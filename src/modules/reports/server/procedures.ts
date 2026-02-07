import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { TRPCError } from "@trpc/server"
import { generateReportData, type ReportConfig } from "@/lib/report-generator"
import {
  exportReportToCSV,
  exportReportToJSON,
  exportReportToPDF,
  exportReportToExcel,
} from "@/lib/report-export"
import { createAuditLog } from "@/lib/audit-log"
import { Prisma } from "@/app/generated"
import { seedSystemReportTemplates } from "@/lib/sync-permissions"

export const reportsRouter = createTRPCRouter({
  // List all reports
  list: protectedProcedure("report.view")
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        reportType: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { page, pageSize, search, reportType, status } = input

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const where: Prisma.ReportWhereInput = {
        companyId: companyId || undefined,
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ]
      }

      if (reportType) {
        where.reportType = reportType
      }

      if (status) {
        where.status = status
      }

      const total = await prisma.report.count({ where })

      const reports = await prisma.report.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          template: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      return {
        reports,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      }
    }),

  // Get a single report
  get: protectedProcedure("report.view")
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const report = await prisma.report.findFirst({
        where: {
          id: input.id,
          companyId: companyId || undefined,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          template: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      })

      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        })
      }

      return report
    }),

  // Create a new report
  create: protectedProcedure("report.create")
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        reportType: z.enum(["CUSTOM", "SOC2", "ISO27001", "AUDIT", "SECURITY", "COMPLIANCE"]),
        format: z.enum(["PDF", "CSV", "Excel", "JSON"]),
        config: z.record(z.string(), z.unknown()).optional(),
        templateId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID is required",
        })
      }

      // Get user's companyId
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      const report = await prisma.report.create({
        data: {
          name: input.name,
          description: input.description,
          reportType: input.reportType,
          format: input.format,
          config: (input.config || {}) as Prisma.InputJsonValue,
          userId: ctx.userId,
          companyId: user?.companyId || null,
          templateId: input.templateId,
          status: "DRAFT",
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      // Create audit log
      await createAuditLog({
        action: "REPORT_CREATED",
        resource: "Report",
        resourceId: report.id,
        details: {
          reportName: report.name,
          reportType: report.reportType,
        },
        userId: ctx.userId,
      })

      return report
    }),

  // Generate report (create and generate in one step)
  generate: protectedProcedure("report.create")
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        reportType: z.enum(["CUSTOM", "SOC2", "ISO27001", "AUDIT", "SECURITY", "COMPLIANCE"]),
        format: z.enum(["PDF", "CSV", "Excel", "JSON"]),
        config: z.record(z.string(), z.unknown()).optional(),
        templateId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID is required",
        })
      }

      // Get user's companyId
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      // Update report status to GENERATING
      const report = await prisma.report.create({
        data: {
          name: input.name,
          description: input.description,
          reportType: input.reportType,
          format: input.format,
          config: (input.config || {}) as Prisma.InputJsonValue,
          userId: ctx.userId,
          companyId: user?.companyId || null,
          templateId: input.templateId,
          status: "GENERATING",
        },
      })

      try {
        // Generate report data
        const reportData = await generateReportData(
          input.reportType,
          (input.config || {}) as ReportConfig,
          ctx.userId,
          user?.companyId || null
        )

        // Export based on format
        let content: string | Buffer
        let mimeType: string
        let fileExtension: string

        switch (input.format) {
          case "CSV":
            content = exportReportToCSV(reportData)
            mimeType = "text/csv"
            fileExtension = "csv"
            break
          case "JSON":
            content = exportReportToJSON(reportData, true)
            mimeType = "application/json"
            fileExtension = "json"
            break
          case "Excel":
            content = await exportReportToExcel(reportData)
            mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            fileExtension = "xlsx"
            break
          case "PDF":
          default:
            content = await exportReportToPDF(reportData)
            mimeType = "application/pdf"
            fileExtension = "pdf"
            break
        }

        // Convert content to base64 for storage/transmission
        const contentBase64 =
          typeof content === "string" ? Buffer.from(content).toString("base64") : content.toString("base64")

        // Update report with generated content
        const updatedReport = await prisma.report.update({
          where: { id: report.id },
          data: {
            status: "COMPLETED",
            generatedAt: new Date(),
            fileSize: Buffer.byteLength(contentBase64, "base64"),
            // In production, you'd save the file to disk/S3 and store the path
            // filePath: `/reports/${report.id}.${fileExtension}`,
          },
        })

        // Create audit log
        await createAuditLog({
          action: "REPORT_GENERATED",
          resource: "Report",
          resourceId: report.id,
          details: {
            reportName: report.name,
            reportType: report.reportType,
            format: input.format,
          },
          userId: ctx.userId,
        })

        return {
          report: updatedReport,
          content: contentBase64,
          mimeType,
          fileExtension,
        }
      } catch (error) {
        // Update report status to FAILED
        await prisma.report.update({
          where: { id: report.id },
          data: {
            status: "FAILED",
          },
        })

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate report",
        })
      }
    }),

  // Delete a report
  delete: protectedProcedure("report.delete")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const report = await prisma.report.findFirst({
        where: {
          id: input.id,
          companyId: companyId || undefined,
        },
      })

      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        })
      }

      await prisma.report.delete({
        where: { id: input.id },
      })

      // Create audit log
      await createAuditLog({
        action: "REPORT_DELETED",
        resource: "Report",
        resourceId: input.id,
        details: {
          reportName: report.name,
        },
        userId: ctx.userId || null,
      })

      return { success: true }
    }),

  // Download a report (regenerates the report content)
  download: protectedProcedure("report.view")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const report = await prisma.report.findFirst({
        where: {
          id: input.id,
          companyId: companyId || undefined,
        },
      })

      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        })
      }

      if (report.status !== "COMPLETED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Report is not ready for download",
        })
      }

      try {
        // Normalize config - convert date strings back to Date objects
        const config = (report.config || {}) as ReportConfig
        if (config.filters?.dateRange) {
          config.filters.dateRange = {
            start: config.filters.dateRange.start instanceof Date 
              ? config.filters.dateRange.start 
              : new Date(config.filters.dateRange.start as string),
            end: config.filters.dateRange.end instanceof Date 
              ? config.filters.dateRange.end 
              : new Date(config.filters.dateRange.end as string),
          }
        }

        // Regenerate report data using stored config
        const reportData = await generateReportData(
          report.reportType,
          config,
          report.userId,
          report.companyId || null
        )

        // Export based on stored format
        let content: string | Buffer
        let mimeType: string
        let fileExtension: string

        switch (report.format) {
          case "CSV":
            content = exportReportToCSV(reportData)
            mimeType = "text/csv"
            fileExtension = "csv"
            break
          case "JSON":
            content = exportReportToJSON(reportData, true)
            mimeType = "application/json"
            fileExtension = "json"
            break
          case "Excel":
            content = await exportReportToExcel(reportData)
            mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            fileExtension = "xlsx"
            break
          case "PDF":
          default:
            content = await exportReportToPDF(reportData)
            mimeType = "application/pdf"
            fileExtension = "pdf"
            break
        }

        // Convert content to base64 for transmission
        const contentBase64 =
          typeof content === "string" ? Buffer.from(content).toString("base64") : content.toString("base64")

        // Create audit log
        await createAuditLog({
          action: "REPORT_DOWNLOADED",
          resource: "Report",
          resourceId: report.id,
          details: {
            reportName: report.name,
            reportType: report.reportType,
            format: report.format,
          },
          userId: ctx.userId || null,
        })

        return {
          content: contentBase64,
          mimeType,
          fileExtension,
          fileName: report.name,
        }
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate report for download",
        })
      }
    }),

  // Report Templates
  listTemplates: protectedProcedure("report.view")
    .input(
      z.object({
        reportType: z.string().optional(),
        category: z.string().optional(),
        includeSystem: z.boolean().default(true),
      })
    )
    .query(async ({ input, ctx }) => {
      // Ensure system templates exist
      await seedSystemReportTemplates()

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const where: Prisma.ReportTemplateWhereInput = {
        OR: [
          { companyId: companyId || undefined },
          { isPublic: true },
          ...(input.includeSystem ? [{ isSystem: true }] : []),
        ],
      }

      if (input.reportType) {
        where.reportType = input.reportType
      }

      if (input.category) {
        where.category = input.category
      }

      const templates = await prisma.reportTemplate.findMany({
        where,
        orderBy: [
          { isSystem: "desc" },
          { usageCount: "desc" },
          { createdAt: "desc" },
        ],
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      return { templates }
    }),

  getTemplate: protectedProcedure("report.view")
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const template = await prisma.reportTemplate.findFirst({
        where: {
          id: input.id,
          OR: [
            { companyId: companyId || undefined },
            { isPublic: true },
            { isSystem: true },
          ],
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        })
      }

      return template
    }),

  createTemplate: protectedProcedure("report.create")
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        reportType: z.enum(["CUSTOM", "SOC2", "ISO27001", "AUDIT", "SECURITY", "COMPLIANCE"]),
        category: z.string().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        isPublic: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID is required",
        })
      }

      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      const template = await prisma.reportTemplate.create({
        data: {
          name: input.name,
          description: input.description,
          reportType: input.reportType,
          category: input.category,
          config: (input.config || {}) as Prisma.InputJsonValue,
          isPublic: input.isPublic ?? false,
          userId: ctx.userId,
          companyId: user?.companyId || null,
        },
      })

      await createAuditLog({
        action: "REPORT_TEMPLATE_CREATED",
        resource: "ReportTemplate",
        resourceId: template.id,
        details: {
          templateName: template.name,
        },
        userId: ctx.userId,
      })

      return template
    }),

  updateTemplate: protectedProcedure("report.update")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        isPublic: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const template = await prisma.reportTemplate.findFirst({
        where: {
          id: input.id,
          companyId: companyId || undefined,
          isSystem: false, // Cannot update system templates
        },
      })

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found or cannot be updated",
        })
      }

      const updated = await prisma.reportTemplate.update({
        where: { id: input.id },
        data: {
          ...(input.name && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.config && { config: input.config as Prisma.InputJsonValue }),
          ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
        },
      })

      await createAuditLog({
        action: "REPORT_TEMPLATE_UPDATED",
        resource: "ReportTemplate",
        resourceId: template.id,
        userId: ctx.userId || null,
      })

      return updated
    }),

  deleteTemplate: protectedProcedure("report.delete")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      const template = await prisma.reportTemplate.findFirst({
        where: {
          id: input.id,
          companyId: companyId || undefined,
          isSystem: false, // Cannot delete system templates
        },
      })

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found or cannot be deleted",
        })
      }

      await prisma.reportTemplate.delete({
        where: { id: input.id },
      })

      await createAuditLog({
        action: "REPORT_TEMPLATE_DELETED",
        resource: "ReportTemplate",
        resourceId: input.id,
        userId: ctx.userId || null,
      })

      return { success: true }
    }),

})





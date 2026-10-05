import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@/app/generated"

export const foldersRouter = createTRPCRouter({
  list: protectedProcedure("password.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId

      // Get folders belonging to the company
      // Now folders have a direct companyId field, so we can filter directly
      // Without a company there is no tenant to list: return nothing
      if (!companyId) {
        return { folders: [] }
      }
      const where: Prisma.FolderWhereInput = { companyId }

      const folders = await prisma.folder.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          icon: true,
          color: true,
          parentId: true,
          createdAt: true,
        },
        orderBy: {
          name: "asc",
        },
      })

      return { folders }
    }),

  create: protectedProcedure("password.create")
    .input(
      z.object({
        name: z.string().min(1, "Folder name is required"),
        description: z.string().optional(),
        parentId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId
      if (!companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "A company is required to create folders" })
      }

      // Check if folder with same name already exists in the same company (at same level if parentId provided)
      const where: Prisma.FolderWhereInput = {
        name: input.name,
        parentId: input.parentId || null,
        companyId,
      }

      const existingFolder = await prisma.folder.findFirst({
        where,
      })

      if (existingFolder) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A folder with this name already exists",
        })
      }

      // Validate parent exists if parentId provided and belongs to same company
      if (input.parentId) {
        const parentWhere: Prisma.FolderWhereInput = { 
          id: input.parentId,
          companyId,
        }

        const parent = await prisma.folder.findFirst({
          where: parentWhere,
        })

        if (!parent) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Parent folder not found",
          })
        }
      }

      // Create folder with companyId
      const folder = await prisma.folder.create({
        data: {
          name: input.name,
          description: input.description || null,
          parentId: input.parentId || null,
          companyId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          icon: true,
          color: true,
          parentId: true,
          createdAt: true,
        },
      })

      return {
        success: true,
        folder,
      }
    }),
})



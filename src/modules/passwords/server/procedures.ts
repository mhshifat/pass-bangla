import { decryptPassword } from "@/lib/crypto"
import { decryptPasswordWithUserKey } from "@/lib/server-crypto-migration"
import prisma from "@/lib/prisma"
import { createTRPCRouter, protectedProcedure, baseProcedure } from "@/trpc/init"
import z from "zod"
import { TRPCError } from "@trpc/server"
import {
  validatePasswordAgainstPolicy,
  // checkPasswordHistory,
} from "@/lib/password-policy"
import { Prisma } from "@/app/generated"

export const passwordsRouter = createTRPCRouter({
  list: protectedProcedure("password.view")
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(10),
        search: z.string().optional(),
        filter: z.enum(["weak", "expiring", "favorites"]).optional(),
        tagIds: z.array(z.string()).optional(),
        folderIds: z.array(z.string()).optional(), // For folder hierarchy search
        searchFields: z.array(z.enum(["name", "username", "url", "notes"])).optional(), // Fields to search in
      }).optional()
    )
    .query(async ({ input = {}, ctx }) => {
      const { page = 1, pageSize = 10, search, filter, tagIds, folderIds, searchFields } = input
      // Use cached userTeams from context (already fetched, no extra query needed)
      const teamIds = ctx.userTeams

      // Helper function to get all descendant folder IDs for hierarchy search
      const getDescendantFolderIds = async (folderIds: string[]): Promise<string[]> => {
        if (!folderIds || folderIds.length === 0) return []
        
        const allFolderIds = new Set<string>(folderIds)
        let currentLevel = folderIds
        
        // Recursively get all child folders
        while (currentLevel.length > 0) {
          const children = await prisma.folder.findMany({
            where: {
              parentId: { in: currentLevel },
            },
            select: { id: true },
          })
          
          const childIds = children.map((f) => f.id)
          if (childIds.length === 0) break
          
          childIds.forEach((id) => allFolderIds.add(id))
          currentLevel = childIds
        }
        
        return Array.from(allFolderIds)
      }

      // Get all folder IDs including descendants for hierarchy search
      const allFolderIds = folderIds && folderIds.length > 0 
        ? await getDescendantFolderIds(folderIds)
        : []

      // Build search conditions with configurable fields
      const searchConditions = search
        ? (() => {
            const fields = searchFields && searchFields.length > 0 
              ? searchFields 
              : ["name", "username", "url", "notes"] // Default: search all fields
            
            const conditions: Prisma.PasswordWhereInput[] = []
            
            if (fields.includes("name")) {
              conditions.push({ name: { contains: search, mode: "insensitive" as const } })
            }
            if (fields.includes("username")) {
              conditions.push({ username: { contains: search, mode: "insensitive" as const } })
            }
            if (fields.includes("url")) {
              conditions.push({ url: { contains: search, mode: "insensitive" as const } })
            }
            if (fields.includes("notes")) {
              conditions.push({ notes: { contains: search, mode: "insensitive" as const } })
            }
            
            // Also search in tags
            conditions.push({
              tags: {
                some: {
                  tag: {
                    name: { contains: search, mode: "insensitive" as const },
                  },
                },
              },
            })
            
            // Also search in folder names
            conditions.push({
              folder: {
                name: { contains: search, mode: "insensitive" as const },
              },
            })
            
            return conditions.length > 0 ? { OR: conditions } : {}
          })()
        : {}

      // Build filter conditions for password-level filters (strength, password expiration, favorites)
      const passwordFilterConditions: {
        strength?: "WEAK" | "MEDIUM" | "STRONG"
        expiresAt?: { not: null; gte: Date; lte: Date }
        isFavorite?: boolean
      } = {}
      if (filter === "weak") {
        passwordFilterConditions.strength = "WEAK"
      } else if (filter === "expiring") {
        const now = new Date()
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        passwordFilterConditions.expiresAt = {
          not: null,
          gte: now,
          lte: sevenDaysFromNow,
        }
      } else if (filter === "favorites") {
        passwordFilterConditions.isFavorite = true
      }

      // Build tag filter conditions
      const tagFilterConditions = tagIds && tagIds.length > 0
        ? {
            tags: {
              some: {
                tagId: { in: tagIds },
              },
            },
          }
        : {}

      // Build folder filter conditions (including hierarchy)
      const folderFilterConditions = allFolderIds.length > 0
        ? {
            folderId: { in: allFolderIds },
          }
        : {}

      // Build share filter conditions for expiring filter
      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      // Query passwords that are either:
      // 1. Owned by the user, OR
      // 2. Shared with teams where the user is a member (not expired)
      // All passwords must belong to the same company (multi-tenant isolation)
      const baseWhere = {
        OR: [
          // Passwords owned by the user
          {
            ownerId: ctx.userId,
            ...searchConditions,
            ...passwordFilterConditions,
            ...tagFilterConditions,
            ...folderFilterConditions,
          },
          // For owned passwords: also check if any share is expiring (when filter is "expiring")
          ...(filter === "expiring"
            ? [
                {
                  ownerId: ctx.userId,
                  sharedWith: {
                    some: {
                      expiresAt: {
                        not: null,
                        gte: now,
                        lte: sevenDaysFromNow,
                      },
                    },
                  },
                  ...searchConditions,
                  ...folderFilterConditions,
                },
              ]
            : []),
          // Passwords shared with teams the user is a member of
          ...(teamIds.length > 0
            ? [
                // For expiring filter: check share expiration for shared passwords
                ...(filter === "expiring"
                  ? [
                      {
                        sharedWith: {
                          some: {
                            teamId: { in: teamIds },
                            expiresAt: {
                              not: null,
                              gte: now,
                              lte: sevenDaysFromNow,
                            },
                          },
                        },
                        ...searchConditions,
                        ...folderFilterConditions,
                      },
                    ]
                  : [
                      // For other filters or no filter: check normal share conditions
                      // Shared passwords with no expiration
                      {
                        sharedWith: {
                          some: {
                            teamId: { in: teamIds },
                            expiresAt: null,
                          },
                        },
                        ...searchConditions,
                        ...passwordFilterConditions,
                        ...folderFilterConditions,
                      },
                      // Shared passwords that haven't expired
                      {
                        sharedWith: {
                          some: {
                            teamId: { in: teamIds },
                            expiresAt: { gt: new Date() },
                          },
                        },
                        ...searchConditions,
                        ...passwordFilterConditions,
                        ...tagFilterConditions,
                        ...folderFilterConditions,
                      },
                    ]),
              ]
            : []),
        ],
      }

      // Add company isolation filter if user belongs to a company
      const where: Prisma.PasswordWhereInput = ctx.companyId
        ? { AND: [{ companyId: ctx.companyId }, baseWhere] }
        : baseWhere

      const [passwords, total] = await Promise.all([
        prisma.password.findMany({
          where,
          select: {
            id: true,
            name: true,
            username: true,
            url: true,
            folderId: true,
            strength: true,
            hasTotp: true,
            expiresAt: true,
            isFavorite: true,
            createdAt: true,
            updatedAt: true,
            ownerId: true,
            folder: {
              select: {
                id: true,
                name: true,
              },
            },
            tags: {
              select: {
                tag: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                    icon: true,
                  },
                },
              },
            },
            sharedWith: {
            select: {
              id: true,
              teamId: true,
              expiresAt: true,
              team: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          },
          orderBy: {
            createdAt: "desc",
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.password.count({ where }),
      ])

      const totalPages = Math.ceil(total / pageSize)

      return {
        passwords: passwords.map((pwd) => ({
          id: pwd.id,
          name: pwd.name,
          username: pwd.username,
          url: pwd.url,
          folder: pwd.folder?.name || null,
          folderId: pwd.folderId,
          strength: pwd.strength.toLowerCase() as "strong" | "medium" | "weak",
          hasTotp: pwd.hasTotp,
          shared: pwd.sharedWith.length > 0,
          sharedWith: pwd.sharedWith.map((share) => ({
            shareId: share.id,
            teamId: share.teamId,
            teamName: share.team?.name || "",
            expiresAt: share.expiresAt,
          })),
          isOwner: pwd.ownerId === ctx.userId,
          isFavorite: pwd.isFavorite,
          tags: pwd.tags.map((pt) => ({
            id: pt.tag.id,
            name: pt.tag.name,
            color: pt.tag.color,
            icon: pt.tag.icon,
          })),
          lastModified: pwd.updatedAt.toISOString().split("T")[0],
          expiresIn: pwd.expiresAt
            ? Math.ceil((pwd.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null,
          createdAt: pwd.createdAt,
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      }
    }),

  create: protectedProcedure("password.create")
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        username: z.string().min(1, "Username is required"),
        password: z.string().min(1, "Password is required"),
        url: z
          .string()
          .refine((val) => !val || val === "" || z.string().url().safeParse(val).success, {
            message: "Must be a valid URL",
          })
          .optional()
          .nullable(),
        folderId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        totpSecret: z.string().optional().nullable(),
        tagIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get user's companyId for policy validation
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      // Validate password against policy
      const validation = await validatePasswordAgainstPolicy(
        input.password,
        user?.companyId || null
      )

      if (!validation.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation.errors.join(". "),
        })
      }

      // CLIENT-SIDE ENCRYPTION: Encrypt using user-specific key (new method)
      // This matches the client-side encryption method
      const { encryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
      const encryptedPassword = encryptPasswordWithUserKey(input.password, ctx.userId)

      // Encrypt TOTP secret if provided (using same method)
      // Normalize TOTP secret: remove spaces and convert to uppercase (Google format)
      let encryptedTotpSecret: string | null = null
      if (input.totpSecret) {
        const normalizedSecret = input.totpSecret.replace(/\s+/g, "").toUpperCase().trim()
        encryptedTotpSecret = encryptPasswordWithUserKey(normalizedSecret, ctx.userId)
      }

      // Calculate password strength (simple implementation)
      // You can enhance this with a proper strength checker
      let strength: "STRONG" | "MEDIUM" | "WEAK" = "MEDIUM"
      if (input.password.length >= 16 && /[A-Z]/.test(input.password) && /[a-z]/.test(input.password) && /[0-9]/.test(input.password) && /[^A-Za-z0-9]/.test(input.password)) {
        strength = "STRONG"
      } else if (input.password.length < 8) {
        strength = "WEAK"
      }

      // Create password
      const password = await prisma.password.create({
        data: {
          name: input.name,
          username: input.username,
          password: encryptedPassword,
          url: input.url || null,
          folderId: input.folderId || null,
          notes: input.notes || null,
          strength,
          hasTotp: !!input.totpSecret,
          totpSecret: encryptedTotpSecret,
          ownerId: ctx.userId,
          companyId: ctx.companyId || null,
        },
        select: {
          id: true,
          name: true,
          username: true,
          url: true,
          folderId: true,
          strength: true,
          hasTotp: true,
          createdAt: true,
        },
      })

      // Assign tags if provided
      if (input.tagIds && input.tagIds.length > 0) {
        // Verify tags exist
        const tags = await prisma.tag.findMany({
          where: {
            id: { in: input.tagIds },
          },
        })

        if (tags.length !== input.tagIds.length) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "One or more tags not found",
          })
        }

        // Create password-tag relationships
        await prisma.passwordTag.createMany({
          data: input.tagIds.map((tagId) => ({
            passwordId: password.id,
            tagId,
          })),
          skipDuplicates: true,
        })
      }

      // Save password history (initial version)
      const { savePasswordHistory } = await import("@/lib/password-history")
      await savePasswordHistory(
        password.id,
        {
          name: input.name,
          username: input.username,
          password: encryptedPassword,
          url: input.url || null,
          notes: input.notes || null,
          folderId: input.folderId || null,
          strength,
          hasTotp: !!input.totpSecret,
          totpSecret: encryptedTotpSecret,
          expiresAt: null,
        },
        ctx.userId,
        "CREATE"
      )

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_CREATED",
        resource: "Password",
        resourceId: password.id,
        details: { name: password.name, hasTotp: password.hasTotp, tagIds: input.tagIds },
        userId: ctx.userId,
      })

      return { password }
    }),

  update: protectedProcedure("password.edit")
    .input(
      z.object({
        id: z.string().min(1, "Password ID is required"),
        name: z.string().min(1, "Name is required"),
        username: z.string().min(1, "Username is required"),
        password: z.string().min(1, "Password is required"),
        url: z
          .string()
          .refine((val) => !val || val === "" || z.string().url().safeParse(val).success, {
            message: "Must be a valid URL",
          })
          .optional()
          .nullable(),
        folderId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        totpSecret: z.string().optional().nullable(),
        tagIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if password exists and user owns it, get current data for history
      const existingPassword = await prisma.password.findFirst({
        where: {
          id: input.id,
          ownerId: ctx.userId,
        },
        select: {
          id: true,
          ownerId: true,
          name: true,
          username: true,
          password: true,
          url: true,
          notes: true,
          folderId: true,
          strength: true,
          hasTotp: true,
          totpSecret: true,
          expiresAt: true,
        },
      })

      if (!existingPassword) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // Save current state to history before updating
      const { savePasswordHistory } = await import("@/lib/password-history")
      await savePasswordHistory(
        input.id,
        {
          name: existingPassword.name,
          username: existingPassword.username,
          password: existingPassword.password,
          url: existingPassword.url,
          notes: existingPassword.notes,
          folderId: existingPassword.folderId,
          strength: existingPassword.strength,
          hasTotp: existingPassword.hasTotp,
          totpSecret: existingPassword.totpSecret,
          expiresAt: existingPassword.expiresAt,
        },
        ctx.userId,
        "UPDATE"
      )

      // CLIENT-SIDE ENCRYPTION: Encrypt using user-specific key (new method)
      // This matches the client-side encryption method
      const { encryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
      const encryptedPassword = encryptPasswordWithUserKey(input.password, ctx.userId)

      // Encrypt TOTP secret if provided (using same method)
      // Normalize TOTP secret: remove spaces and convert to uppercase (Google format)
      let encryptedTotpSecret: string | null = null
      if (input.totpSecret) {
        const normalizedSecret = input.totpSecret.replace(/\s+/g, "").toUpperCase().trim()
        encryptedTotpSecret = encryptPasswordWithUserKey(normalizedSecret, ctx.userId)
      }

      // Calculate password strength
      let strength: "STRONG" | "MEDIUM" | "WEAK" = "MEDIUM"
      if (input.password.length >= 16 && /[A-Z]/.test(input.password) && /[a-z]/.test(input.password) && /[0-9]/.test(input.password) && /[^A-Za-z0-9]/.test(input.password)) {
        strength = "STRONG"
      } else if (input.password.length < 8) {
        strength = "WEAK"
      }

      // Update password
      const password = await prisma.password.update({
        where: { id: input.id },
        data: {
          name: input.name,
          username: input.username,
          password: encryptedPassword,
          url: input.url || null,
          folderId: input.folderId || null,
          notes: input.notes || null,
          strength,
          hasTotp: !!input.totpSecret,
          totpSecret: encryptedTotpSecret,
        },
        select: {
          id: true,
          name: true,
          username: true,
          url: true,
          folderId: true,
          strength: true,
          hasTotp: true,
          updatedAt: true,
        },
      })

      // Update tags if provided
      if (input.tagIds !== undefined) {
        // Get current tags
        const currentTags = await prisma.passwordTag.findMany({
          where: { passwordId: input.id },
          select: { tagId: true },
        })
        const currentTagIds = currentTags.map((pt) => pt.tagId)

        // Store tagIds in a variable to help TypeScript understand it's defined
        const tagIdsArray = input.tagIds

        // Verify new tags exist
        if (tagIdsArray.length > 0) {
          const tags = await prisma.tag.findMany({
            where: {
              id: { in: tagIdsArray },
            },
          })

          if (tags.length !== tagIdsArray.length) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "One or more tags not found",
            })
          }
        }

        // Find tags to add and remove
        const tagsToAdd = tagIdsArray.filter((tagId) => !currentTagIds.includes(tagId))
        const tagsToRemove = currentTagIds.filter((tagId) => !tagIdsArray.includes(tagId))

        // Add new tags
        if (tagsToAdd.length > 0) {
          await prisma.passwordTag.createMany({
            data: tagsToAdd.map((tagId) => ({
              passwordId: input.id,
              tagId,
            })),
            skipDuplicates: true,
          })
        }

        // Remove tags
        if (tagsToRemove.length > 0) {
          await prisma.passwordTag.deleteMany({
            where: {
              passwordId: input.id,
              tagId: { in: tagsToRemove },
            },
          })
        }
      }

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_UPDATED",
        resource: "Password",
        resourceId: password.id,
        details: { name: password.name, tagIds: input.tagIds },
        userId: ctx.userId,
      })

      return { password }
    }),

  getById: protectedProcedure("password.view")
    .input(
      z.object({
        id: z.string().min(1, "Password ID is required"),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use cached userTeams from context (already fetched, no extra query needed)
      const teamIds = ctx.userTeams

      // Find password that is either owned by user or shared with user's teams
      const password = await prisma.password.findFirst({
        where: {
          id: input.id,
          OR: [
            // Password owned by user
            { ownerId: ctx.userId },
            // Password shared with teams user is a member of (not expired)
            ...(teamIds.length > 0
              ? [
                  // Shared with no expiration
                  {
                    sharedWith: {
                      some: {
                        teamId: { in: teamIds },
                        expiresAt: null,
                      },
                    },
                  },
                  // Shared but not expired
                  {
                    sharedWith: {
                      some: {
                        teamId: { in: teamIds },
                        expiresAt: { gt: new Date() },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
          select: {
            id: true,
            name: true,
            username: true,
            password: true, // Encrypted
            url: true,
            notes: true,
            folderId: true,
            strength: true,
            hasTotp: true,
            totpSecret: true, // Encrypted
            expiresAt: true,
            isFavorite: true,
            createdAt: true,
            updatedAt: true,
            ownerId: true, // Include ownerId to determine ownership
          folder: {
            select: {
              id: true,
              name: true,
            },
          },
          tags: {
            select: {
              id: true,
              tag: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                  icon: true,
                },
              },
            },
          },
          sharedWith: {
            select: {
              id: true,
              teamId: true,
              expiresAt: true,
              team: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          rotationPolicyId: true,
          rotationPolicy: {
            select: {
              id: true,
              name: true,
              rotationDays: true,
              reminderDays: true,
              autoRotate: true,
              requireApproval: true,
              isActive: true,
            },
          },
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // CLIENT-SIDE DECRYPTION: Return encrypted passwords instead of decrypted
      // The client will decrypt using Web Crypto API
      // This prevents plain text passwords from being transmitted over the network
      
      // Check if user owns the password
      const isOwner = password.ownerId === ctx.userId
      
      // For team sharing: If user is not the owner, we need to decrypt on server
      // because the client can't decrypt with the owner's key
      // const isSharedWithUser = !isOwner && password.sharedWith.length > 0
      
      // Determine encryption method and handle decryption
      let finalPassword = password.password
      let finalTotpSecret = password.totpSecret
      let passwordEncrypted = true
      let totpEncrypted = password.totpSecret ? true : false
      
      // ALWAYS encrypt passwords and TOTP secrets with the requesting user's key
      // This ensures nothing is ever transmitted in plain text, even for owners
      // Security: Server acts as secure intermediary, re-encrypting for the requesting user
      try {
        const { decryptPasswordWithUserKey, encryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
        
        // Step 1: Decrypt with owner's key
        let plainPassword: string
        let plainTotpSecret: string | null = null
        
        if (password.ownerId) {
          try {
            plainPassword = decryptPasswordWithUserKey(password.password, password.ownerId)
            if (password.totpSecret) {
              plainTotpSecret = decryptPasswordWithUserKey(password.totpSecret, password.ownerId)
            }
          } catch {
            // Try old encryption method
            try {
              plainPassword = decryptPassword(password.password)
              if (password.totpSecret) {
                plainTotpSecret = decryptPassword(password.totpSecret)
              }
            } catch (oldError) {
              // If both fail, keep original encrypted (will show error on client)
              console.error("Failed to decrypt password:", oldError)
              throw oldError
            }
          }
          
          // Step 2: Re-encrypt with requesting user's key (owner or team member)
          // This ensures the password is always encrypted when transmitted to the client
          finalPassword = encryptPasswordWithUserKey(plainPassword, ctx.userId)
          if (plainTotpSecret) {
            finalTotpSecret = encryptPasswordWithUserKey(plainTotpSecret, ctx.userId)
          }
          
          // Mark as encrypted so client knows to decrypt
          passwordEncrypted = true
          totpEncrypted = password.totpSecret ? true : false
        }
      } catch (error) {
        // If decryption/re-encryption fails, keep original encrypted (will show error on client)
        console.error("Failed to re-encrypt password for user:", error)
        // Keep encrypted - client will try to decrypt with their key and fail gracefully
      }

      return {
        id: password.id,
        name: password.name,
        username: password.username,
        password: finalPassword, // Encrypted for owner, decrypted for team members
        passwordEncrypted, // Flag to indicate if password is encrypted
        url: password.url,
        notes: password.notes,
        folder: password.folder?.name || null,
        folderId: password.folderId,
        strength: password.strength.toLowerCase() as "strong" | "medium" | "weak",
        hasTotp: password.hasTotp,
        totpSecret: finalTotpSecret, // Encrypted for owner, decrypted for team members
        totpEncrypted, // Flag to indicate if TOTP is encrypted
        shared: password.sharedWith.length > 0,
        sharedWith: password.sharedWith.map((share) => ({
          shareId: share.id,
          teamId: share.teamId,
          teamName: share.team?.name || "",
          expiresAt: share.expiresAt,
        })),
        isOwner,
        isFavorite: password.isFavorite,
        tags: password.tags.map((pt) => ({
          id: pt.tag.id,
          name: pt.tag.name,
          color: pt.tag.color,
          icon: pt.tag.icon,
        })),
        lastModified: password.updatedAt.toISOString().split("T")[0],
        expiresIn: password.expiresAt
          ? Math.ceil((password.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null,
        createdAt: password.createdAt,
        rotationPolicyId: password.rotationPolicyId,
        rotationPolicy: password.rotationPolicy,
      }
    }),

  getPasswordShares: protectedProcedure("password.view")
    .input(
      z.object({
        passwordId: z.string().min(1, "Password ID is required"),
      })
    )
    .query(async ({ input, ctx }) => {
      // Check if password exists and user owns it
      const password = await prisma.password.findFirst({
        where: {
          id: input.passwordId,
          ownerId: ctx.userId,
        },
        select: {
          id: true,
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found or you don't have permission to view shares",
        })
      }

      // Get all shares for this password
      const shares = await prisma.passwordShare.findMany({
        where: {
          passwordId: input.passwordId,
          teamId: { not: null }, // Only team shares
        },
        select: {
          id: true,
          teamId: true,
          createdAt: true,
          expiresAt: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return {
        shares: shares.map((share) => ({
          id: share.id,
          teamId: share.teamId,
          teamName: share.team?.name || "",
          createdAt: share.createdAt.toISOString(),
          expiresAt: share.expiresAt?.toISOString() || null,
        })),
      }
    }),

  generateTotp: protectedProcedure("password.view")
    .input(
      z.object({
        id: z.string().min(1, "Password ID is required"),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use cached userTeams from context (already fetched, no extra query needed)
      const teamIds = ctx.userTeams

      // Find password that is either owned by user or shared with user's teams
      const password = await prisma.password.findFirst({
        where: {
          id: input.id,
          OR: [
            // Password owned by user
            { ownerId: ctx.userId },
            // Password shared with teams user is a member of (not expired)
            ...(teamIds.length > 0
              ? [
                  // Shared with no expiration
                  {
                    sharedWith: {
                      some: {
                        teamId: { in: teamIds },
                        expiresAt: null,
                      },
                    },
                  },
                  // Shared but not expired
                  {
                    sharedWith: {
                      some: {
                        teamId: { in: teamIds },
                        expiresAt: { gt: new Date() },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          hasTotp: true,
          totpSecret: true, // Encrypted
          ownerId: true, // Needed to determine encryption method
          sharedWith: {
            where: {
              teamId: { in: teamIds },
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
              ],
            },
            select: {
              id: true,
            },
          },
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      if (!password.hasTotp || !password.totpSecret) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "TOTP is not enabled for this password",
        })
      }

      // ALWAYS encrypt TOTP codes with the requesting user's key
      // This ensures nothing is ever transmitted in plain text, even for owners

      // Decrypt TOTP secret (server-side, needed to generate code)
      // Check if TOTP secret is encrypted with new client-side method or old server-side method
      let decryptedTotpSecret: string
      let newEncryptionError: Error | null = null
      
      // Try new encryption method first (user-specific key)
      try {
        const { decryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
        if (!password.ownerId) {
          throw new Error("Password ownerId is missing")
        }
        decryptedTotpSecret = decryptPasswordWithUserKey(password.totpSecret, password.ownerId)
      } catch (error) {
        // Can't decrypt with new method - might be old encryption
        newEncryptionError = error instanceof Error ? error : new Error(String(error))
        
        // Try old encryption method (backward compatibility)
        try {
          decryptedTotpSecret = decryptPassword(password.totpSecret)
        } catch (oldDecryptError) {
          // Both methods failed - TOTP secret might be corrupted
          console.error("New encryption decryption error:", newEncryptionError)
          console.error("Old encryption decryption error:", oldDecryptError)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to decrypt TOTP secret. The TOTP secret may have been encrypted with a different key or is corrupted. Please update the password's TOTP settings.",
            cause: oldDecryptError,
          })
        }
      }

      // Generate TOTP code using otplib
      // Normalize TOTP secret: remove spaces and convert to uppercase (handles Google format)
      const normalizedSecret = decryptedTotpSecret.replace(/\s+/g, "").toUpperCase().trim()
      const { authenticator } = await import("otplib")
      const totpCode = authenticator.generate(normalizedSecret)

      // ALWAYS encrypt TOTP code with the requesting user's key
      // This ensures nothing is ever transmitted in plain text, even for owners
      // Security: Even though TOTP codes are time-limited (30 seconds), we encrypt them
      // to maintain consistency and prevent any potential interception
      try {
        const { encryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
        const encryptedTotpCode = encryptPasswordWithUserKey(totpCode, ctx.userId)
        return {
          totpCode: encryptedTotpCode, // Always encrypted with requesting user's key
          totpEncrypted: true, // Flag to indicate it's encrypted
        }
      } catch (error) {
        console.error("Failed to encrypt TOTP code:", error)
        // Fallback: return plain text if encryption fails (shouldn't happen)
        return {
          totpCode,
          totpEncrypted: false,
        }
      }
    }),

  getPassword: protectedProcedure("password.view")
    .input(
      z.object({
        id: z.string().min(1, "Password ID is required"),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use cached userTeams from context (already fetched, no extra query needed)
      const teamIds = ctx.userTeams

      // Find password that is either owned by user or shared with user's teams
      const password = await prisma.password.findFirst({
        where: {
          id: input.id,
          OR: [
            // Password owned by user
            { ownerId: ctx.userId },
            // Password shared with teams user is a member of (not expired)
            ...(teamIds.length > 0
              ? [
                  // Shared with no expiration
                  {
                    sharedWith: {
                      some: {
                        teamId: { in: teamIds },
                        expiresAt: null,
                      },
                    },
                  },
                  // Shared but not expired
                  {
                    sharedWith: {
                      some: {
                        teamId: { in: teamIds },
                        expiresAt: { gt: new Date() },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          password: true, // Encrypted
          ownerId: true, // Needed to determine encryption method
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // Create audit log for password view
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_VIEWED",
        resource: "Password",
        resourceId: password.id,
        userId: ctx.userId,
      })

      // Check if password is encrypted with new client-side method or old server-side method
      // Try to decrypt with new method first (user-specific key)
      let isNewEncryption = false
      let newEncryptionError: Error | null = null
      try {
        const { decryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
        // Try to decrypt with new method - if it works, it's new encryption
        if (!password.ownerId) {
          throw new Error("Password ownerId is missing")
        }
        decryptPasswordWithUserKey(password.password, password.ownerId)
        isNewEncryption = true
      } catch (error) {
        // Can't decrypt with new method - might be old encryption or error
        newEncryptionError = error instanceof Error ? error : new Error(String(error))
        isNewEncryption = false
      }

      // CLIENT-SIDE DECRYPTION: Return encrypted password if using new method
      // For old encryption, we need to decrypt on server (backward compatibility)
      if (isNewEncryption) {
        return { 
          password: password.password, // Return encrypted password
          passwordEncrypted: true, // Flag to indicate it's encrypted
        }
      } else {
        // Old encryption - decrypt on server for backward compatibility
        // TODO: Migrate this password to new encryption method
        try {
          const decryptedPassword = decryptPassword(password.password)
          return {
            password: decryptedPassword, // Return decrypted password (old method)
            passwordEncrypted: false, // Flag to indicate it's not encrypted (already decrypted)
          }
        } catch (oldDecryptError) {
          // Both new and old decryption failed - password might be corrupted
          // Log both errors for debugging
          console.error("New encryption decryption error:", newEncryptionError)
          console.error("Old encryption decryption error:", oldDecryptError)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to decrypt password. The password may be corrupted or encrypted with an unknown key. Please try updating the password.",
            cause: oldDecryptError,
          })
        }
      }
    }),

  delete: protectedProcedure("password.delete")
    .input(
      z.object({
        id: z.string().min(1, "Password ID is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if password exists and user owns it
      const existingPassword = await prisma.password.findFirst({
        where: {
          id: input.id,
          ownerId: ctx.userId,
        },
      })

      if (!existingPassword) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // Create audit log before deletion
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_DELETED",
        resource: "Password",
        resourceId: input.id,
        details: { name: existingPassword.name },
        userId: ctx.userId,
      })

      // Delete the password (cascade will handle related records)
      await prisma.password.delete({
        where: {
          id: input.id,
        },
      })

      return { success: true }
    }),

  stats: protectedProcedure("password.view")
    .query(async ({ ctx }) => {
      // Use cached userTeams from context (already fetched, no extra query needed)
      const teamIds = ctx.userTeams

      // Build where clause for passwords accessible to user
      const where = {
        OR: [
          // Passwords owned by the user
          { ownerId: ctx.userId },
          // Passwords shared with teams the user is a member of (not expired)
          ...(teamIds.length > 0
            ? [
                // Shared with no expiration
                {
                  sharedWith: {
                    some: {
                      teamId: { in: teamIds },
                      expiresAt: null,
                    },
                  },
                },
                // Shared but not expired
                {
                  sharedWith: {
                    some: {
                      teamId: { in: teamIds },
                      expiresAt: { gt: new Date() },
                    },
                  },
                },
              ]
            : []),
        ],
      }

      // Get all accessible passwords for counting, including share expiration info
      // We need to get all shares to check expiration, so we'll fetch them separately
      const allPasswords = await prisma.password.findMany({
        where,
        select: {
          id: true,
          strength: true,
          expiresAt: true, // Password's own expiration
          isFavorite: true,
          createdAt: true,
          ownerId: true,
        },
      })

      // Get all shares for these passwords to check expiration
      const passwordIds = allPasswords.map((p) => p.id)
      const allShares = await prisma.passwordShare.findMany({
        where: {
          passwordId: { in: passwordIds },
          OR: [
            // Shares for teams the user is in
            ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
            // All shares for passwords the user owns (to check all share expirations)
            {
              password: {
                ownerId: ctx.userId,
              },
            },
          ],
        },
        select: {
          passwordId: true,
          expiresAt: true,
          teamId: true,
        },
      })

      // Map shares to passwords
      const sharesByPasswordId = new Map<string, typeof allShares>()
      for (const share of allShares) {
        if (!sharesByPasswordId.has(share.passwordId)) {
          sharesByPasswordId.set(share.passwordId, [])
        }
        sharesByPasswordId.get(share.passwordId)!.push(share)
      }

      const total = allPasswords.length

      // Count by strength
      const strongCount = allPasswords.filter((p) => p.strength === "STRONG").length
      const weakCount = allPasswords.filter((p) => p.strength === "WEAK").length
      const mediumCount = allPasswords.filter((p) => p.strength === "MEDIUM").length

      // Count expiring soon (within 7 days)
      // Check both password expiration and share expiration
      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const expiringSoon = allPasswords.filter((p) => {
        // Check password's own expiration (for passwords the user owns)
        if (p.ownerId === ctx.userId && p.expiresAt && p.expiresAt > now && p.expiresAt <= sevenDaysFromNow) {
          return true
        }
        
        // Check share expiration
        // Get shares for this password that the user has access to
        const shares = sharesByPasswordId.get(p.id) || []
        
        // Check if any share expires within 7 days
        // For owned passwords: check all shares
        // For shared passwords: check shares for teams the user is in
        return shares.some((share) => {
          if (!share.expiresAt) return false
          
          const expiresAt = new Date(share.expiresAt)
          const isExpiringSoon = expiresAt > now && expiresAt <= sevenDaysFromNow
          
          if (!isExpiringSoon) return false
          
          // If user owns the password, include all shares
          if (p.ownerId === ctx.userId) return true
          
          // If user doesn't own it, only include shares for teams they're in
          return share.teamId !== null && teamIds.includes(share.teamId)
        })
      }).length

      // Calculate percentage of strong passwords
      const strongPercentage = total > 0 ? Math.round((strongCount / total) * 100) : 0

      // Count passwords created in the last 30 days
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const recentCount = allPasswords.filter((p) => p.createdAt >= thirtyDaysAgo).length

      // Count favorite passwords (only owned by user)
      const favoritesCount = allPasswords.filter((p) => p.isFavorite && p.ownerId === ctx.userId).length

      return {
        total,
        strong: strongCount,
        medium: mediumCount,
        weak: weakCount,
        expiringSoon,
        strongPercentage,
        recentCount,
        favorites: favoritesCount,
      }
    }),

  importPreview: protectedProcedure("password.create")
    .input(
      z.object({
        content: z.string().min(1, "File content is required"),
        format: z.enum(["csv", "json", "1password", "lastpass", "bitwarden", "keepass"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const { parsePasswordFile } = await import("@/lib/password-import/parsers")
      const result = parsePasswordFile(input.content, input.format)

      return {
        passwords: result.passwords,
        errors: result.errors,
        warnings: result.warnings,
        totalRows: result.totalRows,
        validRows: result.validRows,
        invalidRows: result.invalidRows,
      }
    }),

  importCommit: protectedProcedure("password.create")
    .input(
      z.object({
        passwords: z.array(
          z.object({
            name: z.string().min(1),
            username: z.string().min(1),
            password: z.string().min(1),
            url: z.string().optional().nullable(),
            notes: z.string().optional().nullable(),
            folderId: z.string().optional().nullable(),
            totpSecret: z.string().optional().nullable(),
          })
        ),
        skipInvalid: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { createAuditLog } = await import("@/lib/audit-log")
      const created: string[] = []
      const errors: string[] = []

      for (let i = 0; i < input.passwords.length; i++) {
        const item = input.passwords[i]

        try {
          // Validate required fields
          if (!item.name || !item.username || !item.password) {
            if (!input.skipInvalid) {
              errors.push(`Row ${i + 1}: Missing required fields`)
            }
            continue
          }

          // Encrypt the password using user-specific key (new method)
          const { encryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
          const encryptedPassword = encryptPasswordWithUserKey(item.password, ctx.userId)

          // Encrypt TOTP secret if provided (using same method)
          let encryptedTotpSecret: string | null = null
          if (item.totpSecret) {
            encryptedTotpSecret = encryptPasswordWithUserKey(item.totpSecret, ctx.userId)
          }

          // Calculate password strength
          let strength: "STRONG" | "MEDIUM" | "WEAK" = "MEDIUM"
          if (item.password.length >= 16 && /[A-Z]/.test(item.password) && /[a-z]/.test(item.password) && /[0-9]/.test(item.password) && /[^A-Za-z0-9]/.test(item.password)) {
            strength = "STRONG"
          } else if (item.password.length < 8) {
            strength = "WEAK"
          }

          // Create password
          const password = await prisma.password.create({
            data: {
              name: item.name,
              username: item.username,
              password: encryptedPassword,
              url: item.url || null,
              folderId: item.folderId || null,
              notes: item.notes || null,
              strength,
              hasTotp: !!item.totpSecret,
              totpSecret: encryptedTotpSecret,
              ownerId: ctx.userId,
              companyId: ctx.companyId || null,
            },
            select: {
              id: true,
              name: true,
            },
          })

          created.push(password.id)

          // Create audit log
          await createAuditLog({
            action: "PASSWORD_CREATED",
            resource: "Password",
            resourceId: password.id,
            details: { name: password.name, imported: true },
            userId: ctx.userId,
          })
        } catch (error) {
          errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
      }

      return {
        success: true,
        created: created.length,
        errors: errors.length,
        createdIds: created,
        errorMessages: errors,
      }
    }),

  export: protectedProcedure("password.view")
    .input(
      z.object({
        format: z.enum(["csv", "json", "bitwarden", "lastpass", "encrypted"]).default("csv"),
        folderId: z.string().optional(),
        tagIds: z.array(z.string()).optional(),
        dateFrom: z.string().optional(), // ISO date string
        dateTo: z.string().optional(), // ISO date string
        includeShared: z.boolean().default(false),
        encryptionKey: z.string().optional(), // For encrypted exports
      })
    )
    .query(async ({ input, ctx }) => {
      // Use cached userTeams from context (already fetched, no extra query needed)
      const teamIds = ctx.userTeams

      // Build where clause for passwords accessible to user
      const passwordWhere: Prisma.PasswordWhereInput = {
        OR: [
          { ownerId: ctx.userId },
          ...(input.includeShared && teamIds.length > 0
            ? [
                {
                  sharedWith: {
                    some: {
                      teamId: { in: teamIds },
                      OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } },
                      ],
                    },
                  },
                },
              ]
            : []),
        ],
      }

      // Apply folder filter
      if (input.folderId) {
        passwordWhere.folderId = input.folderId
      }

      // Apply tag filter
      if (input.tagIds && input.tagIds.length > 0) {
        passwordWhere.tags = {
          some: {
            tagId: { in: input.tagIds },
          },
        }
      }

      // Apply date range filter
      if (input.dateFrom || input.dateTo) {
        passwordWhere.createdAt = {}
        if (input.dateFrom) {
          passwordWhere.createdAt.gte = new Date(input.dateFrom)
        }
        if (input.dateTo) {
          passwordWhere.createdAt.lte = new Date(input.dateTo)
        }
      }

      // Fetch passwords with related data (include totpSecret for export)
      const passwords = await prisma.password.findMany({
        where: passwordWhere,
        include: {
          folder: {
            select: {
              name: true,
            },
          },
          tags: {
            include: {
              tag: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      // Decrypt passwords and format for export
      // Use user-specific key decryption (passwords are encrypted per-user)
      const exportPasswords = await Promise.all(
        passwords.map(async (pwd) => {
          // Try new user-specific encryption first, fallback to old method
          let decryptedPassword: string
          try {
            decryptedPassword = decryptPasswordWithUserKey(pwd.password, pwd.ownerId)
          } catch {
            // Fallback to old server-side encryption
            decryptedPassword = decryptPassword(pwd.password)
          }

          // Decrypt TOTP secret if present and generate backup codes
          let decryptedTotpSecret: string | null = null
          let totpBackupCodes: string[] = []
          
          if (pwd.hasTotp && pwd.totpSecret) {
            try {
              // Try new user-specific encryption first
              decryptedTotpSecret = decryptPasswordWithUserKey(pwd.totpSecret, pwd.ownerId)
            } catch {
              // Fallback to old server-side encryption
              try {
                decryptedTotpSecret = decryptPassword(pwd.totpSecret)
              } catch {
                // If decryption fails, leave as null
                decryptedTotpSecret = null
              }
            }

            // Generate 50 backup TOTP codes using HOTP (same algorithm, different counters)
            // TOTP is just HOTP with time-based counter: counter = floor(time / step)
            if (decryptedTotpSecret) {
              const { hotp } = await import("otplib")
              const now = Math.floor(Date.now() / 1000)
              const step = 30 // TOTP default step is 30 seconds
              const currentCounter = Math.floor(now / step)
              
              for (let i = 0; i < 50; i++) {
                const counter = currentCounter + i
                try {
                  const backupCode = hotp.generate(decryptedTotpSecret, counter)
                  const validInSeconds = i * step
                  const validInMinutes = Math.floor(validInSeconds / 60)
                  const remainingSeconds = validInSeconds % 60
                  const timeLabel = validInMinutes > 0 
                    ? `+${validInMinutes}m${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ''}`
                    : `+${validInSeconds}s`
                  totpBackupCodes.push(`${String(i + 1).padStart(2, '0')}. ${backupCode} (${timeLabel})`)
                } catch {
                  // If HOTP fails, skip this code
                  continue
                }
              }
            }
          }
          
          return {
            name: pwd.name,
            username: pwd.username,
            password: decryptedPassword,
            url: pwd.url || null,
            notes: pwd.notes || null,
            folder: pwd.folder?.name || null,
            tags: pwd.tags.map((pt) => pt.tag.name),
            strength: pwd.strength,
            hasTotp: pwd.hasTotp,
            totpSecret: decryptedTotpSecret,
            totpBackupCodes: totpBackupCodes.length > 0 ? totpBackupCodes : null,
            expiresAt: pwd.expiresAt?.toISOString() || null,
            createdAt: pwd.createdAt.toISOString(),
            updatedAt: pwd.updatedAt.toISOString(),
          }
        })
      )

      // Generate export based on format
      const { 
        exportToCSV, 
        exportToJSON, 
        exportToBitwardenJSON, 
        exportToLastPassCSV,
        exportToEncrypted 
      } = await import("@/lib/password-export/exporters")

      let content: string
      let mimeType: string
      let fileExtension: string

      switch (input.format) {
        case "csv":
          content = exportToCSV(exportPasswords, true)
          mimeType = "text/csv"
          fileExtension = "csv"
          break
        case "json":
          content = exportToJSON(exportPasswords, true)
          mimeType = "application/json"
          fileExtension = "json"
          break
        case "bitwarden":
          content = exportToBitwardenJSON(exportPasswords)
          mimeType = "application/json"
          fileExtension = "json"
          break
        case "lastpass":
          content = exportToLastPassCSV(exportPasswords)
          mimeType = "text/csv"
          fileExtension = "csv"
          break
        case "encrypted":
          if (!input.encryptionKey) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Encryption key is required for encrypted exports",
            })
          }
          content = await exportToEncrypted(exportPasswords, input.encryptionKey)
          mimeType = "application/json"
          fileExtension = "json"
          break
        default:
          content = exportToCSV(exportPasswords, true)
          mimeType = "text/csv"
          fileExtension = "csv"
      }

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_EXPORTED",
        resource: "Password",
        details: {
          format: input.format,
          count: exportPasswords.length,
          folderId: input.folderId,
          tagIds: input.tagIds,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
        },
        userId: ctx.userId,
      })

      return {
        content,
        mimeType,
        fileExtension,
        count: exportPasswords.length,
      }
    }),

  getExportFilters: protectedProcedure("password.view")
    .query(async () => {
      // Get folders accessible to user
      const folders = await prisma.folder.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      })

      // Get tags (if tags are used)
      const tags = await prisma.tag.findMany({
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
        },
        orderBy: {
          name: "asc",
        },
      })

      return {
        folders,
        tags,
      }
    }),

  bulkDelete: protectedProcedure("password.delete")
    .input(
      z.object({
        passwordIds: z.array(z.string()).min(1, "At least one password ID is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user owns all passwords or has permission to delete shared passwords
      const passwords = await prisma.password.findMany({
        where: {
          id: { in: input.passwordIds },
        },
        select: {
          id: true,
          ownerId: true,
          name: true,
        },
      })

      // Check ownership - user can only delete their own passwords
      const unauthorized = passwords.filter((p) => p.ownerId !== ctx.userId)
      if (unauthorized.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You don't have permission to delete ${unauthorized.length} password(s)`,
        })
      }

      // Delete passwords
      const { createAuditLog } = await import("@/lib/audit-log")
      const deleted = await prisma.password.deleteMany({
        where: {
          id: { in: input.passwordIds },
          ownerId: ctx.userId, // Double-check ownership
        },
      })

      // Create audit log for each deleted password
      for (const password of passwords) {
        await createAuditLog({
          action: "PASSWORD_DELETED",
          resource: "Password",
          resourceId: password.id,
          details: { name: password.name, bulk: true },
          userId: ctx.userId,
        })
      }

      return {
        success: true,
        deleted: deleted.count,
      }
    }),

  bulkMoveToFolder: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordIds: z.array(z.string()).min(1, "At least one password ID is required"),
        folderId: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user owns all passwords
      const passwords = await prisma.password.findMany({
        where: {
          id: { in: input.passwordIds },
        },
        select: {
          id: true,
          ownerId: true,
          name: true,
        },
      })

      const unauthorized = passwords.filter((p) => p.ownerId !== ctx.userId)
      if (unauthorized.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You don't have permission to move ${unauthorized.length} password(s)`,
        })
      }

      // Verify folder exists if folderId is provided
      if (input.folderId) {
        const folder = await prisma.folder.findUnique({
          where: { id: input.folderId },
        })
        if (!folder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Folder not found",
          })
        }
      }

      // Update passwords
      const updated = await prisma.password.updateMany({
        where: {
          id: { in: input.passwordIds },
          ownerId: ctx.userId,
        },
        data: {
          folderId: input.folderId || null,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      for (const password of passwords) {
        await createAuditLog({
          action: "PASSWORD_UPDATED",
          resource: "Password",
          resourceId: password.id,
          details: { name: password.name, folderId: input.folderId, bulk: true },
          userId: ctx.userId,
        })
      }

      return {
        success: true,
        updated: updated.count,
      }
    }),

  bulkAssignTags: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordIds: z.array(z.string()).min(1, "At least one password ID is required"),
        tagIds: z.array(z.string()).min(1, "At least one tag ID is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user owns all passwords
      const passwords = await prisma.password.findMany({
        where: {
          id: { in: input.passwordIds },
        },
        select: {
          id: true,
          ownerId: true,
        },
      })

      const unauthorized = passwords.filter((p) => p.ownerId !== ctx.userId)
      if (unauthorized.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You don't have permission to modify ${unauthorized.length} password(s)`,
        })
      }

      // Verify tags exist
      const tags = await prisma.tag.findMany({
        where: {
          id: { in: input.tagIds },
        },
      })

      if (tags.length !== input.tagIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or more tags not found",
        })
      }

      // Assign tags to all passwords (using upsert to avoid duplicates)
      const { createAuditLog } = await import("@/lib/audit-log")
      
      for (const passwordId of input.passwordIds) {
        for (const tagId of input.tagIds) {
          await prisma.passwordTag.upsert({
            where: {
              passwordId_tagId: {
                passwordId,
                tagId,
              },
            },
            update: {},
            create: {
              passwordId,
              tagId,
            },
          })
        }

        // Create audit log
        await createAuditLog({
          action: "PASSWORD_UPDATED",
          resource: "Password",
          resourceId: passwordId,
          details: { tagIds: input.tagIds, bulk: true },
          userId: ctx.userId,
        })
      }

      return {
        success: true,
        updated: input.passwordIds.length,
      }
    }),

  bulkRemoveTags: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordIds: z.array(z.string()).min(1, "At least one password ID is required"),
        tagIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user owns all passwords
      const passwords = await prisma.password.findMany({
        where: {
          id: { in: input.passwordIds },
        },
        select: {
          id: true,
          ownerId: true,
        },
      })

      const unauthorized = passwords.filter((p) => p.ownerId !== ctx.userId)
      if (unauthorized.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You don't have permission to modify ${unauthorized.length} password(s)`,
        })
      }

      // Remove tags
      const where: Prisma.PasswordTagWhereInput = {
        passwordId: { in: input.passwordIds },
      }

      if (input.tagIds && input.tagIds.length > 0) {
        where.tagId = { in: input.tagIds }
      }

      const deleted = await prisma.passwordTag.deleteMany({
        where,
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      for (const password of passwords) {
        await createAuditLog({
          action: "PASSWORD_UPDATED",
          resource: "Password",
          resourceId: password.id,
          details: { removedTagIds: input.tagIds, bulk: true },
          userId: ctx.userId,
        })
      }

      return {
        success: true,
        removed: deleted.count,
      }
    }),

  bulkShare: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordIds: z.array(z.string()).min(1, "At least one password ID is required"),
        teamId: z.string(),
        expiresAt: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user owns all passwords
      const passwords = await prisma.password.findMany({
        where: {
          id: { in: input.passwordIds },
        },
        select: {
          id: true,
          ownerId: true,
          name: true,
        },
      })

      const unauthorized = passwords.filter((p) => p.ownerId !== ctx.userId)
      if (unauthorized.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You don't have permission to share ${unauthorized.length} password(s)`,
        })
      }

      // Verify team exists
      const team = await prisma.team.findUnique({
        where: { id: input.teamId },
      })

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Share passwords with team
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
      const { createAuditLog } = await import("@/lib/audit-log")

      for (const passwordId of input.passwordIds) {
        // Check if already shared with this team
        const existingShare = await prisma.passwordShare.findFirst({
          where: {
            passwordId,
            teamId: input.teamId,
          },
        })

        if (!existingShare) {
          await prisma.passwordShare.create({
            data: {
              passwordId,
              teamId: input.teamId,
              expiresAt,
            },
          })

          // Create audit log
          await createAuditLog({
            action: "PASSWORD_SHARED",
            resource: "Password",
            resourceId: passwordId,
            details: { teamId: input.teamId, expiresAt, bulk: true },
            userId: ctx.userId,
          })
        }
      }

      return {
        success: true,
        shared: input.passwordIds.length,
      }
    }),

  bulkUnshare: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordIds: z.array(z.string()).min(1, "At least one password ID is required"),
        teamId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user owns all passwords
      const passwords = await prisma.password.findMany({
        where: {
          id: { in: input.passwordIds },
        },
        select: {
          id: true,
          ownerId: true,
        },
      })

      const unauthorized = passwords.filter((p) => p.ownerId !== ctx.userId)
      if (unauthorized.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You don't have permission to unshare ${unauthorized.length} password(s)`,
        })
      }

      // Unshare passwords
      const where: Prisma.PasswordShareWhereInput = {
        passwordId: { in: input.passwordIds },
      }

      if (input.teamId) {
        where.teamId = input.teamId
      }

      const deleted = await prisma.passwordShare.deleteMany({
        where,
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      for (const password of passwords) {
        await createAuditLog({
          action: "PASSWORD_UNSHARED",
          resource: "Password",
          resourceId: password.id,
          details: { teamId: input.teamId, bulk: true },
          userId: ctx.userId,
        })
      }

      return {
        success: true,
        unshared: deleted.count,
      }
    }),

  bulkUpdateStrength: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordIds: z.array(z.string()).min(1, "At least one password ID is required"),
        strength: z.enum(["WEAK", "MEDIUM", "STRONG"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user owns all passwords
      const passwords = await prisma.password.findMany({
        where: {
          id: { in: input.passwordIds },
        },
        select: {
          id: true,
          ownerId: true,
        },
      })

      const unauthorized = passwords.filter((p) => p.ownerId !== ctx.userId)
      if (unauthorized.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You don't have permission to update ${unauthorized.length} password(s)`,
        })
      }

      // Update password strength
      const updated = await prisma.password.updateMany({
        where: {
          id: { in: input.passwordIds },
          ownerId: ctx.userId,
        },
        data: {
          strength: input.strength,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      for (const password of passwords) {
        await createAuditLog({
          action: "PASSWORD_UPDATED",
          resource: "Password",
          resourceId: password.id,
          details: { strength: input.strength, bulk: true },
          userId: ctx.userId,
        })
      }

      return {
        success: true,
        updated: updated.count,
      }
    }),

  getHistory: protectedProcedure("password.view")
    .input(
      z.object({
        passwordId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify ownership
      const password = await prisma.password.findUnique({
        where: { id: input.passwordId },
        select: { ownerId: true },
      })

      if (!password || password.ownerId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to view this password's history",
        })
      }

      // Get history
      const history = await prisma.passwordHistory.findMany({
        where: { passwordId: input.passwordId },
        include: {
          changedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return {
        history: history.map((h) => ({
          id: h.id,
          name: h.name,
          username: h.username,
          url: h.url,
          notes: h.notes,
          folderId: h.folderId,
          strength: h.strength,
          hasTotp: h.hasTotp,
          expiresAt: h.expiresAt,
          changeType: h.changeType,
          changedBy: h.changedByUser
            ? {
                id: h.changedByUser.id,
                name: h.changedByUser.name,
                email: h.changedByUser.email,
              }
            : null,
          createdAt: h.createdAt,
        })),
      }
    }),

  restoreVersion: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordId: z.string(),
        historyId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const password = await prisma.password.findUnique({
        where: { id: input.passwordId },
        select: { ownerId: true },
      })

      if (!password || password.ownerId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to restore this password",
        })
      }

      // Get history version
      const historyVersion = await prisma.passwordHistory.findUnique({
        where: { id: input.historyId },
      })

      if (!historyVersion || historyVersion.passwordId !== input.passwordId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "History version not found",
        })
      }

      // Get current password data for history
      const { getCurrentPasswordData, savePasswordHistory } = await import("@/lib/password-history")
      const currentData = await getCurrentPasswordData(input.passwordId)

      if (currentData) {
        // Save current state to history before restoring
        await savePasswordHistory(input.passwordId, currentData, ctx.userId, "UPDATE")
      }

      // Restore from history
      const updated = await prisma.password.update({
        where: { id: input.passwordId },
        data: {
          name: historyVersion.name,
          username: historyVersion.username,
          password: historyVersion.password, // Already encrypted
          url: historyVersion.url,
          notes: historyVersion.notes,
          folderId: historyVersion.folderId,
          strength: historyVersion.strength,
          hasTotp: historyVersion.hasTotp,
          totpSecret: historyVersion.totpSecret, // Already encrypted
          expiresAt: historyVersion.expiresAt,
        },
        select: {
          id: true,
          name: true,
          username: true,
          updatedAt: true,
        },
      })

      // Save restored version to history
      await savePasswordHistory(
        input.passwordId,
        {
          name: historyVersion.name,
          username: historyVersion.username,
          password: historyVersion.password,
          url: historyVersion.url,
          notes: historyVersion.notes,
          folderId: historyVersion.folderId,
          strength: historyVersion.strength,
          hasTotp: historyVersion.hasTotp,
          totpSecret: historyVersion.totpSecret,
          expiresAt: historyVersion.expiresAt,
        },
        ctx.userId,
        "RESTORE"
      )

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_RESTORED",
        resource: "Password",
        resourceId: input.passwordId,
        details: { historyId: input.historyId, name: updated.name },
        userId: ctx.userId,
      })

      return {
        success: true,
        password: updated,
      }
    }),

  compareVersions: protectedProcedure("password.view")
    .input(
      z.object({
        passwordId: z.string(),
        historyId1: z.string().optional(),
        historyId2: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify ownership
      const password = await prisma.password.findUnique({
        where: { id: input.passwordId },
        select: { ownerId: true },
      })

      if (!password || password.ownerId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to view this password",
        })
      }

      // Get current password data
      const currentPassword = await prisma.password.findUnique({
        where: { id: input.passwordId },
        select: {
          id: true,
          name: true,
          username: true,
          url: true,
          notes: true,
          folderId: true,
          strength: true,
          hasTotp: true,
          expiresAt: true,
          updatedAt: true,
        },
      })

      if (!currentPassword) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // Get history versions if provided
      let version1 = null
      let version2 = null

      if (input.historyId1) {
        const h1 = await prisma.passwordHistory.findUnique({
          where: { id: input.historyId1 },
          include: {
            changedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        })
        if (h1 && h1.passwordId === input.passwordId) {
          version1 = {
            id: h1.id,
            name: h1.name,
            username: h1.username,
            url: h1.url,
            notes: h1.notes,
            folderId: h1.folderId,
            strength: h1.strength,
            hasTotp: h1.hasTotp,
            expiresAt: h1.expiresAt,
            changeType: h1.changeType,
            changedBy: h1.changedByUser
              ? {
                  id: h1.changedByUser.id,
                  name: h1.changedByUser.name,
                  email: h1.changedByUser.email,
                }
              : null,
            createdAt: h1.createdAt,
          }
        }
      } else {
        // Use current version as version1
        version1 = {
          id: "current",
          name: currentPassword.name,
          username: currentPassword.username,
          url: currentPassword.url,
          notes: currentPassword.notes,
          folderId: currentPassword.folderId,
          strength: currentPassword.strength,
          hasTotp: currentPassword.hasTotp,
          expiresAt: currentPassword.expiresAt,
          changeType: "CURRENT",
          changedBy: null,
          createdAt: currentPassword.updatedAt,
        }
      }

      if (input.historyId2) {
        const h2 = await prisma.passwordHistory.findUnique({
          where: { id: input.historyId2 },
          include: {
            changedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        })
        if (h2 && h2.passwordId === input.passwordId) {
          version2 = {
            id: h2.id,
            name: h2.name,
            username: h2.username,
            url: h2.url,
            notes: h2.notes,
            folderId: h2.folderId,
            strength: h2.strength,
            hasTotp: h2.hasTotp,
            expiresAt: h2.expiresAt,
            changeType: h2.changeType,
            changedBy: h2.changedByUser
              ? {
                  id: h2.changedByUser.id,
                  name: h2.changedByUser.name,
                  email: h2.changedByUser.email,
                }
              : null,
            createdAt: h2.createdAt,
          }
        }
      }

      return {
        version1,
        version2,
        current: {
          id: "current",
          name: currentPassword.name,
          username: currentPassword.username,
          url: currentPassword.url,
          notes: currentPassword.notes,
          folderId: currentPassword.folderId,
          strength: currentPassword.strength,
          hasTotp: currentPassword.hasTotp,
          expiresAt: currentPassword.expiresAt,
          updatedAt: currentPassword.updatedAt,
        },
      }
    }),

  findDuplicates: protectedProcedure("password.view")
    .input(
      z.object({
        threshold: z.number().min(0).max(1).default(0.8).optional(),
      })
    )
    .query(async ({ ctx }) => {
      // Note: input.threshold is available but not yet used
      // Get all passwords owned by the current user
      // This ensures we only detect duplicates in passwords the user owns
      const passwords = await prisma.password.findMany({
        where: {
          ownerId: ctx.userId,
        },
        select: {
          id: true,
          name: true,
          username: true,
          password: true,
          url: true,
          ownerId: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      // Decrypt and group passwords by their decrypted value
      const passwordGroups = new Map<string, Array<typeof passwords[0] & { decryptedPassword: string }>>()

      for (const pwd of passwords) {
        try {
          // Try new user-specific encryption first
          let decrypted: string
          try {
            decrypted = decryptPasswordWithUserKey(pwd.password, pwd.ownerId)
          } catch {
            // Fallback to old server-side encryption
            decrypted = decryptPassword(pwd.password)
          }
          // Normalize whitespace for comparison
          const normalized = decrypted.trim()
          if (!passwordGroups.has(normalized)) {
            passwordGroups.set(normalized, [])
          }
          passwordGroups.get(normalized)!.push({ ...pwd, decryptedPassword: normalized })
        } catch (error) {
          // Skip passwords that can't be decrypted
          console.error(`Failed to decrypt password ${pwd.id}:`, error)
          continue
        }
      }

      // Filter to only groups with duplicates (2+ passwords)
      const duplicates: Array<{
        password: string
        count: number
        entries: Array<{
          id: string
          name: string
          username: string
          url: string | null
          ownerId: string
          owner: { id: string; name: string; email: string }
        }>
      }> = []

      for (const [decryptedPassword, entries] of passwordGroups.entries()) {
        if (entries.length > 1) {
          duplicates.push({
            password: decryptedPassword,
            count: entries.length,
            entries: entries.map((e) => ({
              id: e.id,
              name: e.name,
              username: e.username,
              url: e.url,
              ownerId: e.ownerId,
              owner: e.owner,
            })),
          })
        }
      }

      return {
        duplicates,
        totalDuplicates: duplicates.reduce((sum, d) => sum + d.count, 0),
        uniqueDuplicatedPasswords: duplicates.length,
      }
    }),

  findReused: protectedProcedure("password.view")
    .query(async ({ ctx }) => {
      // Get all passwords owned by the current user
      const passwords = await prisma.password.findMany({
        where: {
          ownerId: ctx.userId,
        },
        select: {
          id: true,
          name: true,
          username: true,
          password: true,
          url: true,
          ownerId: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      // Group by decrypted password value
      const passwordMap = new Map<string, Array<typeof passwords[0] & { decryptedPassword: string }>>()

      for (const pwd of passwords) {
        try {
          // Try new user-specific encryption first
          let decrypted: string
          try {
            decrypted = decryptPasswordWithUserKey(pwd.password, pwd.ownerId)
          } catch {
            // Fallback to old server-side encryption
            decrypted = decryptPassword(pwd.password)
          }
          if (!passwordMap.has(decrypted)) {
            passwordMap.set(decrypted, [])
          }
          passwordMap.get(decrypted)!.push({ ...pwd, decryptedPassword: decrypted })
        } catch {
          continue
        }
      }

      // Find passwords used in multiple entries (reused)
      const reused: Array<{
        password: string
        count: number
        entries: Array<{
          id: string
          name: string
          username: string
          url: string | null
          ownerId: string
          owner: { id: string; name: string; email: string }
        }>
      }> = []

      for (const [decryptedPassword, entries] of passwordMap.entries()) {
        if (entries.length > 1) {
          reused.push({
            password: decryptedPassword,
            count: entries.length,
            entries: entries.map((e) => ({
              id: e.id,
              name: e.name,
              username: e.username,
              url: e.url,
              ownerId: e.ownerId,
              owner: e.owner,
            })),
          })
        }
      }

      return {
        reused,
        totalReused: reused.reduce((sum, r) => sum + r.count, 0),
        uniqueReusedPasswords: reused.length,
      }
    }),

  findSimilar: protectedProcedure("password.view")
    .input(
      z.object({
        threshold: z.number().min(0).max(1).default(0.8).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { calculateSimilarity, arePasswordsSimilar } = await import("@/lib/password-similarity")
      const threshold = input.threshold ?? 0.8

      // Get all passwords owned by the current user
      const passwords = await prisma.password.findMany({
        where: {
          ownerId: ctx.userId,
        },
        select: {
          id: true,
          name: true,
          username: true,
          password: true,
          url: true,
          ownerId: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      // Decrypt all passwords
      const decryptedPasswords = passwords
        .map((pwd) => {
          try {
            // Try new user-specific encryption first
            let decrypted: string
            try {
              decrypted = decryptPasswordWithUserKey(pwd.password, pwd.ownerId)
            } catch {
              // Fallback to old server-side encryption
              decrypted = decryptPassword(pwd.password)
            }
            return {
              ...pwd,
              decryptedPassword: decrypted,
            }
          } catch {
            return null
          }
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)

      // Find similar passwords
      const similarGroups: Array<{
        entries: Array<{
          id: string
          name: string
          username: string
          url: string | null
          ownerId: string
          owner: { id: string; name: string; email: string }
          password: string
        }>
        similarity: number
      }> = []

      const processed = new Set<string>()

      for (let i = 0; i < decryptedPasswords.length; i++) {
        if (processed.has(decryptedPasswords[i].id)) continue

        const group = [decryptedPasswords[i]]
        processed.add(decryptedPasswords[i].id)

        for (let j = i + 1; j < decryptedPasswords.length; j++) {
          if (processed.has(decryptedPasswords[j].id)) continue

          if (arePasswordsSimilar(decryptedPasswords[i].decryptedPassword, decryptedPasswords[j].decryptedPassword, threshold)) {
            group.push(decryptedPasswords[j])
            processed.add(decryptedPasswords[j].id)
          }
        }

        if (group.length > 1) {
          // Calculate average similarity
          let totalSimilarity = 0
          let comparisons = 0
          for (let k = 0; k < group.length; k++) {
            for (let l = k + 1; l < group.length; l++) {
              totalSimilarity += calculateSimilarity(group[k].decryptedPassword, group[l].decryptedPassword)
              comparisons++
            }
          }
          const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0

          similarGroups.push({
            entries: group.map((e) => ({
              id: e.id,
              name: e.name,
              username: e.username,
              url: e.url,
              ownerId: e.ownerId,
              owner: e.owner,
              password: e.decryptedPassword,
            })),
            similarity: avgSimilarity,
          })
        }
      }

      return {
        similarGroups,
        totalSimilar: similarGroups.reduce((sum, g) => sum + g.entries.length, 0),
        uniqueSimilarGroups: similarGroups.length,
      }
    }),

  bulkResolveDuplicates: protectedProcedure("password.edit")
    .input(
      z.object({
        action: z.enum(["delete", "merge"]),
        passwordIds: z.array(z.string()).min(1),
        keepPasswordId: z.string().optional(), // For merge action
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify user owns all passwords
      const passwords = await prisma.password.findMany({
        where: {
          id: { in: input.passwordIds },
        },
        select: {
          id: true,
          ownerId: true,
        },
      })

      const unauthorized = passwords.filter((p) => p.ownerId !== ctx.userId)
      if (unauthorized.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You don't have permission to modify ${unauthorized.length} password(s)`,
        })
      }

      const { createAuditLog } = await import("@/lib/audit-log")

      if (input.action === "delete") {
        // Delete all specified passwords
        const deleted = await prisma.password.deleteMany({
          where: {
            id: { in: input.passwordIds },
            ownerId: ctx.userId,
          },
        })

        // Create audit log
        await createAuditLog({
          action: "PASSWORD_BULK_DELETE",
          resource: "Password",
          resourceId: input.passwordIds[0],
          details: {
            count: deleted.count,
            passwordIds: input.passwordIds,
            reason: "duplicate_resolution",
          },
          userId: ctx.userId,
        })

        return {
          success: true,
          deleted: deleted.count,
        }
      } else if (input.action === "merge" && input.keepPasswordId) {
        // Merge: keep one password, delete others
        if (!input.passwordIds.includes(input.keepPasswordId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "keepPasswordId must be in passwordIds array",
          })
        }

        const passwordsToDelete = input.passwordIds.filter((id) => id !== input.keepPasswordId)

        if (passwordsToDelete.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No passwords to delete for merge",
          })
        }

        const deleted = await prisma.password.deleteMany({
          where: {
            id: { in: passwordsToDelete },
            ownerId: ctx.userId,
          },
        })

        // Create audit log
        await createAuditLog({
          action: "PASSWORD_BULK_MERGE",
          resource: "Password",
          resourceId: input.keepPasswordId,
          details: {
            mergedCount: deleted.count,
            keptPasswordId: input.keepPasswordId,
            deletedPasswordIds: passwordsToDelete,
            reason: "duplicate_resolution",
          },
          userId: ctx.userId,
        })

        return {
          success: true,
          merged: deleted.count,
          keptPasswordId: input.keepPasswordId,
        }
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid action or missing keepPasswordId for merge",
        })
      }
    }),

  checkPasswordBreach: protectedProcedure("password.view")
    .input(
      z.object({
        passwordId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const password = await prisma.password.findUnique({
        where: { id: input.passwordId },
        select: { id: true, password: true, ownerId: true, name: true },
      })

      if (!password || password.ownerId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to check this password",
        })
      }

      // Decrypt password - try both encryption methods
      let decryptedPassword: string
      try {
        // Try new user-specific encryption first
        const { decryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
        decryptedPassword = decryptPasswordWithUserKey(password.password, password.ownerId)
      } catch {
        // Fallback to old server-side encryption
        try {
          decryptedPassword = decryptPassword(password.password)
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to decrypt password. The password may be corrupted or encrypted with an incompatible method.",
          })
        }
      }

      // Check breach using Have I Been Pwned API
      const { checkPasswordBreach } = await import("@/lib/breach-detection")
      const breachResult = await checkPasswordBreach(decryptedPassword)

      // Save breach record
      const breach = await prisma.passwordBreach.create({
        data: {
          passwordId: input.passwordId,
          isBreached: breachResult.isBreached,
          breachCount: breachResult.breachCount,
          hashPrefix: breachResult.hashPrefix,
          checkedBy: ctx.userId,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: breachResult.isBreached ? "PASSWORD_BREACH_DETECTED" : "PASSWORD_BREACH_CHECKED",
        resource: "Password",
        resourceId: input.passwordId,
        details: {
          isBreached: breachResult.isBreached,
          breachCount: breachResult.breachCount,
          passwordName: password.name,
        },
        userId: ctx.userId,
      })

      return {
        success: true,
        isBreached: breachResult.isBreached,
        breachCount: breachResult.breachCount,
        breachId: breach.id,
      }
    }),

  checkAllPasswordsBreach: protectedProcedure("password.view")
    .mutation(async ({ ctx }) => {
      // Get all passwords owned by the user
      const passwords = await prisma.password.findMany({
        where: {
          ownerId: ctx.userId,
        },
        select: {
          id: true,
          password: true,
          name: true,
          ownerId: true,
        },
      })

      const { checkMultiplePasswords } = await import("@/lib/breach-detection")
      const { createAuditLog } = await import("@/lib/audit-log")

      const results = []
      let breachedCount = 0

      // Decrypt and check each password
      for (const pwd of passwords) {
        try {
          // Try both encryption methods
          let decryptedPassword: string
          try {
            // Try new user-specific encryption first
            const { decryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
            decryptedPassword = decryptPasswordWithUserKey(pwd.password, pwd.ownerId)
          } catch {
            // Fallback to old server-side encryption
            try {
              decryptedPassword = decryptPassword(pwd.password)
            } catch (decryptError) {
              // Skip passwords that can't be decrypted
              console.error(`Failed to decrypt password ${pwd.id}:`, decryptError)
              continue
            }
          }
          const breachResult = await checkMultiplePasswords([decryptedPassword])
          
          if (breachResult.length > 0) {
            const result = breachResult[0]
            
            // Save breach record
            const breach = await prisma.passwordBreach.create({
              data: {
                passwordId: pwd.id,
                isBreached: result.isBreached,
                breachCount: result.breachCount,
                hashPrefix: result.hashPrefix,
                checkedBy: ctx.userId,
              },
            })

            if (result.isBreached) {
              breachedCount++
            }

            results.push({
              passwordId: pwd.id,
              passwordName: pwd.name,
              isBreached: result.isBreached,
              breachCount: result.breachCount,
              breachId: breach.id,
            })

            // Create audit log
            await createAuditLog({
              action: result.isBreached ? "PASSWORD_BREACH_DETECTED" : "PASSWORD_BREACH_CHECKED",
              resource: "Password",
              resourceId: pwd.id,
              details: {
                isBreached: result.isBreached,
                breachCount: result.breachCount,
                passwordName: pwd.name,
                bulkCheck: true,
              },
              userId: ctx.userId,
            })
          }
        } catch (error) {
          // Skip passwords that can't be decrypted
          console.error(`Failed to check password ${pwd.id}:`, error)
          continue
        }
      }

      return {
        success: true,
        checked: passwords.length,
        breached: breachedCount,
        results,
      }
    }),

  getBreachHistory: protectedProcedure("password.view")
    .input(
      z.object({
        passwordId: z.string().optional(),
        includeResolved: z.boolean().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      // Build where clause
      const where: Prisma.PasswordBreachWhereInput = {
        password: {
          ownerId: ctx.userId,
        },
      }

      if (input.passwordId) {
        where.passwordId = input.passwordId
      }

      if (!input.includeResolved) {
        where.resolved = false
      }

      // Get breach history
      const breaches = await prisma.passwordBreach.findMany({
        where,
        include: {
          password: {
            select: {
              id: true,
              name: true,
              username: true,
              url: true,
            },
          },
          checkedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          resolvedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          checkedAt: "desc",
        },
      })

      return {
        breaches,
        total: breaches.length,
        breached: breaches.filter((b) => b.isBreached && !b.resolved).length,
      }
    }),

  resolveBreach: protectedProcedure("password.edit")
    .input(
      z.object({
        breachId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get breach record
      const breach = await prisma.passwordBreach.findUnique({
        where: { id: input.breachId },
        include: {
          password: {
            select: {
              id: true,
              ownerId: true,
              name: true,
            },
          },
        },
      })

      if (!breach) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Breach record not found",
        })
      }

      // Verify ownership
      if (breach.password.ownerId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to resolve this breach",
        })
      }

      // Mark as resolved
      const updated = await prisma.passwordBreach.update({
        where: { id: input.breachId },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: ctx.userId,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "PASSWORD_BREACH_RESOLVED",
        resource: "Password",
        resourceId: breach.passwordId,
        details: {
          breachId: input.breachId,
          passwordName: breach.password.name,
        },
        userId: ctx.userId,
      })

      return {
        success: true,
        breach: updated,
      }
    }),

  toggleFavorite: protectedProcedure("password.edit")
    .input(
      z.object({
        passwordId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify password ownership
      const password = await prisma.password.findFirst({
        where: {
          id: input.passwordId,
          ownerId: ctx.userId,
        },
        select: {
          id: true,
          name: true,
          isFavorite: true,
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // Toggle favorite status
      const updated = await prisma.password.update({
        where: { id: input.passwordId },
        data: {
          isFavorite: !password.isFavorite,
        },
        select: {
          id: true,
          isFavorite: true,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: updated.isFavorite ? "PASSWORD_FAVORITED" : "PASSWORD_UNFAVORITED",
        resource: "Password",
        resourceId: input.passwordId,
        details: {
          passwordName: password.name,
        },
        userId: ctx.userId,
      })

      return {
        success: true,
        isFavorite: updated.isFavorite,
      }
    }),

  getFavorites: protectedProcedure("password.view")
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input = {}, ctx }) => {
      const { page = 1, pageSize = 20, search } = input

      // Build search conditions
      const searchConditions = search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { username: { contains: search, mode: "insensitive" as const } },
              { url: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}

      // Query only passwords owned by the user that are favorited
      const where = {
        ownerId: ctx.userId,
        isFavorite: true,
        ...searchConditions,
      }

      const [passwords, total] = await Promise.all([
        prisma.password.findMany({
          where,
          select: {
            id: true,
            name: true,
            username: true,
            url: true,
            folderId: true,
            strength: true,
            hasTotp: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
            ownerId: true,
            isFavorite: true,
            folder: {
              select: {
                id: true,
                name: true,
              },
            },
            sharedWith: {
              select: {
                id: true,
                teamId: true,
                expiresAt: true,
                team: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.password.count({ where }),
      ])

      const totalPages = Math.ceil(total / pageSize)

      return {
        passwords: passwords.map((pwd) => ({
          id: pwd.id,
          name: pwd.name,
          username: pwd.username,
          url: pwd.url,
          folder: pwd.folder?.name || null,
          folderId: pwd.folderId,
          strength: pwd.strength.toLowerCase() as "strong" | "medium" | "weak",
          hasTotp: pwd.hasTotp,
          shared: pwd.sharedWith.length > 0,
          sharedWith: pwd.sharedWith.map((share) => ({
            shareId: share.id,
            teamId: share.teamId,
            teamName: share.team?.name || "",
            expiresAt: share.expiresAt,
          })),
          isOwner: true,
          isFavorite: pwd.isFavorite,
          lastModified: pwd.updatedAt.toISOString().split("T")[0],
          expiresIn: pwd.expiresAt
            ? Math.ceil((pwd.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null,
          createdAt: pwd.createdAt,
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      }
    }),

  // Tag Autocomplete
  tagAutocomplete: protectedProcedure("password.view")
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      // Get user's company ID
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      // Get tags that are used by passwords from the same company
      const tagWhere: Prisma.TagWhereInput = {
        name: {
          contains: input.query,
          mode: "insensitive",
        },
      }

      // Filter tags by company through password usage
      if (user?.companyId) {
        tagWhere.passwords = {
          some: {
            password: {
              owner: {
                companyId: user.companyId,
              },
            },
          },
        }
      } else {
        // If no company, only show tags used by current user's passwords
        tagWhere.passwords = {
          some: {
            password: {
              ownerId: ctx.userId,
            },
          },
        }
      }

      const tags = await prisma.tag.findMany({
        where: tagWhere,
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          _count: {
            select: {
              passwords: {
                where: user?.companyId
                  ? {
                      password: {
                        owner: {
                          companyId: user.companyId,
                        },
                      },
                    }
                  : {
                      password: {
                        ownerId: ctx.userId,
                      },
                    },
              },
            },
          },
        },
        orderBy: {
          name: "asc",
        },
        take: input.limit * 2, // Get more to sort by usage
      })

      // Sort by usage count and take limit
      const sortedTags = tags
        .sort((a, b) => b._count.passwords - a._count.passwords)
        .slice(0, input.limit)

      return sortedTags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
        usageCount: tag._count.passwords,
      }))
    }),

  // Tag Suggestions (based on password context)
  tagSuggestions: protectedProcedure("password.view")
    .input(
      z.object({
        passwordId: z.string().optional(),
        limit: z.number().min(1).max(20).default(10),
      }).optional()
    )
    .query(async ({ input = {}, ctx }) => {
      const { passwordId, limit = 10 } = input

      // Get user's passwords to analyze tag patterns
      const userPasswords = await prisma.password.findMany({
        where: {
          ownerId: ctx.userId,
        },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
        take: 100, // Analyze recent passwords
        orderBy: {
          updatedAt: "desc",
        },
      })

      // Count tag frequencies
      const tagFrequency = new Map<string, { tag: { id: string; name: string; color: string | null; icon: string | null }; count: number }>()
      
      for (const password of userPasswords) {
        for (const passwordTag of password.tags) {
          const tagId = passwordTag.tag.id
          const existing = tagFrequency.get(tagId)
          if (existing) {
            existing.count++
          } else {
            tagFrequency.set(tagId, {
              tag: passwordTag.tag,
              count: 1,
            })
          }
        }
      }

      // If passwordId is provided, exclude tags already on that password
      let existingTagIds: string[] = []
      if (passwordId) {
        const password = await prisma.password.findFirst({
          where: {
            id: passwordId,
            ownerId: ctx.userId,
          },
          include: {
            tags: {
              select: {
                tagId: true,
              },
            },
          },
        })
        if (password) {
          existingTagIds = password.tags.map((pt) => pt.tagId)
        }
      }

      // Sort by frequency and return top suggestions
      const suggestions = Array.from(tagFrequency.values())
        .filter((item) => !existingTagIds.includes(item.tag.id))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((item) => ({
          id: item.tag.id,
          name: item.tag.name,
          color: item.tag.color,
          icon: item.tag.icon,
          usageCount: item.count,
        }))

      return suggestions
    }),

  // Tag Analytics (most used tags)
  tagAnalytics: protectedProcedure("password.view")
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      }).optional()
    )
    .query(async ({ input = {}, ctx }) => {
      const { limit = 10 } = input

      // Get all tags
      const allTags = await prisma.tag.findMany({
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
        },
      })

      // Get user's password IDs
      const userPasswordIds = await prisma.password.findMany({
        where: {
          ownerId: ctx.userId,
        },
        select: {
          id: true,
        },
      })

      const passwordIds = userPasswordIds.map((p) => p.id)

      // Count tag usage for user's passwords
      const tagUsageCounts = await prisma.passwordTag.groupBy({
        by: ["tagId"],
        where: {
          passwordId: {
            in: passwordIds,
          },
        },
        _count: {
          id: true,
        },
      })

      // Create a map of tagId to usage count
      const usageMap = new Map(
        tagUsageCounts.map((item) => [item.tagId, item._count.id])
      )

      // Combine tags with their usage counts
      const tagsWithUsage = allTags
        .map((tag) => ({
          ...tag,
          usageCount: usageMap.get(tag.id) || 0,
        }))
        .filter((tag) => tag.usageCount > 0) // Only include tags that are used
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, limit)

      const totalPasswords = passwordIds.length

      return tagsWithUsage.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
        usageCount: tag.usageCount,
        usagePercentage: totalPasswords > 0
          ? Math.round((tag.usageCount / totalPasswords) * 100)
          : 0,
      }))
    }),

  // Tag Management
  createTag: protectedProcedure("password.edit")
    .input(
      z.object({
        name: z.string().min(1, "Tag name is required"),
        color: z.string().optional().nullable(),
        icon: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Missing company context for tag creation",
        })
      }
      // Check if tag with same name already exists for this company
      const existingTag = await prisma.tag.findUnique({
        where: {
          name_companyId: {
            name: input.name,
            companyId: ctx.companyId,
          },
        },
      })

      if (existingTag) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tag with this name already exists",
        })
      }

      const tag = await prisma.tag.create({
        data: {
          name: input.name,
          color: input.color || null,
          icon: input.icon || null,
          companyId: ctx.companyId,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TAG_CREATED",
        resource: "Tag",
        resourceId: tag.id,
        details: {
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
        },
        userId: ctx.userId,
      })

      return tag
    }),

  updateTag: protectedProcedure("password.edit")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1, "Tag name is required").optional(),
        color: z.string().optional().nullable(),
        icon: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.companyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Missing company context for tag update",
        })
      }
      const { id, ...updateData } = input

      // Check if tag exists
      const existingTag = await prisma.tag.findUnique({
        where: { id },
      })

      if (!existingTag) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tag not found",
        })
      }

      // If name is being updated, check for conflicts
      if (updateData.name && updateData.name !== existingTag.name) {
        const nameConflict = await prisma.tag.findUnique({
          where: {
            name_companyId: {
              name: updateData.name,
              companyId: ctx.companyId,
            },
          },
        })

        if (nameConflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Tag with this name already exists",
          })
        }
      }

      const tag = await prisma.tag.update({
        where: { id },
        data: {
          ...(updateData.name && { name: updateData.name }),
          color: updateData.color !== undefined ? updateData.color : existingTag.color,
          icon: updateData.icon !== undefined ? updateData.icon : existingTag.icon,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TAG_UPDATED",
        resource: "Tag",
        resourceId: tag.id,
        details: {
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
        },
        userId: ctx.userId,
      })

      return tag
    }),

  // ========== Advanced Search Features ==========

  // Saved Searches
  listSavedSearches: protectedProcedure("password.view")
    .query(async ({ ctx }) => {
      const savedSearches = await prisma.savedSearch.findMany({
        where: {
          userId: ctx.userId,
        },
        orderBy: {
          lastUsedAt: { sort: "desc", nulls: "last" },
        },
      })

      return { savedSearches }
    }),

  createSavedSearch: protectedProcedure("password.view")
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        query: z.string().optional(),
        folderIds: z.array(z.string()).optional(),
        tagIds: z.array(z.string()).optional(),
        filter: z.enum(["weak", "expiring", "favorites"]).optional(),
        searchFields: z.array(z.enum(["name", "username", "url", "notes"])).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const savedSearch = await prisma.savedSearch.create({
        data: {
          userId: ctx.userId,
          name: input.name,
          query: input.query || null,
          folderIds: input.folderIds || [],
          tagIds: input.tagIds || [],
          filter: input.filter || null,
          searchFields: input.searchFields || [],
        },
      })

      return { savedSearch }
    }),

  updateSavedSearch: protectedProcedure("password.view")
    .input(
      z.object({
        id: z.string().min(1, "ID is required"),
        name: z.string().min(1, "Name is required").optional(),
        query: z.string().optional().nullable(),
        folderIds: z.array(z.string()).optional(),
        tagIds: z.array(z.string()).optional(),
        filter: z.enum(["weak", "expiring", "favorites"]).optional().nullable(),
        searchFields: z.array(z.enum(["name", "username", "url", "notes"])).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input

      // Verify ownership
      const existing = await prisma.savedSearch.findFirst({
        where: {
          id,
          userId: ctx.userId,
        },
      })

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Saved search not found",
        })
      }

      const savedSearch = await prisma.savedSearch.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.query !== undefined && { query: data.query }),
          ...(data.folderIds !== undefined && { folderIds: data.folderIds }),
          ...(data.tagIds !== undefined && { tagIds: data.tagIds }),
          ...(data.filter !== undefined && { filter: data.filter }),
          ...(data.searchFields !== undefined && { searchFields: data.searchFields }),
        },
      })

      return { savedSearch }
    }),

  deleteSavedSearch: protectedProcedure("password.view")
    .input(
      z.object({
        id: z.string().min(1, "ID is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const existing = await prisma.savedSearch.findFirst({
        where: {
          id: input.id,
          userId: ctx.userId,
        },
      })

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Saved search not found",
        })
      }

      await prisma.savedSearch.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  executeSavedSearch: baseProcedure
    .use(async ({ ctx, next }) => {
      // Check if user is authenticated
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You must be logged in to perform this action",
        })
      }
      return next({ ctx })
    })
    .input(
      z.object({
        id: z.string().min(1, "ID is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const savedSearch = await prisma.savedSearch.findFirst({
        where: {
          id: input.id,
          userId: ctx.userId,
        },
      })

      if (!savedSearch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Saved search not found",
        })
      }

      // Update lastUsedAt
      await prisma.savedSearch.update({
        where: { id: input.id },
        data: { lastUsedAt: new Date() },
      })

      return {
        searchParams: {
          search: savedSearch.query || undefined,
          folderIds: savedSearch.folderIds.length > 0 ? savedSearch.folderIds : undefined,
          tagIds: savedSearch.tagIds.length > 0 ? savedSearch.tagIds : undefined,
          filter: savedSearch.filter || undefined,
          searchFields: savedSearch.searchFields.length > 0 ? savedSearch.searchFields : undefined,
        },
      }
    }),

  // Search History
  listSearchHistory: protectedProcedure("password.view")
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
      }).optional()
    )
    .query(async ({ input = {}, ctx }) => {
      const { limit = 20 } = input

      const history = await prisma.searchHistory.findMany({
        where: {
          userId: ctx.userId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
      })

      return { history }
    }),

  saveSearchHistory: protectedProcedure("password.view")
    .input(
      z.object({
        query: z.string().optional(),
        folderIds: z.array(z.string()).optional(),
        tagIds: z.array(z.string()).optional(),
        filter: z.enum(["weak", "expiring", "favorites"]).optional(),
        searchFields: z.array(z.enum(["name", "username", "url", "notes"])).optional(),
        resultCount: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Don't save empty searches
      if (!input.query && (!input.folderIds || input.folderIds.length === 0) && 
          (!input.tagIds || input.tagIds.length === 0) && !input.filter) {
        return { success: true }
      }

      await prisma.searchHistory.create({
        data: {
          userId: ctx.userId,
          query: input.query || null,
          folderIds: input.folderIds || [],
          tagIds: input.tagIds || [],
          filter: input.filter || null,
          searchFields: input.searchFields || [],
          resultCount: input.resultCount || null,
        },
      })

      // Keep only last 100 search history entries per user
      const count = await prisma.searchHistory.count({
        where: { userId: ctx.userId },
      })

      if (count > 100) {
        const toDelete = await prisma.searchHistory.findMany({
          where: { userId: ctx.userId },
          orderBy: { createdAt: "asc" },
          take: count - 100,
          select: { id: true },
        })

        if (toDelete.length > 0) {
          await prisma.searchHistory.deleteMany({
            where: {
              id: { in: toDelete.map((h) => h.id) },
            },
          })
        }
      }

      return { success: true }
    }),

  clearSearchHistory: protectedProcedure("password.view")
    .mutation(async ({ ctx }) => {
      await prisma.searchHistory.deleteMany({
        where: {
          userId: ctx.userId,
        },
      })

      return { success: true }
    }),

  // ========== Password Templates ==========

  listTemplates: protectedProcedure("password.view")
    .input(
      z.object({
        category: z.string().optional(),
        service: z.string().optional(),
        includeSystem: z.boolean().default(true),
        includePublic: z.boolean().default(true),
        includeOwn: z.boolean().default(true),
      }).optional()
    )
    .query(async ({ input = {}, ctx }) => {
      const { category, service, includeSystem, includePublic, includeOwn } = input

      // Get user's company ID
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      const orConditions: Prisma.PasswordTemplateWhereInput[] = []

      // System templates
      if (includeSystem) {
        orConditions.push({ isSystem: true })
      }

      // Public templates
      if (includePublic) {
        orConditions.push({ isPublic: true })
      }

      // User's own templates
      if (includeOwn) {
        orConditions.push({ ownerId: ctx.userId })
      }

      // Company templates
      if (user?.companyId) {
        orConditions.push({ companyId: user.companyId })
      }

      const where: Prisma.PasswordTemplateWhereInput = {
        OR: orConditions.length > 0 ? orConditions : [{ id: "" }], // Empty condition if no OR clauses
      }

      // Filter by category
      if (category) {
        where.category = category
      }

      // Filter by service
      if (service) {
        where.service = service
      }

      const templates = await prisma.passwordTemplate.findMany({
        where,
        orderBy: [
          { isSystem: "desc" }, // System templates first
          { usageCount: "desc" }, // Most used first
          { name: "asc" },
        ],
        select: {
          id: true,
          name: true,
          description: true,
          service: true,
          icon: true,
          category: true,
          isSystem: true,
          isPublic: true,
          ownerId: true,
          defaultFields: true,
          usageCount: true,
          createdAt: true,
        },
      })

      return { templates }
    }),

  getTemplate: protectedProcedure("password.view")
    .input(
      z.object({
        id: z.string().min(1, "Template ID is required"),
      })
    )
    .query(async ({ input, ctx }) => {
      // Get user's company ID
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      const template = await prisma.passwordTemplate.findFirst({
        where: {
          id: input.id,
          OR: [
            { isSystem: true },
            { isPublic: true },
            { ownerId: ctx.userId },
            ...(user?.companyId ? [{ companyId: user.companyId }] : []),
          ],
        },
      })

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        })
      }

      return { template }
    }),

  createTemplate: protectedProcedure("password.create")
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        description: z.string().optional(),
        service: z.string().optional(),
        icon: z.string().optional(),
        category: z.string().optional(),
        isPublic: z.boolean().default(false),
        defaultFields: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get user's company ID
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      const template = await prisma.passwordTemplate.create({
        data: {
          name: input.name,
          description: input.description || null,
          service: input.service || null,
          icon: input.icon || null,
          category: input.category || null,
          isPublic: input.isPublic,
          ownerId: ctx.userId,
          companyId: user?.companyId || null,
          defaultFields: (input.defaultFields || {}) as Prisma.InputJsonValue,
        },
      })

      return { template }
    }),

  updateTemplate: protectedProcedure("password.edit")
    .input(
      z.object({
        id: z.string().min(1, "Template ID is required"),
        name: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        service: z.string().optional().nullable(),
        icon: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        isPublic: z.boolean().optional(),
        defaultFields: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input

      // Get user's company ID
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      // Verify ownership (user can't edit system templates)
      // User can edit their own templates or company templates
      const existing = await prisma.passwordTemplate.findFirst({
        where: {
          id,
          isSystem: false, // Can't edit system templates
          OR: [
            { ownerId: ctx.userId },
            ...(user?.companyId ? [{ companyId: user.companyId }] : []),
          ],
        },
      })

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found or you don't have permission to edit it",
        })
      }

      const template = await prisma.passwordTemplate.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.service !== undefined && { service: data.service }),
          ...(data.icon !== undefined && { icon: data.icon }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
          ...(data.defaultFields && { defaultFields: data.defaultFields as Prisma.InputJsonValue }),
        },
      })

      return { template }
    }),

  deleteTemplate: protectedProcedure("password.delete")
    .input(
      z.object({
        id: z.string().min(1, "Template ID is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get user's company ID
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      // Verify ownership (user can't delete system templates)
      // User can delete their own templates or company templates
      const existing = await prisma.passwordTemplate.findFirst({
        where: {
          id: input.id,
          isSystem: false, // Can't delete system templates
          OR: [
            { ownerId: ctx.userId },
            ...(user?.companyId ? [{ companyId: user.companyId }] : []),
          ],
        },
      })

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found or you don't have permission to delete it",
        })
      }

      await prisma.passwordTemplate.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  useTemplate: protectedProcedure("password.view")
    .input(
      z.object({
        id: z.string().min(1, "Template ID is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get user's company ID
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { companyId: true },
      })

      // Build OR conditions for template access
      const templateWhere: Prisma.PasswordTemplateWhereInput = {
        id: input.id,
        OR: [
          { isSystem: true },
          { isPublic: true },
          { ownerId: ctx.userId },
          ...(user?.companyId ? [{ companyId: user.companyId }] : []),
        ],
      }

      // Increment usage count
      await prisma.passwordTemplate.updateMany({
        where: templateWhere,
        data: {
          usageCount: {
            increment: 1,
          },
        },
      })

      // Get template
      const template = await prisma.passwordTemplate.findFirst({
        where: templateWhere,
      })

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        })
      }

      return {
        template: {
          id: template.id,
          name: template.name,
          defaultFields: template.defaultFields,
        },
      }
    }),

  deleteTag: protectedProcedure("password.edit")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Check if tag exists
      const tag = await prisma.tag.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              passwords: true,
            },
          },
        },
      })

      if (!tag) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tag not found",
        })
      }

      // Delete tag (cascade will remove PasswordTag relations)
      await prisma.tag.delete({
        where: { id: input.id },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TAG_DELETED",
        resource: "Tag",
        resourceId: input.id,
        details: {
          name: tag.name,
          passwordCount: tag._count.passwords,
        },
        userId: ctx.userId,
      })

      return { success: true }
    }),

  // Temporary Password Sharing
  createTemporaryShare: protectedProcedure("password.share")
    .input(
      z.object({
        passwordId: z.string(),
        expiresAt: z.date().optional(),
        maxAccesses: z.number().min(1).max(100).optional(),
        isOneTime: z.boolean().default(false),
        includeTotp: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if password exists and is owned by current user
      const password = await prisma.password.findUnique({
        where: { id: input.passwordId },
        include: {
          owner: {
            select: {
              id: true,
              companyId: true,
            },
          },
        },
      })

      if (!password) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Password not found",
        })
      }

      // Check if user owns the password
      if (password.ownerId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only create temporary shares for passwords you own",
        })
      }

      // Generate secure share token
      const crypto = await import("crypto")
      const shareToken = crypto.randomBytes(32).toString("hex")

      // Create temporary share
      const temporaryShare = await prisma.temporaryPasswordShare.create({
        data: {
          passwordId: input.passwordId,
          shareToken,
          createdBy: ctx.userId,
          expiresAt: input.expiresAt || null,
          maxAccesses: input.maxAccesses || null,
          isOneTime: input.isOneTime,
          includeTotp: input.includeTotp && password.hasTotp, // Only include TOTP if password has TOTP enabled
        },
        select: {
          id: true,
          shareToken: true,
          expiresAt: true,
          maxAccesses: true,
          isOneTime: true,
          includeTotp: true,
          createdAt: true,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TEMPORARY_PASSWORD_SHARE_CREATED",
        resource: "Password",
        resourceId: input.passwordId,
        details: {
          passwordName: password.name,
          expiresAt: input.expiresAt?.toISOString() || null,
          maxAccesses: input.maxAccesses || null,
          isOneTime: input.isOneTime,
          includeTotp: temporaryShare.includeTotp,
        },
        userId: ctx.userId,
      })

      return {
        success: true,
        share: temporaryShare,
        shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/share/${temporaryShare.shareToken}`,
      }
    }),

  accessTemporaryShare: baseProcedure
    .input(
      z.object({
        shareToken: z.string(),
      })
    )
    .query(async ({ input }) => {
      const temporaryShare = await prisma.temporaryPasswordShare.findUnique({
        where: { shareToken: input.shareToken },
        select: {
          id: true,
          passwordId: true,
          includeTotp: true,
          expiresAt: true,
          maxAccesses: true,
          accessCount: true,
          isOneTime: true,
          revokedAt: true,
          password: {
            select: {
              id: true,
              name: true,
              username: true,
              password: true, // Encrypted
              url: true,
              notes: true,
              hasTotp: true,
              totpSecret: true, // Encrypted
              ownerId: true, // Needed for decryption
              owner: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      })

      if (!temporaryShare) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Share link not found or has been revoked",
        })
      }

      // Check if share is revoked
      if (temporaryShare.revokedAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This share link has been revoked",
        })
      }

      // Check if share is expired
      if (temporaryShare.expiresAt && temporaryShare.expiresAt < new Date()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This share link has expired",
        })
      }

      // Check if max accesses reached
      if (
        temporaryShare.maxAccesses &&
        temporaryShare.accessCount >= temporaryShare.maxAccesses
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Maximum number of accesses reached for this share link",
        })
      }

      // Increment access count and update accessedAt
      await prisma.temporaryPasswordShare.update({
        where: { id: temporaryShare.id },
        data: {
          accessCount: { increment: 1 },
          accessedAt: new Date(),
        },
      })

      // If one-time share, mark as revoked after access
      if (temporaryShare.isOneTime) {
        await prisma.temporaryPasswordShare.update({
          where: { id: temporaryShare.id },
          data: {
            revokedAt: new Date(),
          },
        })
      }

      // Decrypt password - handle both old and new encryption methods
      let decryptedPassword: string
      let decryptedTotpSecret: string | null = null
      
      // Try new encryption method first (user-specific key)
      try {
        const { decryptPasswordWithUserKey } = await import("@/lib/server-crypto-migration")
        const passwordOwner = await prisma.password.findUnique({
          where: { id: temporaryShare.passwordId },
          select: { ownerId: true },
        })
        
        if (passwordOwner?.ownerId) {
          decryptedPassword = decryptPasswordWithUserKey(temporaryShare.password.password, passwordOwner.ownerId)
          // Only decrypt TOTP secret if includeTotp is true
          if (temporaryShare.includeTotp && temporaryShare.password.totpSecret) {
            decryptedTotpSecret = decryptPasswordWithUserKey(temporaryShare.password.totpSecret, passwordOwner.ownerId)
          }
        } else {
          throw new Error("Password owner not found")
        }
      } catch {
        // Try old encryption method (backward compatibility)
        try {
          decryptedPassword = decryptPassword(temporaryShare.password.password)
          // Only decrypt TOTP secret if includeTotp is true
          if (temporaryShare.includeTotp && temporaryShare.password.totpSecret) {
            decryptedTotpSecret = decryptPassword(temporaryShare.password.totpSecret)
          }
        } catch (oldError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to decrypt password. The password may be corrupted or encrypted with an unknown key.",
            cause: oldError,
          })
        }
      }

      // For temporary shares with TOTP, we return the encrypted TOTP secret
      // so the client can generate TOTP codes client-side and update them every 30 seconds
      // This is more efficient than polling the server and allows real-time updates
      let encryptedTotpSecret: string | null = null
      if (temporaryShare.includeTotp && decryptedTotpSecret) {
        const { encryptWithShareToken } = await import("@/lib/server-crypto-migration")
        encryptedTotpSecret = encryptWithShareToken(decryptedTotpSecret, input.shareToken)
      }

      // Encrypt password with share token for secure transmission
      // This ensures passwords are never transmitted in plain text, even for temporary shares
      // The client will decrypt using the share token they already have
      const { encryptWithShareToken } = await import("@/lib/server-crypto-migration")
      const encryptedPassword = encryptWithShareToken(decryptedPassword, input.shareToken)

      return {
        password: {
          ...temporaryShare.password,
          password: encryptedPassword, // Encrypted with share token
          passwordEncrypted: true, // Flag to indicate it's encrypted
          totpSecret: encryptedTotpSecret, // Encrypted TOTP secret (client will generate codes)
          totpEncrypted: encryptedTotpSecret !== null, // Flag to indicate if TOTP secret is encrypted
        },
        totpCode: null, // Client will generate TOTP codes from the secret
        totpEncrypted: false, // Not applicable since we're returning the secret
        shareInfo: {
          expiresAt: temporaryShare.expiresAt,
          maxAccesses: temporaryShare.maxAccesses,
          accessCount: temporaryShare.accessCount + 1,
          isOneTime: temporaryShare.isOneTime,
          includeTotp: temporaryShare.includeTotp, // Include flag so client knows if TOTP should be available
        },
      }
    }),

  listTemporaryShares: protectedProcedure("password.view")
    .input(
      z.object({
        passwordId: z.string().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const where: Prisma.TemporaryPasswordShareWhereInput = {
        createdBy: ctx.userId,
      }

      if (input?.passwordId) {
        where.passwordId = input.passwordId
      }

      const shares = await prisma.temporaryPasswordShare.findMany({
        where,
        include: {
          password: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      return shares.map((share) => ({
        id: share.id,
        shareToken: share.shareToken,
        passwordId: share.passwordId,
        passwordName: share.password.name,
        expiresAt: share.expiresAt,
        maxAccesses: share.maxAccesses,
        accessCount: share.accessCount,
        isOneTime: share.isOneTime,
        revokedAt: share.revokedAt,
        createdAt: share.createdAt,
        accessedAt: share.accessedAt,
        shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/share/${share.shareToken}`,
      }))
    }),

  revokeTemporaryShare: protectedProcedure("password.share")
    .input(
      z.object({
        shareId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const share = await prisma.temporaryPasswordShare.findUnique({
        where: { id: input.shareId },
        include: {
          password: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Share not found",
        })
      }

      // Check if user created this share
      if (share.createdBy !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only revoke shares you created",
        })
      }

      // Check if already revoked
      if (share.revokedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This share has already been revoked",
        })
      }

      // Revoke the share
      await prisma.temporaryPasswordShare.update({
        where: { id: input.shareId },
        data: {
          revokedAt: new Date(),
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "TEMPORARY_PASSWORD_SHARE_REVOKED",
        resource: "Password",
        resourceId: share.passwordId,
        details: {
          passwordName: share.password.name,
          shareId: input.shareId,
        },
        userId: ctx.userId,
      })

      return { success: true }
    }),
})


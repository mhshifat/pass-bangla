
import prisma from "@/lib/prisma"
import { baseProcedure, createTRPCRouter, protectedProcedure } from "@/trpc/init"
import z from "zod"
import { TRPCError } from "@trpc/server"
import { encrypt, decrypt } from "@/lib/crypto"
import { getPasswordPolicy } from "@/lib/password-policy"
import {
  getDataRetentionPolicy,
  exportUserData,
  deleteUserData,
  cleanupExpiredData,
} from "@/lib/gdpr-compliance"

import { syncPermissionsAndRoles } from "@/lib/sync-permissions"

export const settingsRouter = createTRPCRouter({
  getEmailConfig: protectedProcedure("settings.view").query(async () => {
    const settings = await prisma.settings.findMany({
      where: {
        key: {
          in: [
            "smtp_host",
            "smtp_port",
            "smtp_secure",
            "smtp_user",
            "smtp_password",
            "smtp_from_email",
            "smtp_from_name",
          ],
        },
      },
    })

    const config: Record<string, unknown> = {}

    const decryptKeys = [
      "smtp_host",
      "smtp_port",
      "smtp_secure",
      "smtp_user",
      "smtp_password",
      "smtp_from_email",
      "smtp_from_name",
    ]
    settings.forEach((setting) => {
      if (decryptKeys.includes(setting.key)) {
        config[setting.key] = setting.value ? decrypt(setting.value as string) : ""
      } else {
        config[setting.key] = setting.value
      }
    })

    return {
      smtp_host: (config.smtp_host as string) || "",
      smtp_port: (config.smtp_port as string) || "587",
      smtp_secure: (config.smtp_secure as boolean) || false,
      smtp_user: (config.smtp_user as string) || "",
      smtp_password: (config.smtp_password as string) || "",
      smtp_from_email: (config.smtp_from_email as string) || "",
      smtp_from_name: (config.smtp_from_name as string) || "PassBangla",
    }
  }),

  updateEmailConfig: protectedProcedure("settings.edit")
    .input(
      z.object({
        smtp_host: z.string(),
        smtp_port: z.string(),
        smtp_secure: z.boolean(),
        smtp_user: z.string().optional(),
        smtp_password: z.string().optional(),
        smtp_from_email: z.string().email(),
        smtp_from_name: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Update or create each setting

      const encryptKeys = [
        "smtp_host",
        "smtp_port",
        "smtp_secure",
        "smtp_user",
        "smtp_password",
        "smtp_from_email",
        "smtp_from_name",
      ]
      await Promise.all(
        Object.entries(input).map(async ([key, value]) => {
          if (typeof value === "undefined") return // skip undefined values
          let toSave = value
          if (encryptKeys.includes(key) && value) {
            toSave = encrypt(value as string)
          }
          await prisma.settings.upsert({
            where: { key },
            update: { value: toSave },
            create: { key, value: toSave },
          })
        })
      )

      // Reset email transporter cache
      const { resetEmailTransporter } = await import("@/lib/mailer")
      resetEmailTransporter()

      return { success: true }
    }),

  testEmailConfig: protectedProcedure("settings.edit")
    .input(
      z.object({
        testEmail: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      const { testEmailConfig, sendEmail } = await import("@/lib/mailer")
      const { renderEmailLayout, emailCallout, APP_NAME } = await import(
        "@/lib/email-template"
      )

      // First verify the configuration
      const testResult = await testEmailConfig()
      if (!testResult.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: testResult.error || "Email configuration is invalid",
        })
      }

      // Send a test email
      const emailResult = await sendEmail({
        to: input.testEmail,
        subject: `Test email from ${APP_NAME}`,
        html: renderEmailLayout({
          title: `Test email from ${APP_NAME}`,
          heading: "Email configuration test",
          preview: "Your email configuration is working correctly.",
          bodyHtml: `
            ${emailCallout(
              "✓ Your email configuration is working correctly.",
              "success"
            )}
            <p style="margin: 0 0 8px;">
              This is a test email sent from your ${APP_NAME} application to verify that your email delivery is configured correctly.
            </p>
            <p style="font-size: 13px; color: #737373; margin: 24px 0 0;">
              Sent at: ${new Date().toLocaleString()}
            </p>
          `,
        }),
        text: `Email configuration test successful! Your ${APP_NAME} email delivery is working correctly.`,
      })

      if (!emailResult.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: emailResult.error || "Failed to send test email",
        })
      }

      return { success: true }
    }),

  getGeneralSettings: protectedProcedure("settings.view").query(async () => {
    const settings = await prisma.settings.findMany({
      where: {
        key: {
          in: [
            "app.name",
            "app.maintenance_mode",
            "app.theme",
          ],
        },
      },
    })

    const config: Record<string, unknown> = {}
    settings.forEach((setting) => {
      config[setting.key] = setting.value
    })

    return {
      appName: (config["app.name"] as string) || "PassBangla",
      maintenanceMode: (config["app.maintenance_mode"] as boolean) || false,
      theme: (config["app.theme"] as string) || "system",
    }
  }),

  updateGeneralSettings: protectedProcedure("settings.edit")
    .input(
      z.object({
        appName: z.string().min(1, "Application name is required"),
        maintenanceMode: z.boolean(),
        theme: z.enum(["light", "dark", "system"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Update or create each setting
      const updates = [
        prisma.settings.upsert({
          where: { key: "app.name" },
          update: { value: input.appName },
          create: { key: "app.name", value: input.appName },
        }),
        prisma.settings.upsert({
          where: { key: "app.maintenance_mode" },
          update: { value: input.maintenanceMode },
          create: { key: "app.maintenance_mode", value: input.maintenanceMode },
        }),
      ]

      if (input.theme !== undefined) {
        updates.push(
          prisma.settings.upsert({
            where: { key: "app.theme" },
            update: { value: input.theme },
            create: { key: "app.theme", value: input.theme },
          })
        )
      }

      await Promise.all(updates)

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "SETTINGS_UPDATED",
        resource: "Settings",
        details: { 
          category: "general", 
          appName: input.appName, 
          maintenanceMode: input.maintenanceMode,
          theme: input.theme,
        },
        userId: ctx.userId,
      })

      return { success: true }
    }),

  getSecuritySettings: protectedProcedure("settings.view").query(async () => {
    const settings = await prisma.settings.findMany({
      where: {
        key: {
          in: [
            "security.password.min_length",
            "security.password.require_uppercase",
            "security.password.require_lowercase",
            "security.password.require_numbers",
            "security.password.require_special",
            "security.password.expiry_days",
            "security.session.timeout_minutes",
            "security.session.max_concurrent",
            "security.session.require_reauth",
            "security.login.max_attempts",
            "security.login.lockout_duration_minutes",
            "security.device.require_mfa_untrusted",
          ],
        },
      },
    })

    const config: Record<string, unknown> = {}
    settings.forEach((setting) => {
      config[setting.key] = setting.value
    })

    return {
      // Password Policies
      passwordMinLength: (config["security.password.min_length"] as number) ?? 12,
      passwordRequireUppercase: (config["security.password.require_uppercase"] as boolean) ?? true,
      passwordRequireLowercase: (config["security.password.require_lowercase"] as boolean) ?? true,
      passwordRequireNumbers: (config["security.password.require_numbers"] as boolean) ?? true,
      passwordRequireSpecial: (config["security.password.require_special"] as boolean) ?? true,
      passwordExpiryDays: (config["security.password.expiry_days"] as number) ?? 90,
      // Session Management
      sessionTimeoutMinutes: (config["security.session.timeout_minutes"] as number) ?? 30,
      sessionMaxConcurrent: (config["security.session.max_concurrent"] as number) ?? 3,
      sessionRequireReauth: (config["security.session.require_reauth"] as boolean) ?? true,
      // Login Security
      loginMaxAttempts: (config["security.login.max_attempts"] as number) ?? 5,
      loginLockoutDurationMinutes: (config["security.login.lockout_duration_minutes"] as number) ?? 15,
      // Device Management
      requireMfaForUntrustedDevices: (config["security.device.require_mfa_untrusted"] as boolean) ?? false,
    }
  }),

  updateSecuritySettings: protectedProcedure("settings.edit")
    .input(
      z.object({
        // Password Policies
        passwordMinLength: z.number().min(4).max(128),
        passwordRequireUppercase: z.boolean(),
        passwordRequireLowercase: z.boolean(),
        passwordRequireNumbers: z.boolean(),
        passwordRequireSpecial: z.boolean(),
        passwordExpiryDays: z.number().min(0).max(3650), // 0 = never, max 10 years
        // Session Management
        sessionTimeoutMinutes: z.number().min(1).max(1440), // 1 minute to 24 hours
        sessionMaxConcurrent: z.number().min(1).max(100),
        sessionRequireReauth: z.boolean(),
        // Login Security
        loginMaxAttempts: z.number().min(1).max(20),
        loginLockoutDurationMinutes: z.number().min(1).max(1440), // 1 minute to 24 hours
        // Device Management
        requireMfaForUntrustedDevices: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Update or create each setting
      await Promise.all([
        // Password Policies
        prisma.settings.upsert({
          where: { key: "security.password.min_length" },
          update: { value: input.passwordMinLength },
          create: { key: "security.password.min_length", value: input.passwordMinLength },
        }),
        prisma.settings.upsert({
          where: { key: "security.password.require_uppercase" },
          update: { value: input.passwordRequireUppercase },
          create: { key: "security.password.require_uppercase", value: input.passwordRequireUppercase },
        }),
        prisma.settings.upsert({
          where: { key: "security.password.require_lowercase" },
          update: { value: input.passwordRequireLowercase },
          create: { key: "security.password.require_lowercase", value: input.passwordRequireLowercase },
        }),
        prisma.settings.upsert({
          where: { key: "security.password.require_numbers" },
          update: { value: input.passwordRequireNumbers },
          create: { key: "security.password.require_numbers", value: input.passwordRequireNumbers },
        }),
        prisma.settings.upsert({
          where: { key: "security.password.require_special" },
          update: { value: input.passwordRequireSpecial },
          create: { key: "security.password.require_special", value: input.passwordRequireSpecial },
        }),
        prisma.settings.upsert({
          where: { key: "security.password.expiry_days" },
          update: { value: input.passwordExpiryDays },
          create: { key: "security.password.expiry_days", value: input.passwordExpiryDays },
        }),
        // Session Management
        prisma.settings.upsert({
          where: { key: "security.session.timeout_minutes" },
          update: { value: input.sessionTimeoutMinutes },
          create: { key: "security.session.timeout_minutes", value: input.sessionTimeoutMinutes },
        }),
        prisma.settings.upsert({
          where: { key: "security.session.max_concurrent" },
          update: { value: input.sessionMaxConcurrent },
          create: { key: "security.session.max_concurrent", value: input.sessionMaxConcurrent },
        }),
        prisma.settings.upsert({
          where: { key: "security.session.require_reauth" },
          update: { value: input.sessionRequireReauth },
          create: { key: "security.session.require_reauth", value: input.sessionRequireReauth },
        }),
        // Login Security
        prisma.settings.upsert({
          where: { key: "security.login.max_attempts" },
          update: { value: input.loginMaxAttempts },
          create: { key: "security.login.max_attempts", value: input.loginMaxAttempts },
        }),
        prisma.settings.upsert({
          where: { key: "security.login.lockout_duration_minutes" },
          update: { value: input.loginLockoutDurationMinutes },
          create: { key: "security.login.lockout_duration_minutes", value: input.loginLockoutDurationMinutes },
        }),
        // Device Management
        ...(input.requireMfaForUntrustedDevices !== undefined
          ? [
              prisma.settings.upsert({
                where: { key: "security.device.require_mfa_untrusted" },
                update: { value: input.requireMfaForUntrustedDevices },
                create: {
                  key: "security.device.require_mfa_untrusted",
                  value: input.requireMfaForUntrustedDevices,
                },
              }),
            ]
          : []),
      ])

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "SETTINGS_UPDATED",
        resource: "Settings",
        details: { category: "security" },
        userId: ctx.userId,
      })

      return { success: true }
    }),

  getMfaSettings: protectedProcedure("settings.view").query(async () => {
    const settings = await prisma.settings.findMany({
      where: {
        key: {
          in: [
            "mfa.enforce_all_users",
            "mfa.enforce_admins",
            "mfa.methods.totp",
            "mfa.methods.sms",
            "mfa.methods.email",
            "mfa.methods.hardware",
            "mfa.grace_period_days",
            "mfa.recovery_codes_enabled",
            "mfa.recovery_codes_count",
            "mfa.admin_reset_enabled",
          ],
        },
      },
    })

    const config: Record<string, unknown> = {}
    settings.forEach((setting) => {
      config[setting.key] = setting.value
    })

    return {
      enforceAllUsers: (config["mfa.enforce_all_users"] as boolean) ?? false,
      enforceAdmins: (config["mfa.enforce_admins"] as boolean) ?? false,
      methodTotp: (config["mfa.methods.totp"] as boolean) ?? true,
      methodSms: (config["mfa.methods.sms"] as boolean) ?? false,
      methodEmail: (config["mfa.methods.email"] as boolean) ?? false,
      methodHardware: (config["mfa.methods.hardware"] as boolean) ?? false,
      gracePeriodDays: (config["mfa.grace_period_days"] as number) ?? 7,
      recoveryCodesEnabled: (config["mfa.recovery_codes_enabled"] as boolean) ?? true,
      recoveryCodesCount: (config["mfa.recovery_codes_count"] as number) ?? 10,
      adminResetEnabled: (config["mfa.admin_reset_enabled"] as boolean) ?? true,
    }
  }),

  updateMfaSettings: protectedProcedure("settings.edit")
    .input(
      z.object({
        enforceAllUsers: z.boolean(),
        enforceAdmins: z.boolean(),
        methodTotp: z.boolean(),
        methodSms: z.boolean(),
        methodEmail: z.boolean(),
        methodHardware: z.boolean(),
        gracePeriodDays: z.number().min(0).max(365), // 0 to 1 year
        recoveryCodesEnabled: z.boolean(),
        recoveryCodesCount: z.number().min(1).max(50),
        adminResetEnabled: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate credentials before enabling methods
      if (input.methodSms) {
        const smsSettings = await prisma.settings.findMany({
          where: {
            key: {
              in: ["mfa.sms.account_sid", "mfa.sms.auth_token", "mfa.sms.phone_number"],
            },
          },
        })

        const smsConfig: Record<string, string> = {}
        smsSettings.forEach((setting) => {
          smsConfig[setting.key] = setting.value as string
        })

        if (!smsConfig["mfa.sms.account_sid"] || !smsConfig["mfa.sms.auth_token"] || !smsConfig["mfa.sms.phone_number"]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "SMS credentials are not configured. Please configure them in Settings → MFA Credentials before enabling SMS MFA.",
          })
        }
      }

      if (input.methodHardware) {
        const webauthnSettings = await prisma.settings.findMany({
          where: {
            key: {
              in: ["mfa.webauthn.rp_id", "mfa.webauthn.rp_name", "mfa.webauthn.origin"],
            },
          },
        })

        const webauthnConfig: Record<string, string> = {}
        webauthnSettings.forEach((setting) => {
          webauthnConfig[setting.key] = setting.value as string
        })

        if (!webauthnConfig["mfa.webauthn.rp_id"] || !webauthnConfig["mfa.webauthn.rp_name"] || !webauthnConfig["mfa.webauthn.origin"]) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "WebAuthn credentials are not configured. Please configure them in Settings → MFA Credentials before enabling Hardware Security Keys MFA.",
          })
        }
      }

      // Update or create each setting
      await Promise.all([
        prisma.settings.upsert({
          where: { key: "mfa.enforce_all_users" },
          update: { value: input.enforceAllUsers },
          create: { key: "mfa.enforce_all_users", value: input.enforceAllUsers },
        }),
        prisma.settings.upsert({
          where: { key: "mfa.enforce_admins" },
          update: { value: input.enforceAdmins },
          create: { key: "mfa.enforce_admins", value: input.enforceAdmins },
        }),
        prisma.settings.upsert({
          where: { key: "mfa.methods.totp" },
          update: { value: input.methodTotp },
          create: { key: "mfa.methods.totp", value: input.methodTotp },
        }),
        prisma.settings.upsert({
          where: { key: "mfa.methods.sms" },
          update: { value: input.methodSms },
          create: { key: "mfa.methods.sms", value: input.methodSms },
        }),
        prisma.settings.upsert({
          where: { key: "mfa.methods.email" },
          update: { value: input.methodEmail },
          create: { key: "mfa.methods.email", value: input.methodEmail },
        }),
        prisma.settings.upsert({
          where: { key: "mfa.methods.hardware" },
          update: { value: input.methodHardware },
          create: { key: "mfa.methods.hardware", value: input.methodHardware },
        }),
        prisma.settings.upsert({
          where: { key: "mfa.grace_period_days" },
          update: { value: input.gracePeriodDays },
          create: { key: "mfa.grace_period_days", value: input.gracePeriodDays },
        }),
        prisma.settings.upsert({
          where: { key: "mfa.recovery_codes_enabled" },
          update: { value: input.recoveryCodesEnabled },
          create: { key: "mfa.recovery_codes_enabled", value: input.recoveryCodesEnabled },
        }),
        prisma.settings.upsert({
          where: { key: "mfa.recovery_codes_count" },
          update: { value: input.recoveryCodesCount },
          create: { key: "mfa.recovery_codes_count", value: input.recoveryCodesCount },
        }),
        prisma.settings.upsert({
          where: { key: "mfa.admin_reset_enabled" },
          update: { value: input.adminResetEnabled },
          create: { key: "mfa.admin_reset_enabled", value: input.adminResetEnabled },
        }),
      ])

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "SETTINGS_UPDATED",
        resource: "Settings",
        details: { category: "mfa" },
        userId: ctx.userId,
      })

      return { success: true }
    }),

  getMfaCredentials: protectedProcedure("settings.view").query(async () => {
    const settings = await prisma.settings.findMany({
      where: {
        key: {
          in: [
            "mfa.sms.account_sid",
            "mfa.sms.auth_token",
            "mfa.sms.phone_number",
            "mfa.webauthn.rp_id",
            "mfa.webauthn.rp_name",
            "mfa.webauthn.origin",
          ],
        },
      },
    })

    const config: Record<string, unknown> = {}
    settings.forEach((setting) => {
      config[setting.key] = setting.value
    })

    // Decrypt sensitive SMS credentials
    const decryptKeys = ["mfa.sms.account_sid", "mfa.sms.auth_token", "mfa.sms.phone_number"]
    decryptKeys.forEach((key) => {
      if (config[key]) {
        config[key] = decrypt(config[key] as string)
      }
    })

    return {
      smsAccountSid: (config["mfa.sms.account_sid"] as string) || "",
      smsAuthToken: (config["mfa.sms.auth_token"] as string) || "",
      smsPhoneNumber: (config["mfa.sms.phone_number"] as string) || "",
      webauthnRpId: (config["mfa.webauthn.rp_id"] as string) || "",
      webauthnRpName: (config["mfa.webauthn.rp_name"] as string) || "",
      webauthnOrigin: (config["mfa.webauthn.origin"] as string) || "",
    }
  }),

  updateMfaCredentials: protectedProcedure("settings.edit")
    .input(
      z.object({
        smsAccountSid: z.string().optional(),
        smsAuthToken: z.string().optional(),
        smsPhoneNumber: z.string().optional(),
        webauthnRpId: z.string().optional(),
        webauthnRpName: z.string().optional(),
        webauthnOrigin: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Encrypt sensitive SMS credentials
      const encryptKeys = ["smsAccountSid", "smsAuthToken", "smsPhoneNumber"]
      const encryptedData: Record<string, string> = {}
      
      encryptKeys.forEach((key) => {
        const value = input[key as keyof typeof input]
        if (value !== undefined && value !== "") {
          encryptedData[key] = encrypt(value as string)
        }
      })

      // Update or create each setting
      await Promise.all([
        input.smsAccountSid !== undefined &&
          prisma.settings.upsert({
            where: { key: "mfa.sms.account_sid" },
            update: { value: encryptedData.smsAccountSid || input.smsAccountSid },
            create: { key: "mfa.sms.account_sid", value: encryptedData.smsAccountSid || input.smsAccountSid },
          }),
        input.smsAuthToken !== undefined &&
          prisma.settings.upsert({
            where: { key: "mfa.sms.auth_token" },
            update: { value: encryptedData.smsAuthToken || input.smsAuthToken },
            create: { key: "mfa.sms.auth_token", value: encryptedData.smsAuthToken || input.smsAuthToken },
          }),
        input.smsPhoneNumber !== undefined &&
          prisma.settings.upsert({
            where: { key: "mfa.sms.phone_number" },
            update: { value: encryptedData.smsPhoneNumber || input.smsPhoneNumber },
            create: { key: "mfa.sms.phone_number", value: encryptedData.smsPhoneNumber || input.smsPhoneNumber },
          }),
        input.webauthnRpId !== undefined &&
          prisma.settings.upsert({
            where: { key: "mfa.webauthn.rp_id" },
            update: { value: input.webauthnRpId },
            create: { key: "mfa.webauthn.rp_id", value: input.webauthnRpId },
          }),
        input.webauthnRpName !== undefined &&
          prisma.settings.upsert({
            where: { key: "mfa.webauthn.rp_name" },
            update: { value: input.webauthnRpName },
            create: { key: "mfa.webauthn.rp_name", value: input.webauthnRpName },
          }),
        input.webauthnOrigin !== undefined &&
          prisma.settings.upsert({
            where: { key: "mfa.webauthn.origin" },
            update: { value: input.webauthnOrigin },
            create: { key: "mfa.webauthn.origin", value: input.webauthnOrigin },
          }),
      ].filter(Boolean))

      // Clear caches when credentials are updated
      const { clearSmsCredentialsCache } = await import("@/lib/sms")
      const { clearWebAuthnCredentialsCache } = await import("@/lib/webauthn")
      clearSmsCredentialsCache()
      clearWebAuthnCredentialsCache()

      return { success: true }
    }),

  checkMfaCredentialsStatus: protectedProcedure("settings.view").query(async () => {
    // Check SMS credentials
    const smsSettings = await prisma.settings.findMany({
      where: {
        key: {
          in: ["mfa.sms.account_sid", "mfa.sms.auth_token", "mfa.sms.phone_number"],
        },
      },
    })

    const smsConfig: Record<string, string> = {}
    smsSettings.forEach((setting) => {
      smsConfig[setting.key] = setting.value as string
    })

    const smsConfigured = 
      smsConfig["mfa.sms.account_sid"] && 
      smsConfig["mfa.sms.auth_token"] && 
      smsConfig["mfa.sms.phone_number"]

    // Check WebAuthn credentials
    const webauthnSettings = await prisma.settings.findMany({
      where: {
        key: {
          in: ["mfa.webauthn.rp_id", "mfa.webauthn.rp_name", "mfa.webauthn.origin"],
        },
      },
    })

    const webauthnConfig: Record<string, string> = {}
    webauthnSettings.forEach((setting) => {
      webauthnConfig[setting.key] = setting.value as string
    })

    const webauthnConfigured = 
      webauthnConfig["mfa.webauthn.rp_id"] && 
      webauthnConfig["mfa.webauthn.rp_name"] && 
      webauthnConfig["mfa.webauthn.origin"]

    return {
      smsConfigured: !!smsConfigured,
      webauthnConfigured: !!webauthnConfigured,
    }
  }),

  // IP Whitelisting
  getIpWhitelists: protectedProcedure("settings.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? undefined

      // Get user-specific and company-wide whitelists
      const whitelists = await prisma.ipWhitelist.findMany({
        where: {
          OR: [
            { userId: ctx.userId || undefined },
            { companyId: finalCompanyId || undefined, userId: null },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      return { whitelists }
    }),

  addIpWhitelist: protectedProcedure("settings.edit")
    .input(
      z.object({
        ipAddress: z.string().min(1, "IP address is required"),
        description: z.string().optional(),
        userId: z.string().optional(), // null for company-wide
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate IP address format
      const { isValidIpAddress } = await import("@/lib/ip-whitelist")
      if (!isValidIpAddress(input.ipAddress)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid IP address format. Use IPv4 address or CIDR notation (e.g., 192.168.1.1 or 192.168.1.0/24)",
        })
      }

      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? undefined

      // Check if IP already exists
      const existing = await prisma.ipWhitelist.findFirst({
        where: {
          ipAddress: input.ipAddress,
          userId: input.userId || null,
          companyId: input.userId ? null : finalCompanyId || null,
        },
      })

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This IP address is already whitelisted",
        })
      }

      const whitelist = await prisma.ipWhitelist.create({
        data: {
          ipAddress: input.ipAddress,
          description: input.description || null,
          userId: input.userId || null,
          companyId: input.userId ? null : finalCompanyId || null,
          createdById: ctx.userId || null,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "IP_WHITELIST_ADDED",
        resource: "IpWhitelist",
        resourceId: whitelist.id,
        userId: ctx.userId || undefined,
        details: { ipAddress: input.ipAddress, userId: input.userId },
      })

      return { success: true, whitelist }
    }),

  updateIpWhitelist: protectedProcedure("settings.edit")
    .input(
      z.object({
        id: z.string(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const whitelist = await prisma.ipWhitelist.findUnique({
        where: { id: input.id },
      })

      if (!whitelist) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "IP whitelist entry not found",
        })
      }

      // Check permissions - user can only update their own or company-wide entries
      if (whitelist.userId && whitelist.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only update your own IP whitelist entries",
        })
      }

      const updated = await prisma.ipWhitelist.update({
        where: { id: input.id },
        data: {
          description: input.description !== undefined ? input.description : undefined,
          isActive: input.isActive !== undefined ? input.isActive : undefined,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "IP_WHITELIST_UPDATED",
        resource: "IpWhitelist",
        resourceId: updated.id,
        userId: ctx.userId || undefined,
      })

      return { success: true, whitelist: updated }
    }),

  deleteIpWhitelist: protectedProcedure("settings.edit")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const whitelist = await prisma.ipWhitelist.findUnique({
        where: { id: input.id },
      })

      if (!whitelist) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "IP whitelist entry not found",
        })
      }

      // Check permissions
      if (whitelist.userId && whitelist.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own IP whitelist entries",
        })
      }

      await prisma.ipWhitelist.delete({
        where: { id: input.id },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "IP_WHITELIST_DELETED",
        resource: "IpWhitelist",
        resourceId: input.id,
        userId: ctx.userId || undefined,
      })

      return { success: true }
    }),

  // Geographic Restrictions
  getGeographicRestrictions: protectedProcedure("settings.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? undefined

      const restrictions = await prisma.geographicRestriction.findMany({
        where: {
          OR: [
            { userId: ctx.userId || undefined },
            { companyId: finalCompanyId || undefined, userId: null },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      return { restrictions }
    }),

  addGeographicRestriction: protectedProcedure("settings.edit")
    .input(
      z.object({
        countryCode: z.string().length(2, "Country code must be 2 characters (ISO 3166-1 alpha-2)"),
        action: z.enum(["ALLOW", "BLOCK"]),
        userId: z.string().optional(), // null for company-wide
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? undefined

      // Check if restriction already exists
      const existing = await prisma.geographicRestriction.findFirst({
        where: {
          countryCode: input.countryCode.toUpperCase(),
          userId: input.userId || null,
          companyId: input.userId ? null : finalCompanyId || null,
        },
      })

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A restriction for this country already exists",
        })
      }

      const restriction = await prisma.geographicRestriction.create({
        data: {
          countryCode: input.countryCode.toUpperCase(),
          action: input.action,
          userId: input.userId || null,
          companyId: input.userId ? null : finalCompanyId || null,
          createdById: ctx.userId || null,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "GEOGRAPHIC_RESTRICTION_ADDED",
        resource: "GeographicRestriction",
        resourceId: restriction.id,
        userId: ctx.userId || undefined,
        details: { countryCode: input.countryCode, action: input.action },
      })

      return { success: true, restriction }
    }),

  updateGeographicRestriction: protectedProcedure("settings.edit")
    .input(
      z.object({
        id: z.string(),
        action: z.enum(["ALLOW", "BLOCK"]).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const restriction = await prisma.geographicRestriction.findUnique({
        where: { id: input.id },
      })

      if (!restriction) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geographic restriction not found",
        })
      }

      // Check permissions
      if (restriction.userId && restriction.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only update your own geographic restrictions",
        })
      }

      const updated = await prisma.geographicRestriction.update({
        where: { id: input.id },
        data: {
          action: input.action !== undefined ? input.action : undefined,
          isActive: input.isActive !== undefined ? input.isActive : undefined,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "GEOGRAPHIC_RESTRICTION_UPDATED",
        resource: "GeographicRestriction",
        resourceId: updated.id,
        userId: ctx.userId || undefined,
      })

      return { success: true, restriction: updated }
    }),

  deleteGeographicRestriction: protectedProcedure("settings.edit")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const restriction = await prisma.geographicRestriction.findUnique({
        where: { id: input.id },
      })

      if (!restriction) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geographic restriction not found",
        })
      }

      // Check permissions
      if (restriction.userId && restriction.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own geographic restrictions",
        })
      }

      await prisma.geographicRestriction.delete({
        where: { id: input.id },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "GEOGRAPHIC_RESTRICTION_DELETED",
        resource: "GeographicRestriction",
        resourceId: input.id,
        userId: ctx.userId || undefined,
      })

      return { success: true }
    }),

  // IP Security Settings
  getIpSecuritySettings: protectedProcedure("settings.view")
    .query(async () => {
      const settings = await prisma.settings.findMany({
        where: {
          key: {
            in: [
              "security.ip_whitelist_enabled",
              "security.geographic_restriction_enabled",
              "security.vpn_detection_enabled",
              "security.suspicious_location_alerts_enabled",
            ],
          },
        },
      })

      const config: Record<string, unknown> = {}
      settings.forEach((setting) => {
        config[setting.key] = setting.value
      })

      return {
        ipWhitelistEnabled: (config["security.ip_whitelist_enabled"] as boolean) ?? false,
        geographicRestrictionEnabled: (config["security.geographic_restriction_enabled"] as boolean) ?? false,
        vpnDetectionEnabled: (config["security.vpn_detection_enabled"] as boolean) ?? false,
        suspiciousLocationAlertsEnabled: (config["security.suspicious_location_alerts_enabled"] as boolean) ?? false,
      }
    }),

  updateIpSecuritySettings: protectedProcedure("settings.edit")
    .input(
      z.object({
        ipWhitelistEnabled: z.boolean().optional(),
        geographicRestrictionEnabled: z.boolean().optional(),
        vpnDetectionEnabled: z.boolean().optional(),
        suspiciousLocationAlertsEnabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const settingsToUpdate = [
        { key: "security.ip_whitelist_enabled", value: input.ipWhitelistEnabled },
        { key: "security.geographic_restriction_enabled", value: input.geographicRestrictionEnabled },
        { key: "security.vpn_detection_enabled", value: input.vpnDetectionEnabled },
        { key: "security.suspicious_location_alerts_enabled", value: input.suspiciousLocationAlertsEnabled },
      ]

      await Promise.all(
        settingsToUpdate
          .filter((s) => s.value !== undefined)
          .map((setting) =>
            prisma.settings.upsert({
              where: { key: setting.key },
              update: { value: setting.value },
              create: { key: setting.key, value: setting.value },
            })
          )
      )

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "IP_SECURITY_SETTINGS_UPDATED",
        resource: "Settings",
        userId: ctx.userId || undefined,
        details: input,
      })

      return { success: true }
    }),

  // Threat Detection Procedures
  getThreatEvents: protectedProcedure("settings.view")
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
        threatType: z.enum([
          "BRUTE_FORCE",
          "RATE_LIMIT_EXCEEDED",
          "UNUSUAL_ACCESS_PATTERN",
          "SUSPICIOUS_LOCATION",
          "MULTIPLE_FAILED_LOGINS",
          "ANOMALY_DETECTED",
        ]).optional(),
        isResolved: z.boolean().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId ?? undefined

      const where: {
        companyId?: string
        severity?: string
        threatType?: string
        isResolved?: boolean
      } = {}

      if (companyId) {
        where.companyId = companyId
      }
      if (input.severity) {
        where.severity = input.severity
      }
      if (input.threatType) {
        where.threatType = input.threatType
      }
      if (input.isResolved !== undefined) {
        where.isResolved = input.isResolved
      }

      const [threats, total] = await Promise.all([
        prisma.threatEvent.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        prisma.threatEvent.count({ where }),
      ])

      return {
        threats,
        pagination: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages: Math.ceil(total / input.limit),
        },
      }
    }),

  resolveThreatEvent: protectedProcedure("settings.edit")
    .input(
      z.object({
        threatEventId: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const threatEvent = await prisma.threatEvent.findUnique({
        where: { id: input.threatEventId },
      })

      if (!threatEvent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Threat event not found",
        })
      }

      // Use companyId from context (already fetched, no extra query needed)
      const companyId = ctx.companyId ?? undefined

      // Only check company match if both threat event and user have companyId
      // If threat event has no companyId, it's a global threat and can be resolved by anyone with permission
      if (threatEvent.companyId && companyId && threatEvent.companyId !== companyId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to resolve this threat event",
        })
      }

      await prisma.threatEvent.update({
        where: { id: input.threatEventId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: ctx.userId || null,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "THREAT_EVENT_RESOLVED",
        resource: "ThreatEvent",
        resourceId: input.threatEventId,
        userId: ctx.userId || null,
      })

      return { success: true }
    }),

  getThreatDetectionSettings: protectedProcedure("settings.view").query(async () => {
    const { getThreatDetectionConfig } = await import("@/lib/threat-detection")
    return await getThreatDetectionConfig()
  }),

  updateThreatDetectionSettings: protectedProcedure("settings.edit")
    .input(
      z.object({
        enabled: z.boolean(),
        rateLimiting: z.object({
          enabled: z.boolean(),
          login: z.object({
            maxRequests: z.number().min(1).max(100),
            windowMinutes: z.number().min(1).max(1440),
          }),
          passwordReset: z.object({
            maxRequests: z.number().min(1).max(100),
            windowMinutes: z.number().min(1).max(1440),
          }),
          api: z.object({
            maxRequests: z.number().min(1).max(1000),
            windowMinutes: z.number().min(1).max(1440),
          }),
        }),
        bruteForceProtection: z.object({
          enabled: z.boolean(),
          maxAttempts: z.number().min(1).max(20),
          lockoutDurationMinutes: z.number().min(1).max(1440),
          windowMinutes: z.number().min(1).max(1440),
        }),
        anomalyDetection: z.object({
          enabled: z.boolean(),
          checkUnusualLocation: z.boolean(),
          checkUnusualTime: z.boolean(),
          checkUnusualDevice: z.boolean(),
        }),
        captcha: z.object({
          enabled: z.boolean(),
          triggerAfterFailedAttempts: z.number().min(1).max(10),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const settings = [
        { key: "security.threat.enabled", value: input.enabled },
        { key: "security.threat.rate_limiting.enabled", value: input.rateLimiting.enabled },
        { key: "security.threat.rate_limiting.login.max_requests", value: input.rateLimiting.login.maxRequests },
        { key: "security.threat.rate_limiting.login.window_minutes", value: input.rateLimiting.login.windowMinutes },
        { key: "security.threat.rate_limiting.password_reset.max_requests", value: input.rateLimiting.passwordReset.maxRequests },
        { key: "security.threat.rate_limiting.password_reset.window_minutes", value: input.rateLimiting.passwordReset.windowMinutes },
        { key: "security.threat.rate_limiting.api.max_requests", value: input.rateLimiting.api.maxRequests },
        { key: "security.threat.rate_limiting.api.window_minutes", value: input.rateLimiting.api.windowMinutes },
        { key: "security.threat.brute_force.enabled", value: input.bruteForceProtection.enabled },
        { key: "security.threat.brute_force.max_attempts", value: input.bruteForceProtection.maxAttempts },
        { key: "security.threat.brute_force.lockout_duration_minutes", value: input.bruteForceProtection.lockoutDurationMinutes },
        { key: "security.threat.brute_force.window_minutes", value: input.bruteForceProtection.windowMinutes },
        { key: "security.threat.anomaly.enabled", value: input.anomalyDetection.enabled },
        { key: "security.threat.anomaly.check_unusual_location", value: input.anomalyDetection.checkUnusualLocation },
        { key: "security.threat.anomaly.check_unusual_time", value: input.anomalyDetection.checkUnusualTime },
        { key: "security.threat.anomaly.check_unusual_device", value: input.anomalyDetection.checkUnusualDevice },
        { key: "security.threat.captcha.enabled", value: input.captcha.enabled },
        { key: "security.threat.captcha.trigger_after_failed_attempts", value: input.captcha.triggerAfterFailedAttempts },
      ]

      await Promise.all(
        settings.map((setting) =>
          prisma.settings.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: { key: setting.key, value: setting.value },
          })
        )
      )

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "SETTINGS_UPDATED",
        resource: "Settings",
        details: { category: "threat_detection" },
        userId: ctx.userId || null,
      })

      return { success: true }
    }),

  // Password Policy
  getPasswordPolicy: protectedProcedure("settings.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? undefined

      if (!finalCompanyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Company ID is required",
        })
      }

      const policy = await prisma.passwordPolicy.findUnique({
        where: { companyId: finalCompanyId },
      })

      if (!policy) {
        // Return default policy
        return {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecial: true,
          expirationDays: null,
          preventReuseCount: 0,
          requireChangeOnFirstLogin: false,
          requireChangeAfterDays: null,
          isActive: true,
        }
      }

      return {
        minLength: policy.minLength,
        requireUppercase: policy.requireUppercase,
        requireLowercase: policy.requireLowercase,
        requireNumbers: policy.requireNumbers,
        requireSpecial: policy.requireSpecial,
        expirationDays: policy.expirationDays,
        preventReuseCount: policy.preventReuseCount,
        requireChangeOnFirstLogin: policy.requireChangeOnFirstLogin,
        requireChangeAfterDays: policy.requireChangeAfterDays,
        isActive: policy.isActive,
      }
    }),

  updatePasswordPolicy: protectedProcedure("settings.edit")
    .input(
      z.object({
        minLength: z.number().min(4).max(128),
        requireUppercase: z.boolean(),
        requireLowercase: z.boolean(),
        requireNumbers: z.boolean(),
        requireSpecial: z.boolean(),
        expirationDays: z.number().min(0).max(3650).nullable(),
        preventReuseCount: z.number().min(0).max(50),
        requireChangeOnFirstLogin: z.boolean(),
        requireChangeAfterDays: z.number().min(1).max(3650).nullable(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? undefined

      if (!finalCompanyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Company ID is required",
        })
      }

      // Upsert password policy
      await prisma.passwordPolicy.upsert({
        where: { companyId: finalCompanyId },
        update: {
          minLength: input.minLength,
          requireUppercase: input.requireUppercase,
          requireLowercase: input.requireLowercase,
          requireNumbers: input.requireNumbers,
          requireSpecial: input.requireSpecial,
          expirationDays: input.expirationDays,
          preventReuseCount: input.preventReuseCount,
          requireChangeOnFirstLogin: input.requireChangeOnFirstLogin,
          requireChangeAfterDays: input.requireChangeAfterDays,
          isActive: input.isActive,
        },
        create: {
          companyId: finalCompanyId,
          minLength: input.minLength,
          requireUppercase: input.requireUppercase,
          requireLowercase: input.requireLowercase,
          requireNumbers: input.requireNumbers,
          requireSpecial: input.requireSpecial,
          expirationDays: input.expirationDays,
          preventReuseCount: input.preventReuseCount,
          requireChangeOnFirstLogin: input.requireChangeOnFirstLogin,
          requireChangeAfterDays: input.requireChangeAfterDays,
          isActive: input.isActive,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "SETTINGS_UPDATED",
        resource: "Settings",
        details: { category: "password_policy" },
        userId: ctx.userId || null,
      })

      return { success: true }
    }),

  // GDPR Compliance - Data Retention Policy
  getDataRetentionPolicy: protectedProcedure("settings.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? null

      return await getDataRetentionPolicy(finalCompanyId)
    }),

  updateDataRetentionPolicy: protectedProcedure("settings.edit")
    .input(
      z.object({
        auditLogRetentionDays: z.number().min(0).max(3650).nullable(),
        passwordHistoryRetentionDays: z.number().min(0).max(3650).nullable(),
        sessionRetentionDays: z.number().min(0).max(3650).nullable(),
        deletedDataRetentionDays: z.number().min(0).max(3650).nullable(),
        autoDeleteEnabled: z.boolean(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? undefined

      if (!finalCompanyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Company ID is required",
        })
      }

      // Upsert data retention policy
      await prisma.dataRetentionPolicy.upsert({
        where: { companyId: finalCompanyId },
        update: {
          auditLogRetentionDays: input.auditLogRetentionDays,
          passwordHistoryRetentionDays: input.passwordHistoryRetentionDays,
          sessionRetentionDays: input.sessionRetentionDays,
          deletedDataRetentionDays: input.deletedDataRetentionDays,
          autoDeleteEnabled: input.autoDeleteEnabled,
          isActive: input.isActive,
        },
        create: {
          companyId: finalCompanyId,
          auditLogRetentionDays: input.auditLogRetentionDays,
          passwordHistoryRetentionDays: input.passwordHistoryRetentionDays,
          sessionRetentionDays: input.sessionRetentionDays,
          deletedDataRetentionDays: input.deletedDataRetentionDays,
          autoDeleteEnabled: input.autoDeleteEnabled,
          isActive: input.isActive,
        },
      })

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "SETTINGS_UPDATED",
        resource: "Settings",
        details: { category: "data_retention_policy" },
        userId: ctx.userId || null,
      })

      return { success: true }
    }),

  // GDPR Compliance - Data Export
  requestDataExport: protectedProcedure("settings.view")
    .input(
      z.object({
        exportType: z.enum(["FULL", "PASSWORDS", "AUDIT_LOGS", "PROFILE"]),
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

      // Create export request
      const exportRecord = await prisma.dataExport.create({
        data: {
          userId: ctx.userId,
          companyId: user?.companyId || null,
          exportType: input.exportType,
          status: "PENDING",
        },
      })

      // Process export asynchronously (in a real app, this would be a background job)
      try {
        const result = await exportUserData(
          ctx.userId,
          user?.companyId || null,
          input.exportType
        )

        // Update export record with result
        await prisma.dataExport.update({
          where: { id: exportRecord.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            // In a real implementation, you'd save the file and store the path
            // filePath: result.filePath,
            // fileSize: result.fileSize,
          },
        })

        return {
          exportId: result.exportId,
          data: result.data,
        }
      } catch (error) {
        await prisma.dataExport.update({
          where: { id: exportRecord.id },
          data: {
            status: "FAILED",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
        })
        throw error
      }
    }),

  // GDPR Compliance - Right to be Forgotten
  requestDataDeletion: protectedProcedure("settings.view")
    .input(
      z.object({
        deletionScope: z
          .object({
            deletePasswords: z.boolean().optional(),
            deleteAuditLogs: z.boolean().optional(),
            deleteSessions: z.boolean().optional(),
            deleteProfile: z.boolean().optional(),
          })
          .optional(),
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

      // Generate confirmation token
      const confirmationToken = crypto.randomUUID()

      // Create deletion request
      const deletionRequest = await prisma.dataDeletionRequest.create({
        data: {
          userId: ctx.userId,
          companyId: user?.companyId || null,
          requestType: input.deletionScope?.deleteProfile
            ? "FULL_DELETION"
            : "PARTIAL_DELETION",
          status: "PENDING",
          deletionScope: input.deletionScope || {},
          confirmationToken,
        },
      })

      // In a real implementation, you'd send a confirmation email here
      // For now, we'll return the token (in production, this should be sent via email)

      return {
        requestId: deletionRequest.id,
        confirmationToken, // In production, don't return this - send via email
        message:
          "Please confirm your deletion request. A confirmation email has been sent.",
      }
    }),

  confirmDataDeletion: protectedProcedure("settings.view")
    .input(
      z.object({
        confirmationToken: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User ID is required",
        })
      }

      // Find deletion request
      const deletionRequest = await prisma.dataDeletionRequest.findUnique({
        where: { confirmationToken: input.confirmationToken },
      })

      if (!deletionRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deletion request not found",
        })
      }

      if (deletionRequest.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to confirm this request",
        })
      }

      if (deletionRequest.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Deletion request has already been processed",
        })
      }

      // Update status to processing
      await prisma.dataDeletionRequest.update({
        where: { id: deletionRequest.id },
        data: {
          status: "PROCESSING",
          confirmedAt: new Date(),
        },
      })

      try {
        // Perform deletion
        const result = await deleteUserData(
          ctx.userId,
          deletionRequest.companyId || null,
          deletionRequest.deletionScope as {
            deletePasswords?: boolean
            deleteAuditLogs?: boolean
            deleteSessions?: boolean
            deleteProfile?: boolean
          }
        )

        // Update status to completed
        await prisma.dataDeletionRequest.update({
          where: { id: deletionRequest.id },
          data: {
            status: "COMPLETED",
            processedAt: new Date(),
            processedBy: ctx.userId,
          },
        })

        return {
          success: true,
          deletedItems: result.deletedItems,
        }
      } catch (error) {
        await prisma.dataDeletionRequest.update({
          where: { id: deletionRequest.id },
          data: {
            status: "FAILED",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
            processedAt: new Date(),
          },
        })
        throw error
      }
    }),

  // GDPR Compliance - Run Cleanup
  runDataCleanup: protectedProcedure("settings.edit")
    .mutation(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? null

      const result = await cleanupExpiredData(finalCompanyId)

      // Create audit log
      const { createAuditLog } = await import("@/lib/audit-log")
      await createAuditLog({
        action: "DATA_CLEANUP",
        resource: "DataRetentionPolicy",
        details: { cleaned: result.cleaned, errors: result.errors },
        userId: ctx.userId || null,
      })

      return result
    }),

  // GDPR Compliance - Compliance Report
  getComplianceReport: protectedProcedure("settings.view")
    .query(async ({ ctx }) => {
      // Use companyId from context (already fetched, no extra query needed)
      const finalCompanyId = ctx.companyId ?? null

      // Get retention policy
      const retentionPolicy = await getDataRetentionPolicy(finalCompanyId)

      // Get statistics
      const totalUsers = await prisma.user.count({
        where: { companyId: finalCompanyId || undefined },
      })

      const totalPasswords = await prisma.password.count({
        where: {
          owner: {
            companyId: finalCompanyId || undefined,
          },
        },
      })

      const totalAuditLogs = await prisma.auditLog.count({
        where: {
          user: {
            companyId: finalCompanyId || undefined,
          },
        },
      })

      const pendingDeletionRequests = await prisma.dataDeletionRequest.count({
        where: {
          companyId: finalCompanyId || undefined,
          status: "PENDING",
        },
      })

      const completedExports = await prisma.dataExport.count({
        where: {
          companyId: finalCompanyId || undefined,
          status: "COMPLETED",
        },
      })

      return {
        retentionPolicy,
        statistics: {
          totalUsers,
          totalPasswords,
          totalAuditLogs,
          pendingDeletionRequests,
          completedExports,
        },
      }
    }),

  // Sync permissions and update system roles
  syncPermissions: protectedProcedure("role.manage")
    .mutation(async () => {
      const result = await syncPermissionsAndRoles()
      return result
    }),
})

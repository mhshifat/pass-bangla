import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"
import prisma from "@/lib/prisma"
import {
  isBytloopMailConfigured,
  getBytloopMailFrom,
  sendEmailViaBytloopMailApi,
} from "@/lib/bytloop-mail"

interface EmailConfig {
  host: string
  port: number
  secure: boolean
  auth?: {
    user: string
    pass: string
  }
  from: string
}

let cachedTransporter: Transporter | null = null

async function getEmailConfig(): Promise<EmailConfig | null> {
  try {
    // First, try to get from Settings table (user-configured)
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
          ],
        },
      },
    })

    const settingsMap = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, unknown>)

    // Check if Settings table has required config
    if (
      settingsMap.smtp_host &&
      settingsMap.smtp_port &&
      settingsMap.smtp_from_email
    ) {
      const { decrypt } = await import("@/lib/crypto")
      const hasAuth = settingsMap.smtp_user && settingsMap.smtp_password

      // Helper to safely decrypt (handles both encrypted and plain text)
      const safeDecrypt = (value: string): string => {
        try {
          // Try to decrypt, if it fails, assume it's plain text
          return decrypt(value)
        } catch {
          return value
        }
      }

      return {
        host: safeDecrypt(settingsMap.smtp_host as string),
        port: parseInt(safeDecrypt(settingsMap.smtp_port as string)),
        secure: settingsMap.smtp_secure === true || settingsMap.smtp_secure === "true",
        auth: hasAuth ? {
          user: safeDecrypt(settingsMap.smtp_user as string),
          pass: safeDecrypt(settingsMap.smtp_password as string),
        } : undefined,
        from: safeDecrypt(settingsMap.smtp_from_email as string),
      }
    }

    // Fallback to system mail credentials from .env
    const systemHost = process.env.SYSTEM_SMTP_HOST
    const systemPort = process.env.SYSTEM_SMTP_PORT
    const systemUser = process.env.SYSTEM_SMTP_USER
    const systemPassword = process.env.SYSTEM_SMTP_PASSWORD
    const systemFromEmail = process.env.SYSTEM_SMTP_FROM_EMAIL
    const systemSecure = process.env.SYSTEM_SMTP_SECURE === "true"

    if (systemHost && systemPort && systemFromEmail) {
      return {
        host: systemHost,
        port: parseInt(systemPort),
        secure: systemSecure,
        auth: systemUser && systemPassword ? {
          user: systemUser,
          pass: systemPassword,
        } : undefined,
        from: systemFromEmail,
      }
    }

    return null
  } catch (error) {
    console.error("Failed to get email config:", error)
    return null
  }
}

async function getTransporter(): Promise<Transporter | null> {
  const config = await getEmailConfig()
  
  if (!config) {
    return null
  }

  // Create new transporter if config changed or doesn't exist
  if (!cachedTransporter) {
    // Auto-detect secure based on port for common providers
    // Port 465 = SSL (secure: true)
    // Port 587 = TLS/STARTTLS (secure: false)
    // Port 25 = Unencrypted (secure: false, but not recommended)
    let secure = config.secure
    
    // Override secure setting based on port for better compatibility
    if (config.port === 465) {
      secure = true // SSL
    } else if (config.port === 587 || config.port === 25) {
      secure = false // TLS/STARTTLS
    }
    // For other ports, use the configured value

    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: secure,
      ...(config.auth && { auth: config.auth }),
      // Add TLS options for better compatibility
      tls: {
        // Do not fail on invalid certificates (useful for self-signed certs in dev)
        rejectUnauthorized: process.env.NODE_ENV === "production",
        // Support older TLS versions if needed
        minVersion: "TLSv1.2",
      },
      // For port 587, require STARTTLS
      requireTLS: config.port === 587,
    })
  }

  return cachedTransporter
}

export async function sendEmail(options: {
  to: string
  subject: string
  html?: string
  text?: string
  replyTo?: string
  correlationId?: string
}): Promise<{ success: boolean; error?: string }> {
  // Prefer the hosted Bytloop Mail HTTP API when an API key is configured.
  // Falls back to SMTP/nodemailer (below) when it is not.
  if (isBytloopMailConfigured()) {
    try {
      // Resolve the From address: explicit Bytloop From env, else the
      // SMTP-configured From, else a last-resort default.
      const config = await getEmailConfig().catch(() => null)
      const from =
        getBytloopMailFrom() ||
        config?.from ||
        "no-reply@passbangla.com"

      await sendEmailViaBytloopMailApi({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        correlationId: options.correlationId,
      })
      return { success: true }
    } catch (error) {
      console.error("Bytloop Mail send failed:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send email via Bytloop Mail",
      }
    }
  }

  try {
    const transporter = await getTransporter()

    if (!transporter) {
      return {
        success: false,
        error: "Email is not configured. Please configure SMTP settings.",
      }
    }

    const config = await getEmailConfig()
    if (!config) {
      return {
        success: false,
        error: "Email configuration is incomplete.",
      }
    }

    // Log configuration for debugging (without sensitive data)
    console.log("Sending email with config:", {
      host: config.host,
      port: config.port,
      secure: config.secure,
      hasAuth: !!config.auth,
    })

    const info = await transporter.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })

    console.log("Email sent successfully:", info.messageId)
    return { success: true }
  } catch (error) {
    console.error("Failed to send email:", error)
    
    // Provide more helpful error messages for common issues
    let errorMessage = error instanceof Error ? error.message : "Failed to send email"
    
    if (errorMessage.includes("wrong version number") || errorMessage.includes("ESOCKET")) {
      errorMessage = `SSL/TLS configuration error. For SendGrid: use port 587 with TLS (secure: false) or port 465 with SSL (secure: true). Original error: ${errorMessage}`
    }
    
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Helper to test email configuration
export async function testEmailConfig(): Promise<{ success: boolean; error?: string }> {
  try {
    // The Bytloop HTTP API has no connection to "verify"; if it's configured,
    // treat the configuration as valid (a real failure surfaces on send).
    if (isBytloopMailConfigured()) {
      return { success: true }
    }

    const transporter = await getTransporter()
    
    if (!transporter) {
      return {
        success: false,
        error: "Email is not configured. Please configure SMTP settings.",
      }
    }

    await transporter.verify()
    return { success: true }
  } catch (error) {
    console.error("Email config test failed:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Email configuration test failed",
    }
  }
}

// Reset cached transporter (useful when settings are updated)
export function resetEmailTransporter(): void {
  cachedTransporter = null
}

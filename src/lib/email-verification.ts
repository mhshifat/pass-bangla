import crypto from "crypto"
import prisma from "@/lib/prisma"
import { sendEmail } from "./mailer"
import { renderEmailLayout, emailButton, emailLinkFallback, APP_NAME } from "./email-template"

/**
 * Generate a secure random token for email verification
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

/**
 * Create an email verification token for a user
 */
export async function createVerificationToken(userId: string, email: string): Promise<string> {
  // Delete any existing tokens for this user
  await prisma.emailVerificationToken.deleteMany({
    where: { userId },
  })

  // Create new token (expires in 24 hours)
  const token = generateVerificationToken()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 24)

  await prisma.emailVerificationToken.create({
    data: {
      token,
      userId,
      email,
      expiresAt,
    },
  })

  return token
}

/**
 * Verify an email verification token
 */
export async function verifyToken(token: string): Promise<{ valid: boolean; userId?: string; email?: string }> {
  const verificationToken = await prisma.emailVerificationToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!verificationToken) {
    return { valid: false }
  }

  // Check if token is expired
  if (verificationToken.expiresAt < new Date()) {
    // Delete expired token
    await prisma.emailVerificationToken.delete({
      where: { token },
    })
    return { valid: false }
  }

  // Check if email matches user's current email
  if (verificationToken.email !== verificationToken.user.email) {
    return { valid: false }
  }

  return {
    valid: true,
    userId: verificationToken.userId,
    email: verificationToken.email,
  }
}

/**
 * Send verification email to user
 */
export async function sendVerificationEmail(
  userId: string,
  email: string,
  token: string,
  baseUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get base URL from environment or use default
    const appUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const verificationUrl = `${appUrl}/verify-email?token=${token}`

    const emailResult = await sendEmail({
      to: email,
      subject: "Verify your email address",
      html: renderEmailLayout({
        title: "Verify your email address",
        heading: "Verify your email",
        preview: `Confirm your email address to finish setting up your ${APP_NAME} account.`,
        bodyHtml: `
          <p style="margin: 0 0 16px;">Hello,</p>
          <p style="margin: 0 0 8px;">
            Thanks for registering with ${APP_NAME}. Please confirm your email address by clicking the button below.
          </p>
          ${emailButton(verificationUrl, "Verify email address")}
          ${emailLinkFallback(verificationUrl)}
          <p style="font-size: 14px; color: #737373; margin: 24px 0 0;">
            This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
          </p>
        `,
      }),
      text: `Verify your email

Thanks for registering with ${APP_NAME}. Please confirm your email address by visiting the following link:

${verificationUrl}

This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.

© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.`,
    })

    return emailResult
  } catch (error) {
    console.error("Failed to send verification email:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send verification email",
    }
  }
}

/**
 * Clean up expired verification tokens
 */
export async function cleanupExpiredTokens(): Promise<void> {
  await prisma.emailVerificationToken.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  })
}

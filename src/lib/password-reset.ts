import crypto from "crypto"
import prisma from "@/lib/prisma"
import { sendEmail } from "./mailer"
import { hashPassword } from "./auth"
import {
  renderEmailLayout,
  emailButton,
  emailLinkFallback,
  emailCallout,
  APP_NAME,
} from "./email-template"

/**
 * Generate a secure random token for password reset
 */
export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

/**
 * Create a password reset token for a user
 */
export async function createPasswordResetToken(userId: string, email: string): Promise<string> {
  // Delete any existing unused tokens for this user
  await prisma.passwordResetToken.deleteMany({
    where: { 
      userId,
      used: false,
    },
  })

  // Create new token (expires in 1 hour)
  const token = generatePasswordResetToken()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + 1)

  await prisma.passwordResetToken.create({
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
 * Verify a password reset token
 */
export async function verifyPasswordResetToken(token: string): Promise<{ valid: boolean; userId?: string; email?: string }> {
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!resetToken) {
    return { valid: false }
  }

  // Check if token is expired
  if (resetToken.expiresAt < new Date()) {
    // Delete expired token
    await prisma.passwordResetToken.delete({
      where: { token },
    })
    return { valid: false }
  }

  // Check if token is already used
  if (resetToken.used) {
    return { valid: false }
  }

  // Check if email matches user's current email or recovery email
  const isValidEmail = 
    resetToken.email === resetToken.user.email ||
    resetToken.email === resetToken.user.recoveryEmail

  if (!isValidEmail) {
    return { valid: false }
  }

  return {
    valid: true,
    userId: resetToken.userId,
    email: resetToken.email,
  }
}

/**
 * Mark a password reset token as used
 */
export async function markPasswordResetTokenAsUsed(token: string): Promise<void> {
  await prisma.passwordResetToken.update({
    where: { token },
    data: {
      used: true,
      usedAt: new Date(),
    },
  })
}

/**
 * Send password reset email to user
 */
export async function sendPasswordResetEmail(
  userId: string,
  email: string,
  token: string,
  baseUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get base URL from environment or use default
    const appUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const resetUrl = `${appUrl}/reset-password?token=${token}`

    const emailResult = await sendEmail({
      to: email,
      subject: "Reset your password",
      html: renderEmailLayout({
        title: "Reset your password",
        heading: "Reset your password",
        preview: `Reset the password for your ${APP_NAME} account.`,
        bodyHtml: `
          <p style="margin: 0 0 16px;">Hello,</p>
          <p style="margin: 0 0 8px;">
            We received a request to reset your password. Click the button below to choose a new one.
          </p>
          ${emailButton(resetUrl, "Reset password")}
          ${emailLinkFallback(resetUrl)}
          <p style="font-size: 14px; color: #737373; margin: 24px 0 0;">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
          ${emailCallout(
            "<strong>Security notice:</strong> If you didn't request this password reset, please contact support immediately.",
            "warning"
          )}
        `,
      }),
      text: `Reset your password

We received a request to reset your password. Visit the following link to choose a new one:

${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.

Security notice: If you didn't request this password reset, please contact support immediately.

© ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.`,
    })

    return emailResult
  } catch (error) {
    console.error("Failed to send password reset email:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send password reset email",
    }
  }
}

/**
 * Clean up expired password reset tokens
 */
export async function cleanupExpiredPasswordResetTokens(): Promise<void> {
  await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { used: true, usedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, // Delete used tokens older than 7 days
      ],
    },
  })
}

"use server"

import { generateCorrelationId, logError, sanitizeClientErrorMessage } from "@/lib/correlation-id-util"
import { onboardingSubject } from "@/lib/onboarding-message"

interface SendOnboardingEmailInput {
  to: string
  name: string
  loginUrl: string
  /** Temporary password, when the admin wants to include it. */
  password?: string
}

/**
 * Sends a themed onboarding/welcome email to a newly created user with their
 * sign-in link, credentials (if provided), and getting-started steps.
 *
 * Uses the shared mailer (Bytloop Mail API or SMTP) and the themed email layout.
 */
export async function sendOnboardingEmailAction(
  input: SendOnboardingEmailInput
): Promise<{ success?: boolean; error?: string; correlationId?: string }> {
  const correlationId = generateCorrelationId()
  try {
    const { sendEmail } = await import("@/lib/mailer")
    const {
      renderEmailLayout,
      emailButton,
      emailCallout,
      escapeHtml,
      APP_NAME,
    } = await import("@/lib/email-template")

    const subject = onboardingSubject(APP_NAME)

    const credentialsHtml = input.password
      ? emailCallout(
          `<strong>Email:</strong> ${escapeHtml(input.to)}<br/>` +
            `<strong>Temporary password:</strong> ` +
            `<span style="font-family: 'SFMono-Regular', Menlo, Consolas, monospace;">${escapeHtml(input.password)}</span>`,
          "info"
        ) +
        emailCallout(
          `For your security, change this password from <strong>Settings → Security</strong> right after your first sign-in.`,
          "warning"
        )
      : emailCallout(
          `<strong>Email:</strong> ${escapeHtml(input.to)}<br/>` +
            `Use <strong>“Forgot password”</strong> on the sign-in page to create your password.`,
          "info"
        )

    const html = renderEmailLayout({
      title: subject,
      heading: `Welcome to ${APP_NAME}, ${escapeHtml(input.name)} 👋`,
      preview: `Your ${APP_NAME} account is ready — sign in to get started.`,
      bodyHtml: `
        <p style="margin: 0 0 16px;">
          An account has been created for you on ${APP_NAME}, your secure password manager.
          Use the button below to sign in and finish setting up your account.
        </p>
        ${emailButton(input.loginUrl, "Sign in to your account")}
        ${credentialsHtml}
        <p style="font-weight: 600; margin: 24px 0 8px;">Getting started</p>
        <ol style="margin: 0; padding-left: 18px; color: #0a0a0a; font-size: 14px; line-height: 1.7;">
          <li>Sign in${input.password ? " and change your temporary password" : " after creating your password"}.</li>
          <li>Enable two-factor authentication (Settings → Security).</li>
          <li>Add your first password and explore your dashboard.</li>
        </ol>
        <p style="font-size: 13px; color: #737373; margin: 24px 0 0;">
          If you weren't expecting this invitation, you can safely ignore this email.
        </p>
      `,
    })

    const text = [
      `Welcome to ${APP_NAME}, ${input.name}!`,
      ``,
      `An account has been created for you. Sign in: ${input.loginUrl}`,
      `Email: ${input.to}`,
      input.password
        ? `Temporary password: ${input.password} (please change it after signing in)`
        : `Use "Forgot password" on the sign-in page to create your password.`,
      ``,
      `Getting started:`,
      `1. Sign in and set/change your password.`,
      `2. Enable two-factor authentication (Settings → Security).`,
      `3. Add your first password and explore your dashboard.`,
    ].join("\n")

    const result = await sendEmail({
      to: input.to,
      subject,
      html,
      text,
      correlationId,
    })

    if (!result.success) {
      return { error: result.error || "Failed to send onboarding email", correlationId }
    }
    return { success: true, correlationId }
  } catch (error) {
    logError(correlationId, error, { action: "sendOnboardingEmailAction", email: input.to })
    const message = error instanceof Error ? error.message : "Failed to send onboarding email"
    return { error: sanitizeClientErrorMessage(message, "Failed to send onboarding email"), correlationId }
  }
}

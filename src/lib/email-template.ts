/**
 * Shared, theme-aligned email templating.
 *
 * Every transactional email in the app is composed through {@link renderEmailLayout}
 * plus the small building blocks below, so they share one consistent look that
 * mirrors the product's neutral design system (near-black primary, white cards,
 * subtle borders, rounded corners).
 *
 * The app theme is defined in OKLCH (see `globals.css`). Email clients have poor
 * OKLCH support, so the palette is mapped to email-safe hex here:
 *
 * - primary / header / button:  #171717  (≈ oklch(0.205 0 0))
 * - foreground text:            #0a0a0a  (≈ oklch(0.145 0 0))
 * - muted text:                 #737373  (≈ oklch(0.556 0 0))
 * - border:                     #e5e5e5  (≈ oklch(0.922 0 0))
 * - page background:            #fafafa
 * - card background:            #ffffff
 * - destructive:                #dc2626  (≈ oklch(0.577 0.245 27.325))
 */

export const EMAIL_THEME = {
  primary: "#171717",
  primaryForeground: "#ffffff",
  foreground: "#0a0a0a",
  muted: "#737373",
  mutedSoft: "#a3a3a3",
  border: "#e5e5e5",
  pageBackground: "#fafafa",
  cardBackground: "#ffffff",
  subtleBackground: "#f5f5f5",
  destructive: "#dc2626",
  success: "#16a34a",
  info: "#171717",
  radius: "12px",
  innerRadius: "8px",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const

export const APP_NAME = "PassBangla"

/** Escapes a string for safe interpolation into HTML email markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Primary call-to-action button (near-black, matches the product's primary
 * button). `label` is rendered as-is — escape caller-supplied text first.
 */
export function emailButton(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 32px auto;">
      <tr>
        <td align="center" style="border-radius: ${EMAIL_THEME.innerRadius}; background: ${EMAIL_THEME.primary};">
          <a href="${href}"
             style="display: inline-block; padding: 14px 32px; font-family: ${EMAIL_THEME.fontFamily}; font-size: 15px; font-weight: 600; color: ${EMAIL_THEME.primaryForeground}; text-decoration: none; border-radius: ${EMAIL_THEME.innerRadius};">
            ${label}
          </a>
        </td>
      </tr>
    </table>`
}

/**
 * A "copy and paste this link" fallback block for action emails.
 */
export function emailLinkFallback(url: string): string {
  return `
    <p style="font-size: 13px; color: ${EMAIL_THEME.muted}; margin: 24px 0 8px;">
      Or copy and paste this link into your browser:
    </p>
    <p style="font-size: 12px; color: ${EMAIL_THEME.muted}; word-break: break-all; background: ${EMAIL_THEME.subtleBackground}; padding: 12px 14px; border-radius: ${EMAIL_THEME.innerRadius}; border: 1px solid ${EMAIL_THEME.border}; margin: 0;">
      <a href="${url}" style="color: ${EMAIL_THEME.foreground}; text-decoration: none;">${escapeHtml(url)}</a>
    </p>`
}

type CalloutVariant = "info" | "success" | "warning"

/**
 * A bordered callout used for notices (security warnings, success confirmations).
 * `content` is rendered as-is — escape caller-supplied text first.
 */
export function emailCallout(content: string, variant: CalloutVariant = "info"): string {
  const accent =
    variant === "warning"
      ? EMAIL_THEME.destructive
      : variant === "success"
        ? EMAIL_THEME.success
        : EMAIL_THEME.primary
  return `
    <div style="background: ${EMAIL_THEME.subtleBackground}; border: 1px solid ${EMAIL_THEME.border}; border-left: 3px solid ${accent}; padding: 14px 16px; border-radius: ${EMAIL_THEME.innerRadius}; margin: 24px 0;">
      <p style="font-size: 14px; color: ${EMAIL_THEME.foreground}; margin: 0; line-height: 1.6;">
        ${content}
      </p>
    </div>`
}

/**
 * Large, monospace one-time-code display (e.g. MFA / verification codes).
 */
export function emailCodeBlock(code: string): string {
  return `
    <div style="text-align: center; background: ${EMAIL_THEME.subtleBackground}; border: 1px solid ${EMAIL_THEME.border}; padding: 24px; border-radius: ${EMAIL_THEME.innerRadius}; margin: 28px 0;">
      <span style="font-family: 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: ${EMAIL_THEME.foreground};">
        ${escapeHtml(code)}
      </span>
    </div>`
}

/**
 * Renders a full HTML email document with the shared themed header/footer.
 *
 * @param title    Document <title> and accessibility heading.
 * @param heading  Visible header-bar heading (defaults to {@link title}).
 * @param preview  Hidden inbox preview text.
 * @param bodyHtml Pre-rendered, already-escaped body markup.
 */
export function renderEmailLayout(params: {
  title: string
  bodyHtml: string
  heading?: string
  preview?: string
}): string {
  const { title, bodyHtml } = params
  const heading = params.heading ?? title
  const year = new Date().getFullYear()
  const preview = params.preview
    ? `<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(params.preview)}</div>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background: ${EMAIL_THEME.pageBackground}; -webkit-font-smoothing: antialiased;">
  ${preview}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${EMAIL_THEME.pageBackground}; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background: ${EMAIL_THEME.cardBackground}; border: 1px solid ${EMAIL_THEME.border}; border-radius: ${EMAIL_THEME.radius}; overflow: hidden;">
          <tr>
            <td style="background: ${EMAIL_THEME.primary}; padding: 28px 32px;">
              <span style="font-family: ${EMAIL_THEME.fontFamily}; font-size: 20px; font-weight: 700; color: ${EMAIL_THEME.primaryForeground}; letter-spacing: -0.3px;">
                ${escapeHtml(APP_NAME)}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 8px;">
              <h1 style="font-family: ${EMAIL_THEME.fontFamily}; font-size: 22px; font-weight: 700; color: ${EMAIL_THEME.foreground}; margin: 0 0 20px; letter-spacing: -0.3px;">
                ${escapeHtml(heading)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 36px; font-family: ${EMAIL_THEME.fontFamily}; font-size: 15px; line-height: 1.6; color: ${EMAIL_THEME.foreground};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid ${EMAIL_THEME.border}; background: ${EMAIL_THEME.cardBackground};">
              <p style="font-family: ${EMAIL_THEME.fontFamily}; font-size: 12px; color: ${EMAIL_THEME.mutedSoft}; margin: 0; text-align: center;">
                © ${year} ${escapeHtml(APP_NAME)}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

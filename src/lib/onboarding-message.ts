import { APP_NAME } from "@/lib/email-template"

/**
 * Shared helpers for composing a new-user onboarding message and building
 * "share via …" deep links (WhatsApp, Messenger, Telegram, SMS, email).
 *
 * These are pure functions usable on both client and server. The HTML email
 * body is built separately (see the onboarding email action) using the themed
 * `email-template` helpers.
 */

export interface OnboardingDetails {
  name: string
  email: string
  /** Temporary password, when known (i.e. right after the admin creates the user). */
  password?: string
  /** Sign-in URL (defaults handled by the caller, usually `${origin}/login`). */
  loginUrl: string
  appName?: string
}

/**
 * Builds the plain-text onboarding message shared over chat apps / SMS / copy.
 */
export function buildOnboardingText(details: OnboardingDetails): string {
  const appName = details.appName ?? APP_NAME
  const credentialLine = details.password
    ? `Temporary password: ${details.password}`
    : `Set your password using "Forgot password" on the sign-in page.`
  const firstStep = details.password
    ? `Sign in, then change your password from Settings → Security.`
    : `Use "Forgot password" to create your password, then sign in.`

  return [
    `Hi ${details.name},`,
    ``,
    `An account has been created for you on ${appName} — your secure password manager.`,
    ``,
    `Sign in: ${details.loginUrl}`,
    `Email: ${details.email}`,
    credentialLine,
    ``,
    `Getting started:`,
    `1. ${firstStep}`,
    `2. Enable two-factor authentication (Settings → Security).`,
    `3. Add your first password and explore your dashboard.`,
    ``,
    `Welcome aboard!`,
    `— The ${appName} Team`,
  ].join("\n")
}

/** Short subject line for the onboarding email / mailto. */
export function onboardingSubject(appName: string = APP_NAME): string {
  return `Welcome to ${appName} — your account is ready`
}

/* ----------------------------- share deep links ---------------------------- */

/** WhatsApp share (opens chat with the message prefilled). */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** Telegram share — needs a URL plus the descriptive text. */
export function telegramShareUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
}

/**
 * Facebook Messenger share. The web share dialog requires a Facebook app id;
 * we use the `m.me`-friendly sharer which works without one in most setups by
 * sharing a link. Falls back gracefully when Messenger isn't installed.
 */
export function messengerShareUrl(url: string): string {
  return `https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&app_id=0&redirect_uri=${encodeURIComponent(url)}`
}

/** SMS deep link with the body prefilled (cross-platform `?&body=` form). */
export function smsShareUrl(text: string): string {
  return `sms:?&body=${encodeURIComponent(text)}`
}

/** mailto: link for the user's default mail client. */
export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Gmail compose link (web). */
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

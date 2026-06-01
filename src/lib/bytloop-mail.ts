import { logger } from "@/lib/logger"

const DEFAULT_BASE = "https://mail.bytloop.com"

/**
 * Returns `true` when the Bytloop Mail HTTP API is configured (an API key is
 * present). Used by the mailer to decide whether to prefer the hosted API over
 * SMTP/nodemailer.
 */
export function isBytloopMailConfigured(): boolean {
  return Boolean(process.env.SYSTEM_BYTLOOP_MAIL_KEY?.trim())
}

/**
 * Resolves the default From address for Bytloop sends.
 *
 * Prefers `SYSTEM_BYTLOOP_MAIL_FROM`; callers may still pass an explicit `from`
 * to `sendEmailViaBytloopMailApi`.
 */
export function getBytloopMailFrom(): string | undefined {
  return process.env.SYSTEM_BYTLOOP_MAIL_FROM?.trim() || undefined
}

/**
 * Sends a single transactional email via the hosted Bytloop Mail HTTP API
 * (`POST /api/v1/emails`), using a workspace API key.
 *
 * Env:
 * - `SYSTEM_BYTLOOP_MAIL_KEY` — Bearer token (API key from the mail product).
 * - `SYSTEM_BYTLOOP_MAIL_BASE_URL` — optional, default {@link DEFAULT_BASE}.
 * - `SYSTEM_BYTLOOP_MAIL_FROM` — optional explicit From; otherwise callers pass `from`.
 */
export async function sendEmailViaBytloopMailApi(params: {
  from: string
  to: string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  correlationId?: string
}): Promise<void> {
  const key = process.env.SYSTEM_BYTLOOP_MAIL_KEY?.trim()
  if (!key) {
    throw new Error("SYSTEM_BYTLOOP_MAIL_KEY is not set")
  }
  const base = (process.env.SYSTEM_BYTLOOP_MAIL_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "")
  const url = `${base}/api/v1/emails`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      ...(params.html !== undefined ? { html: params.html } : {}),
      ...(params.text !== undefined ? { text: params.text } : {}),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    logger.error("Bytloop Mail API send failed", {
      status: res.status,
      correlationId: params.correlationId,
      body: body.slice(0, 2000),
    })
    throw new Error(`Bytloop Mail API returned ${res.status}`)
  }
}

/**
 * Simple math CAPTCHA.
 * The challenge token is a signed, short-lived JWT that carries a keyed hash of
 * the answer (never the answer itself), so it works across serverless instances.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { SignJWT, jwtVerify } from "jose"

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "default-secret-change-in-production"
)
const CAPTCHA_TTL_SECONDS = 5 * 60

export interface CaptchaChallenge {
  question: string
  token: string
}

function answerHash(nonce: string, answer: number, binding: string): string {
  return createHmac("sha256", secret).update(`${nonce}:${answer}:${binding}`).digest("hex")
}

/**
 * Generate a math CAPTCHA challenge. `binding` (e.g. the client IP) ties the
 * token to the requester that received it.
 */
export async function createCaptchaChallenge(binding = ""): Promise<CaptchaChallenge> {
  const num1 = Math.floor(Math.random() * 10) + 1
  const num2 = Math.floor(Math.random() * 10) + 1

  let question: string
  let answer: number

  if (Math.random() > 0.5) {
    question = `${num1} + ${num2}`
    answer = num1 + num2
  } else {
    // Ensure positive result for subtraction
    const max = Math.max(num1, num2)
    const min = Math.min(num1, num2)
    question = `${max} - ${min}`
    answer = max - min
  }

  const nonce = randomBytes(12).toString("hex")
  const token = await new SignJWT({ n: nonce, h: answerHash(nonce, answer, binding) })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("captcha")
    .setExpirationTime(`${CAPTCHA_TTL_SECONDS}s`)
    .sign(secret)

  return { question, token }
}

/** Verify a CAPTCHA answer against a token issued by createCaptchaChallenge. */
export async function verifyCaptchaToken(token: string, userAnswer: number, binding = ""): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience: "captcha" })
    if (typeof payload.n !== "string" || typeof payload.h !== "string") return false
    const expected = Buffer.from(payload.h, "hex")
    const actual = Buffer.from(answerHash(payload.n, userAnswer, binding), "hex")
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

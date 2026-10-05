import twilio from "twilio"
import { getSettings } from "@/lib/settings-cache"
import { decrypt } from "@/lib/crypto"

let twilioClient: twilio.Twilio | null = null
let twilioClientKey: string | null = null

async function getTwilioCredentials(companyId?: string | null) {
  // Served from the shared settings cache (short TTL), so credential changes made on
  // another instance are picked up without a process-lifetime cache here
  const settings = await getSettings(["mfa.sms.account_sid", "mfa.sms.auth_token", "mfa.sms.phone_number"], companyId)

  const config: Record<string, string> = {}
  settings.forEach((value, key) => {
    config[key] = decrypt(value as string)
  })

  const accountSid = config["mfa.sms.account_sid"]
  const authToken = config["mfa.sms.auth_token"]
  const phoneNumber = config["mfa.sms.phone_number"]

  if (!accountSid || !authToken || !phoneNumber) {
    return null
  }

  return { accountSid, authToken, phoneNumber }
}

async function getTwilioClient(
  credentials: { accountSid: string; authToken: string } | null
) {
  if (!credentials) {
    return null
  }

  const key = `${credentials.accountSid}:${credentials.authToken}`
  if (twilioClient && twilioClientKey === key) {
    return twilioClient
  }

  twilioClient = twilio(credentials.accountSid, credentials.authToken)
  twilioClientKey = key
  return twilioClient
}

export async function checkSmsCredentials(companyId?: string | null): Promise<{ configured: boolean; error?: string }> {
  const credentials = await getTwilioCredentials(companyId)
  if (!credentials) {
    return {
      configured: false,
      error: "SMS credentials are not configured. Please configure them in Settings → MFA Credentials.",
    }
  }
  return { configured: true }
}

export async function sendSmsCode(
  phoneNumber: string,
  code: string,
  companyId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const creds = await getTwilioCredentials(companyId)
    if (!creds) {
      return {
        success: false,
        error: "SMS credentials are not configured. Please configure them in Settings → MFA Credentials.",
      }
    }

    const client = await getTwilioClient(creds)
    if (!client) {
      return {
        success: false,
        error: "Failed to initialize Twilio client.",
      }
    }

    await client.messages.create({
      body: `Your Password Storage verification code is: ${code}. This code will expire in 10 minutes.`,
      from: creds.phoneNumber,
      to: phoneNumber,
    })

    return { success: true }
  } catch (error) {
    console.error("Failed to send SMS:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send SMS",
    }
  }
}

// Clear cache when credentials are updated
export function clearSmsCredentialsCache() {
  twilioClient = null
  twilioClientKey = null
}

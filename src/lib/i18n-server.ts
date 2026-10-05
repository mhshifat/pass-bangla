import { cookies } from "next/headers"
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from "@/lib/i18n-shared"

export type { SupportedLanguage }

const LANGUAGE_COOKIE_NAME = "i18nextLng"

/**
 * Get the user's language preference (server-side)
 * Priority:
 * 1. Cookie (user's explicit preference) - Only respected if user is logged in
 * 2. Default to 'en' (English)
 *
 * Note: Language selection is only available to authenticated users via:
 * - Profile/Settings page
 * - Sidebar language selector
 */
export async function getServerLanguage(): Promise<SupportedLanguage> {
  try {
    const cookieStore = await cookies()
    const languageCookie = cookieStore.get(LANGUAGE_COOKIE_NAME)?.value

    // Only use cookie if it exists and contains a supported language
    // Cookie is only set when user explicitly changes language after login
    if (isSupportedLanguage(languageCookie)) {
      return languageCookie
    }
  } catch (error) {
    console.warn("Failed to read language cookie:", error)
  }

  // Always default to English
  return DEFAULT_LANGUAGE
}

/**
 * Get blog translations based on language
 */
export async function getBlogTranslations(language: SupportedLanguage) {
  // Import translations dynamically to avoid server/client issues
  if (language === "bn") {
    const bnTranslations = await import("@/locales/bn/common.json")
    return bnTranslations.default?.blog || {}
  }

  const enTranslations = await import("@/locales/en/common.json")
  return enTranslations.default?.blog || {}
}

/**
 * Get changelog translations based on language
 */
export async function getChangelogTranslations(language: SupportedLanguage) {
  // Import translations dynamically to avoid server/client issues
  if (language === "bn") {
    const bnTranslations = await import("@/locales/bn/common.json")
    return bnTranslations.default?.changelog || {}
  }

  const enTranslations = await import("@/locales/en/common.json")
  return enTranslations.default?.changelog || {}
}

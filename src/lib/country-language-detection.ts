/**
 * Country to language mapping
 * Maps country codes to supported languages
 */

const COUNTRY_TO_LANGUAGE: Record<string, 'en' | 'bn'> = {
  // Bengali-speaking countries/regions
  BD: 'bn', // Bangladesh
  // Note: India (IN) is not mapped to 'bn' by default since Hindi/English are more common
  // You can add specific Indian states/regions if needed
  
  // Default to English for all other countries
}

/**
 * Get language from country code
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., 'BD', 'US', 'IN')
 * @returns Language code ('en' or 'bn') or null if not determinable
 */
export function getLanguageFromCountry(countryCode: string | null | undefined): 'en' | 'bn' | null {
  if (!countryCode) return null
  
  const upperCountryCode = countryCode.toUpperCase()
  return COUNTRY_TO_LANGUAGE[upperCountryCode] || 'en'
}

/**
 * Detect country from browser (client-side)
 * Uses browser's Intl API to get locale/region and timezone
 * @returns Country code or null
 */
export function detectCountryFromBrowser(): string | null {
  if (typeof window === 'undefined') return null
  
  try {
    // Try to get country from browser locale
    const navigatorWithUserLanguage = navigator as Navigator & { userLanguage?: string }
    const locale = navigator.language || navigatorWithUserLanguage.userLanguage
    if (locale) {
      // Extract country code from locale (e.g., 'en-BD' -> 'BD', 'bn-BD' -> 'BD')
      const parts = locale.split('-')
      if (parts.length > 1) {
        return parts[parts.length - 1].toUpperCase()
      }
    }
    
    // If locale doesn't have country, try timezone
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      // Map timezones to countries
      if (timezone.includes('Dhaka')) {
        return 'BD' // Bangladesh
      }
      if (timezone.includes('Calcutta') || timezone.includes('Kolkata')) {
        return 'IN' // India (but we don't map IN to bn by default)
      }
    } catch {
      // Ignore timezone errors
    }
  } catch (error) {
    // Ignore detection errors
  }
  
  return null
}

/**
 * Detect language from country (client-side)
 * @returns Language code ('en' or 'bn') or null
 */
export function detectLanguageFromCountryClient(): 'en' | 'bn' | null {
  const countryCode = detectCountryFromBrowser()
  return getLanguageFromCountry(countryCode)
}


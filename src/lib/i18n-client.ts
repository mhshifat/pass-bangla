/**
 * Client-side i18n utilities
 * These functions can be used in client components
 * 
 * Language Management:
 * - Default language is English for all users
 * - Language selection is only available after login via:
 *   - Sidebar language selector
 *   - Profile/Settings page
 * - Language preference is stored in cookies for persistence
 */

const LANGUAGE_COOKIE_NAME = "i18nextLng"

/**
 * Set language cookie (client-side helper)
 * This is a client-side only function that can be used in "use client" components
 * 
 * Note: This should only be called from authenticated areas (sidebar, settings)
 */
export function setLanguageCookie(language: string) {
  if (typeof document !== "undefined") {
    // Set cookie with 1 year expiration
    const expires = new Date()
    expires.setFullYear(expires.getFullYear() + 1)
    document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`
  }
}


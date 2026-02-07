"use client"

import { useEffect } from "react"
import { I18nextProvider } from "react-i18next"
import i18n from "@/lib/i18n"

/**
 * I18nProvider
 * 
 * Manages i18n initialization on the client.
 * Default language is English. Language selection is only available after login.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Only use cookie for language preference (set by user after login)
    // No automatic detection - always default to English
    if (typeof window !== "undefined") {
      const getCookieValue = (name: string) => {
        const value = `; ${document.cookie}`
        const parts = value.split(`; ${name}=`)
        if (parts.length === 2) return parts.pop()?.split(';').shift()
        return null
      }
      
      const cookieLanguage = getCookieValue("i18nextLng")
      
      // Use cookie if it exists (user's explicit choice after login), otherwise default to English
      const preferredLanguage = (cookieLanguage && (cookieLanguage === 'en' || cookieLanguage === 'bn')) 
        ? cookieLanguage
        : 'en'
      
      // Sync localStorage with cookie for consistency
      try {
        if (cookieLanguage) {
          localStorage.setItem("i18nextLng", cookieLanguage)
        }
      } catch {
        // Ignore localStorage errors
      }
      
      // Only change language if it doesn't match the preferred language
      if (i18n.language !== preferredLanguage) {
        i18n.changeLanguage(preferredLanguage).catch(() => {
          // Silent fail
        })
        // Update HTML lang to match
        document.documentElement.lang = preferredLanguage
      }
    }
  }, [])

  // Listen for language changes
  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      if (typeof document !== "undefined") {
        document.documentElement.lang = lng
      }
      // Force a re-render by dispatching a custom event
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("i18n:languageChanged", { detail: lng }))
      }
    }

    i18n.on("languageChanged", handleLanguageChange)

    return () => {
      i18n.off("languageChanged", handleLanguageChange)
    }
  }, [])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}



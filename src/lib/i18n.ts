import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Import translation files
import enTranslations from '@/locales/en/common.json'
import bnTranslations from '@/locales/bn/common.json'

/**
 * i18n initialization
 * 
 * Default language: English
 * Language selection: Only available after login via sidebar or settings
 * No automatic detection based on timezone, country, or browser language
 */

// Only initialize if not already initialized (for client-side)
if (!i18n.isInitialized) {  
  // Get initial language - only from cookie (user's explicit choice after login)
  // Always default to English
  let initialLanguage = 'en'
  if (typeof window !== 'undefined') {
    // Check window.__I18N_INITIAL_LANGUAGE__ (set by blocking script from cookie only)
    const windowWithLang = window as typeof window & { __I18N_INITIAL_LANGUAGE__?: string }
    if (windowWithLang.__I18N_INITIAL_LANGUAGE__) {
      const scriptLang = windowWithLang.__I18N_INITIAL_LANGUAGE__
      if (scriptLang === 'en' || scriptLang === 'bn') {
        initialLanguage = scriptLang
      }
    } else {
      // Fallback: Check cookie directly
      const cookieMatch = document.cookie.match(/i18nextLng=([^;]+)/)
      if (cookieMatch && (cookieMatch[1] === 'en' || cookieMatch[1] === 'bn')) {
        initialLanguage = cookieMatch[1]
      }
    }
  }
  i18n
    .use(initReactI18next) // Passes i18n down to react-i18next
    .init({
      resources: {
        en: {
          translation: enTranslations,
        },
        bn: {
          translation: bnTranslations,
        },
      },
      fallbackLng: 'en', // Default language
      lng: initialLanguage, // Set initial language to match server - this prevents LanguageDetector from overriding
      debug: false,
      react: {
        useSuspense: false, // Disable suspense to avoid hydration issues
      },
      interpolation: {
        escapeValue: false, // React already escapes values
      },
      // No detection config - we handle language detection manually via blocking script
      // The blocking script sets the cookie, and we read it in initialLanguage
      // Ensure proper language loading
      supportedLngs: ['en', 'bn'],
      nonExplicitSupportedLngs: false,
    })
    .then(() => {
      // Ensure the language is set correctly after initialization
      // Cookie is only set when user explicitly changes language after login
      if (typeof window !== 'undefined') {
        // Get the language from cookie (user's explicit choice)
        const cookieMatch = document.cookie.match(/i18nextLng=([^;]+)/)
        const cookieLang = cookieMatch && (cookieMatch[1] === 'en' || cookieMatch[1] === 'bn') ? cookieMatch[1] : null
        
        // Use cookie if exists, otherwise use initialLanguage (defaults to 'en')
        const targetLanguage = cookieLang || initialLanguage
        
        // Only change language if it doesn't match the target
        if (i18n.language !== targetLanguage && targetLanguage) {
          i18n.changeLanguage(targetLanguage).catch(() => {
            // Silent fail
          })
        }
        
        // Only sync localStorage if cookie exists (user has explicitly set language)
        if (cookieLang) {
          try {
            localStorage.setItem('i18nextLng', cookieLang)
          } catch {
            // Ignore localStorage errors
          }
        }
      }
    })
    .catch((error) => {
      console.error('i18n initialization error:', error)
    })
}

export default i18n



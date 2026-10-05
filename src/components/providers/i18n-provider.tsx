"use client"

import { Suspense, use, useEffect, useState } from "react"
import { I18nextProvider } from "react-i18next"
import {
  DEFAULT_LANGUAGE,
  getI18nInstance,
  isSupportedLanguage,
  loadTranslationBundle,
  registerI18nInstance,
  releaseI18nInstance,
  syncLanguage,
  type SupportedLanguage,
} from "@/lib/i18n"

interface I18nProviderProps {
  /** Language the server rendered with (from the `i18nextLng` cookie). */
  initialLanguage?: SupportedLanguage
  children: React.ReactNode
}

/**
 * I18nProvider
 *
 * Default language is English. Language selection is only available after login.
 * The server and the client's first render both use `initialLanguage`, so there is no
 * hydration mismatch and no flash of untranslated keys for Bangla users.
 */
export function I18nProvider({ initialLanguage = DEFAULT_LANGUAGE, children }: I18nProviderProps) {
  return (
    <Suspense fallback={null}>
      <I18nRuntime initialLanguage={initialLanguage}>{children}</I18nRuntime>
    </Suspense>
  )
}

function I18nRuntime({ initialLanguage, children }: { initialLanguage: SupportedLanguage; children: React.ReactNode }) {
  // Non-English bundles ship as a separate chunk. `use` resolves it before the first render
  // (server HTML stays visible meanwhile), so the active language is available synchronously.
  const bundle = initialLanguage === DEFAULT_LANGUAGE ? undefined : use(loadTranslationBundle(initialLanguage))
  const [i18n] = useState(() =>
    getI18nInstance(initialLanguage, bundle ? { [initialLanguage]: bundle } : undefined)
  )

  useEffect(() => {
    // Reconcile with the cookie in case it disagrees with what the server rendered
    const cookieMatch = document.cookie.match(/(?:^|;\s*)i18nextLng=([^;]+)/)
    const cookieLanguage = cookieMatch?.[1]
    const preferredLanguage = isSupportedLanguage(cookieLanguage) ? cookieLanguage : DEFAULT_LANGUAGE

    try {
      if (cookieLanguage) {
        localStorage.setItem("i18nextLng", cookieLanguage)
      }
    } catch {
      // Ignore localStorage errors
    }

    if (i18n.language !== preferredLanguage) {
      i18n.changeLanguage(preferredLanguage).catch(() => {
        // Silent fail
      })
    }
  }, [i18n])

  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      document.documentElement.lang = lng
      document.body.classList.toggle("font-bengali", lng === "bn")
      window.dispatchEvent(new CustomEvent("i18n:languageChanged", { detail: lng }))
      syncLanguage(i18n, lng)
    }

    registerI18nInstance(i18n)
    i18n.on("languageChanged", handleLanguageChange)

    return () => {
      i18n.off("languageChanged", handleLanguageChange)
      releaseI18nInstance(i18n)
    }
  }, [i18n])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}

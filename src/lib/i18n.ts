import { createInstance, type i18n as I18nInstance, type BackendModule, type Resource, type ResourceKey } from 'i18next'
import { initReactI18next } from 'react-i18next'

// English is the default/fallback language, so it is the only bundle in the main chunk.
// Other languages are fetched as their own chunk the first time they are needed.
import enTranslations from '@/locales/en/common.json'

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n-shared'

export { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, isSupportedLanguage, type SupportedLanguage } from '@/lib/i18n-shared'

type TranslationBundle = Record<string, unknown>

// React's `use()` reads these fields to resolve an already-settled thenable synchronously,
// so a bundle that is loaded once never suspends again (e.g. after a language switch).
type TrackedPromise<T> = Promise<T> & {
  status?: 'pending' | 'fulfilled' | 'rejected'
  value?: T
  reason?: unknown
}

// One promise per language so React's `use()` and the backend share the same in-flight load.
const bundlePromises = new Map<string, TrackedPromise<TranslationBundle>>()

export function loadTranslationBundle(language: string): Promise<TranslationBundle> {
  if (language === DEFAULT_LANGUAGE) {
    return Promise.resolve(enTranslations as TranslationBundle)
  }
  let promise = bundlePromises.get(language)
  if (!promise) {
    const tracked: TrackedPromise<TranslationBundle> =
      language === 'bn'
        ? import('@/locales/bn/common.json').then((mod) => mod.default as TranslationBundle)
        : Promise.reject(new Error(`Unsupported language: ${language}`))
    tracked.status = 'pending'
    tracked.then(
      (value) => {
        tracked.status = 'fulfilled'
        tracked.value = value
      },
      (reason) => {
        tracked.status = 'rejected'
        tracked.reason = reason
        bundlePromises.delete(language)
      },
    )
    bundlePromises.set(language, tracked)
    promise = tracked
  }
  return promise
}

// i18next "backend" that resolves missing bundles via dynamic import. This is what makes
// `i18n.changeLanguage('bn')` from the ~160 existing hook call sites work unchanged: i18next
// asks the backend, we fetch the chunk, and `languageChanged` fires once it is in the store.
const lazyBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    loadTranslationBundle(language).then(
      (data) => callback(null, data as ResourceKey),
      (error) => callback(error instanceof Error ? error : String(error), false),
    )
  },
}

export type InitialBundles = Partial<Record<SupportedLanguage, TranslationBundle>>

/**
 * Create a fully initialised instance. Initialisation is synchronous when the active language
 * is bundled (i18next skips the async path when `resources` are supplied), so `t()` works on
 * the very first render.
 */
export function createI18nInstance(language: SupportedLanguage, bundles?: InitialBundles): I18nInstance {
  const resources: Resource = {
    en: { translation: enTranslations as ResourceKey },
  }
  if (bundles) {
    for (const [lng, bundle] of Object.entries(bundles)) {
      if (lng !== DEFAULT_LANGUAGE && bundle) {
        resources[lng] = { translation: bundle as ResourceKey }
      }
    }
  }

  const instance = createInstance()
  instance
    .use(initReactI18next)
    .use(lazyBackend)
    .init({
      resources,
      partialBundledLanguages: true,
      fallbackLng: DEFAULT_LANGUAGE,
      lng: language,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      nonExplicitSupportedLngs: false,
      debug: false,
      react: {
        useSuspense: false,
      },
      interpolation: {
        escapeValue: false,
      },
    })
    .catch((error) => {
      console.error('i18n initialization error:', error)
    })

  return instance
}

let browserInstance: I18nInstance | undefined
const segmentInstances = new Set<I18nInstance>()

/**
 * On the server every request gets its own instance (the language comes from the request's
 * cookie, and a shared singleton would leak one visitor's language into another's render).
 * In the browser the first provider (root layout, always English) owns the shared instance.
 * A nested provider whose server-rendered language differs gets its own instance so its first
 * render matches the server HTML; `syncLanguage` keeps all instances on the same language.
 */
export function getI18nInstance(language: SupportedLanguage, bundles?: InitialBundles): I18nInstance {
  if (typeof window === 'undefined') {
    return createI18nInstance(language, bundles)
  }
  if (!browserInstance) {
    browserInstance = createI18nInstance(language, bundles)
    return browserInstance
  }
  if (browserInstance.language === language) {
    return browserInstance
  }
  const instance = createI18nInstance(language, bundles)
  segmentInstances.add(instance)
  return instance
}

/** Browser only: propagate a language change from one instance to every other live instance. */
export function syncLanguage(source: I18nInstance, language: string): void {
  const all = browserInstance ? [browserInstance, ...segmentInstances] : [...segmentInstances]
  for (const other of all) {
    if (other !== source && other.language !== language) {
      other.changeLanguage(language).catch(() => {
        // Silent fail
      })
    }
  }
}

export function registerI18nInstance(instance: I18nInstance): void {
  if (instance !== browserInstance) segmentInstances.add(instance)
}

export function releaseI18nInstance(instance: I18nInstance): void {
  segmentInstances.delete(instance)
}

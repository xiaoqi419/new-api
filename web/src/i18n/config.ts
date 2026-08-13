/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import i18n, { type BackendModule, type ReadCallback } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { convertDetectedLanguage } from './languages'

// Statically bundling all seven locales made translations ~82% of the entry
// chunk even though a visitor only ever reads one of them, so each locale is
// fetched as its own async chunk through i18next's backend interface.
const localeLoaders: Record<
  string,
  () => Promise<{ translation?: Record<string, string> }>
> = {
  en: async () => (await import('./locales/en.json')).default,
  zhCN: async () => (await import('./locales/zh.json')).default,
  zhTW: async () => (await import('./locales/zh-TW.json')).default,
  fr: async () => (await import('./locales/fr.json')).default,
  ru: async () => (await import('./locales/ru.json')).default,
  ja: async () => (await import('./locales/ja.json')).default,
  vi: async () => (await import('./locales/vi.json')).default,
}

const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init: () => {},
  read: async (
    language: string,
    _namespace: string,
    callback: ReadCallback
  ) => {
    const load = localeLoaders[language]
    if (!load) {
      callback(null, {})
      return
    }
    try {
      const bundle = await load()
      callback(null, bundle.translation ?? {})
    } catch (error) {
      callback(error as Error, false)
    }
  },
}

export const i18nReady = i18n
  .use(lazyLocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Keys are the English source strings, so an untranslated key already
    // renders correct English. Keeping `en` as the fallback would make every
    // non-English visitor download a second locale for no visible gain.
    fallbackLng: false,
    supportedLngs: ['en', 'zhCN', 'fr', 'ru', 'ja', 'vi', 'zhTW'],
    load: 'currentOnly',
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    // Locales now resolve asynchronously. `main.tsx` waits for the first one
    // before rendering and `changeLanguage` only settles once the new bundle is
    // in, so no component needs its own Suspense boundary.
    react: { useSuspense: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Browsers report `zh-CN`/`zh-TW`/`zh`; map them onto our `zhCN`/`zhTW`
      // codes (non-Chinese codes pass through for normal supportedLngs matching).
      convertDetectedLanguage,
    },
  })

export default i18n

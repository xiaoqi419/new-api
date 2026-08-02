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
import { createContext, useContext, useEffect } from 'react'

import {
  DEFAULT_THEME_CUSTOMIZATION,
  resolveThemeFont,
  type ThemeCustomization,
} from '@/lib/theme-customization'

function applyAttribute(name: string, value: string | null) {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  if (value === null) {
    body.removeAttribute(name)
  } else {
    body.setAttribute(name, value)
  }
}

type ThemeCustomizationContextType = {
  customization: ThemeCustomization
}

// The theme drawer that let users pick a font, radius, scale and content
// layout is gone, so these axes have no UI and always resolve to the design
// system defaults.
const ThemeCustomizationContext = createContext<ThemeCustomizationContextType>({
  customization: DEFAULT_THEME_CUSTOMIZATION,
})

export function ThemeCustomizationProvider(props: {
  children: React.ReactNode
}) {
  // Mirror the defaults to the <body> via data-* attributes so theme-presets.css
  // can override CSS variables at the right cascade layer. Font resolves first
  // because CSS works in terms of the concrete sans/serif choice rather than the
  // `default` sentinel.
  useEffect(() => {
    applyAttribute(
      'data-theme-font',
      resolveThemeFont(DEFAULT_THEME_CUSTOMIZATION.font)
    )
    applyAttribute('data-theme-radius', null)
    applyAttribute('data-theme-scale', null)
    applyAttribute(
      'data-theme-content-layout',
      DEFAULT_THEME_CUSTOMIZATION.contentLayout
    )
  }, [])

  return (
    <ThemeCustomizationContext.Provider
      value={{ customization: DEFAULT_THEME_CUSTOMIZATION }}
    >
      {props.children}
    </ThemeCustomizationContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeCustomization() {
  return useContext(ThemeCustomizationContext)
}

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

export interface LoginPageStat {
  value: string
  label: string
}

export interface LoginPageConfig {
  background_image?: string
  title?: string
  description?: string
  stats?: LoginPageStat[]
}

export const EMPTY_LOGIN_PAGE_CONFIG: LoginPageConfig = {}

export function parseLoginPageConfig(raw: unknown): LoginPageConfig {
  if (!raw) return EMPTY_LOGIN_PAGE_CONFIG

  let source: unknown = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return EMPTY_LOGIN_PAGE_CONFIG
    try {
      source = JSON.parse(raw)
    } catch {
      return EMPTY_LOGIN_PAGE_CONFIG
    }
  }

  if (!source || typeof source !== 'object') return EMPTY_LOGIN_PAGE_CONFIG
  const obj = source as Record<string, unknown>

  const stats: LoginPageStat[] = []
  if (Array.isArray(obj.stats)) {
    for (const item of obj.stats) {
      if (!item || typeof item !== 'object') continue
      const value = (item as Record<string, unknown>).value
      const label = (item as Record<string, unknown>).label
      const valueStr = typeof value === 'string' ? value.trim() : ''
      const labelStr = typeof label === 'string' ? label.trim() : ''
      if (!valueStr && !labelStr) continue
      stats.push({ value: valueStr, label: labelStr })
    }
  }

  return {
    background_image:
      typeof obj.background_image === 'string'
        ? obj.background_image.trim()
        : '',
    title: typeof obj.title === 'string' ? obj.title.trim() : '',
    description:
      typeof obj.description === 'string' ? obj.description.trim() : '',
    stats,
  }
}

export function serializeLoginPageConfig(config: LoginPageConfig): string {
  const stats = (config.stats ?? [])
    .map((s) => ({
      value: (s.value ?? '').trim(),
      label: (s.label ?? '').trim(),
    }))
    .filter((s) => s.value || s.label)

  const payload: LoginPageConfig = {
    background_image: (config.background_image ?? '').trim(),
    title: (config.title ?? '').trim(),
    description: (config.description ?? '').trim(),
    stats,
  }

  return JSON.stringify(payload)
}

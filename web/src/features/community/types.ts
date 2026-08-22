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
import { isHttpUrl } from '@/lib/content-format'

export type CommunityLinkType =
  | 'qq'
  | 'wechat'
  | 'telegram'
  | 'discord'
  | 'custom'

export type CommunityLinkAction = 'copy' | 'link'

export type CommunityLink = {
  id: string
  type: CommunityLinkType
  label: string
  value: string
  action: CommunityLinkAction
  qrImageUrl?: string
  enabled: boolean
}

const VALID_TYPES = new Set<CommunityLinkType>([
  'qq',
  'wechat',
  'telegram',
  'discord',
  'custom',
])

function normalizeType(raw: unknown): CommunityLinkType {
  if (typeof raw === 'string' && VALID_TYPES.has(raw as CommunityLinkType)) {
    return raw as CommunityLinkType
  }
  return 'custom'
}

/**
 * Parse the raw CommunityLinks JSON string configured by admins into a typed,
 * sanitized array. Invalid or disabled entries are dropped so consumers can
 * render the result directly.
 */
export function parseCommunityLinks(raw?: string | null): CommunityLink[] {
  if (!raw || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const result: CommunityLink[] = []
  parsed.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const record = item as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label.trim() : ''
    const value = typeof record.value === 'string' ? record.value.trim() : ''
    const qrImageUrl =
      typeof record.qrImageUrl === 'string' ? record.qrImageUrl.trim() : ''
    if (label === '' && value === '' && qrImageUrl === '') return

    const enabled = record.enabled !== false
    if (!enabled) return

    let action: CommunityLinkAction = 'copy'
    if (record.action === 'link' || record.action === 'copy') {
      action = record.action
    } else if (isHttpUrl(value)) {
      action = 'link'
    }

    result.push({
      id: typeof record.id === 'string' && record.id ? record.id : `c-${index}`,
      type: normalizeType(record.type),
      label,
      value,
      action,
      qrImageUrl: qrImageUrl || undefined,
      enabled,
    })
  })
  return result
}

export function communityLinkHasQr(link: CommunityLink): boolean {
  return Boolean(link.qrImageUrl) || (link.action === 'link' && isHttpUrl(link.value))
}

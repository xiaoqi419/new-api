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
function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

/**
 * Normalize a configured API endpoint into the OpenAI-compatible Base URL that
 * clients should point at (i.e. ending with `/v1`). Falls back to the current
 * origin when no endpoint is configured.
 */
export function normalizeApiBaseUrl(sourceUrl?: string): string {
  const fallback = `${getCurrentOrigin()}/v1`
  const trimmed = sourceUrl?.trim()
  if (!trimmed) return fallback

  const noSlash = trimmed.replace(/\/+$/, '')
  if (noSlash.endsWith('/v1/chat/completions')) {
    return noSlash.replace(/\/chat\/completions$/, '')
  }
  if (noSlash.endsWith('/v1')) return noSlash
  return `${noSlash}/v1`
}

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

const NAMESPACE_URL =
  /https?:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink)\/?([^A-Za-z0-9/._~:?&=%+-]|$)/gi

function stripCodeFence(text: string) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  const rest = trimmed.slice(3)
  const newline = rest.indexOf('\n')
  const body = (newline >= 0 ? rest.slice(newline + 1) : rest).trim()
  return body.endsWith('```') ? body.slice(0, -3).trim() : body
}

/** Keeps one inline drawing. SVG namespace URLs are not remote assets. */
export function playableDrawingHTML(stored: string, reply: string) {
  const saved = stored.trim()
  if (saved) return saved
  const text = stripCodeFence(reply)
  if (!text || text.toLowerCase().includes('javascript:')) return ''
  const scan = text.replace(NAMESPACE_URL, '$1').toLowerCase()
  const hasCanvas = scan.includes('<canvas')
  const hasSVG = scan.includes('<svg') && scan.includes('viewbox')
  if (scan.includes('http://') || scan.includes('https://') || (!hasCanvas && !hasSVG)) {
    return ''
  }
  if (!scan.includes('<html')) {
    return `<!doctype html><html><body>${text}</body></html>`
  }
  return text
}

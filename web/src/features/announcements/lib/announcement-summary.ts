/*
Copyright (C) 2026 QuantumNous

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

export function getAnnouncementSummary(
  content: string,
  maxLength = 160
): string {
  const text = content
    .replaceAll(/```[\s\S]*?```/g, '')
    .replaceAll(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replaceAll(/<[^>]+>/g, ' ')
    .split('\n')
    .filter(
      (line) =>
        !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
    )
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s{0,3}[-*+]\s+/, '')
        .replace(/^\s{0,3}\d+[.)]\s+/, '')
        .replaceAll('|', ' ')
    )
    .join(' ')
    .replaceAll(/[`*_~>]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()

  const characters = [...text]
  if (characters.length <= maxLength) return text

  return `${characters.slice(0, maxLength).join('').trimEnd()}…`
}

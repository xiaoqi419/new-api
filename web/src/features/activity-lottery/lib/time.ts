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
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseShanghaiInputTime(value: string): number | null {
  const match = LOCAL_INPUT_RE.exec(value)
  if (!match) return null

  const [, year, month, day, hour, minute] = match
  const utcMs =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute)
    ) - SHANGHAI_OFFSET_MS
  if (!Number.isFinite(utcMs)) return null
  if (formatShanghaiInputTime(utcMs / 1000) !== value) return null
  return utcMs / 1000
}

export function parseShanghaiStartDate(value: string): number | null {
  const match = LOCAL_DATE_RE.exec(value)
  if (!match) return null

  const [, year, month, day] = match
  const utcMs =
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0) -
    SHANGHAI_OFFSET_MS
  if (!Number.isFinite(utcMs)) return null
  if (formatShanghaiStartDate(utcMs / 1000) !== value) return null
  return utcMs / 1000
}

export function formatShanghaiStartDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp * 1000 + SHANGHAI_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
}

export function formatShanghaiInputTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp * 1000 + SHANGHAI_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
}

export function formatShanghaiDrawTime(timestamp: number): string {
  const local = formatShanghaiInputTime(timestamp)
  if (!local) return ''
  const [date, time] = local.split('T')
  if (time === '00:00') {
    const previousDay = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10)
    return `${previousDay} 24:00`
  }
  return `${date} ${time}`
}

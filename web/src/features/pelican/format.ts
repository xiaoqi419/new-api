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
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

export function formatRatio(value: number) {
  if (!Number.isFinite(value)) return 'x1'
  return `x${value.toFixed(2).replace(/\.?0+$/, '')}`
}

export function formatPercent(rate: number | null) {
  if (rate == null || !Number.isFinite(rate)) return '—'
  const value = rate * 100
  if (Math.abs(value - Math.round(value)) < 0.05) return `${Math.round(value)}%`
  return `${value.toFixed(1)}%`
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} s`
  return `${Math.floor(total / 60)}m ${total % 60}s`
}

export function formatCountdown(targetSec: number, nowMs: number) {
  const left = Math.max(0, Math.floor(targetSec - nowMs / 1000))
  const minutes = Math.floor(left / 60)
  const seconds = left % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function parts(unix: number, locale: string | undefined, withSeconds: boolean) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: SHANGHAI_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: false,
  }).formatToParts(new Date(unix * 1000))
}

function pick(list: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return list.find((part) => part.type === type)?.value ?? ''
}

export function formatSlotLabel(unix: number, locale?: string) {
  if (!unix) return '—'
  const list = parts(unix, locale, false)
  return `${pick(list, 'month')}-${pick(list, 'day')} ${pick(list, 'hour')}:${pick(list, 'minute')}`
}

export function formatCheckedAt(unix: number, locale?: string) {
  if (!unix) return '—'
  const list = parts(unix, locale, true)
  return `${pick(list, 'month')}-${pick(list, 'day')} ${pick(list, 'hour')}:${pick(list, 'minute')}:${pick(list, 'second')}`
}

export function formatClock(unix: number, locale?: string) {
  if (!unix) return '—'
  const list = parts(unix, locale, true)
  return `${pick(list, 'hour')}:${pick(list, 'minute')}:${pick(list, 'second')}`
}

const BLOCK_CLASS: Record<string, string> = {
  pass: 'bg-green-500',
  fail: 'bg-red-500',
  error: 'bg-amber-400',
  running: 'bg-blue-500 animate-pulse',
  empty: 'bg-neutral-300',
}

export function statusBlockClass(status: string) {
  return BLOCK_CLASS[status] ?? BLOCK_CLASS.empty
}

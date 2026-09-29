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
import { formatNumber } from '@/lib/format'

const YUAN_INPUT_RE = /^(0|[1-9]\d{0,5})(?:\.(\d{1,2}))?$/

export function parseActivityPrizeYuan(value: string): number | null {
  const match = YUAN_INPUT_RE.exec(value.trim())
  if (!match) return null

  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return cents >= 1 && cents <= 10_000_000 ? cents : null
}

export function formatActivityPrizeYuan(
  cents: number,
  locale: Intl.LocalesArgument
): string {
  return `¥${formatNumber(cents / 100, locale)}`
}

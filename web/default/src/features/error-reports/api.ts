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

For commercial licensing, please contact support@quantumnous.com
*/
import { api } from '@/lib/api'

import type { ApiResponse, ErrorStatData } from './types'

export async function getErrorStat(
  startSec: number,
  endSec: number
): Promise<ApiResponse<ErrorStatData>> {
  const res = await api.get(
    `/api/log/error_stat?start_timestamp=${startSec}&end_timestamp=${endSec}`
  )
  return res.data
}

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
import { useCallback, useEffect, useState } from 'react'

import { getGroupBuyHall } from '../api'
import { PAGE_SIZE } from '../constants'
import type { GroupBuyHallItem } from '../types'

export function useGroupBuyHall() {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [items, setItems] = useState<GroupBuyHallItem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(async (targetPage: number) => {
    setLoading(true)
    try {
      const res = await getGroupBuyHall(targetPage, PAGE_SIZE)
      if (res.success && res.data) {
        setEnabled(res.data.enabled)
        setItems(res.data.page_info?.items ?? [])
        setTotal(res.data.page_info?.total ?? 0)
        setPage(targetPage)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(1)
  }, [load])

  return { loading, enabled, items, page, total, pageSize: PAGE_SIZE, load }
}

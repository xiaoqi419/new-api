import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { getSelfTickets } from '../api'
import {
  TICKET_ERROR,
  getTicketCategoryOptions,
  getTicketStatusOptions,
} from '../constants'
import { useTicketsColumns } from './tickets-columns'
import { useTickets } from './tickets-provider'

const route = getRouteApi('/_authenticated/tickets/')

export function TicketsTable() {
  const { t } = useTranslation()
  const columns = useTicketsColumns(false)
  const { refreshTrigger } = useTickets()
  const isMobile = useMediaQuery('(max-width: 640px)')

  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
    globalFilter: { enabled: false, key: 'filter' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'category', searchKey: 'category', type: 'array' },
    ],
  })

  const statusFilter =
    (columnFilters.find((f) => f.id === 'status')?.value as
      | string[]
      | undefined) ?? []
  const categoryFilter =
    (columnFilters.find((f) => f.id === 'category')?.value as
      | string[]
      | undefined) ?? []

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'tickets-self',
      pagination.pageIndex + 1,
      pagination.pageSize,
      statusFilter[0] ?? '',
      categoryFilter[0] ?? '',
      refreshTrigger,
    ],
    queryFn: async () => {
      const res = await getSelfTickets({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        status: statusFilter[0] ?? '',
        category: categoryFilter[0] ?? '',
      })
      if (!res.success) {
        toast.error(res.message || t(TICKET_ERROR.LOAD_FAILED))
        return { items: [], total: 0 }
      }
      return {
        items: res.data?.items || [],
        total: res.data?.total || 0,
      }
    },
    placeholderData: (prev) => prev,
  })

  const rows = data?.items || []

  const { table } = useDataTable({
    data: rows,
    columns,
    columnFilters,
    globalFilter,
    pagination,
    onPaginationChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  const statusOptions = useMemo(() => getTicketStatusOptions(t), [t])
  const categoryOptions = useMemo(() => getTicketCategoryOptions(t), [t])

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No tickets yet')}
      toolbarProps={{
        filters: [
          {
            columnId: 'status',
            title: t('Status'),
            options: statusOptions,
            singleSelect: true,
          },
          {
            columnId: 'category',
            title: t('Category'),
            options: categoryOptions,
            singleSelect: true,
          },
        ],
      }}
    />
  )
}

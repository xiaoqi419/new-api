import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { adminListTickets } from '../api'
import {
  TICKET_ERROR,
  getTicketCategoryOptions,
  getTicketPriorityOptions,
  getTicketStatusOptions,
} from '../constants'
import { useTicketsColumns } from './tickets-columns'
import { useTickets } from './tickets-provider'

const route = getRouteApi('/_authenticated/tickets/admin')

export function TicketsAdminTable() {
  const { t } = useTranslation()
  const columns = useTicketsColumns(true)
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
    globalFilter: { enabled: true, key: 'keyword' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'category', searchKey: 'category', type: 'array' },
      { columnId: 'priority', searchKey: 'priority', type: 'array' },
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
  const priorityFilter =
    (columnFilters.find((f) => f.id === 'priority')?.value as
      | string[]
      | undefined) ?? []

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'tickets-admin',
      pagination.pageIndex + 1,
      pagination.pageSize,
      globalFilter,
      statusFilter[0] ?? '',
      categoryFilter[0] ?? '',
      priorityFilter[0] ?? '',
      refreshTrigger,
    ],
    queryFn: async () => {
      const res = await adminListTickets({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        keyword: globalFilter ?? '',
        status: statusFilter[0] ?? '',
        category: categoryFilter[0] ?? '',
        priority: priorityFilter[0] ?? '',
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
    globalFilterFn: () => true,
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
  const priorityOptions = useMemo(() => getTicketPriorityOptions(t), [t])

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No tickets yet')}
      toolbarProps={{
        searchPlaceholder: t('Search ticket no, title, or user...'),
        filters: [
          {
            columnId: 'status',
            title: t('Status'),
            options: statusOptions,
            singleSelect: true,
          },
          {
            columnId: 'priority',
            title: t('Priority'),
            options: priorityOptions,
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

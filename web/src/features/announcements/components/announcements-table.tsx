import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { adminListAnnouncements } from '../api'
import { ANNOUNCEMENT_ERROR, getAnnouncementTypeOptions } from '../constants'
import { useAnnouncementsColumns } from './announcements-columns'
import { useAnnouncements } from './announcements-provider'

const route = getRouteApi('/_authenticated/announcements/admin')

export function AnnouncementsTable() {
  const { t } = useTranslation()
  const columns = useAnnouncementsColumns()
  const { refreshTrigger } = useAnnouncements()
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
    columnFilters: [{ columnId: 'type', searchKey: 'type', type: 'array' }],
  })

  const typeFilter =
    (columnFilters.find((f) => f.id === 'type')?.value as string[] | undefined) ??
    []
  const typeFilterValue = typeFilter[0] ?? ''

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'announcements-admin',
      pagination.pageIndex + 1,
      pagination.pageSize,
      typeFilterValue,
      refreshTrigger,
    ],
    queryFn: async () => {
      const res = await adminListAnnouncements({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        type: typeFilterValue,
      })
      if (!res.success) {
        toast.error(res.message || t(ANNOUNCEMENT_ERROR.LOAD_FAILED))
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

  const typeOptions = useMemo(() => getAnnouncementTypeOptions(t), [t])

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No announcements yet')}
      toolbarProps={{
        filters: [
          {
            columnId: 'type',
            title: t('Category'),
            options: typeOptions,
            singleSelect: true,
          },
        ],
      }}
    />
  )
}

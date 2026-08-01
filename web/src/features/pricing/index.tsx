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
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { cn } from '@/lib/utils'

import {
  LoadingSkeleton,
  EmptyState,
  SearchBar,
  PricingTable,
  PricingSidebar,
  PricingToolbar,
  ModelCardGrid,
} from './components'
import {
  DEFAULT_TOKEN_UNIT,
  ENDPOINT_TYPES,
  EXCLUDED_GROUPS,
  FILTER_ALL,
  MODALITY_FILTERS,
  QUOTA_TYPES,
  SORT_OPTIONS,
  VIEW_MODES,
  getModalityFilterLabels,
} from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'

export function Pricing() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    modalityFilter,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setVendorFilter,
    setGroupFilter,
    setQuotaTypeFilter,
    setEndpointTypeFilter,
    setTagFilter,
    setModalityFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    availableTags,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  const modalityLabels = getModalityFilterLabels(t)

  const handleModelClick = useCallback(
    (modelName: string) => {
      navigate({
        to: '/pricing/$modelId',
        params: { modelId: modelName },
        search: {
          search: searchInput || undefined,
          sort: sortBy !== SORT_OPTIONS.NAME ? sortBy : undefined,
          vendor: vendorFilter !== FILTER_ALL ? vendorFilter : undefined,
          group: groupFilter !== FILTER_ALL ? groupFilter : undefined,
          quotaType:
            quotaTypeFilter !== QUOTA_TYPES.ALL ? quotaTypeFilter : undefined,
          endpointType:
            endpointTypeFilter !== ENDPOINT_TYPES.ALL
              ? endpointTypeFilter
              : undefined,
          tag: tagFilter !== FILTER_ALL ? tagFilter : undefined,
          modality:
            modalityFilter !== MODALITY_FILTERS.ALL
              ? modalityFilter
              : undefined,
          tokenUnit: tokenUnit !== DEFAULT_TOKEN_UNIT ? tokenUnit : undefined,
          view: viewMode !== VIEW_MODES.TABLE ? viewMode : undefined,
          rechargePrice: showRechargePrice || undefined,
        },
      })
    },
    [
      navigate,
      searchInput,
      sortBy,
      vendorFilter,
      groupFilter,
      quotaTypeFilter,
      endpointTypeFilter,
      tagFilter,
      modalityFilter,
      tokenUnit,
      viewMode,
      showRechargePrice,
    ]
  )

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  const renderPricingContent = () => {
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    if (viewMode === VIEW_MODES.CARD) {
      return (
        <ModelCardGrid
          models={filteredModels}
          onModelClick={handleModelClick}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          selectedGroup={groupFilter}
        />
      )
    }

    return (
      <PricingTable
        models={filteredModels}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        tokenUnit={tokenUnit}
        showRechargePrice={showRechargePrice}
        selectedGroup={groupFilter}
        onModelClick={handleModelClick}
      />
    )
  }

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto w-full max-w-[1800px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
          <LoadingSkeleton viewMode={viewMode} />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='relative'>
        <PageTransition className='relative mx-auto w-full max-w-[1800px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
          <header className='mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-baseline gap-2'>
              <h1 className='text-xl font-bold tracking-tight sm:text-2xl'>
                {t('Model Square')}
              </h1>
              <span className='text-muted-foreground text-xs sm:text-sm'>
                {t('This site currently has {{count}} models enabled', {
                  count: models?.length || 0,
                })}
              </span>
            </div>
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onClear={clearSearch}
              placeholder={t(
                'Search model name, provider, endpoint, or tag...'
              )}
              className='w-full sm:max-w-sm'
            />
          </header>

          <div className='grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]'>
            <PricingSidebar
              quotaTypeFilter={quotaTypeFilter}
              endpointTypeFilter={endpointTypeFilter}
              vendorFilter={vendorFilter}
              groupFilter={groupFilter}
              tagFilter={tagFilter}
              onQuotaTypeChange={setQuotaTypeFilter}
              onEndpointTypeChange={setEndpointTypeFilter}
              onVendorChange={setVendorFilter}
              onGroupChange={setGroupFilter}
              onTagChange={setTagFilter}
              vendors={vendors || []}
              groups={availableGroups}
              groupRatios={groupRatio}
              tags={availableTags}
              models={models || []}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
              className='hover-scrollbar sticky top-4 hidden max-h-[calc(100dvh-2rem)] self-start overflow-y-auto xl:block'
            />

            <main className='min-w-0 space-y-4'>
              <div className='flex flex-wrap items-center gap-1.5'>
                {Object.entries(modalityLabels).map(([value, label]) => (
                  <button
                    key={value}
                    type='button'
                    onClick={() => setModalityFilter(value)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      modalityFilter === value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <PricingToolbar
                filteredCount={filteredModels.length}
                totalCount={models?.length}
                sortBy={sortBy}
                onSortChange={setSortBy}
                tokenUnit={tokenUnit}
                onTokenUnitChange={setTokenUnit}
                showRechargePrice={showRechargePrice}
                onRechargePriceChange={setShowRechargePrice}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                quotaTypeFilter={quotaTypeFilter}
                endpointTypeFilter={endpointTypeFilter}
                vendorFilter={vendorFilter}
                groupFilter={groupFilter}
                tagFilter={tagFilter}
                onQuotaTypeChange={setQuotaTypeFilter}
                onEndpointTypeChange={setEndpointTypeFilter}
                onVendorChange={setVendorFilter}
                onGroupChange={setGroupFilter}
                onTagChange={setTagFilter}
                vendors={vendors || []}
                groups={availableGroups}
                groupRatios={groupRatio}
                tags={availableTags}
                models={models || []}
                hasActiveFilters={hasActiveFilters}
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
              />

              {renderPricingContent()}
            </main>
          </div>
        </PageTransition>
      </div>
    </PublicLayout>
  )
}

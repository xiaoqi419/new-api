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

import {
  LoadingSkeleton,
  EmptyState,
  GroupView,
  PricingTable,
  PricingSidebar,
  PricingToolbar,
  ModelCardGrid,
  PricingHero,
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

  const handleModelClick = useCallback(
    (modelName: string, sourceGroup?: string) => {
      navigate({
        to: '/pricing/$modelId',
        params: { modelId: modelName },
        search: {
          search: searchInput || undefined,
          sort: sortBy !== SORT_OPTIONS.NAME ? sortBy : undefined,
          vendor: vendorFilter !== FILTER_ALL ? vendorFilter : undefined,
          // The group view clicks through from a specific group row, so that
          // row's group wins over the sidebar filter: the detail page must
          // price the model with the ratio the user just saw on the chip.
          group:
            sourceGroup ??
            (groupFilter !== FILTER_ALL ? groupFilter : undefined),
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

  const filterPanelProps = {
    quotaTypeFilter,
    endpointTypeFilter,
    vendorFilter,
    groupFilter,
    tagFilter,
    modalityFilter,
    onQuotaTypeChange: setQuotaTypeFilter,
    onEndpointTypeChange: setEndpointTypeFilter,
    onVendorChange: setVendorFilter,
    onGroupChange: setGroupFilter,
    onTagChange: setTagFilter,
    onModalityChange: setModalityFilter,
    vendors: vendors || [],
    groups: availableGroups,
    groupRatios: groupRatio,
    tags: availableTags,
    models: models || [],
    hasActiveFilters,
    activeFilterCount,
    onClearFilters: clearFilters,
  }

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

    if (viewMode === VIEW_MODES.GROUP) {
      return (
        <GroupView
          models={filteredModels}
          groups={availableGroups}
          groupRatio={groupRatio || {}}
          usableGroup={usableGroup || {}}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          onModelClick={handleModelClick}
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

  return (
    <PublicLayout
      showMainContainer={false}
      publicSurface='home'
      headerProps={{ className: 'top-3 xl:top-6' }}
    >
      <main className='min-h-svh overflow-visible bg-white dark:bg-[#1f1f1f]'>
        <PageTransition className='relative pb-12 xl:pb-[169px]'>
          <PricingHero
            modelCount={isLoading ? undefined : models?.length}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onClearSearch={clearSearch}
          />

          <section
            data-testid='pricing-results-workspace'
            className='relative z-10 mx-auto mt-[-48px] w-full max-w-[1280px] px-4 pb-12 sm:px-6 xl:mt-[-64px] xl:grid xl:h-[552px] xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-8 xl:px-0 xl:pb-0'
          >
            <aside className='hidden h-[552px] xl:block'>
              <PricingSidebar {...filterPanelProps} className='h-full' />
            </aside>

            <section
              aria-label={t('Model Square')}
              className='flex min-w-0 flex-col rounded-[24px] border border-[#eef1f4] bg-white p-4 shadow-[0_18px_40px_rgba(0,0,0,0.12)] sm:p-6 xl:h-[552px] xl:p-7 dark:border-white/12 dark:bg-[#111]'
            >
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
                {...filterPanelProps}
              />

              <div className='hover-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto pr-1'>
                {isLoading ? (
                  <LoadingSkeleton viewMode={viewMode} />
                ) : (
                  renderPricingContent()
                )}
              </div>
            </section>
          </section>
        </PageTransition>
      </main>
    </PublicLayout>
  )
}

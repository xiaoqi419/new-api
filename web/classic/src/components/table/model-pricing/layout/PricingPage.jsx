/*
Copyright (C) 2025 QuantumNous

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

import React from 'react';
import {
  Layout,
  ImagePreview,
  Button,
  Typography,
  Input,
  Pagination,
  Empty,
  Avatar,
} from '@douyinfe/semi-ui';
import { IconSearch, IconPlay } from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import PricingSidebar from './PricingSidebar';
import PricingContent from './content/PricingContent';
import ModelDetailSideSheet from '../modal/ModelDetailSideSheet';
import UptimeStrip from '../perf/UptimeStrip';
import { useModelPricingData } from '../../../../hooks/model-pricing/useModelPricingData';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import { useAppearance } from '../../../../context/Theme';
import {
  calculateModelPrice,
  formatPriceInfo,
  getLobeHubIcon,
} from '../../../../helpers';

const { Text } = Typography;

const getModelKey = (model) => model.key ?? model.model_name ?? model.id;

const getModelIcon = (model) => {
  if (model?.icon) {
    return getLobeHubIcon(model.icon, 28);
  }
  if (model?.vendor_icon) {
    return getLobeHubIcon(model.vendor_icon, 28);
  }
  const avatarText = (model?.model_name || 'AI').slice(0, 2).toUpperCase();
  return (
    <Avatar size='small' color='blue'>
      {avatarText}
    </Avatar>
  );
};

const getEndpointTypes = (models = []) => {
  const endpointTypes = new Set();
  models.forEach((model) => {
    if (Array.isArray(model.supported_endpoint_types)) {
      model.supported_endpoint_types.forEach((endpointType) =>
        endpointTypes.add(endpointType),
      );
    }
  });
  return [...endpointTypes].sort();
};

const getVendorItems = (models = []) => {
  const vendors = new Map();
  models.forEach((model) => {
    const vendor = model.vendor_name || 'unknown';
    vendors.set(vendor, (vendors.get(vendor) || 0) + 1);
  });
  return [...vendors.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const ApimartPricingPage = ({ pricingData, allProps, isMobile }) => {
  const endpointTypes = React.useMemo(
    () => getEndpointTypes(pricingData.models),
    [pricingData.models],
  );
  const vendorItems = React.useMemo(
    () => getVendorItems(pricingData.models).slice(0, 14),
    [pricingData.models],
  );
  const pageSize = isMobile ? 6 : 9;
  const startIndex = (pricingData.currentPage - 1) * pageSize;
  const visibleModels = pricingData.filteredModels.slice(
    startIndex,
    startIndex + pageSize,
  );
  const featuredModel =
    pricingData.filteredModels[0] || pricingData.models[0] || null;

  const handleReset = () => {
    pricingData.setFilterEndpointType('all');
    pricingData.setFilterVendor('all');
    pricingData.setFilterGroup('all');
    pricingData.setFilterQuotaType('all');
    pricingData.setFilterTag('all');
    pricingData.setSearchValue('');
    pricingData.setCurrentPage(1);
  };

  const renderMarketCard = (model, index) => {
    const priceData = calculateModelPrice({
      record: model,
      selectedGroup: pricingData.selectedGroup,
      groupRatio: pricingData.groupRatio,
      tokenUnit: pricingData.tokenUnit,
      displayPrice: pricingData.displayPrice,
      currency: pricingData.currency,
      quotaDisplayType: pricingData.siteDisplayType,
    });

    const perf = pricingData.perfMap?.[model.model_name];
    const rates =
      perf && Array.isArray(perf.recent_success_rates)
        ? perf.recent_success_rates
        : [];

    return (
      <button
        className={`app-market-model-card variant-${index % 6}`}
        key={getModelKey(model) || index}
        onClick={() => pricingData.openModelDetail(model)}
        type='button'
      >
        <div className='app-market-model-cover'>
          <div className='app-market-model-brand'>
            {getModelIcon(model)}
            <span>{model.vendor_name || pricingData.t('未知供应商')}</span>
          </div>
          <div className='app-market-model-price'>
            {formatPriceInfo(
              priceData,
              pricingData.t,
              pricingData.siteDisplayType,
            )}
          </div>
        </div>
        <div className='app-market-model-body'>
          <strong>{model.model_name}</strong>
          <p>
            {model.description || pricingData.t('统一模型网关中的可用模型')}
          </p>
          {rates.length > 0 && (
            <div className='app-market-model-uptime'>
              <UptimeStrip rates={rates} showLabel={false} t={pricingData.t} />
            </div>
          )}
        </div>
      </button>
    );
  };

  let marketContent = (
    <div className='app-market-grid'>
      {visibleModels.map((model, index) => renderMarketCard(model, index))}
    </div>
  );
  if (visibleModels.length === 0) {
    marketContent = (
      <div className='app-market-empty'>
        <Empty description={pricingData.t('搜索无结果')} />
      </div>
    );
  }
  if (pricingData.loading) {
    marketContent = (
      <div className='app-market-empty'>
        <Empty description={pricingData.t('加载中')} />
      </div>
    );
  }

  return (
    <div className='app-market-page'>
      <section className='app-market-spotlight'>
        <div className='app-market-spotlight-copy'>
          <Text>{pricingData.t('API 市场')}</Text>
          <Typography.Title heading={1}>
            {featuredModel?.model_name || pricingData.t('多模型 API 市场')}
          </Typography.Title>
          <p>
            {featuredModel?.description ||
              pricingData.t('搜索、比较并接入可用 AI 模型。')}
          </p>
          <div className='app-market-spotlight-meta'>
            <span>
              {featuredModel?.vendor_name || pricingData.t('多供应商')}
            </span>
            <span>
              {pricingData.filteredModels.length} {pricingData.t('模型')}
            </span>
          </div>
          <Link to='/console/playground'>
            <Button theme='solid' type='primary' icon={<IconPlay />}>
              {pricingData.t('立即试用')}
            </Button>
          </Link>
        </div>
      </section>

      <section className='app-market-shell'>
        <aside className='app-market-sidebar'>
          <div className='app-market-filter-block'>
            <div className='app-market-filter-title'>
              {pricingData.t('模型类型')}
            </div>
            <button
              className={
                pricingData.filterEndpointType === 'all' ? 'active' : ''
              }
              onClick={() => pricingData.setFilterEndpointType('all')}
              type='button'
            >
              <span>All</span>
              <em>{pricingData.models.length}</em>
            </button>
            {endpointTypes.map((endpointType) => (
              <button
                className={
                  pricingData.filterEndpointType === endpointType
                    ? 'active'
                    : ''
                }
                key={endpointType}
                onClick={() => pricingData.setFilterEndpointType(endpointType)}
                type='button'
              >
                <span>{endpointType}</span>
                <em>
                  {
                    pricingData.models.filter((model) =>
                      model.supported_endpoint_types?.includes(endpointType),
                    ).length
                  }
                </em>
              </button>
            ))}
          </div>

          <div className='app-market-filter-block'>
            <div className='app-market-filter-title'>
              {pricingData.t('供应商')}
            </div>
            <button
              className={pricingData.filterVendor === 'all' ? 'active' : ''}
              onClick={() => pricingData.setFilterVendor('all')}
              type='button'
            >
              <span>{pricingData.t('全部供应商')}</span>
              <em>{pricingData.models.length}</em>
            </button>
            {vendorItems.map((vendor) => (
              <button
                className={
                  pricingData.filterVendor === vendor.name ? 'active' : ''
                }
                key={vendor.name}
                onClick={() => pricingData.setFilterVendor(vendor.name)}
                type='button'
              >
                <span>
                  {vendor.name === 'unknown'
                    ? pricingData.t('未知供应商')
                    : vendor.name}
                </span>
                <em>{vendor.count}</em>
              </button>
            ))}
          </div>
        </aside>

        <main className='app-market-content'>
          <div className='app-market-toolbar'>
            <Input
              prefix={<IconSearch />}
              placeholder={pricingData.t('Search model name or provider...')}
              value={pricingData.searchValue}
              onCompositionStart={pricingData.handleCompositionStart}
              onCompositionEnd={pricingData.handleCompositionEnd}
              onChange={pricingData.handleChange}
              showClear
            />
            <Button type='tertiary' onClick={handleReset}>
              {pricingData.t('默认')}
            </Button>
          </div>

          <Text className='app-market-count'>
            {pricingData.filteredModels.length} {pricingData.t('模型')}
          </Text>

          {marketContent}

          {pricingData.filteredModels.length > pageSize && (
            <div className='app-market-pagination'>
              <Pagination
                currentPage={pricingData.currentPage}
                pageSize={pageSize}
                total={pricingData.filteredModels.length}
                onPageChange={(page) => pricingData.setCurrentPage(page)}
                showSizeChanger={false}
                size={isMobile ? 'small' : 'default'}
              />
            </div>
          )}
        </main>
      </section>

      <ImagePreview
        src={pricingData.modalImageUrl}
        visible={pricingData.isModalOpenurl}
        onVisibleChange={(visible) => pricingData.setIsModalOpenurl(visible)}
      />

      <ModelDetailSideSheet
        visible={pricingData.showModelDetail}
        onClose={pricingData.closeModelDetail}
        modelData={pricingData.selectedModel}
        groupRatio={pricingData.groupRatio}
        usableGroup={pricingData.usableGroup}
        currency={pricingData.currency}
        siteDisplayType={pricingData.siteDisplayType}
        tokenUnit={pricingData.tokenUnit}
        displayPrice={pricingData.displayPrice}
        showRatio={allProps.showRatio}
        vendorsMap={pricingData.vendorsMap}
        endpointMap={pricingData.endpointMap}
        autoGroups={pricingData.autoGroups}
        perfMap={pricingData.perfMap}
        serverAddress={pricingData.statusState?.status?.server_address || ''}
        t={pricingData.t}
      />
    </div>
  );
};

const PricingPage = () => {
  const pricingData = useModelPricingData();
  const { Sider, Content } = Layout;
  const isMobile = useIsMobile();
  const appearance = useAppearance();
  const [showRatio, setShowRatio] = React.useState(false);
  const [viewMode, setViewMode] = React.useState('card');
  const isApimart = appearance.preset === 'apimart';
  const allProps = {
    ...pricingData,
    showRatio,
    setShowRatio,
    viewMode,
    setViewMode,
  };

  if (isApimart) {
    return (
      <ApimartPricingPage
        pricingData={pricingData}
        allProps={allProps}
        isMobile={isMobile}
      />
    );
  }

  return (
    <div className='bg-white'>
      <Layout className='pricing-layout'>
        <Content className='pricing-scroll-hide pricing-content'>
          <PricingContent
            {...allProps}
            isMobile={isMobile}
            sidebarProps={allProps}
          />
        </Content>

        {!isMobile && (
          <Sider className='pricing-scroll-hide pricing-sidebar'>
            <PricingSidebar {...allProps} />
          </Sider>
        )}
      </Layout>

      <ImagePreview
        src={pricingData.modalImageUrl}
        visible={pricingData.isModalOpenurl}
        onVisibleChange={(visible) => pricingData.setIsModalOpenurl(visible)}
      />

      <ModelDetailSideSheet
        visible={pricingData.showModelDetail}
        onClose={pricingData.closeModelDetail}
        modelData={pricingData.selectedModel}
        groupRatio={pricingData.groupRatio}
        usableGroup={pricingData.usableGroup}
        currency={pricingData.currency}
        siteDisplayType={pricingData.siteDisplayType}
        tokenUnit={pricingData.tokenUnit}
        displayPrice={pricingData.displayPrice}
        showRatio={allProps.showRatio}
        vendorsMap={pricingData.vendorsMap}
        endpointMap={pricingData.endpointMap}
        autoGroups={pricingData.autoGroups}
        perfMap={pricingData.perfMap}
        serverAddress={pricingData.statusState?.status?.server_address || ''}
        t={pricingData.t}
      />
    </div>
  );
};

export default PricingPage;

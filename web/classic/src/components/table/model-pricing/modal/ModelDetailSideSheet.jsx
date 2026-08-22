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
  SideSheet,
  Typography,
  Button,
  Divider,
  Tabs,
  TabPane,
} from '@douyinfe/semi-ui';
import { IconClose } from '@douyinfe/semi-icons';

import ModelHeader from './components/ModelHeader';
import ModelMetaTags from './components/ModelMetaTags';
import ModelBasicInfo from './components/ModelBasicInfo';
import ModelEndpoints from './components/ModelEndpoints';
import ModelPricingTable from './components/ModelPricingTable';
import DynamicPricingBreakdown from './components/DynamicPricingBreakdown';
import ModelPerformance from './components/ModelPerformance';
import ModelApi from './components/ModelApi';

const { Text } = Typography;

const ModelDetailSideSheet = ({
  visible,
  onClose,
  modelData,
  groupRatio,
  currency,
  siteDisplayType,
  tokenUnit,
  displayPrice,
  showRatio,
  usableGroup,
  vendorsMap,
  endpointMap,
  autoGroups,
  perfMap = {},
  serverAddress = '',
  t,
}) => {
  const isDynamic =
    modelData?.billing_mode === 'tiered_expr' && modelData?.billing_expr;

  return (
    <SideSheet
      placement='right'
      title={
        <ModelHeader modelData={modelData} vendorsMap={vendorsMap} t={t} />
      }
      bodyStyle={{
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
      }}
      visible={visible}
      width='100%'
      closeIcon={
        <Button
          className='semi-button-tertiary semi-button-size-small semi-button-borderless'
          type='button'
          icon={<IconClose />}
          onClick={onClose}
        />
      }
      onCancel={onClose}
    >
      <div className='w-full max-w-[1400px] mx-auto px-6 pt-3 pb-8'>
        {!modelData && (
          <div className='flex justify-center items-center py-10'>
            <Text type='secondary'>{t('加载中...')}</Text>
          </div>
        )}
        {modelData && (
          <>
            <ModelMetaTags
              modelData={modelData}
              vendorsMap={vendorsMap}
              t={t}
            />
            <Tabs type='line' lazyRender>
              <TabPane tab={t('概览')} itemKey='overview'>
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 pt-3'>
                  {/* 左栏：简介 + API 端点 */}
                  <div className='flex flex-col gap-4'>
                    <ModelBasicInfo
                      modelData={modelData}
                      vendorsMap={vendorsMap}
                      t={t}
                    />
                    <Divider margin={12} />
                    <ModelEndpoints
                      modelData={modelData}
                      endpointMap={endpointMap}
                      t={t}
                    />
                  </div>

                  {/* 右栏：定价 + 性能表现 */}
                  <div className='flex flex-col gap-4'>
                    {isDynamic && (
                      <>
                        <DynamicPricingBreakdown
                          billingExpr={modelData.billing_expr}
                          t={t}
                        />
                        <Divider margin={12} />
                      </>
                    )}
                    <ModelPricingTable
                      modelData={modelData}
                      groupRatio={groupRatio}
                      currency={currency}
                      siteDisplayType={siteDisplayType}
                      tokenUnit={tokenUnit}
                      displayPrice={displayPrice}
                      showRatio={showRatio}
                      usableGroup={usableGroup}
                      autoGroups={autoGroups}
                      t={t}
                    />
                    <Divider margin={12} />
                    <ModelPerformance modelData={modelData} t={t} />
                  </div>
                </div>
              </TabPane>

              <TabPane tab={t('开发文档')} itemKey='api'>
                <div className='pt-3'>
                  <ModelApi
                    modelData={modelData}
                    endpointMap={endpointMap}
                    serverAddress={serverAddress}
                    t={t}
                  />
                </div>
              </TabPane>
            </Tabs>
          </>
        )}
      </div>
    </SideSheet>
  );
};

export default ModelDetailSideSheet;

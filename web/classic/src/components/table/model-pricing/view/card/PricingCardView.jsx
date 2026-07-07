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
  Card,
  Tooltip,
  Checkbox,
  Empty,
  Pagination,
  Button,
  Avatar,
} from '@douyinfe/semi-ui';
import { IconHelpCircle } from '@douyinfe/semi-icons';
import {
  Copy,
  Type,
  Image as ImageIcon,
  AudioLines,
  Video,
  FileText,
} from 'lucide-react';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import {
  calculateModelPrice,
  formatDynamicPriceSummary,
  getLobeHubIcon,
} from '../../../../../helpers';
import PricingCardSkeleton from './PricingCardSkeleton';
import { useMinimumLoadingTime } from '../../../../../hooks/common/useMinimumLoadingTime';
import { useIsMobile } from '../../../../../hooks/common/useIsMobile';
import { formatTokenCount } from '../../perf/format';
import UptimeStrip from '../../perf/UptimeStrip';

const MODALITY_ICONS = {
  text: Type,
  image: ImageIcon,
  audio: AudioLines,
  video: Video,
  file: FileText,
};

const CARD_STYLES = {
  container:
    'w-10 h-10 rounded-xl flex items-center justify-center relative shadow-sm',
  icon: 'w-6 h-6 flex items-center justify-center',
  selected: 'border-blue-500 bg-blue-50',
  default: 'border-gray-200 hover:border-gray-300',
};

const WAVE_GRADIENTS = [
  { id: 'pcw-blue', color: '#60a5fa' },
  { id: 'pcw-violet', color: '#a78bfa' },
  { id: 'pcw-pink', color: '#f472b6' },
  { id: 'pcw-green', color: '#34d399' },
];

// 渐变定义只需在页面中声明一次，供所有卡片的装饰波形复用
const WaveDefs = () => (
  <svg width='0' height='0' className='absolute' aria-hidden='true'>
    <defs>
      {WAVE_GRADIENTS.map((g) => (
        <linearGradient key={g.id} id={g.id} x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0' stopColor={g.color} stopOpacity='0' />
          <stop offset='1' stopColor={g.color} stopOpacity='0.9' />
        </linearGradient>
      ))}
    </defs>
  </svg>
);

// 卡片右上角装饰性波形线（参考站风格，流动动画、纯装饰、不响应交互）
const CardWave = () => (
  <svg
    className='absolute top-0 right-0 pointer-events-none'
    width='200'
    height='52'
    viewBox='0 0 200 52'
    fill='none'
    style={{ opacity: 0.55 }}
    aria-hidden='true'
  >
    <path
      className='pcw-line pcw-line-1'
      d='M-30 28 C 10 8, 40 46, 80 26 S 150 6, 235 24'
      stroke='url(#pcw-blue)'
      strokeWidth='2'
    />
    <path
      className='pcw-line pcw-line-2'
      d='M-30 36 C 20 18, 50 52, 90 32 S 160 14, 235 32'
      stroke='url(#pcw-violet)'
      strokeWidth='2'
    />
    <path
      className='pcw-line pcw-line-3'
      d='M-30 20 C 15 4, 45 38, 85 18 S 155 0, 235 16'
      stroke='url(#pcw-pink)'
      strokeWidth='2'
    />
    <path
      className='pcw-line pcw-line-4'
      d='M-30 44 C 25 26, 55 56, 95 38 S 165 20, 235 38'
      stroke='url(#pcw-green)'
      strokeWidth='1.5'
    />
  </svg>
);

const PricingCardView = ({
  filteredModels,
  loading,
  rowSelection,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  selectedGroup,
  groupRatio,
  copyText,
  setModalImageUrl,
  setIsModalOpenurl,
  currency,
  siteDisplayType,
  tokenUnit,
  displayPrice,
  showRatio,
  t,
  selectedRowKeys = [],
  setSelectedRowKeys,
  openModelDetail,
  perfMap = {},
}) => {
  const showSkeleton = useMinimumLoadingTime(loading);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedModels = filteredModels.slice(
    startIndex,
    startIndex + pageSize,
  );
  const getModelKey = (model) => model.key ?? model.model_name ?? model.id;
  const isMobile = useIsMobile();

  const handleCheckboxChange = (model, checked) => {
    if (!setSelectedRowKeys) return;
    const modelKey = getModelKey(model);
    const newKeys = checked
      ? Array.from(new Set([...selectedRowKeys, modelKey]))
      : selectedRowKeys.filter((key) => key !== modelKey);
    setSelectedRowKeys(newKeys);
    rowSelection?.onChange?.(newKeys, null);
  };

  // 获取模型图标
  const getModelIcon = (model) => {
    if (!model || !model.model_name) {
      return (
        <div className={CARD_STYLES.container}>
          <Avatar size='large'>?</Avatar>
        </div>
      );
    }
    // 1) 优先使用模型自定义图标
    if (model.icon) {
      return (
        <div className={CARD_STYLES.container}>
          <div className={CARD_STYLES.icon}>
            {getLobeHubIcon(model.icon, 24)}
          </div>
        </div>
      );
    }
    // 2) 退化为供应商图标
    if (model.vendor_icon) {
      return (
        <div className={CARD_STYLES.container}>
          <div className={CARD_STYLES.icon}>
            {getLobeHubIcon(model.vendor_icon, 24)}
          </div>
        </div>
      );
    }

    // 如果没有供应商图标，使用模型名称生成头像

    const avatarText = model.model_name.slice(0, 2).toUpperCase();
    return (
      <div className={CARD_STYLES.container}>
        <Avatar
          size='small'
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 'bold',
          }}
        >
          {avatarText}
        </Avatar>
      </div>
    );
  };

  // 获取模型描述
  const getModelDescription = (record) => {
    return record.description || '';
  };

  // 渲染模态图标组（小圆角方框）
  const renderModalities = (mods) => {
    if (!Array.isArray(mods) || mods.length === 0) return null;
    return (
      <span className='inline-flex items-center gap-1'>
        {mods.map((m) => {
          const Icon = MODALITY_ICONS[m];
          return (
            <span
              key={m}
              className='inline-flex items-center justify-center w-5 h-5 rounded-md text-gray-600'
              style={{ backgroundColor: 'var(--semi-color-fill-0)' }}
              title={m}
            >
              {Icon ? <Icon size={12} /> : m.charAt(0).toUpperCase()}
            </span>
          );
        })}
      </span>
    );
  };

  // 去除价格字符串末尾多余的 0（"$75.0000" -> "$75"，"$0.7500" -> "$0.75"）
  const trimPrice = (s) => {
    if (typeof s !== 'string') return s;
    const m = s.match(/^([^\d.]*)([\d.]+)(.*)$/);
    if (!m) return s;
    let num = m[2];
    if (num.includes('.')) num = num.replace(/0+$/, '').replace(/\.$/, '');
    return `${m[1]}${num}${m[3]}`;
  };

  // 大号价格单元：突出数值 + 次要单位
  const PriceUnit = ({ value, unit }) => (
    <span className='inline-flex items-baseline whitespace-nowrap'>
      <span
        className='text-xl font-bold'
        style={{ color: 'var(--semi-color-primary)' }}
      >
        {value}
      </span>
      {unit && <span className='text-xs text-gray-400 ml-0.5'>{unit}</span>}
    </span>
  );

  // 渲染突出价格（输入 | 输出），参考站样式
  const renderHeadlinePrice = (priceData) => {
    if (priceData.isDynamicPricing) {
      return (
        <div className='flex flex-col gap-1 text-xs mb-2'>
          {formatDynamicPriceSummary(
            priceData.billingExpr,
            t,
            priceData.usedGroupRatio,
          )}
        </div>
      );
    }
    if (priceData.isPerToken) {
      if (priceData.isTokensDisplay) {
        const hasIn = priceData.inputRatio != null;
        const hasOut = priceData.completionRatio != null;
        if (!hasIn && !hasOut) return null;
        return (
          <div className='flex items-center gap-2 mb-2'>
            {hasIn && (
              <PriceUnit value={`${priceData.inputRatio}x`} unit={t('输入')} />
            )}
            {hasIn && hasOut && <span className='text-gray-300'>|</span>}
            {hasOut && (
              <PriceUnit
                value={`${priceData.completionRatio}x`}
                unit={t('补全')}
              />
            )}
          </div>
        );
      }
      const unit = `/${priceData.unitLabel} tokens`;
      return (
        <div className='flex items-center gap-2 mb-2'>
          <PriceUnit value={trimPrice(priceData.inputPrice)} unit={unit} />
          <span className='text-gray-300'>|</span>
          <PriceUnit value={trimPrice(priceData.completionPrice)} unit={unit} />
        </div>
      );
    }
    // 按次计费
    if (priceData.price && priceData.price !== '-') {
      return (
        <div className='flex items-center gap-2 mb-2'>
          <PriceUnit value={priceData.price} unit={`/${t('次')}`} />
        </div>
      );
    }
    return null;
  };

  // 渲染元数据行（以竖线分隔的能力/上下文/模态信息），参考站样式
  const renderMetaRow = (model) => {
    const inMods = Array.isArray(model.input_modalities)
      ? model.input_modalities
      : [];
    const outMods = Array.isArray(model.output_modalities)
      ? model.output_modalities
      : [];
    const ctx = formatTokenCount(model.context_length);
    const maxOut = formatTokenCount(model.max_output_tokens);
    const allMods = Array.from(new Set([...inMods, ...outMods]));
    const multimodal = allMods.some((m) => m !== 'text');

    const segs = [];
    if (inMods.length > 0 || outMods.length > 0) {
      segs.push(
        <span key='cat' className='text-gray-500'>
          {multimodal ? t('文本 / 多模态') : t('文本')}
        </span>,
      );
    }
    if (ctx) {
      segs.push(
        <span key='ctx'>
          <span className='text-gray-400'>{t('上下文')} </span>
          <span className='font-semibold text-gray-700'>{ctx}</span>
        </span>,
      );
    }
    if (maxOut) {
      segs.push(
        <span key='mo'>
          <span className='text-gray-400'>{t('最大输出')} </span>
          <span className='font-semibold text-gray-700'>{maxOut}</span>
        </span>,
      );
    }
    if (inMods.length > 0) {
      segs.push(
        <span key='in' className='inline-flex items-center gap-1'>
          <span className='text-gray-400'>{t('输入')}</span>
          {renderModalities(inMods)}
        </span>,
      );
    }
    if (outMods.length > 0) {
      segs.push(
        <span key='out' className='inline-flex items-center gap-1'>
          <span className='text-gray-400'>{t('输出')}</span>
          {renderModalities(outMods)}
        </span>,
      );
    }
    if (segs.length === 0) return null;
    return (
      <div className='flex items-center flex-wrap gap-x-2 gap-y-1 text-xs mb-2'>
        {segs.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className='text-gray-200'>|</span>}
            {s}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // 渲染底部：知识截止(左) + 正常运行时间条(右)，一行对齐（参考站样式）
  const renderBottom = (model) => {
    const perf = perfMap[model.model_name];
    const rates =
      perf && Array.isArray(perf.recent_success_rates)
        ? perf.recent_success_rates
        : [];
    const cutoff = model.knowledge_cutoff;
    if (!cutoff && rates.length === 0) return null;
    return (
      <div
        className='flex items-center justify-between gap-3 pt-2 mt-2 border-t'
        style={{ borderColor: 'var(--semi-color-border)' }}
      >
        <span className='text-xs text-gray-500 whitespace-nowrap'>
          {cutoff ? `${t('知识库截止')}: ${cutoff}` : ''}
        </span>
        {rates.length > 0 && (
          <div className='flex-1 max-w-[60%]'>
            <UptimeStrip rates={rates} showLabel={false} t={t} />
          </div>
        )}
      </div>
    );
  };

  // 显示骨架屏
  if (showSkeleton) {
    return (
      <PricingCardSkeleton
        rowSelection={!!rowSelection}
        showRatio={showRatio}
      />
    );
  }

  if (!filteredModels || filteredModels.length === 0) {
    return (
      <div className='flex justify-center items-center py-20'>
        <Empty
          image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
          darkModeImage={
            <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
          }
          description={t('搜索无结果')}
        />
      </div>
    );
  }

  return (
    <div className='px-2 pt-2'>
      <WaveDefs />
      <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3'>
        {paginatedModels.map((model, index) => {
          const modelKey = getModelKey(model);
          const isSelected = selectedRowKeys.includes(modelKey);

          const priceData = calculateModelPrice({
            record: model,
            selectedGroup,
            groupRatio,
            tokenUnit,
            displayPrice,
            currency,
            quotaDisplayType: siteDisplayType,
          });

          return (
            <Card
              key={modelKey || index}
              className={`!rounded-2xl relative overflow-hidden transition-all duration-200 hover:shadow-lg border cursor-pointer ${isSelected ? CARD_STYLES.selected : CARD_STYLES.default}`}
              bodyStyle={{ height: '100%' }}
              onClick={() => openModelDetail && openModelDetail(model)}
            >
              <CardWave />
              <div className='relative flex flex-col h-full'>
                {/* 头部：图标 + 模型名称 + 操作按钮 */}
                <div className='flex items-center justify-between mb-2'>
                  <div className='flex items-center gap-2 min-w-0'>
                    {getModelIcon(model)}
                    <h3 className='text-base font-bold text-gray-900 truncate'>
                      {model.model_name}
                    </h3>
                  </div>

                  <div className='flex items-center gap-1 ml-2 shrink-0'>
                    {/* 复制按钮 */}
                    <Button
                      size='small'
                      theme='borderless'
                      type='tertiary'
                      icon={<Copy size={13} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyText(model.model_name);
                      }}
                    />

                    {/* 选择框 */}
                    {rowSelection && (
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleCheckboxChange(model, e.target.checked);
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* 突出价格（输入 | 输出） */}
                {renderHeadlinePrice(priceData)}

                {/* 元数据行（竖线分隔） */}
                {renderMetaRow(model)}

                {/* 模型描述 - 占据剩余空间 */}
                <div className='flex-1 mb-3'>
                  <p
                    className='text-xs line-clamp-2 leading-relaxed'
                    style={{ color: 'var(--semi-color-text-2)' }}
                  >
                    {getModelDescription(model)}
                  </p>
                </div>

                {/* 底部区域 */}
                <div className='mt-auto'>
                  {/* 知识库截止 + 正常运行时间条 */}
                  {renderBottom(model)}

                  {/* 倍率信息（可选） */}
                  {showRatio && (
                    <div className='pt-3'>
                      <div className='flex items-center space-x-1 mb-2'>
                        <span className='text-xs font-medium text-gray-700'>
                          {t('倍率信息')}
                        </span>
                        <Tooltip
                          content={t('倍率是为了方便换算不同价格的模型')}
                        >
                          <IconHelpCircle
                            className='text-blue-500 cursor-pointer'
                            size='small'
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalImageUrl('/ratio.png');
                              setIsModalOpenurl(true);
                            }}
                          />
                        </Tooltip>
                      </div>
                      <div className='grid grid-cols-3 gap-2 text-xs text-gray-600'>
                        <div>
                          {t('模型')}:{' '}
                          {model.quota_type === 0 ? model.model_ratio : t('无')}
                        </div>
                        <div>
                          {t('补全')}:{' '}
                          {model.quota_type === 0
                            ? parseFloat(model.completion_ratio.toFixed(3))
                            : t('无')}
                        </div>
                        <div>
                          {t('分组')}: {priceData?.usedGroupRatio ?? '-'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 分页 */}
      {filteredModels.length > 0 && (
        <div className='flex justify-center mt-6 py-4 border-t pricing-pagination-divider'>
          <Pagination
            currentPage={currentPage}
            pageSize={pageSize}
            total={filteredModels.length}
            showSizeChanger={true}
            pageSizeOptions={[10, 20, 50, 100]}
            size={isMobile ? 'small' : 'default'}
            showQuickJumper={isMobile}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default PricingCardView;

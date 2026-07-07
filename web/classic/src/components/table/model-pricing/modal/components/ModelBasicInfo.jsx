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
import { Avatar, Typography, Tag, Space } from '@douyinfe/semi-ui';
import { IconInfoCircle } from '@douyinfe/semi-icons';
import { Type, Image as ImageIcon, AudioLines, Video, FileText } from 'lucide-react';
import { stringToColor } from '../../../../../helpers';
import { formatTokenCount } from '../../perf/format';

const { Text } = Typography;

const MODALITY_ICONS = {
  text: Type,
  image: ImageIcon,
  audio: AudioLines,
  video: Video,
  file: FileText,
};

const renderModalityRow = (mods) => (
  <span className='inline-flex items-center gap-1 flex-wrap'>
    {mods.map((m) => {
      const Icon = MODALITY_ICONS[m];
      return (
        <span key={m} className='inline-flex items-center gap-1 text-gray-700'>
          {Icon ? <Icon size={13} /> : null}
          <span className='text-xs'>{m}</span>
        </span>
      );
    })}
  </span>
);

const MetaRow = ({ label, children }) => (
  <div className='flex items-start justify-between py-1'>
    <span className='text-xs text-gray-500'>{label}</span>
    <span className='text-xs text-gray-800 text-right'>{children}</span>
  </div>
);

const ModelBasicInfo = ({ modelData, vendorsMap = {}, t }) => {
  // 获取模型描述（使用后端真实数据）
  const getModelDescription = () => {
    if (!modelData) return t('暂无模型描述');

    // 优先使用后端提供的描述
    if (modelData.description) {
      return modelData.description;
    }

    // 如果没有描述但有供应商描述，显示供应商信息
    if (modelData.vendor_description) {
      return t('供应商信息：') + modelData.vendor_description;
    }

    return t('暂无模型描述');
  };

  // 获取模型标签
  const getModelTags = () => {
    const tags = [];

    if (modelData?.tags) {
      const customTags = modelData.tags.split(',').filter((tag) => tag.trim());
      customTags.forEach((tag) => {
        const tagText = tag.trim();
        tags.push({ text: tagText, color: stringToColor(tagText) });
      });
    }

    return tags;
  };

  return (
    <div>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='blue' className='mr-2 shadow-md'>
          <IconInfoCircle size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>{t('基本信息')}</Text>
          <div className='text-xs text-gray-600'>
            {t('模型的详细描述和基本特性')}
          </div>
        </div>
      </div>
      <div className='text-gray-600'>
        <p className='mb-4'>{getModelDescription()}</p>
        {getModelTags().length > 0 && (
          <Space wrap>
            {getModelTags().map((tag, index) => (
              <Tag key={index} color={tag.color} shape='circle' size='small'>
                {tag.text}
              </Tag>
            ))}
          </Space>
        )}
        {renderCatalogMeta()}
      </div>
    </div>
  );

  function renderCatalogMeta() {
    if (!modelData) return null;
    const ctx = formatTokenCount(modelData.context_length);
    const maxOut = formatTokenCount(modelData.max_output_tokens);
    const cutoff = modelData.knowledge_cutoff;
    const release = modelData.release_date;
    const params = modelData.parameter_count;
    const inMods = Array.isArray(modelData.input_modalities)
      ? modelData.input_modalities
      : [];
    const outMods = Array.isArray(modelData.output_modalities)
      ? modelData.output_modalities
      : [];
    const caps = Array.isArray(modelData.capabilities)
      ? modelData.capabilities
      : [];

    const hasAny =
      ctx ||
      maxOut ||
      cutoff ||
      release ||
      params ||
      inMods.length > 0 ||
      outMods.length > 0 ||
      caps.length > 0;
    if (!hasAny) return null;

    return (
      <div
        className='mt-4 rounded-xl border p-3'
        style={{ borderColor: 'var(--semi-color-border)' }}
      >
        {ctx && <MetaRow label={t('上下文长度')}>{ctx}</MetaRow>}
        {maxOut && <MetaRow label={t('最大输出')}>{maxOut}</MetaRow>}
        {cutoff && <MetaRow label={t('知识库截止')}>{cutoff}</MetaRow>}
        {release && <MetaRow label={t('发布日期')}>{release}</MetaRow>}
        {params && <MetaRow label={t('参数规模')}>{params}</MetaRow>}
        {inMods.length > 0 && (
          <MetaRow label={t('输入模态')}>{renderModalityRow(inMods)}</MetaRow>
        )}
        {outMods.length > 0 && (
          <MetaRow label={t('输出模态')}>{renderModalityRow(outMods)}</MetaRow>
        )}
        {caps.length > 0 && (
          <div className='pt-2'>
            <div className='text-xs text-gray-500 mb-1'>{t('能力')}</div>
            <Space wrap>
              {caps.map((c) => (
                <Tag key={c} color='blue' shape='circle' size='small'>
                  {c}
                </Tag>
              ))}
            </Space>
          </div>
        )}
      </div>
    );
  }
};

export default ModelBasicInfo;

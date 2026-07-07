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
import { Tag } from '@douyinfe/semi-ui';
import {
  Type,
  Image as ImageIcon,
  AudioLines,
  Video,
  FileText,
} from 'lucide-react';
import { formatTokenCount } from '../../perf/format';

const MODALITY_ICONS = {
  text: Type,
  image: ImageIcon,
  audio: AudioLines,
  video: Video,
  file: FileText,
};

const renderModalities = (mods) => (
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

// 模型详情头部的能力/上下文/供应商等标签信息（仅展示后端提供的真实字段）
const ModelMetaTags = ({ modelData, vendorsMap = {}, t }) => {
  if (!modelData) return null;

  const inMods = Array.isArray(modelData.input_modalities)
    ? modelData.input_modalities
    : [];
  const outMods = Array.isArray(modelData.output_modalities)
    ? modelData.output_modalities
    : [];
  const ctx = formatTokenCount(modelData.context_length);
  const maxOut = formatTokenCount(modelData.max_output_tokens);
  const caps = Array.isArray(modelData.capabilities)
    ? modelData.capabilities
    : [];

  const vendorName =
    modelData.vendor_name && vendorsMap[modelData.vendor_name]
      ? vendorsMap[modelData.vendor_name].name || modelData.vendor_name
      : modelData.vendor_name;

  const infoSegs = [];
  if (inMods.length > 0) {
    infoSegs.push(
      <span key='in' className='inline-flex items-center gap-1'>
        <span className='text-gray-400'>{t('输入')}</span>
        {renderModalities(inMods)}
      </span>,
    );
  }
  if (outMods.length > 0) {
    infoSegs.push(
      <span key='out' className='inline-flex items-center gap-1'>
        <span className='text-gray-400'>{t('输出')}</span>
        {renderModalities(outMods)}
      </span>,
    );
  }
  if (ctx) {
    infoSegs.push(
      <span key='ctx'>
        <span className='text-gray-400'>{t('上下文')} </span>
        <span className='font-semibold text-gray-700'>{ctx}</span>
      </span>,
    );
  }
  if (maxOut) {
    infoSegs.push(
      <span key='mo'>
        <span className='text-gray-400'>{t('最大输出')} </span>
        <span className='font-semibold text-gray-700'>{maxOut}</span>
      </span>,
    );
  }
  if (modelData.release_date) {
    infoSegs.push(
      <span key='rel'>
        <span className='text-gray-400'>{t('更新')} </span>
        <span className='font-semibold text-gray-700'>
          {modelData.release_date}
        </span>
      </span>,
    );
  }
  if (caps.includes('reasoning')) {
    infoSegs.push(
      <span key='rsn'>
        <span className='text-gray-400'>{t('推理')} </span>
        <span className='font-semibold text-gray-700'>{t('支持')}</span>
      </span>,
    );
  }

  const hasCapsRow = vendorName || caps.length > 0;

  if (infoSegs.length === 0 && !hasCapsRow) return null;

  return (
    <div className='flex flex-col gap-2 mb-4'>
      {infoSegs.length > 0 && (
        <div className='flex items-center flex-wrap gap-x-2 gap-y-1 text-xs'>
          {infoSegs.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className='text-gray-200'>|</span>}
              {s}
            </React.Fragment>
          ))}
        </div>
      )}
      {hasCapsRow && (
        <div className='flex items-center flex-wrap gap-2'>
          {vendorName && (
            <Tag color='white' size='small' shape='circle'>
              {vendorName} {t('提供')}
            </Tag>
          )}
          {caps.map((c) => (
            <Tag key={c} color='blue' size='small' shape='circle'>
              {c}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModelMetaTags;

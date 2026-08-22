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
import SelectableButtonGroup from '../../../common/ui/SelectableButtonGroup';
import { modelHasModality } from './catalogFilters';

// 输入/输出模态筛选。无任何模型携带模态数据时不渲染。
const PricingModalities = ({
  dimension = 'input',
  activeValue,
  onChange,
  models = [],
  allModels = [],
  loading = false,
  t,
}) => {
  const field =
    dimension === 'output' ? 'output_modalities' : 'input_modalities';
  const source = allModels.length > 0 ? allModels : models;

  const available = [...
    new Set(source.flatMap((m) => (Array.isArray(m[field]) ? m[field] : []))),
  ].sort();

  if (available.length === 0) return null;

  const countFor = (modality) =>
    modality === 'all'
      ? models.length
      : models.filter((m) => modelHasModality(m, dimension, modality)).length;

  const items = [
    { value: 'all', label: t('全部'), tagCount: countFor('all') },
    ...available.map((m) => ({
      value: m,
      label: m,
      tagCount: countFor(m),
    })),
  ];

  return (
    <SelectableButtonGroup
      title={dimension === 'output' ? t('输出能力') : t('输入能力')}
      items={items}
      activeValue={activeValue}
      onChange={onChange}
      loading={loading}
      variant='violet'
      t={t}
    />
  );
};

export default PricingModalities;

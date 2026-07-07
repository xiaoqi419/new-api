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
import { CONTEXT_BUCKETS } from './catalogFilters';

// 上下文长度筛选。无任何模型设置 context_length 时不渲染。
const PricingContextLength = ({
  activeValue,
  onChange,
  models = [],
  allModels = [],
  loading = false,
  t,
}) => {
  const source = allModels.length > 0 ? allModels : models;
  const hasAny = source.some((m) => Number(m.context_length) > 0);
  if (!hasAny) return null;

  const countFor = (bucket) =>
    models.filter((m) => bucket.test(Number(m.context_length) || 0)).length;

  const items = [
    { value: 'all', label: t('全部'), tagCount: models.length },
    ...CONTEXT_BUCKETS.map((b) => ({
      value: b.key,
      label: b.label,
      tagCount: countFor(b),
    })).filter((it) => it.tagCount > 0),
  ];

  return (
    <SelectableButtonGroup
      title={t('上下文长度')}
      items={items}
      activeValue={activeValue}
      onChange={onChange}
      loading={loading}
      t={t}
    />
  );
};

export default PricingContextLength;

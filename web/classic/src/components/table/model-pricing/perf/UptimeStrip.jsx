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
import { successRateColor, formatSuccessPct } from './format';

// 正常运行时间状态条：数据来自真实 recent_success_rates(每桶成功率%)。
const UptimeStrip = ({ rates = [], max = 24, showLabel = true, t }) => {
  const valid = (rates || []).filter((r) => Number.isFinite(r));
  if (valid.length === 0) return null;

  const display = valid.slice(-max);
  const avg = display.reduce((s, r) => s + r, 0) / display.length;

  return (
    <div>
      {showLabel && (
        <div className='flex items-center justify-between mb-1'>
          <span className='text-xs text-gray-500'>
            {t ? t('正常运行时间') : '正常运行时间'}
          </span>
          <span className='text-xs' style={{ color: successRateColor(avg) }}>
            {formatSuccessPct(avg)}
          </span>
        </div>
      )}
      <div
        className='flex items-stretch justify-between h-5'
        style={{ gap: 3 }}
      >
        {display.map((r, i) => (
          <span
            key={i}
            className='rounded-full'
            style={{
              flex: '1 1 0',
              minWidth: 4,
              maxWidth: 6,
              backgroundColor: successRateColor(r),
            }}
            title={`${t ? t('成功率') : '成功率'} ${r.toFixed(1)}%`}
          />
        ))}
      </div>
    </div>
  );
};

export default UptimeStrip;

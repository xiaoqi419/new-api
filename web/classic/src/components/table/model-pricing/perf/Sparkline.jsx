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

// 轻量级 SVG 折线/面积图，不引入任何图表依赖。
const Sparkline = ({
  data = [],
  width = 140,
  height = 36,
  color = '#10b981',
  min,
  max,
  fill = true,
  strokeWidth = 1.5,
}) => {
  const valid = (data || []).filter((v) => Number.isFinite(v));
  if (valid.length === 0) return null;

  const pts = valid.length === 1 ? [valid[0], valid[0]] : valid;
  const lo = min ?? Math.min(...pts);
  const hi = max ?? Math.max(...pts);
  const range = hi - lo || 1;
  const stepX = pts.length > 1 ? width / (pts.length - 1) : width;

  const coords = pts.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - lo) / range) * (height - 2) - 1;
    return [x, y];
  });

  const line = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio='none'
      style={{ display: 'block' }}
    >
      {fill && <path d={area} fill={color} fillOpacity={0.12} stroke='none' />}
      <path
        d={line}
        fill='none'
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin='round'
        strokeLinecap='round'
      />
    </svg>
  );
};

export default Sparkline;

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

// 性能指标展示格式化工具，对应后端 /api/perf-metrics 返回的真实数据。
// success_rate 为 0-100 的百分比，avg_tps 为每秒 token 数，延迟单位为毫秒。

export function formatThroughput(tps) {
  if (!Number.isFinite(tps) || tps <= 0) return '—';
  if (tps >= 1000) return `${(tps / 1000).toFixed(1)}K t/s`;
  return `${tps.toFixed(tps < 10 ? 2 : 1)} t/s`;
}

export function formatLatency(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

export function formatSuccessPct(pct) {
  if (!Number.isFinite(pct)) return '—';
  return `${pct.toFixed(2)}%`;
}

// 与 default 主题保持一致的成功率分级配色。
export function successRateColor(rate) {
  if (!Number.isFinite(rate)) return '#9ca3af';
  if (rate >= 100) return '#10b981';
  if (rate >= 90) return '#34d399';
  if (rate >= 70) return '#f59e0b';
  return '#ef4444';
}

// 将 token 数量格式化为紧凑形式：1000000 -> 1M，128000 -> 128K
export function formatTokenCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

export function averageDefined(values) {
  const nums = (values || []).filter((v) => Number.isFinite(v) && v > 0);
  if (nums.length === 0) return 0;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

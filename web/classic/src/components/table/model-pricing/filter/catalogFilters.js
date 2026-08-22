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

// 模型目录维度筛选的共享定义，供 hook(过滤逻辑) 与筛选组件(选项渲染)复用。

export const CONTEXT_BUCKETS = [
  { key: '32k', label: '≤ 32K', test: (n) => n > 0 && n <= 32768 },
  { key: '128k', label: '32K–128K', test: (n) => n > 32768 && n <= 131072 },
  { key: '256k', label: '128K–256K', test: (n) => n > 131072 && n <= 262144 },
  { key: '1m', label: '> 256K', test: (n) => n > 262144 },
];

export function matchContextBucket(contextLength, bucketKey) {
  const n = Number(contextLength) || 0;
  const bucket = CONTEXT_BUCKETS.find((b) => b.key === bucketKey);
  return bucket ? bucket.test(n) : false;
}

export function modelHasModality(model, dimension, modality) {
  const field =
    dimension === 'output' ? 'output_modalities' : 'input_modalities';
  return Array.isArray(model[field]) && model[field].includes(modality);
}

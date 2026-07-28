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
export const SIZE_OPTIONS = [
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '1792x1024',
  '1024x1792',
  '512x512',
  'auto',
]
export const DEFAULT_SIZE = '1024x1024'

// 'default' means omit `quality` from the request so upstream uses its own
// default (avoids sending a value a given model does not accept).
export const QUALITY_OPTIONS = [
  'default',
  'standard',
  'hd',
  'high',
  'medium',
  'low',
]
export const DEFAULT_QUALITY = 'default'

export const N_MIN = 1
export const N_MAX = 4
export const N_DEFAULT = 1

// Heuristic name fragments used only to pre-select a sensible default model;
// the picker still lists every model the user can access.
export const IMAGE_MODEL_HINTS = [
  'image',
  'dall',
  'seedream',
  'flux',
  'kolors',
  'cogview',
  'wanx',
  'hunyuan-image',
  'irag',
  'stable-diffusion',
  'sora-image',
  'gpt-image',
  't2i',
  'midjourney',
]

export const RECORDS_PAGE_SIZE = 12

export const IMAGE_RECORDS_QUERY_KEY = ['image-generation-records'] as const

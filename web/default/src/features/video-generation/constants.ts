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
export const VIDEO_MODELS = [
  'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-fast-260128',
]
export const RESOLUTION_OPTIONS = ['480p', '720p', '1080p']
export const RATIO_OPTIONS = [
  '16:9',
  '9:16',
  '1:1',
  '4:3',
  '3:4',
  '21:9',
  'adaptive',
]

export const DEFAULT_MODEL = 'doubao-seedance-2-0-260128'
export const DEFAULT_RESOLUTION = '720p'
export const DEFAULT_RATIO = '16:9'

export const DURATION_MIN = 4
export const DURATION_MAX = 15
export const DURATION_DEFAULT = 5

export const VIDEO_POLL_INTERVAL_MS = 5000

export const MAX_REF_IMAGES = 9
export const MAX_REF_VIDEOS = 3
export const MAX_REF_AUDIOS = 3

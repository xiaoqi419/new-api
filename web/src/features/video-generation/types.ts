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
export type VideoMode = 'text' | 'first' | 'firstlast' | 'reference'

export type RefMediaType = 'image' | 'video' | 'audio'

export interface SelectOption {
  label: string
  value: string
}

export interface TokenListItem {
  id: number
  name: string
  status: number
}

export interface ContentItem {
  type: 'image_url' | 'video_url' | 'audio_url'
  role: string
  image_url?: { url: string }
  video_url?: { url: string }
  audio_url?: { url: string }
}

export interface VideoSubmitBody {
  model: string
  prompt: string
  seconds: string
  metadata: {
    resolution: string
    ratio: string
    generate_audio: boolean
    watermark: boolean
    content?: ContentItem[]
  }
}

export interface VideoTaskData {
  status?: string
  progress?: string
  result_url?: string
  quota?: number
  fail_reason?: string
}

export interface VideoResult {
  url?: string
  quota?: number
}

export interface VideoFormState {
  mode: VideoMode
  prompt: string
  firstFrame: string
  lastFrame: string
  refImages: string[]
  refVideos: string[]
  refAudios: string[]
}

/*
Copyright (C) 2023-2026 QuantumNous

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
import {
  ArrowRight,
  AudioLines,
  FileText,
  Image as ImageIcon,
  Type,
  Video,
  type LucideIcon,
} from '@/components/icons'
import { cn } from '@/lib/utils'

import type { Modality } from '../types'

const MODALITY_META: Record<Modality, { icon: LucideIcon; className: string }> =
  {
    text: { icon: Type, className: 'text-neutral' },
    image: { icon: ImageIcon, className: 'text-chart-4' },
    audio: { icon: AudioLines, className: 'text-warning' },
    video: { icon: Video, className: 'text-destructive' },
    file: { icon: FileText, className: 'text-info' },
  }

const MODALITY_ORDER: Modality[] = ['text', 'image', 'audio', 'video', 'file']

function dedupeModalities(list?: Modality[]): Modality[] {
  if (!list || list.length === 0) return []
  const seen = new Set<Modality>()
  for (const item of list) {
    if (MODALITY_META[item]) seen.add(item)
  }
  return MODALITY_ORDER.filter((m) => seen.has(m))
}

function ModalityIcons(props: { modalities: Modality[]; size?: number }) {
  const size = props.size ?? 14
  return (
    <span className='inline-flex items-center gap-1'>
      {props.modalities.map((modality) => {
        const meta = MODALITY_META[modality]
        const Icon = meta.icon
        return (
          <Icon
            key={modality}
            className={cn('shrink-0', meta.className)}
            style={{ width: size, height: size }}
          />
        )
      })}
    </span>
  )
}

/**
 * Renders input -> output modality icons (ephone-style "type" column).
 * Returns null when no modality metadata is available so callers can show a
 * neutral placeholder instead.
 */
export function ModalityFlow(props: {
  input?: Modality[]
  output?: Modality[]
  size?: number
  className?: string
}) {
  const input = dedupeModalities(props.input)
  const output = dedupeModalities(props.output)

  if (input.length === 0 && output.length === 0) return null

  if (output.length === 0) {
    return (
      <span className={cn('inline-flex items-center', props.className)}>
        <ModalityIcons modalities={input} size={props.size} />
      </span>
    )
  }

  if (input.length === 0) {
    return (
      <span className={cn('inline-flex items-center', props.className)}>
        <ModalityIcons modalities={output} size={props.size} />
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-1', props.className)}>
      <ModalityIcons modalities={input} size={props.size} />
      <ArrowRight className='text-muted-foreground/40 size-3 shrink-0' />
      <ModalityIcons modalities={output} size={props.size} />
    </span>
  )
}

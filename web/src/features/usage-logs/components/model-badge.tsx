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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Route } from '@/components/icons'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getLobeIcon } from '@/lib/lobe-icon'
import { resolveModelProvider } from '@/lib/model-provider'
import { cn } from '@/lib/utils'

interface ModelBadgeProps {
  modelName: string
  displayName?: string
  actualModel?: string
  className?: string
  wrapText?: boolean
  onInspect?: () => void
}

function ModelBadgeContent(props: ModelBadgeProps & { copyable: boolean }) {
  const provider = resolveModelProvider(props.modelName)

  return (
    <StatusBadge
      copyText={props.modelName}
      copyable={props.copyable}
      size='sm'
      showDot={!provider?.icon}
      autoColor={provider?.icon ? undefined : props.modelName}
      className={cn(
        'border-border/60 bg-muted/30 h-6 max-w-none gap-1.5 rounded-md border px-2 [font-family:var(--font-body)]',
        provider?.icon && 'text-foreground',
        props.wrapText && 'h-auto min-h-6 max-w-full py-px whitespace-normal',
        props.className
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1.5',
          props.wrapText ? 'max-w-full min-w-0' : 'max-w-none'
        )}
      >
        {provider?.icon && (
          <span
            className='flex h-[18px] w-[18px] shrink-0 items-center justify-center'
            title={provider.label ?? provider.name}
            aria-label={provider.label ?? provider.name}
          >
            {getLobeIcon(provider.icon, 18)}
          </span>
        )}
        <span
          className={
            props.wrapText
              ? 'line-clamp-2 leading-5 [overflow-wrap:anywhere]'
              : 'whitespace-nowrap'
          }
        >
          {props.displayName ?? props.modelName}
        </span>
      </span>
    </StatusBadge>
  )
}

export function ModelBadge(props: ModelBadgeProps) {
  const { t } = useTranslation()
  const modelLabel = `${t('Model')}: ${props.modelName}`
  const hasDetails = !!props.actualModel

  if (!hasDetails) {
    if (props.onInspect) {
      return (
        <CopyButton
          value={props.modelName}
          aria-label={modelLabel}
          size='sm'
          iconClassName='hidden'
          className='h-auto min-h-8 max-w-full min-w-0 justify-start px-0 py-0 text-left font-normal whitespace-normal'
        >
          <ModelBadgeContent {...props} copyable={false} />
        </CopyButton>
      )
    }
    return <ModelBadgeContent {...props} copyable />
  }

  const content = (
    <>
      <ModelBadgeContent {...props} copyable={false} />
      {props.actualModel && (
        <Route
          className='text-muted-foreground size-3 shrink-0'
          aria-hidden='true'
        />
      )}
    </>
  )

  if (props.onInspect) {
    return (
      <Button
        variant='ghost'
        aria-label={modelLabel}
        aria-haspopup='dialog'
        onClick={props.onInspect}
        className='h-auto min-h-8 max-w-full min-w-0 flex-wrap justify-start gap-1 px-0 py-0 text-left font-normal whitespace-normal'
      >
        {content}
      </Button>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant='ghost'
            aria-label={modelLabel}
            className='h-auto max-w-full min-w-0 flex-wrap justify-start gap-1 p-0 font-normal'
          />
        }
      >
        {content}
      </PopoverTrigger>
      <PopoverContent className='w-96 max-w-[calc(100vw-2rem)]'>
        <div className='space-y-2'>
          <div className='flex items-start justify-between gap-3'>
            <span className='text-muted-foreground text-xs'>
              {t('Request Model:')}
            </span>
            <span className='truncate font-mono text-xs font-medium'>
              {props.modelName}
            </span>
          </div>
          <div className='flex items-start justify-between gap-3'>
            <span className='text-muted-foreground text-xs'>
              {t('Actual Model:')}
            </span>
            <span className='truncate font-mono text-xs font-medium'>
              {props.actualModel}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

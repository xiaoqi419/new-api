import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { IconDiscord, IconTelegram, IconWeChat } from '@/assets/brand-icons'
import { Dialog } from '@/components/dialog'
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
  Check,
  Copy,
  ExternalLink,
  Globe,
  MessageCircle,
  QrCode,
  Users,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { navIconNameFor, resolveNavIcon } from '@/lib/nav-icons'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'
import { cn } from '@/lib/utils'

import {
  communityLinkHasQr,
  type CommunityLink,
  type CommunityLinkType,
} from './types'
import { useCommunityLinks } from './use-community-links'

function CommunityIcon({ type }: { type: CommunityLinkType }) {
  const className = 'size-5 shrink-0'
  switch (type) {
    case 'wechat':
      return <IconWeChat className={className} />
    case 'telegram':
      return <IconTelegram className={className} />
    case 'discord':
      return <IconDiscord className={className} />
    case 'qq':
      return <MessageCircle className={cn(className, 'text-[#12b7f5]')} />
    default:
      return <Globe className={cn(className, 'text-muted-foreground')} />
  }
}

function CommunityRow({
  link,
  onShowQr,
}: {
  link: CommunityLink
  onShowQr: (link: CommunityLink) => void
}) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard()
  const copied = copiedText === link.value

  return (
    <div className='hover:bg-accent flex items-center gap-3 rounded-md px-2 py-2 transition-colors'>
      <CommunityIcon type={link.type} />
      <div className='min-w-0 flex-1'>
        <div className='truncate text-sm font-medium'>{link.label}</div>
        {link.value && (
          <div className='text-muted-foreground truncate text-xs'>
            {link.value}
          </div>
        )}
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        {link.action === 'copy' && link.value && (
          <Button
            size='sm'
            variant='outline'
            className='h-7 px-2 text-xs'
            onClick={() => void copyToClipboard(link.value)}
          >
            {copied ? (
              <Check className='size-3.5' />
            ) : (
              <Copy className='size-3.5' />
            )}
            {copied ? t('Copied') : t('Copy')}
          </Button>
        )}
        {link.action === 'link' && link.value && (
          <Button
            size='sm'
            variant='outline'
            className='h-7 px-2 text-xs'
            render={
              <a href={link.value} target='_blank' rel='noopener noreferrer' />
            }
          >
            <ExternalLink className='size-3.5' />
            {t('Join')}
          </Button>
        )}
        {communityLinkHasQr(link) && (
          <Button
            size='icon'
            variant='ghost'
            className='size-7'
            aria-label={t('View QR code')}
            onClick={() => onShowQr(link)}
          >
            <QrCode className='size-4' />
          </Button>
        )}
      </div>
    </div>
  )
}

export function CommunityMenu({
  className,
  variant = 'icon',
}: {
  className?: string
  variant?: 'icon' | 'nav'
}) {
  const { t } = useTranslation()
  const links = useCommunityLinks()
  const { status } = useStatus()
  const [qrLink, setQrLink] = useState<CommunityLink | null>(null)

  if (links.length === 0) return null

  const modules = parseHeaderNavModulesFromStatus(
    status as Record<string, unknown> | null
  )
  const CommunityNavIcon =
    resolveNavIcon(navIconNameFor(modules.icons, 'community')) ?? Users

  const trigger =
    variant === 'nav' ? (
      <Button
        variant='ghost'
        className={cn(
          'text-muted-foreground hover:text-primary h-auto rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-transparent',
          className
        )}
      >
        <CommunityNavIcon className='size-4' />
        {t('Community')}
      </Button>
    ) : (
      <Button
        variant='ghost'
        size='icon'
        className={cn('size-9', className)}
        aria-label={t('Community')}
      >
        <CommunityNavIcon className='size-4' />
      </Button>
    )

  let qrContent: React.ReactNode = null
  if (qrLink?.qrImageUrl) {
    qrContent = (
      <img
        src={qrLink.qrImageUrl}
        alt={qrLink.label}
        className='size-48 rounded-md object-contain'
      />
    )
  } else if (qrLink?.value) {
    qrContent = (
      <div className='rounded-md bg-white p-3'>
        <QRCodeSVG value={qrLink.value} size={180} />
      </div>
    )
  }

  return (
    <>
      <Popover>
        <PopoverTrigger render={trigger} />
        <PopoverContent align='end' className='w-72 p-2'>
          <div className='text-muted-foreground px-2 pt-1 pb-1 text-xs font-medium'>
            {t('Official Community')}
          </div>
          <div className='flex flex-col'>
            {links.map((link) => (
              <CommunityRow key={link.id} link={link} onShowQr={setQrLink} />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog
        open={!!qrLink}
        onOpenChange={(open) => {
          if (!open) setQrLink(null)
        }}
        title={qrLink?.label || t('QR code')}
        contentClassName='sm:max-w-xs'
        contentHeight='auto'
      >
        <div className='flex flex-col items-center gap-3 py-2'>
          {qrContent}
          {qrLink?.value && (
            <div className='text-muted-foreground max-w-full truncate text-center text-xs'>
              {qrLink.value}
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}

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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Check, Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { CryptoAsset } from '../../types'

interface CryptoAssetSelectDialogProps {
  open: boolean
  assets: CryptoAsset[]
  processing?: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (asset: CryptoAsset) => void | Promise<void>
}

const GMPAY_NETWORK_PROTOCOLS: Record<string, string> = {
  tron: 'TRC20',
  trc20: 'TRC20',
  'trc-20': 'TRC20',
  ethereum: 'ERC20',
  eth: 'ERC20',
  erc20: 'ERC20',
  'erc-20': 'ERC20',
  solana: 'SPL',
  sol: 'SPL',
  spl: 'SPL',
  binance: 'BEP20',
  bsc: 'BEP20',
  bnb: 'BEP20',
  bep20: 'BEP20',
  'bep-20': 'BEP20',
  'binance-smart-chain': 'BEP20',
}

function getCryptoNetworkProtocol(network: string): string {
  const normalizedNetwork = network.trim().toLowerCase()
  return (
    GMPAY_NETWORK_PROTOCOLS[normalizedNetwork] ||
    normalizedNetwork.toUpperCase()
  )
}

/** Lets users choose a configured native wallet before an order is created. */
export function CryptoAssetSelectDialog(props: CryptoAssetSelectDialogProps) {
  const { t } = useTranslation()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const usdtAssets = props.assets.filter(
    (asset) => asset.token.trim().toUpperCase() === 'USDT'
  )

  useEffect(() => {
    if (!props.open) {
      setSelectedKey(null)
    }
  }, [props.open])

  if (!usdtAssets.length) return null

  const handleSelect = async (asset: CryptoAsset) => {
    setSelectedKey(`${asset.network}:${asset.token}`)
    await props.onSelect(asset)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Choose a payment network')}
      description={t('Select a USDT payment network.')}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      footerClassName='grid grid-cols-1 gap-2 sm:flex sm:justify-end'
      footer={
        <Button
          variant='outline'
          onClick={() => props.onOpenChange(false)}
          disabled={props.processing}
        >
          {t('Cancel')}
        </Button>
      }
    >
      <div
        className='grid gap-2'
        role='listbox'
        aria-label={t('Payment network')}
      >
        {usdtAssets.map((asset) => {
          const key = `${asset.network}:${asset.token}`
          const selected = selectedKey === key
          let statusIcon = null
          if (selected && props.processing) {
            statusIcon = <Loader2 className='size-4 shrink-0 animate-spin' />
          } else if (selected) {
            statusIcon = <Check className='text-primary size-4 shrink-0' />
          }
          return (
            <Button
              key={key}
              type='button'
              variant='outline'
              role='option'
              aria-selected={selected}
              disabled={props.processing}
              onClick={() => void handleSelect(asset)}
              className={cn(
                'h-auto min-h-14 justify-between gap-3 px-4 py-3 text-left',
                selected && 'border-primary bg-primary/5'
              )}
            >
              <span className='flex min-w-0 flex-col items-start gap-0.5'>
                <span className='truncate font-medium'>
                  {asset.display_name}
                </span>
                <span className='text-muted-foreground text-xs'>
                  USDT · {getCryptoNetworkProtocol(asset.network)}
                </span>
              </span>
              {statusIcon}
            </Button>
          )
        })}
      </div>
    </Dialog>
  )
}

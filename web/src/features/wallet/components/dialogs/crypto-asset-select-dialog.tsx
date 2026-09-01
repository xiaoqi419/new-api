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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Check, Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { CryptoAsset, CryptoToken } from '../../types'

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

const CRYPTO_TOKENS = new Set<CryptoToken>(['USDT', 'USDC'])

function isCryptoToken(value: string): value is CryptoToken {
  return CRYPTO_TOKENS.has(value as CryptoToken)
}

function getAssetKey(asset: CryptoAsset): string {
  return `${asset.token}:${asset.network}`
}

/**
 * Lets users choose a configured stablecoin and network before an order is
 * created. The component intentionally owns only the selection state; the
 * parent remains responsible for creating the checkout order.
 */
export function CryptoAssetSelectDialog(props: CryptoAssetSelectDialogProps) {
  const { t } = useTranslation()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedToken, setSelectedToken] = useState<CryptoToken | null>(null)

  const assets = useMemo(
    () =>
      props.assets.filter((asset) =>
        isCryptoToken(asset.token.trim().toUpperCase())
      ),
    [props.assets]
  )
  const currencies = useMemo(() => {
    const seen = new Set<CryptoToken>()
    const result: CryptoToken[] = []
    for (const asset of assets) {
      const token = asset.token.trim().toUpperCase()
      if (!isCryptoToken(token) || seen.has(token)) continue
      seen.add(token)
      result.push(token)
    }
    return result
  }, [assets])

  const activeToken =
    selectedToken ?? (currencies.length === 1 ? currencies[0] : null)
  const activeAssets = activeToken
    ? assets.filter((asset) => asset.token.trim().toUpperCase() === activeToken)
    : []
  const currencyStage = activeToken === null

  useEffect(() => {
    if (!props.open) {
      setSelectedKey(null)
      setSelectedToken(null)
    }
  }, [props.open])

  if (!assets.length) return null

  const handleSelect = async (asset: CryptoAsset) => {
    setSelectedKey(getAssetKey(asset))
    await props.onSelect(asset)
  }

  const handleCurrencySelect = (token: CryptoToken) => {
    const tokenAssets = assets.filter(
      (asset) => asset.token.trim().toUpperCase() === token
    )
    setSelectedToken(token)
    if (tokenAssets.length === 1) {
      void handleSelect(tokenAssets[0])
    }
  }

  const handleBack = () => {
    if (currencies.length > 1) {
      setSelectedToken(null)
      setSelectedKey(null)
    }
  }

  const dialogTitle = currencyStage
    ? t('Choose a payment currency')
    : t('Choose a payment network')
  const dialogDescription = currencyStage
    ? t('Select a payment currency.')
    : t('Select a {{token}} payment network.', { token: activeToken })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={dialogTitle}
      description={dialogDescription}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-xl'
      footerClassName='grid grid-cols-1 gap-2 sm:flex sm:justify-end'
      footer={
        <>
          {!currencyStage && currencies.length > 1 && (
            <Button
              variant='outline'
              onClick={handleBack}
              disabled={props.processing}
            >
              {t('Back')}
            </Button>
          )}
          <Button
            variant='outline'
            onClick={() => props.onOpenChange(false)}
            disabled={props.processing}
          >
            {t('Cancel')}
          </Button>
        </>
      }
    >
      <div
        className='grid gap-2'
        role='listbox'
        aria-label={
          currencyStage ? t('Payment currency') : t('Payment network')
        }
      >
        {currencyStage
          ? currencies.map((token) => {
              const tokenAssets = assets.filter(
                (asset) => asset.token.trim().toUpperCase() === token
              )
              const selected = selectedToken === token
              let statusIcon = null
              if (selected && props.processing) {
                statusIcon = (
                  <Loader2 className='size-4 shrink-0 animate-spin' />
                )
              } else if (selected) {
                statusIcon = <Check className='text-primary size-4 shrink-0' />
              }
              return (
                <Button
                  key={token}
                  type='button'
                  variant='outline'
                  role='option'
                  aria-selected={selected}
                  disabled={props.processing}
                  onClick={() => handleCurrencySelect(token)}
                  className={cn(
                    'h-auto min-h-16 justify-between gap-3 px-4 py-3 text-left',
                    selected && 'border-primary bg-primary/5'
                  )}
                >
                  <span className='flex min-w-0 flex-col items-start gap-0.5'>
                    <span className='truncate font-medium'>{token}</span>
                    <span className='text-muted-foreground text-xs'>
                      {t('Networks available: {{count}}', {
                        count: tokenAssets.length,
                      })}
                    </span>
                  </span>
                  {statusIcon}
                </Button>
              )
            })
          : activeAssets.map((asset) => {
              const key = getAssetKey(asset)
              const selected = selectedKey === key
              let statusIcon = null
              if (selected && props.processing) {
                statusIcon = (
                  <Loader2 className='size-4 shrink-0 animate-spin' />
                )
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
                      {asset.token} · {getCryptoNetworkProtocol(asset.network)}
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

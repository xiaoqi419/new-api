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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getTopupInfo } from '@/features/wallet/api'
import { EpayCheckoutDialog } from '@/features/wallet/components/dialogs/epay-checkout-dialog'
import {
  openEpayCheckout,
  submitPaymentForm,
} from '@/features/wallet/lib/payment'
import type { EpayCheckoutData } from '@/features/wallet/types'

import { agentConsolePrepay, getAgentPrepayStatus } from '../api'

type AgentPrepayRequest = {
  amount: number
  payment_method: string
}

export function PrepayCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [checkout, setCheckout] = useState<EpayCheckoutData | null>(null)
  const lastRequestRef = useRef<AgentPrepayRequest | null>(null)
  const { data: topupRes } = useQuery({
    queryKey: ['agent-console-topup-info'],
    queryFn: getTopupInfo,
  })
  const payMethods: { type: string; name?: string }[] =
    topupRes?.data?.pay_methods ?? []
  const paymentMethodItems =
    payMethods.length === 0
      ? [{ value: '', label: t('No payment method') }]
      : payMethods.map((payMethod) => ({
          value: payMethod.type,
          label: payMethod.name || payMethod.type,
        }))
  const selectedPaymentMethod = method || payMethods[0]?.type || ''

  const mutation = useMutation({
    mutationFn: agentConsolePrepay,
    onSuccess: (response, request) => {
      if (response.message !== 'success' && response.success !== true) {
        const message =
          typeof response.data === 'string' ? response.data : response.message
        toast.error(message || t('Operation failed'))
        return
      }

      const opened = openEpayCheckout(
        response.data,
        { paymentMethod: request.payment_method },
        setCheckout
      )
      if (opened) return

      if (
        response.url &&
        response.data &&
        typeof response.data === 'object' &&
        !Array.isArray(response.data)
      ) {
        submitPaymentForm(
          response.url,
          response.data as Record<string, unknown>
        )
        return
      }

      toast.error(t('Payment request failed'))
    },
    onError: () => {
      toast.error(t('Payment request failed'))
    },
  })

  const startPrepay = () => {
    const request = {
      amount: Number(amount) || 0,
      payment_method: selectedPaymentMethod,
    }
    lastRequestRef.current = request
    mutation.mutate(request)
  }

  const retryCheckout = () => {
    const request = lastRequestRef.current
    if (!request) return
    setCheckout(null)
    mutation.mutate(request)
  }

  const completeCheckout = useCallback(async () => {
    setCheckout(null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['agent-console-self'] }),
      queryClient.invalidateQueries({ queryKey: ['agent-console-ledgers'] }),
    ])
  }, [queryClient])

  return (
    <>
      <div className='max-w-xl space-y-3 rounded-lg border p-4'>
        <h3 className='text-base font-semibold'>{t('Prepay to Platform')}</h3>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Top up your agent wallet 1:1 via the platform payment gateway. The settlement discount applies when your users recharge, not here.'
          )}
        </p>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div className='space-y-1'>
            <Label htmlFor='agent-prepay-amount'>{t('Amount')}</Label>
            <Input
              id='agent-prepay-amount'
              type='number'
              min='0'
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label>{t('Payment Method')}</Label>
            <Select
              items={paymentMethodItems}
              value={selectedPaymentMethod}
              onValueChange={(value) => value !== null && setMethod(value)}
            >
              <SelectTrigger className='w-full'>
                <SelectValue>
                  {paymentMethodItems.find(
                    (item) => item.value === selectedPaymentMethod
                  )?.label ?? t('No payment method')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {paymentMethodItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={startPrepay}
          disabled={mutation.isPending || !amount || !selectedPaymentMethod}
        >
          {t('Prepay')}
        </Button>
      </div>

      <EpayCheckoutDialog
        open={checkout !== null}
        checkout={checkout}
        getStatus={getAgentPrepayStatus}
        onClose={() => setCheckout(null)}
        onSuccess={completeCheckout}
        onRetry={retryCheckout}
      />
    </>
  )
}

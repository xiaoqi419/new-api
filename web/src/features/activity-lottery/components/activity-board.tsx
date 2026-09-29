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
import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Gift,
  Ticket,
  Trophy,
  Users,
} from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  activityLotteryCurrencyFromCampaign,
  formatActivityPrizeAmount,
} from '../lib/money'
import { activityLotteryStatusLabel } from '../lib/status'
import { formatShanghaiDrawTime, formatShanghaiStartDate } from '../lib/time'
import type { ActivityLotteryView } from '../types'

type ActivityLotteryBoardProps = {
  view: ActivityLotteryView
}

function DrawCountdown(props: { drawAt: number; serverTime: number }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(props.serverTime)

  useEffect(() => {
    const start = Date.now()
    const timer = window.setInterval(() => {
      setNow(props.serverTime + Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [props.serverTime])

  const remaining = Math.max(0, props.drawAt - now)
  if (remaining === 0) {
    return <span>{t('The draw is being finalized')}</span>
  }
  const days = Math.floor(remaining / 86400)
  const hours = Math.floor((remaining % 86400) / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)
  const seconds = remaining % 60

  return (
    <span className='font-mono text-lg font-semibold tabular-nums sm:text-xl'>
      {t('Draw in {{days}}d {{hours}}h {{minutes}}m {{seconds}}s', {
        days,
        hours: String(hours).padStart(2, '0'),
        minutes: String(minutes).padStart(2, '0'),
        seconds: String(seconds).padStart(2, '0'),
      })}
    </span>
  )
}

export function ActivityLotteryBoard(props: ActivityLotteryBoardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const campaign = props.view.campaign
  const currency = activityLotteryCurrencyFromCampaign(campaign)
  const topPrize = Math.max(
    0,
    ...campaign.prizes.map((prize) => prize.amount_cents)
  )
  const totalWinners = campaign.prizes.reduce(
    (sum, prize) => sum + prize.count,
    0
  )
  const prizePool = campaign.prizes.reduce(
    (sum, prize) => sum + prize.count * prize.amount_cents,
    0
  )
  const entryOpen =
    campaign.status === 'open' &&
    props.view.server_time >= campaign.qualification_start_at &&
    props.view.server_time < campaign.qualification_end_at

  let participationContent: ReactNode
  if (props.view.joined) {
    participationContent = (
      <p className='text-success flex items-center gap-2 font-medium'>
        <CheckCircle2 aria-hidden='true' className='size-4' />
        {t('Your recharge qualified for this draw')}
      </p>
    )
  } else if (
    campaign.status === 'open' &&
    props.view.server_time < campaign.qualification_start_at
  ) {
    participationContent = (
      <p className='text-muted-foreground'>
        {t('Participation has not started yet')}
      </p>
    )
  } else if (entryOpen) {
    participationContent = (
      <>
        <p className='text-muted-foreground leading-relaxed'>
          {t(
            'A successful wallet top-up from the participation start date until the draw time gives each account one entry.'
          )}
        </p>
        <Button
          render={
            <Link to='/finance/$section' params={{ section: 'wallet' }} />
          }
        >
          {t('Go to wallet')}
          <ArrowUpRight aria-hidden='true' className='size-4' />
        </Button>
      </>
    )
  } else {
    participationContent = (
      <p className='text-muted-foreground'>
        {t('Entry is closed for this draw')}
      </p>
    )
  }

  return (
    <div className='space-y-6'>
      <section className='border-warning/30 from-warning/15 via-warning/5 to-card relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 sm:p-8'>
        <Trophy
          aria-hidden='true'
          className='text-warning/15 pointer-events-none absolute -top-8 -right-8 size-48 rotate-12'
        />
        <div className='relative space-y-5'>
          <Badge variant={campaign.status === 'open' ? 'warning' : 'secondary'}>
            {activityLotteryStatusLabel(campaign.status, t)}
          </Badge>
          <div className='max-w-2xl space-y-2'>
            <h2 className='text-2xl font-semibold tracking-tight sm:text-4xl'>
              {campaign.title}
            </h2>
            {campaign.description && (
              <p className='text-muted-foreground text-sm leading-relaxed sm:text-base'>
                {campaign.description}
              </p>
            )}
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='bg-background/75 rounded-xl border p-4 backdrop-blur-sm'>
              <p className='text-muted-foreground text-xs'>{t('Top prize')}</p>
              <p className='mt-1 text-3xl font-semibold tabular-nums'>
                {formatActivityPrizeAmount(topPrize, currency, locale)}
              </p>
            </div>
            <div className='bg-background/75 rounded-xl border p-4 backdrop-blur-sm'>
              <p className='text-muted-foreground flex items-center gap-1 text-xs'>
                <Clock aria-hidden='true' className='size-3.5' />
                {t('Draw time')}
              </p>
              <time
                dateTime={new Date(campaign.draw_at * 1000).toISOString()}
                className='mt-1 block text-lg font-semibold tabular-nums sm:text-xl'
              >
                {formatShanghaiDrawTime(campaign.draw_at)}
              </time>
              <p className='text-muted-foreground text-xs'>
                {t('Beijing time')}
              </p>
            </div>
          </div>
          <p className='text-muted-foreground text-xs'>
            {t('Participation window: {{start}} 00:00 – {{end}}', {
              start: formatShanghaiStartDate(campaign.qualification_start_at),
              end: formatShanghaiDrawTime(campaign.qualification_end_at),
            })}
          </p>
          {campaign.status === 'open' && (
            <div
              role='timer'
              className='bg-background/85 text-foreground flex w-fit items-center gap-2 rounded-xl border px-4 py-2 backdrop-blur-sm'
            >
              <Clock aria-hidden='true' className='size-5 shrink-0' />
              <DrawCountdown
                drawAt={campaign.draw_at}
                serverTime={props.view.server_time}
              />
            </div>
          )}
        </div>
      </section>

      <div className='grid gap-4 lg:grid-cols-[1.15fr_0.85fr]'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Ticket aria-hidden='true' className='text-primary size-4' />
              {t('Your participation')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {participationContent}
            <p className='text-muted-foreground text-xs'>
              {t(
                'Only successful wallet top-ups from the participation start date until the draw time count; one entry per account.'
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Users aria-hidden='true' className='text-primary size-4' />
              {t('Draw overview')}
            </CardTitle>
          </CardHeader>
          <CardContent className='grid grid-cols-2 gap-4'>
            <div>
              <p className='text-muted-foreground text-xs'>
                {t('Participants')}
              </p>
              <p className='mt-1 text-2xl font-semibold tabular-nums'>
                {formatNumber(props.view.participant_count, locale)}
              </p>
            </div>
            <div>
              <p className='text-muted-foreground text-xs'>
                {t('Prize slots')}
              </p>
              <p className='mt-1 text-2xl font-semibold tabular-nums'>
                {formatNumber(totalWinners, locale)}
              </p>
            </div>
            <div className='col-span-2 border-t pt-3'>
              <p className='text-muted-foreground text-xs'>
                {t('Total prize pool')}
              </p>
              <p className='mt-1 text-lg font-semibold tabular-nums'>
                {formatActivityPrizeAmount(prizePool, currency, locale)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className='space-y-3'>
        <div className='flex items-center justify-between gap-3'>
          <h3 className='text-lg font-semibold'>{t('Prize tiers')}</h3>
          <span className='text-muted-foreground text-xs'>
            {t('One prize per winner')}
          </span>
        </div>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          {campaign.prizes.map((prize) => (
            <Card key={prize.id} size='sm' className='gap-2'>
              <CardContent className='space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>{prize.name}</span>
                  <Gift aria-hidden='true' className='text-warning size-4' />
                </div>
                <p className='text-2xl font-semibold tabular-nums'>
                  {formatActivityPrizeAmount(
                    prize.amount_cents,
                    currency,
                    locale
                  )}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {t('Winners')}: {formatNumber(prize.count, locale)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {props.view.my_prize && (
        <Card className='border-success/40 bg-success/5'>
          <CardHeader>
            <CardTitle>{t('Your winning prize')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <p className='text-lg font-semibold'>
              {props.view.my_prize.name} ·{' '}
              {formatActivityPrizeAmount(
                props.view.my_prize.amount_cents,
                currency,
                locale
              )}
            </p>
            <p className='text-muted-foreground text-sm'>
              {t(
                'The prize has been credited automatically as an activity gift.'
              )}
            </p>
            <Badge variant='secondary'>
              {props.view.my_prize.granted
                ? t('Activity gift credited')
                : t('Activity gift pending')}
            </Badge>
          </CardContent>
        </Card>
      )}

      {campaign.status === 'drawn' && (
        <section className='space-y-3'>
          <h3 className='text-lg font-semibold'>{t('Winners')}</h3>
          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
            {props.view.winners.map((winner) => (
              <Card key={winner.id} size='sm'>
                <CardContent className='flex items-center justify-between gap-3'>
                  <span className='truncate'>{winner.masked_name}</span>
                  <span className='shrink-0 text-sm font-medium'>
                    {winner.name} ·{' '}
                    {formatActivityPrizeAmount(
                      winner.amount_cents,
                      currency,
                      locale
                    )}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {campaign.status === 'expired' && (
        <Card>
          <CardContent className='text-muted-foreground'>
            {t(
              'The minimum number of participants was not reached, so no prizes were issued.'
            )}
          </CardContent>
        </Card>
      )}

      {campaign.status === 'canceled' && (
        <Card>
          <CardContent className='text-muted-foreground'>
            {t('This campaign was canceled; no prizes were issued.')}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

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

import {
  IconBolt,
  IconCalendarClock,
  IconServer,
  IconTickCircle,
  IconUser,
} from '@douyinfe/semi-icons'
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Progress,
  Select,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import GroupBuyCountdown from '../../components/groupbuy/GroupBuyCountdown'
import {
  normalizeEpayCheckout,
  openClassicGroupBuyJoinEpay,
} from '../../components/topup/lib/epay-checkout'
import EpayCheckoutModal from '../../components/topup/modals/EpayCheckoutModal'
import WechatPayModal from '../../components/topup/modals/WechatPayModal'
import {
  API,
  showError,
  showSuccess,
  renderQuota,
  getQuotaPerUnit,
  copy,
  timestamp2string,
} from '../../helpers'

// eslint-disable-next-line react/only-export-components -- production payment flow is exported for entry regression tests
export async function requestClassicGroupBuyJoinEpayCheckout({
  api,
  groupNo,
  paymentMethod,
  scene,
  money,
  onCheckout,
}) {
  const response = await api.post('/api/user/groupbuy/join', {
    group_no: groupNo,
    payment_method: paymentMethod,
    scene,
  })
  const message = response.data?.message
  const data = response.data?.data
  const opened =
    message === 'success' &&
    openClassicGroupBuyJoinEpay(data, { paymentMethod, money }, onCheckout)
  return { message, data, opened }
}

const statusMap = (t) => ({
  pending: { text: t('拼团中'), color: 'orange' },
  success: { text: t('已成团'), color: 'green' },
  failed: { text: t('已失败'), color: 'grey' },
})

const renderShare = (amount) => renderQuota(amount * getQuotaPerUnit())

function isSafeHttpUrl(value) {
  try {
    const u = new URL((value || '').trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const GroupBuy = () => {
  const { t } = useTranslation()
  const sm = statusMap(t)
  const [searchParams] = useSearchParams()
  const groupNo = searchParams.get('no') || ''

  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [payWay, setPayWay] = useState('wechatpay')
  const [enableWechat, setEnableWechat] = useState(false)
  const [enableAlipay, setEnableAlipay] = useState(false)
  const [epayMethods, setEpayMethods] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [agreed, setAgreed] = useState(false)

  const [wechatOpen, setWechatOpen] = useState(false)
  const [wechatQr, setWechatQr] = useState('')
  const [wechatTradeNo, setWechatTradeNo] = useState('')
  const [epayCheckout, setEpayCheckout] = useState(null)
  const [epayCheckoutOpen, setEpayCheckoutOpen] = useState(false)

  const loadDetail = async () => {
    if (!groupNo) {
      setLoading(false)
      return
    }
    try {
      const res = await API.get(
        `/api/user/groupbuy/detail?no=${encodeURIComponent(groupNo)}`
      )
      const { success, message, data } = res.data
      if (success) {
        setDetail(data)
      } else {
        showError(message)
      }
    } catch {
      showError(t('加载失败'))
    } finally {
      setLoading(false)
    }
  }

  const loadPayMethods = async () => {
    try {
      const res = await API.get('/api/user/topup/info')
      const { success, data } = res.data
      if (success) {
        const w = data.enable_wechatpay_topup || false
        const a = data.enable_alipay_topup || false
        const methods = Array.isArray(data.pay_methods) ? data.pay_methods : []
        setEnableWechat(w)
        setEnableAlipay(a)
        setEpayMethods(
          methods.filter(
            (method) =>
              method?.type &&
              ![
                'stripe',
                'creem',
                'alipay_direct',
                'wechatpay',
                'waffo',
                'waffo_pancake',
              ].includes(method.type) &&
              !method.type.startsWith('waffo:')
          )
        )
        if (w) setPayWay('wechatpay')
        else if (a) setPayWay('alipay_direct')
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadDetail()
    loadPayMethods()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupNo])

  const handlePayData = (data) => {
    const isEpay = epayMethods.some((method) => method.type === payWay)
    const checkout = isEpay
      ? normalizeEpayCheckout(data, {
          paymentMethod: payWay,
          money: detail?.per_share_price,
        })
      : null
    if (checkout) {
      openClassicGroupBuyJoinEpay(
        data,
        {
          paymentMethod: payWay,
          money: detail?.per_share_price,
        },
        (value) => {
          setEpayCheckout(value)
          setEpayCheckoutOpen(true)
        }
      )
      return
    }
    if (data.qr_code) {
      setWechatQr(data.qr_code)
      setWechatTradeNo(data.trade_no || '')
      setWechatOpen(true)
      return
    }
    showError(t('支付请求失败'))
  }

  const join = async () => {
    setSubmitting(true)
    try {
      const ua = navigator.userAgent || ''
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
      const inWeChat = /MicroMessenger/i.test(ua)
      const scene =
        payWay === 'wechatpay' && isMobile && !inWeChat ? 'h5' : 'native'
      const isEpay = epayMethods.some((method) => method.type === payWay)
      const money = detail?.per_share_price
      if (isEpay) {
        const result = await requestClassicGroupBuyJoinEpayCheckout({
          api: API,
          groupNo,
          paymentMethod: payWay,
          scene,
          money,
          onCheckout: (value) => {
            setEpayCheckout(value)
            setEpayCheckoutOpen(true)
          },
        })
        if (!result.opened) {
          let errorMessage = t('参团失败')
          if (result.message !== 'success') {
            errorMessage =
              typeof result.data === 'string'
                ? result.data
                : result.message || errorMessage
          }
          showError(errorMessage)
        }
        return
      }
      const res = await API.post('/api/user/groupbuy/join', {
        group_no: groupNo,
        payment_method: payWay,
        scene,
      })
      const { message, data } = res.data
      if (message === 'success') {
        if (
          payWay === 'wechatpay' &&
          data.h5_url &&
          isSafeHttpUrl(data.h5_url)
        ) {
          window.location.href = data.h5_url
        } else {
          handlePayData(data)
        }
      } else {
        showError(typeof data === 'string' ? data : message || t('参团失败'))
      }
    } catch {
      showError(t('参团失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const shareLink = `${window.location.origin}/console/groupbuy?no=${groupNo}`
  const copyShare = async () => {
    await copy(shareLink)
    showSuccess(t('拼团链接已复制'))
  }

  if (loading) {
    return (
      <div className='mt-[60px] flex justify-center'>
        <Spin size='large' />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className='mt-[60px] px-2'>
        <Banner
          type='danger'
          description={t('拼团不存在或已失效')}
          closeIcon={null}
        />
      </div>
    )
  }

  const tiers =
    detail.tiers && detail.tiers.length > 0
      ? detail.tiers
      : [
          {
            count: detail.required_count,
            per_share_amount: detail.per_share_amount,
          },
        ]
  const maxCount = tiers.at(-1).count
  const bestAmount = tiers.at(-1).per_share_amount
  const cap = detail.target_count || maxCount
  const paid = detail.paid_count || 0
  const remaining = Math.max(0, cap - paid)
  const percent = Math.min(100, Math.round((paid / (cap || 1)) * 100))
  const expired = detail.expire_time * 1000 < Date.now()
  const currentAmount = detail.current_amount || tiers[0].per_share_amount
  const canJoin =
    detail.status === 'pending' && !detail.joined && !expired && remaining > 0

  const payOptions = []
  if (enableWechat) {
    payOptions.push({ label: t('微信支付'), value: 'wechatpay' })
  }
  if (enableAlipay) {
    payOptions.push({ label: t('支付宝'), value: 'alipay_direct' })
  }
  epayMethods.forEach((method) => {
    payOptions.push({ label: method.name || method.type, value: method.type })
  })

  const notes =
    detail.notes && detail.notes.length > 0
      ? detail.notes
      : [
          t('支付成功即锁定名额，拼团成功后额度立即到账。'),
          t('拼团有效期内人数越多，每人到账额度越高。'),
          t('未达最低成团人数则拼团失败，已支付款项将自动原路退回。'),
        ]

  return (
    <div className='mt-[60px] px-2 max-w-5xl mx-auto pb-8'>
      {/* Hero banner */}
      <div
        className='rounded-2xl overflow-hidden shadow-sm'
        style={{
          '--gb-primary-channel': '37 99 235',
          backgroundImage:
            "linear-gradient(120deg, rgba(var(--gb-primary-channel) / 94%) 0%, rgba(var(--gb-primary-channel) / 68%) 100%), url('/cover-4.webp')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          className='p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'
          style={{ color: '#ffffff' }}
        >
          <div className='min-w-0'>
            <div className='flex items-center gap-3'>
              <Typography.Title
                heading={3}
                style={{ color: '#ffffff', margin: 0 }}
              >
                {detail.package_name || t('拼团充值')}
              </Typography.Title>
              <span
                className='shrink-0 rounded-full px-3 py-1 text-xs font-medium'
                style={{
                  background: 'rgba(255,255,255,0.95)',
                  color: 'var(--semi-color-primary)',
                }}
              >
                {sm[detail.status]?.text || detail.status}
              </span>
            </div>
            <div className='mt-3 flex items-end gap-2'>
              <span className='text-4xl font-extrabold leading-none'>
                ¥{Number(detail.per_share_price).toFixed(2)}
              </span>
              <span className='mb-1' style={{ opacity: 0.85 }}>
                / {t('每人')}
              </span>
            </div>
            <div
              className='mt-2 text-base font-medium'
              style={{ opacity: 0.95 }}
            >
              {t('拼满')} {maxCount} {t('人，每人到账')}{' '}
              <span className='font-bold underline'>
                {renderShare(bestAmount)}
              </span>
            </div>
          </div>
          <div className='flex flex-wrap gap-2 md:justify-end md:max-w-[240px]'>
            <span
              className='inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm'
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              <IconBolt size='small' /> {t('成团即时到账')}
            </span>
            <span
              className='inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm'
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              <IconUser size='small' /> {t('人越多越划算')}
            </span>
            <span
              className='inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm'
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              <IconServer size='small' /> {t('全模型可用')}
            </span>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className='grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4 items-start'>
        {/* Progress + tiers */}
        <div className='lg:col-span-3'>
          <Card className='!rounded-2xl'>
            <div className='flex items-center justify-between'>
              <Typography.Text strong>{t('成团进度')}</Typography.Text>
              <Typography.Text type='tertiary' size='small'>
                {paid}/{cap} {t('人')}
              </Typography.Text>
            </div>
            <Progress
              percent={percent}
              stroke='var(--semi-color-primary)'
              style={{ marginTop: 8 }}
              aria-label='progress'
            />
            {detail.status === 'pending' && (
              <Typography.Text type='tertiary' size='small'>
                {remaining > 0
                  ? `${t('还差')} ${remaining} ${t('人满团，人满即得最高额度')}`
                  : t('已满员，等待结算')}
              </Typography.Text>
            )}

            <div className='mt-4 flex items-center justify-between'>
              <span className='inline-flex items-center gap-1 text-semi-color-text-2 text-sm'>
                <IconCalendarClock size='small' /> {t('距拼团结束')}
              </span>
              <GroupBuyCountdown expireTime={detail.expire_time} size='lg' />
            </div>

            {/* Tier ladder */}
            <div className='mt-4 flex flex-col gap-2'>
              {tiers.map((tier) => {
                const unlocked = paid >= tier.count
                const isCurrent =
                  currentAmount === tier.per_share_amount && unlocked
                return (
                  <div
                    key={tier.count}
                    className='flex items-center justify-between rounded-xl px-3 py-2 border transition-colors'
                    style={{
                      borderColor: isCurrent
                        ? 'var(--semi-color-primary)'
                        : 'var(--semi-color-border)',
                      background: isCurrent
                        ? 'var(--semi-color-primary-light-default)'
                        : 'transparent',
                    }}
                  >
                    <span className='inline-flex items-center gap-2'>
                      {unlocked ? (
                        <IconTickCircle
                          size='small'
                          style={{ color: 'var(--semi-color-primary)' }}
                        />
                      ) : (
                        <span className='inline-block w-3 h-3 rounded-full border border-semi-color-border' />
                      )}
                      <Typography.Text strong>
                        {tier.count} {t('人团')}
                      </Typography.Text>
                    </span>
                    <Typography.Text
                      strong
                      style={{
                        color: unlocked
                          ? 'var(--semi-color-primary)'
                          : undefined,
                      }}
                    >
                      {t('每人')} {renderShare(tier.per_share_amount)}
                    </Typography.Text>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Join panel */}
        <div className='lg:col-span-2'>
          <Card className='!rounded-2xl'>
            <Typography.Text strong>{t('参与拼团')}</Typography.Text>

            {detail.status === 'success' && (
              <Banner
                className='mt-3'
                type='success'
                closeIcon={null}
                description={t('拼团已成功，额度已到账')}
              />
            )}
            {detail.status === 'failed' && (
              <Banner
                className='mt-3'
                type='warning'
                closeIcon={null}
                description={t('拼团未成功，已支付成员将自动退款')}
              />
            )}
            {detail.joined && detail.status === 'pending' && (
              <Banner
                className='mt-3'
                type='info'
                closeIcon={null}
                description={t('你已参团，分享链接邀请好友一起拼')}
              />
            )}

            {canJoin && (
              <div className='mt-3 flex flex-col gap-3'>
                <Select
                  style={{ width: '100%' }}
                  value={payWay}
                  onChange={setPayWay}
                  optionList={payOptions}
                  placeholder={t('选择支付方式')}
                />
                <Checkbox
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                >
                  <Typography.Text size='small'>
                    {t('我已阅读并同意《拼团规则》')}
                  </Typography.Text>
                </Checkbox>
                <Button
                  theme='solid'
                  type='primary'
                  size='large'
                  block
                  loading={submitting}
                  disabled={payOptions.length === 0 || !agreed}
                  onClick={join}
                >
                  {t('立即参团')} ¥{Number(detail.per_share_price).toFixed(2)}{' '}
                  {t('立返')} {renderShare(currentAmount)}
                </Button>
              </div>
            )}

            <div className='mt-4 pt-3 border-t border-semi-color-border flex items-center gap-2'>
              <Typography.Text
                type='tertiary'
                ellipsis
                style={{ maxWidth: 180 }}
              >
                {shareLink}
              </Typography.Text>
              <Button size='small' onClick={copyShare}>
                {t('复制链接')}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Notes + models */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4'>
        <Card className='!rounded-2xl' title={t('拼团须知')}>
          <div className='flex flex-col gap-2'>
            {notes.map((note) => (
              <div key={note} className='flex items-start gap-2'>
                <IconTickCircle
                  size='small'
                  style={{ color: 'var(--semi-color-primary)', marginTop: 3 }}
                />
                <Typography.Text type='tertiary'>{note}</Typography.Text>
              </div>
            ))}
          </div>
        </Card>
        <Card className='!rounded-2xl' title={t('模型接入')}>
          <div className='flex items-start gap-2'>
            <IconServer
              size='small'
              style={{ color: 'var(--semi-color-primary)', marginTop: 3 }}
            />
            <Typography.Text type='tertiary'>
              {detail.models_hint ||
                t('拼团成功后额度即时到账，全系模型均可调用。')}
            </Typography.Text>
          </div>
          <div className='mt-3'>
            <Typography.Text type='tertiary' size='small'>
              {t('截止时间')}：{timestamp2string(detail.expire_time)}
            </Typography.Text>
          </div>
        </Card>
      </div>

      {/* Members */}
      <Card className='!rounded-2xl mt-4' title={t('已参团成员')}>
        <div className='flex flex-wrap gap-2'>
          {(detail.participants || []).length === 0 && (
            <Typography.Text type='tertiary'>
              {t('还没有成员，快来当第一个吧')}
            </Typography.Text>
          )}
          {(detail.participants || []).map((p) => (
            <Tag
              key={p.user_id ?? p.username}
              color={p.pay_status === 'paid' ? 'green' : 'orange'}
            >
              {p.username}（
              {p.pay_status === 'paid' ? t('已支付') : t('待支付')}）
            </Tag>
          ))}
        </div>
      </Card>

      <WechatPayModal
        t={t}
        visible={wechatOpen}
        qrCode={wechatQr}
        tradeNo={wechatTradeNo}
        onSuccess={() => {
          setWechatOpen(false)
          loadDetail()
        }}
        onCancel={() => setWechatOpen(false)}
      />

      <EpayCheckoutModal
        t={t}
        visible={epayCheckoutOpen}
        checkout={epayCheckout}
        getStatus={async (tradeNo) => {
          const res = await API.get(
            `/api/user/topup/status?trade_no=${encodeURIComponent(tradeNo)}`
          )
          return res.data
        }}
        onSuccess={async () => {
          setEpayCheckoutOpen(false)
          setEpayCheckout(null)
          await loadDetail()
        }}
        onCancel={async (paid) => {
          setEpayCheckoutOpen(false)
          const tradeNo = epayCheckout?.trade_no
          setEpayCheckout(null)
          if (!paid && tradeNo) {
            try {
              await API.post('/api/user/groupbuy/cancel', {
                trade_no: tradeNo,
              })
            } catch {
              // The reservation also expires server-side when cancellation fails.
            }
          }
          await loadDetail()
        }}
        onRetry={async () => {
          const tradeNo = epayCheckout?.trade_no
          setEpayCheckoutOpen(false)
          setEpayCheckout(null)
          if (tradeNo) {
            try {
              await API.post('/api/user/groupbuy/cancel', {
                trade_no: tradeNo,
              })
            } catch {
              // The reservation also expires server-side when cancellation fails.
            }
          }
          await join()
        }}
      />
    </div>
  )
}

export default GroupBuy

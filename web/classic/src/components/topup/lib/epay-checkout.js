const isSafeHttpUrl = (value) => {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(url.hostname)
    )
  } catch {
    return false
  }
}

const isSafeCheckoutTarget = (checkout) => {
  if (checkout.checkout_type === 'payurl') {
    return isSafeHttpUrl(checkout.checkout_value)
  }
  if (checkout.checkout_type !== 'urlscheme') return false
  const value = checkout.checkout_value.toLowerCase()
  if (checkout.payment_method === 'alipay') {
    return value.startsWith('alipay://') || value.startsWith('alipays://')
  }
  if (checkout.payment_method === 'wxpay') {
    return value.startsWith('weixin://') || value.startsWith('wxp://')
  }
  return false
}

export function normalizeEpayCheckout(value, fallback = {}) {
  if (!value || typeof value !== 'object') return null
  const fields = value
  let checkoutType = fields.checkout_type
  let checkoutValue = fields.checkout_value
  if (!checkoutType && typeof fields.pay_url === 'string') {
    checkoutType = 'payurl'
    checkoutValue = fields.pay_url
  } else if (!checkoutType && typeof fields.payurl === 'string') {
    checkoutType = 'payurl'
    checkoutValue = fields.payurl
  } else if (!checkoutType && typeof fields.qr_code === 'string') {
    checkoutType = 'qrcode'
    checkoutValue = fields.qr_code
  }
  const tradeNo = fields.trade_no ?? fallback.tradeNo
  const paymentMethod = fields.payment_method ?? fallback.paymentMethod
  const money = fields.money ?? fallback.money
  if (
    !['qrcode', 'payurl', 'urlscheme'].includes(checkoutType) ||
    typeof checkoutValue !== 'string' ||
    !checkoutValue.trim() ||
    typeof tradeNo !== 'string' ||
    !tradeNo.trim() ||
    typeof paymentMethod !== 'string' ||
    !paymentMethod.trim() ||
    (typeof money !== 'string' && typeof money !== 'number')
  ) {
    return null
  }
  if (
    fallback.paymentMethod &&
    paymentMethod.trim() !== fallback.paymentMethod.trim()
  ) {
    return null
  }
  if (fallback.money !== undefined) {
    const responseMoney = Number(money)
    const expectedMoney = Number(fallback.money)
    if (
      !Number.isFinite(responseMoney) ||
      !Number.isFinite(expectedMoney) ||
      responseMoney !== expectedMoney
    ) {
      return null
    }
  }
  const checkout = {
    trade_no: tradeNo.trim(),
    gateway_trade_no:
      typeof fields.gateway_trade_no === 'string' &&
      fields.gateway_trade_no.trim()
        ? fields.gateway_trade_no.trim()
        : undefined,
    checkout_type: checkoutType,
    checkout_value: checkoutValue.trim(),
    payment_method: paymentMethod.trim(),
    money: String(money),
  }
  if (checkoutType !== 'qrcode' && !isSafeCheckoutTarget(checkout)) return null
  return checkout
}

export function openEpayCheckout(value, fallback, setCheckout) {
  const checkout = normalizeEpayCheckout(value, fallback)
  if (!checkout) return false
  setCheckout(checkout)
  return true
}

export const openClassicWalletEpay = openEpayCheckout
export const openClassicSubscriptionEpay = openEpayCheckout
export const openClassicGroupBuyCreateEpay = openEpayCheckout
export const openClassicGroupBuyJoinEpay = openEpayCheckout

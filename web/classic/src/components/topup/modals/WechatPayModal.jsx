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

import React, { useEffect, useRef } from 'react';
import { Modal, Typography, Spin } from '@douyinfe/semi-ui';
import { API, showSuccess, showError } from '../../../helpers';

export default function WechatPayModal({
  t,
  visible,
  qrCode,
  tradeNo,
  provider = 'wechat',
  onSuccess,
  onCancel,
}) {
  const isAlipay = provider === 'alipay';
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible || !tradeNo) return undefined;
    let elapsed = 0;
    const tick = async () => {
      elapsed += 3;
      try {
        const res = await API.get(
          `/api/user/topup/status?trade_no=${encodeURIComponent(tradeNo)}`,
        );
        const { message, data } = res.data;
        if (message === 'success' && data?.status) {
          if (data.status === 'success') {
            clearInterval(timerRef.current);
            showSuccess(t('支付成功'));
            onSuccess?.();
            return;
          }
          if (data.status === 'expired' || data.status === 'failed') {
            clearInterval(timerRef.current);
            showError(t('支付未完成'));
            onCancel?.();
            return;
          }
        }
      } catch (e) {
        // ignore polling errors, keep retrying until timeout
      }
      if (elapsed >= 300) {
        clearInterval(timerRef.current);
      }
    };
    timerRef.current = setInterval(tick, 3000);
    return () => clearInterval(timerRef.current);
  }, [visible, tradeNo]);

  return (
    <Modal
      title={isAlipay ? t('支付宝扫码支付') : t('微信扫码支付')}
      visible={visible}
      footer={null}
      onCancel={onCancel}
      centered
      maskClosable={false}
      size='small'
    >
      <div className='flex flex-col items-center gap-3 py-2'>
        {qrCode ? (
          <img
            src={qrCode}
            alt={isAlipay ? 'alipay qr' : 'wechat pay qr'}
            style={{ width: 220, height: 220 }}
          />
        ) : (
          <Spin size='large' />
        )}
        <Typography.Text type='tertiary'>
          {isAlipay
            ? t('请使用支付宝扫描二维码完成支付，支付后将自动到账')
            : t('请使用微信扫描二维码完成支付，支付后将自动到账')}
        </Typography.Text>
      </div>
    </Modal>
  );
}

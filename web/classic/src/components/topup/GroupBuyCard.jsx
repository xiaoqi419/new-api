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

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Select,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { API, showError, renderQuota, getQuotaPerUnit } from '../../helpers';
import WechatPayModal from './modals/WechatPayModal';

function isSafeHttpUrl(value) {
  try {
    const u = new URL((value || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const renderShare = (amount) => renderQuota(amount * getQuotaPerUnit());

// packageInfo 归一化套餐的价格与档位区间（兼容阶梯团与旧版均分套餐）。
const packageInfo = (pkg) => {
  const tiers = pkg.tiers || [];
  if (tiers.length > 0) {
    return {
      price: Number(pkg.per_share_price) || 0,
      minCount: tiers.at(0).count,
      maxCount: tiers.at(-1).count,
      floor: tiers.at(0).per_share_amount,
      best: tiers.at(-1).per_share_amount,
    };
  }
  const rc = pkg.required_count || 1;
  return {
    price: Number(pkg.total_price) / rc,
    minCount: rc,
    maxCount: rc,
    floor: Math.floor(pkg.total_amount / rc),
    best: Math.floor(pkg.total_amount / rc),
  };
};

const GroupBuyCard = ({ t, enableWechatPayTopUp, enableAlipayTopUp }) => {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [packages, setPackages] = useState([]);
  const [payWay, setPayWay] = useState('wechatpay');
  const [submittingId, setSubmittingId] = useState(null);

  const [wechatOpen, setWechatOpen] = useState(false);
  const [wechatQr, setWechatQr] = useState('');
  const [wechatTradeNo, setWechatTradeNo] = useState('');
  const [pendingGroupNo, setPendingGroupNo] = useState('');

  const load = async () => {
    try {
      const res = await API.get('/api/user/groupbuy/info');
      const { success, data } = res.data;
      if (success && data.enabled) {
        setEnabled(true);
        setPackages(data.packages || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (enableWechatPayTopUp) setPayWay('wechatpay');
    else if (enableAlipayTopUp) setPayWay('alipay_direct');
  }, [enableWechatPayTopUp, enableAlipayTopUp]);

  const payOptions = [];
  if (enableWechatPayTopUp) {
    payOptions.push({ label: t('微信支付'), value: 'wechatpay' });
  }
  if (enableAlipayTopUp) {
    payOptions.push({ label: t('支付宝'), value: 'alipay_direct' });
  }

  const handlePayData = (data, groupNo) => {
    if (data.qr_code) {
      setWechatQr(data.qr_code);
      setWechatTradeNo(data.trade_no || '');
      setPendingGroupNo(groupNo);
      setWechatOpen(true);
      return;
    }
    if (data.pay_url && isSafeHttpUrl(data.pay_url)) {
      window.open(data.pay_url, '_blank');
      navigate(`/console/groupbuy?no=${groupNo}`);
      return;
    }
    if (data.epay_url) {
      const form = document.createElement('form');
      form.action = data.epay_url;
      form.method = 'POST';
      form.target = '_blank';
      const params = data.epay_params || {};
      for (const key in params) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = params[key];
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
      navigate(`/console/groupbuy?no=${groupNo}`);
      return;
    }
    showError(t('支付请求失败'));
  };

  const create = async (pkg) => {
    setSubmittingId(pkg.id);
    try {
      const ua = navigator.userAgent || '';
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
      const inWeChat = /MicroMessenger/i.test(ua);
      const scene =
        payWay === 'wechatpay' && isMobile && !inWeChat ? 'h5' : 'native';
      const res = await API.post('/api/user/groupbuy/create', {
        package_id: pkg.id,
        payment_method: payWay,
        scene,
      });
      const { message, data } = res.data;
      if (message === 'success') {
        if (data.h5_url && isSafeHttpUrl(data.h5_url)) {
          window.location.href = data.h5_url;
        } else {
          handlePayData(data, data.group_no);
        }
      } else {
        showError(
          typeof data === 'string' ? data : message || t('发起拼团失败'),
        );
      }
    } catch {
      showError(t('发起拼团失败'));
    } finally {
      setSubmittingId(null);
    }
  };

  if (!enabled || packages.length === 0) return null;

  return (
    <Card className='!rounded-2xl mt-6' title={t('拼团充值')}>
      <Typography.Text type='tertiary'>
        {t('发起拼团并邀请好友一起充值，满员后各自到账，更划算')}
      </Typography.Text>
      <div className='mt-3 mb-3'>
        <Space>
          <Typography.Text>{t('支付方式')}</Typography.Text>
          <Select
            style={{ width: 140 }}
            value={payWay}
            onChange={setPayWay}
            optionList={payOptions}
            placeholder={t('选择支付方式')}
          />
        </Space>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {packages.map((pkg) => {
          const info = packageInfo(pkg);
          return (
            <div
              key={pkg.id}
              className='border border-semi-color-border rounded-xl p-4 flex flex-col gap-2'
            >
              <div className='flex items-center justify-between'>
                <Typography.Text strong>{pkg.name}</Typography.Text>
                <Tag color='blue'>
                  {info.minCount === info.maxCount
                    ? `${info.maxCount} ${t('人成团')}`
                    : `${info.minCount}-${info.maxCount} ${t('人阶梯')}`}
                </Tag>
              </div>
              {pkg.description && (
                <Typography.Text type='tertiary' size='small'>
                  {pkg.description}
                </Typography.Text>
              )}
              <div className='flex items-baseline gap-2'>
                <Typography.Text className='!text-[var(--semi-color-primary)] !text-2xl !font-bold'>
                  ¥{info.price.toFixed(2)}
                </Typography.Text>
                <Typography.Text type='tertiary' size='small'>
                  / {t('每人')}
                </Typography.Text>
              </div>
              <Typography.Text type='tertiary' size='small'>
                {info.minCount === info.maxCount
                  ? `${t('每人到账')} ${renderShare(info.best)}`
                  : `${info.minCount}${t('人得')} ${renderShare(info.floor)} → ${info.maxCount}${t('人得')} ${renderShare(info.best)}`}
              </Typography.Text>
              <Button
                theme='solid'
                type='primary'
                loading={submittingId === pkg.id}
                disabled={payOptions.length === 0}
                onClick={() => create(pkg)}
                className='mt-1'
              >
                {t('发起拼团')}
              </Button>
            </div>
          );
        })}
      </div>

      <WechatPayModal
        t={t}
        visible={wechatOpen}
        qrCode={wechatQr}
        tradeNo={wechatTradeNo}
        onSuccess={() => {
          setWechatOpen(false);
          if (pendingGroupNo) {
            navigate(`/console/groupbuy?no=${pendingGroupNo}`);
          }
        }}
        onCancel={() => {
          setWechatOpen(false);
          if (pendingGroupNo) {
            navigate(`/console/groupbuy?no=${pendingGroupNo}`);
          }
        }}
      />
    </Card>
  );
};

export default GroupBuyCard;

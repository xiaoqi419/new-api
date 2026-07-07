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
import { useSearchParams } from 'react-router-dom';
import {
  Banner,
  Button,
  Card,
  Progress,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  API,
  showError,
  showSuccess,
  renderQuota,
  getQuotaPerUnit,
  copy,
  timestamp2string,
} from '../../helpers';
import WechatPayModal from '../../components/topup/modals/WechatPayModal';

const statusMap = (t) => ({
  pending: { text: t('拼团中'), color: 'orange' },
  success: { text: t('已成团'), color: 'green' },
  failed: { text: t('已失败'), color: 'grey' },
});

function isSafeHttpUrl(value) {
  try {
    const u = new URL((value || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const GroupBuy = () => {
  const { t } = useTranslation();
  const sm = statusMap(t);
  const [searchParams] = useSearchParams();
  const groupNo = searchParams.get('no') || '';

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [payWay, setPayWay] = useState('wechatpay');
  const [enableWechat, setEnableWechat] = useState(false);
  const [enableAlipay, setEnableAlipay] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [wechatOpen, setWechatOpen] = useState(false);
  const [wechatQr, setWechatQr] = useState('');
  const [wechatTradeNo, setWechatTradeNo] = useState('');

  const loadDetail = async () => {
    if (!groupNo) {
      setLoading(false);
      return;
    }
    try {
      const res = await API.get(
        `/api/user/groupbuy/detail?no=${encodeURIComponent(groupNo)}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setDetail(data);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const loadPayMethods = async () => {
    try {
      const res = await API.get('/api/user/topup/info');
      const { success, data } = res.data;
      if (success) {
        const w = data.enable_wechatpay_topup || false;
        const a = data.enable_alipay_topup || false;
        setEnableWechat(w);
        setEnableAlipay(a);
        if (w) setPayWay('wechatpay');
        else if (a) setPayWay('alipay_direct');
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    loadDetail();
    loadPayMethods();
  }, [groupNo]);

  const handlePayData = (data) => {
    if (data.qr_code) {
      setWechatQr(data.qr_code);
      setWechatTradeNo(data.trade_no || '');
      setWechatOpen(true);
      return;
    }
    if (data.pay_url && isSafeHttpUrl(data.pay_url)) {
      window.open(data.pay_url, '_blank');
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
      return;
    }
    showError(t('支付请求失败'));
  };

  const join = async () => {
    setSubmitting(true);
    try {
      const ua = navigator.userAgent || '';
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
      const inWeChat = /MicroMessenger/i.test(ua);
      const scene =
        payWay === 'wechatpay' && isMobile && !inWeChat ? 'h5' : 'native';
      const res = await API.post('/api/user/groupbuy/join', {
        group_no: groupNo,
        payment_method: payWay,
        scene,
      });
      const { message, data } = res.data;
      if (message === 'success') {
        if (data.h5_url && isSafeHttpUrl(data.h5_url)) {
          window.location.href = data.h5_url;
        } else {
          handlePayData(data);
        }
      } else {
        showError(typeof data === 'string' ? data : message || t('参团失败'));
      }
    } catch (e) {
      showError(t('参团失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const shareLink = `${window.location.origin}/console/groupbuy?no=${groupNo}`;
  const copyShare = async () => {
    await copy(shareLink);
    showSuccess(t('拼团链接已复制'));
  };

  if (loading) {
    return (
      <div className='mt-[60px] flex justify-center'>
        <Spin size='large' />
      </div>
    );
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
    );
  }

  const remaining = Math.max(0, detail.required_count - detail.paid_count);
  const expired = detail.expire_time * 1000 < Date.now();
  const canJoin =
    detail.status === 'pending' && !detail.joined && !expired && remaining > 0;

  const payOptions = [];
  if (enableWechat)
    payOptions.push({ label: t('微信支付'), value: 'wechatpay' });
  if (enableAlipay)
    payOptions.push({ label: t('支付宝'), value: 'alipay_direct' });

  return (
    <div className='mt-[60px] px-2 max-w-2xl mx-auto'>
      <Card>
        <div className='flex items-center justify-between mb-3'>
          <Typography.Title heading={4} style={{ margin: 0 }}>
            {detail.package_name || t('拼团充值')}
          </Typography.Title>
          <Tag color={sm[detail.status]?.color || 'grey'} size='large'>
            {sm[detail.status]?.text || detail.status}
          </Tag>
        </div>

        <Space
          vertical
          align='start'
          style={{ width: '100%' }}
          spacing='medium'
        >
          <Typography.Text>
            {t('每人到账额度')}：
            <strong>
              {renderQuota(detail.per_share_amount * getQuotaPerUnit())}
            </strong>
          </Typography.Text>
          <Typography.Text>
            {t('每人支付')}：
            <strong>¥{Number(detail.per_share_price).toFixed(2)}</strong>
          </Typography.Text>
          <Typography.Text type='tertiary'>
            {t('总价')} ¥{Number(detail.total_price).toFixed(2)} · {t('总额度')}{' '}
            {renderQuota(detail.total_amount * getQuotaPerUnit())}
          </Typography.Text>
          <div style={{ width: '100%' }}>
            <Typography.Text>
              {t('成团进度')}：{detail.paid_count}/{detail.required_count}
              {detail.status === 'pending' &&
                `（${t('还差')} ${remaining} ${t('人')}）`}
            </Typography.Text>
            <Progress
              percent={Math.round(
                (detail.paid_count / detail.required_count) * 100,
              )}
              style={{ marginTop: 6 }}
            />
          </div>
          <Typography.Text type='tertiary'>
            {t('截止时间')}：{timestamp2string(detail.expire_time)}
          </Typography.Text>

          <div style={{ width: '100%' }}>
            <Typography.Text strong>{t('已参团成员')}</Typography.Text>
            <div className='mt-1 flex flex-wrap gap-2'>
              {(detail.participants || []).map((p, idx) => (
                <Tag
                  key={idx}
                  color={p.pay_status === 'paid' ? 'green' : 'orange'}
                >
                  {p.username}（
                  {p.pay_status === 'paid' ? t('已支付') : t('待支付')}）
                </Tag>
              ))}
            </div>
          </div>

          {detail.status === 'success' && (
            <Banner
              type='success'
              closeIcon={null}
              description={t('拼团已成功，额度已到账')}
            />
          )}
          {detail.status === 'failed' && (
            <Banner
              type='warning'
              closeIcon={null}
              description={t('拼团未成功，已支付成员将自动退款')}
            />
          )}

          {detail.joined && detail.status === 'pending' && (
            <Banner
              type='info'
              closeIcon={null}
              description={t('你已参团，分享链接邀请好友一起拼')}
            />
          )}

          {canJoin && (
            <Space>
              <Select
                style={{ width: 140 }}
                value={payWay}
                onChange={setPayWay}
                optionList={payOptions}
                placeholder={t('选择支付方式')}
              />
              <Button
                theme='solid'
                type='primary'
                loading={submitting}
                disabled={payOptions.length === 0}
                onClick={join}
              >
                {t('参团并支付')}
              </Button>
            </Space>
          )}

          <Space>
            <Typography.Text type='tertiary' ellipsis style={{ maxWidth: 360 }}>
              {shareLink}
            </Typography.Text>
            <Button size='small' onClick={copyShare}>
              {t('复制拼团链接')}
            </Button>
          </Space>
        </Space>
      </Card>

      <WechatPayModal
        t={t}
        visible={wechatOpen}
        qrCode={wechatQr}
        tradeNo={wechatTradeNo}
        onSuccess={() => {
          setWechatOpen(false);
          loadDetail();
        }}
        onCancel={() => setWechatOpen(false)}
      />
    </div>
  );
};

export default GroupBuy;

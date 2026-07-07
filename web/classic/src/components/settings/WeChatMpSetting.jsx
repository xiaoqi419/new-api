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

import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Image,
  Row,
  Spin,
  Switch,
  Typography,
} from '@douyinfe/semi-ui';
import { IconUpload } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess, toBoolean } from '../../helpers';

const QR_MAX_BYTES = 256 * 1024;

export default function WeChatMpSetting() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [inputs, setInputs] = useState({
    WeChatMpName: '',
    WeChatMpAppId: '',
    WeChatMpAppSecret: '',
    WeChatMpToken: '',
    WeChatAccountQRCodeImageURL: '',
  });
  const refForm = useRef();
  const fileRef = useRef(null);
  const callbackUrl = `${window.location.origin}/api/wechat/callback`;

  const loadOptions = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      const { success, message, data } = res.data;
      if (success) {
        const map = {};
        data.forEach((item) => (map[item.key] = item.value));
        setEnabled(toBoolean(map['WeChatAuthEnabled']));
        const next = {
          WeChatMpName: map['WeChatMpName'] || '',
          WeChatMpAppId: map['WeChatMpAppId'] || '',
          WeChatMpAppSecret: '',
          WeChatMpToken: '',
          WeChatAccountQRCodeImageURL: map['WeChatAccountQRCodeImageURL'] || '',
        };
        setInputs(next);
        refForm.current?.setValues(next);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOptions();
  }, []);

  const onPickQr = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > QR_MAX_BYTES) {
      showError(t('二维码图片不能超过 256KB'));
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setInputs((p) => ({ ...p, WeChatAccountQRCodeImageURL: reader.result }));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeQr = () =>
    setInputs((p) => ({ ...p, WeChatAccountQRCodeImageURL: '' }));

  const save = async () => {
    setLoading(true);
    try {
      // 先保存配置项，再切换启用开关（启用校验依赖 Token 已写入）
      const ops = [
        ['WeChatMpName', inputs.WeChatMpName],
        ['WeChatMpAppId', inputs.WeChatMpAppId],
        ['WeChatAccountQRCodeImageURL', inputs.WeChatAccountQRCodeImageURL],
      ];
      if (inputs.WeChatMpAppSecret !== '') {
        ops.push(['WeChatMpAppSecret', inputs.WeChatMpAppSecret]);
      }
      if (inputs.WeChatMpToken !== '') {
        ops.push(['WeChatMpToken', inputs.WeChatMpToken]);
      }
      await Promise.all(ops.map(([key, value]) => API.put('/api/option/', { key, value })));
      const res = await API.put('/api/option/', {
        key: 'WeChatAuthEnabled',
        value: String(enabled),
      });
      if (!res.data.success) {
        showError(res.data.message);
        return;
      }
      showSuccess(t('保存成功'));
      loadOptions();
    } catch (e) {
      showError(t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Spin spinning={loading}>
      {/* 启用开关 */}
      <Card style={{ marginTop: '10px' }}>
        <div className='flex items-center justify-between'>
          <div>
            <Typography.Title heading={6}>
              {t('启用微信订阅号登录')}
            </Typography.Title>
            <Typography.Text type='tertiary'>
              {t('开启后，登录页面将显示微信登录入口')}
            </Typography.Text>
          </div>
          <Switch checked={enabled} onChange={setEnabled} size='large' />
        </div>
      </Card>

      {/* 公众号配置 */}
      <Card style={{ marginTop: '10px' }}>
        <Form
          initValues={inputs}
          getFormApi={(api) => (refForm.current = api)}
        >
          <Form.Section text={t('公众号配置')}>
            <Typography.Text type='tertiary'>
              {t('在微信公众平台 → 设置与开发 → 基本配置中获取，服务器URL填写：')}{' '}
              <Typography.Text code copyable>
                {callbackUrl}
              </Typography.Text>
            </Typography.Text>
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col xs={24} sm={24} md={12} lg={12} xl={12}>
                <Form.Input
                  field='WeChatMpName'
                  label={t('公众号名称')}
                  placeholder={t('用于展示，如：小小乐星球')}
                  onChange={(v) => setInputs((p) => ({ ...p, WeChatMpName: v }))}
                />
              </Col>
              <Col xs={24} sm={24} md={12} lg={12} xl={12}>
                <Form.Input
                  field='WeChatMpAppId'
                  label={'AppID'}
                  placeholder={t('选填，如：wxeee5eb72aea380ca')}
                  onChange={(v) =>
                    setInputs((p) => ({ ...p, WeChatMpAppId: v }))
                  }
                />
              </Col>
              <Col xs={24} sm={24} md={12} lg={12} xl={12}>
                <Form.Input
                  field='WeChatMpAppSecret'
                  label={'AppSecret'}
                  type='password'
                  placeholder={t('选填，已配置则留空表示不修改')}
                  onChange={(v) =>
                    setInputs((p) => ({ ...p, WeChatMpAppSecret: v }))
                  }
                />
              </Col>
              <Col xs={24} sm={24} md={12} lg={12} xl={12}>
                <Form.Input
                  field='WeChatMpToken'
                  label={t('消息校验 Token')}
                  type='password'
                  placeholder={t('与微信公众平台配置的 Token 保持一致，留空表示不修改')}
                  extraText={t('必填项，用于校验公众号消息回调')}
                  onChange={(v) =>
                    setInputs((p) => ({ ...p, WeChatMpToken: v }))
                  }
                />
              </Col>
            </Row>
          </Form.Section>
        </Form>
      </Card>

      {/* 公众号二维码 */}
      <Card style={{ marginTop: '10px' }}>
        <Form.Section text={t('公众号二维码')}>
          <Typography.Text type='tertiary'>
            {t('用户扫码关注后发送验证码完成登录')}
          </Typography.Text>
          <div className='flex items-center gap-4' style={{ marginTop: 12 }}>
            {inputs.WeChatAccountQRCodeImageURL ? (
              <Image
                src={inputs.WeChatAccountQRCodeImageURL}
                width={120}
                height={120}
                style={{ borderRadius: 8 }}
              />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  border: '1px dashed var(--semi-color-border)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography.Text type='tertiary'>{t('未上传')}</Typography.Text>
              </div>
            )}
            <div className='flex flex-col gap-2'>
              <input
                ref={fileRef}
                type='file'
                accept='image/*'
                style={{ display: 'none' }}
                onChange={onPickQr}
              />
              <Button
                icon={<IconUpload />}
                onClick={() => fileRef.current?.click()}
              >
                {t('上传二维码')}
              </Button>
              {inputs.WeChatAccountQRCodeImageURL && (
                <Button type='danger' theme='borderless' onClick={removeQr}>
                  {t('移除')}
                </Button>
              )}
            </div>
          </div>
        </Form.Section>
      </Card>

      <div style={{ marginTop: '10px' }}>
        <Button theme='solid' type='primary' onClick={save}>
          {t('保存配置')}
        </Button>
      </div>
    </Spin>
  );
}

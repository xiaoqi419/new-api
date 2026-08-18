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

import React, { useEffect, useState, useRef } from 'react';
import { Banner, Button, Form, Row, Col, Spin } from '@douyinfe/semi-ui';
import { API, removeTrailingSlash, showError, showSuccess } from '../../../helpers';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';

export default function SettingsPaymentGatewayWechatPay(props) {
  const { t } = useTranslation();
  const sectionTitle = props.hideSectionTitle ? undefined : t('微信支付设置');
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    WechatPayEnabled: false,
    WechatPayAppId: '',
    WechatPayAppSecret: '',
    WechatPayMchId: '',
    WechatPayApiV3Key: '',
    WechatPayCert: '',
    WechatPayCertSerialNo: '',
    WechatPayPrivateKey: '',
    WechatPayNotifyUrl: '',
    WechatPayNative: true,
    WechatPayH5: false,
    WechatPayJSAPI: false,
    WechatPayMinTopUp: 1,
  });
  const [originInputs, setOriginInputs] = useState({});
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const currentInputs = {
        WechatPayEnabled: props.options.WechatPayEnabled === true,
        WechatPayAppId: props.options.WechatPayAppId || '',
        WechatPayAppSecret: '',
        WechatPayMchId: props.options.WechatPayMchId || '',
        WechatPayApiV3Key: '',
        WechatPayCert: '',
        WechatPayCertSerialNo: props.options.WechatPayCertSerialNo || '',
        WechatPayPrivateKey: '',
        WechatPayNotifyUrl: props.options.WechatPayNotifyUrl || '',
        WechatPayNative: props.options.WechatPayNative === true,
        WechatPayH5: props.options.WechatPayH5 === true,
        WechatPayJSAPI: props.options.WechatPayJSAPI === true,
        WechatPayMinTopUp:
          props.options.WechatPayMinTopUp !== undefined
            ? parseFloat(props.options.WechatPayMinTopUp)
            : 1,
      };
      setInputs(currentInputs);
      setOriginInputs({ ...currentInputs });
      formApiRef.current.setValues(currentInputs);
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitSetting = async () => {
    setLoading(true);
    try {
      const options = [];
      options.push({
        key: 'WechatPayEnabled',
        value: inputs.WechatPayEnabled ? 'true' : 'false',
      });
      options.push({ key: 'WechatPayAppId', value: inputs.WechatPayAppId });
      options.push({ key: 'WechatPayMchId', value: inputs.WechatPayMchId });
      options.push({
        key: 'WechatPayCertSerialNo',
        value: inputs.WechatPayCertSerialNo,
      });
      options.push({
        key: 'WechatPayNotifyUrl',
        value: removeTrailingSlash(inputs.WechatPayNotifyUrl || ''),
      });
      options.push({
        key: 'WechatPayNative',
        value: inputs.WechatPayNative ? 'true' : 'false',
      });
      options.push({
        key: 'WechatPayH5',
        value: inputs.WechatPayH5 ? 'true' : 'false',
      });
      options.push({
        key: 'WechatPayJSAPI',
        value: inputs.WechatPayJSAPI ? 'true' : 'false',
      });
      if (inputs.WechatPayApiV3Key && inputs.WechatPayApiV3Key !== '') {
        options.push({
          key: 'WechatPayApiV3Key',
          value: inputs.WechatPayApiV3Key,
        });
      }
      if (inputs.WechatPayAppSecret && inputs.WechatPayAppSecret !== '') {
        options.push({
          key: 'WechatPayAppSecret',
          value: inputs.WechatPayAppSecret,
        });
      }
      if (inputs.WechatPayCert && inputs.WechatPayCert !== '') {
        options.push({ key: 'WechatPayCert', value: inputs.WechatPayCert });
      }
      if (inputs.WechatPayPrivateKey && inputs.WechatPayPrivateKey !== '') {
        options.push({
          key: 'WechatPayPrivateKey',
          value: inputs.WechatPayPrivateKey,
        });
      }
      if (
        inputs.WechatPayMinTopUp !== undefined &&
        inputs.WechatPayMinTopUp !== null
      ) {
        options.push({
          key: 'WechatPayMinTopUp',
          value: inputs.WechatPayMinTopUp.toString(),
        });
      }

      const results = await Promise.all(
        options.map((opt) =>
          API.put('/api/option/', { key: opt.key, value: opt.value }),
        ),
      );
      const errorResults = results.filter((res) => !res.data.success);
      if (errorResults.length > 0) {
        errorResults.forEach((res) => showError(res.data.message));
      } else {
        showSuccess(t('更新成功'));
        setOriginInputs({ ...inputs });
        props.refresh?.();
      }
    } catch {
      showError(t('更新失败'));
    }
    setLoading(false);
  };

  let callbackBase = t('网站地址');
  if (inputs.WechatPayNotifyUrl) {
    callbackBase = removeTrailingSlash(inputs.WechatPayNotifyUrl);
  } else if (props.options.ServerAddress) {
    callbackBase = removeTrailingSlash(props.options.ServerAddress);
  }

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={sectionTitle}>
          <Banner
            type='info'
            icon={<BookOpen size={16} />}
            description={
              <>
                {t(
                  '在微信支付商户平台（pay.weixin.qq.com）开通对应产品后，于「账户中心 → API 安全」获取 APIv3 密钥、商户私钥（apiclient_key.pem）与公钥证书（apiclient_cert.pem）。粘贴公钥证书内容后系统会自动解析证书序列号。',
                )}
                <br />
                {t('支付回调通知地址（需在商户平台配置）')}：{callbackBase}
                /api/user/wechatpay/notify
                <br />
                {t(
                  'JSAPI（微信内支付）需为「服务号」并填写 AppID/AppSecret 完成网页授权；NATIVE 与 H5 无需 AppSecret。',
                )}
              </>
            }
            style={{ marginBottom: 12 }}
          />
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='WechatPayEnabled'
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                label={t('启用微信支付')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='WechatPayMchId'
                label={t('商户号 MchID')}
                placeholder={t('微信支付商户号')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.InputNumber
                field='WechatPayMinTopUp'
                label={t('最低充值数量')}
                placeholder={t('用户单次最少可充值的数量')}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='WechatPayAppId'
                label={t('关联公众号 AppID')}
                placeholder={t('服务号/公众号 AppID（JSAPI 必填服务号）')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='WechatPayAppSecret'
                label={t('服务号 AppSecret')}
                type='password'
                placeholder={t('仅 JSAPI 需要，留空保持不变')}
                extraText={t('保存后不会回显')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='WechatPayApiV3Key'
                label={t('APIv3 密钥')}
                type='password'
                placeholder={t('留空表示保持当前不变')}
                extraText={t('保存后不会回显')}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={24} lg={24} xl={24}>
              <Form.TextArea
                field='WechatPayCert'
                label={t('公钥证书（apiclient_cert.pem 内容）')}
                placeholder={t(
                  '粘贴 -----BEGIN CERTIFICATE----- 开头的完整内容，系统自动解析序列号；留空保持当前不变',
                )}
                autosize={{ minRows: 4, maxRows: 8 }}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={24} lg={24} xl={24}>
              <Form.Input
                field='WechatPayCertSerialNo'
                label={t('商户证书序列号（可选，留空则自动解析）')}
                placeholder={t('未粘贴证书时可手填 apiclient_cert 的序列号')}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={24} lg={24} xl={24}>
              <Form.TextArea
                field='WechatPayPrivateKey'
                label={t('商户私钥（apiclient_key.pem 内容）')}
                placeholder={t(
                  '粘贴 -----BEGIN PRIVATE KEY----- 开头的完整内容，留空表示保持当前不变',
                )}
                autosize={{ minRows: 4, maxRows: 10 }}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='WechatPayNative'
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                label={t('NATIVE 扫码支付（PC/手机网页展示二维码）')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='WechatPayH5'
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                label={t('H5 支付（手机外部浏览器唤起微信）')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='WechatPayJSAPI'
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                label={t('JSAPI 支付（微信内直接调起，需服务号）')}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={24} lg={24} xl={24}>
              <Form.Input
                field='WechatPayNotifyUrl'
                label={t('支付回调基地址（如 https://你的域名，留空用站点地址）')}
                placeholder={t('https://你的域名')}
              />
            </Col>
          </Row>
          <Button onClick={submitSetting} style={{ marginTop: 8 }}>
            {t('更新微信支付设置')}
          </Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}

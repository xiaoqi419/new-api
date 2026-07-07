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

import React from 'react';
import { Button, Modal, Image, Typography } from '@douyinfe/semi-ui';
import { SiWechat } from 'react-icons/si';

const WeChatBindModal = ({
  t,
  showWeChatBindModal,
  setShowWeChatBindModal,
  wechatBindCode,
  wechatBindLoading,
  refreshWeChatBindCode,
  status,
}) => {
  return (
    <Modal
      title={
        <div className='flex items-center'>
          <SiWechat className='mr-2 text-green-500' size={20} />
          {t('绑定微信账户')}
        </div>
      }
      visible={showWeChatBindModal}
      onCancel={() => setShowWeChatBindModal(false)}
      footer={null}
      size={'small'}
      centered={true}
      className='modern-modal'
    >
      <div className='space-y-4 py-4 text-center'>
        {status.wechat_qrcode && (
          <Image
            src={status.wechat_qrcode}
            className='mx-auto'
            style={{ maxWidth: 200 }}
          />
        )}
        <div className='text-gray-600'>
          <p>
            {t(
              '请使用微信扫码关注公众号，将下方验证码发送给公众号，完成后将自动绑定（3 分钟内有效）',
            )}
          </p>
        </div>
        <div>
          {wechatBindCode ? (
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 6 }}>
              {wechatBindCode}
            </div>
          ) : (
            <Typography.Text type='tertiary'>
              {t('正在获取验证码...')}
            </Typography.Text>
          )}
        </div>
        <Button
          theme='borderless'
          loading={wechatBindLoading}
          onClick={refreshWeChatBindCode}
          icon={<SiWechat size={16} />}
        >
          {t('刷新验证码')}
        </Button>
      </div>
    </Modal>
  );
};

export default WeChatBindModal;

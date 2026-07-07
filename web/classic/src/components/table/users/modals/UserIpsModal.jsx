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
import { Modal, Table, Empty, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, timestamp2string } from '../../../../helpers';

const { Text } = Typography;

const UserIpsModal = ({ visible, user, onCancel }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  const loadIps = async (userId) => {
    setLoading(true);
    try {
      const res = await API.get(`/api/user/ips?id=${userId}`);
      const { success, message, data: rows } = res.data;
      if (success) {
        setData(rows || []);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && user?.id) {
      loadIps(user.id);
    } else {
      setData([]);
    }
  }, [visible, user?.id]);

  const columns = [
    {
      title: 'IP',
      dataIndex: 'ip',
    },
    {
      title: t('次数'),
      dataIndex: 'count',
      render: (text) => text ?? 0,
    },
    {
      title: t('最近时间'),
      dataIndex: 'last_time',
      render: (text) => (text ? timestamp2string(text) : '-'),
    },
  ];

  return (
    <Modal
      title={
        user ? `${t('用户 IP 记录')} - ${user.username}` : t('用户 IP 记录')
      }
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      <Text type='tertiary' size='small'>
        {t(
          'IP 来源于登录与请求日志，去重后按最近时间排序；请求日志 IP 仅在用户开启记录时存在。',
        )}
      </Text>
      <div className='mt-3'>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={data.length > 10 ? { pageSize: 10 } : false}
          rowKey='ip'
          empty={<Empty description={t('暂无 IP 记录')} />}
          size='small'
        />
      </div>
    </Modal>
  );
};

export default UserIpsModal;

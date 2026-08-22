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

import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  API,
  showError,
  showSuccess,
  renderQuota,
  timestamp2string,
} from '../../helpers';

const PAGE_SIZE = 10;

const statusMap = (t) => ({
  pending: { text: t('待发放'), color: 'orange' },
  paid: { text: t('已发放'), color: 'green' },
  cancelled: { text: t('已作废'), color: 'grey' },
});

const RebateRecords = () => {
  const { t } = useTranslation();
  const sm = statusMap(t);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');

  const loadRecords = useCallback(async (p, s) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/rebate/?p=${p}&page_size=${PAGE_SIZE}&status=${s}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setRecords(data.items || []);
        setTotal(data.total || 0);
      } else {
        showError(message);
      }
    } catch {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadRecords(1, status);
    setPage(1);
  }, [loadRecords, status]);

  const pay = async (id) => {
    const res = await API.post('/api/rebate/pay', { id });
    if (res.data.success) {
      showSuccess(t('发放成功'));
      loadRecords(page, status);
    } else {
      showError(res.data.message);
    }
  };

  const cancel = async (id) => {
    const res = await API.post('/api/rebate/cancel', { id });
    if (res.data.success) {
      showSuccess(t('已作废'));
      loadRecords(page, status);
    } else {
      showError(res.data.message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: t('邀请人ID'), dataIndex: 'inviter_id', width: 100 },
    { title: t('好友ID'), dataIndex: 'invitee_id', width: 100 },
    {
      title: t('好友充值额度'),
      dataIndex: 'topup_quota',
      render: (v) => renderQuota(v),
    },
    {
      title: t('返现比例'),
      dataIndex: 'rebate_ratio',
      render: (v) => `${(v * 100).toFixed(2)}%`,
    },
    {
      title: t('应返额度'),
      dataIndex: 'rebate_quota',
      render: (v) => renderQuota(v),
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      render: (v) => <Tag color={sm[v]?.color || 'grey'}>{sm[v]?.text || v}</Tag>,
    },
    {
      title: t('创建时间'),
      dataIndex: 'create_time',
      render: (v) => (v ? timestamp2string(v) : '-'),
    },
    {
      title: t('操作'),
      dataIndex: 'op',
      render: (_, record) =>
        record.status === 'pending' ? (
          <Space>
            <Popconfirm
              title={t('确认发放该返现到邀请人余额？')}
              onConfirm={() => pay(record.id)}
            >
              <Button theme='solid' type='primary' size='small'>
                {t('发放')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t('确认作废该返现记录？')}
              onConfirm={() => cancel(record.id)}
            >
              <Button type='danger' size='small'>
                {t('作废')}
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <Card>
      <Space style={{ marginBottom: 12 }}>
        <Typography.Text>{t('状态筛选')}</Typography.Text>
        <Select
          style={{ width: 160 }}
          value={status}
          onChange={setStatus}
          optionList={[
            { label: t('全部'), value: '' },
            { label: t('待发放'), value: 'pending' },
            { label: t('已发放'), value: 'paid' },
            { label: t('已作废'), value: 'cancelled' },
          ]}
        />
        <Button onClick={() => loadRecords(page, status)}>{t('刷新')}</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={records}
        loading={loading}
        pagination={{
          currentPage: page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: (p) => {
            setPage(p);
            loadRecords(p, status);
          },
        }}
      />
    </Card>
  );
};

const RebateRatios = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState(null);
  const [ratioInput, setRatioInput] = useState(null);

  const loadUsers = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await API.get(`/api/rebate/users?p=${p}&page_size=${PAGE_SIZE}`);
      const { success, message, data } = res.data;
      if (success) {
        setUsers(data.items || []);
        setTotal(data.total || 0);
      } else {
        showError(message);
      }
    } catch {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadUsers(1);
  }, [loadUsers]);

  const openEdit = (user) => {
    setEditing(user);
    setRatioInput(
      user.rebate_ratio === null || user.rebate_ratio === undefined
        ? null
        : user.rebate_ratio,
    );
  };

  const submitRatio = async () => {
    const payload = {
      user_id: editing.id,
      rebate_ratio:
        ratioInput === null || ratioInput === '' ? null : Number(ratioInput),
    };
    const res = await API.put('/api/rebate/user_ratio', payload);
    if (res.data.success) {
      showSuccess(t('设置成功'));
      setEditing(null);
      loadUsers(page);
    } else {
      showError(res.data.message);
    }
  };

  const columns = [
    { title: t('用户ID'), dataIndex: 'id', width: 90 },
    { title: t('用户名'), dataIndex: 'username' },
    { title: t('显示名称'), dataIndex: 'display_name' },
    { title: t('邀请人数'), dataIndex: 'aff_count', width: 100 },
    {
      title: t('专属返现比例'),
      dataIndex: 'rebate_ratio',
      render: (v) =>
        v === null || v === undefined ? (
          <Tag color='blue'>{t('使用全局默认')}</Tag>
        ) : (
          `${(v * 100).toFixed(2)}%`
        ),
    },
    {
      title: t('操作'),
      dataIndex: 'op',
      render: (_, record) => (
        <Button size='small' onClick={() => openEdit(record)}>
          {t('编辑比例')}
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <Table
        columns={columns}
        dataSource={users}
        loading={loading}
        pagination={{
          currentPage: page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: (p) => {
            setPage(p);
            loadUsers(p);
          },
        }}
      />
      <Modal
        title={t('设置专属返现比例')}
        visible={!!editing}
        onOk={submitRatio}
        onCancel={() => setEditing(null)}
        okText={t('保存')}
        cancelText={t('取消')}
      >
        <Typography.Paragraph type='tertiary'>
          {t('留空表示使用全局默认比例。取值范围 0 到 1，如 0.1 表示返充值额度的 10%。')}
        </Typography.Paragraph>
        <InputNumber
          style={{ width: '100%' }}
          min={0}
          max={1}
          step={0.01}
          value={ratioInput}
          placeholder={t('留空使用全局默认')}
          onChange={(v) => setRatioInput(v)}
        />
      </Modal>
    </Card>
  );
};

const Rebate = () => {
  const { t } = useTranslation();
  return (
    <div className='mt-[60px] px-2'>
      <Tabs type='line'>
        <Tabs.TabPane tab={t('返现记录')} itemKey='records'>
          <RebateRecords />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('返现比例设置')} itemKey='ratios'>
          <RebateRatios />
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default Rebate;

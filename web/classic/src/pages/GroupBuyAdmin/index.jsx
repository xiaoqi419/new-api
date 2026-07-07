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
import {
  Button,
  Card,
  Form,
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
  getQuotaPerUnit,
  timestamp2string,
} from '../../helpers';

const PAGE_SIZE = 10;

const orderStatusMap = (t) => ({
  pending: { text: t('拼团中'), color: 'orange' },
  success: { text: t('已成团'), color: 'green' },
  failed: { text: t('已失败'), color: 'grey' },
});

const renderShareAmount = (amount) => renderQuota(amount * getQuotaPerUnit());

const durationUnitOptions = (t) => [
  { label: t('小时'), value: 'hour' },
  { label: t('天'), value: 'day' },
  { label: t('月'), value: 'month' },
  { label: t('年'), value: 'year' },
];

const durationUnitLabel = (t, unit) =>
  ({ hour: t('小时'), day: t('天'), month: t('月'), year: t('年') })[unit] ||
  unit;

const Packages = () => {
  const { t } = useTranslation();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formApi, setFormApi] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/group_buy/packages');
      const { success, message, data } = res.data;
      if (success) {
        setPackages(data || []);
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
    load();
  }, []);

  const openCreate = () => {
    const initial = {
      name: '',
      description: '',
      required_count: 2,
      total_amount: 100,
      total_price: 10,
      duration_unit: 'day',
      duration_value: 1,
      enabled: true,
    };
    setEditing(initial);
    setTimeout(() => formApi && formApi.setValues(initial), 0);
  };

  const openEdit = (record) => {
    setEditing(record);
    setTimeout(() => formApi && formApi.setValues(record), 0);
  };

  const submit = async () => {
    if (!formApi) return;
    const values = await formApi.validate().catch(() => null);
    if (!values) return;
    const payload = {
      ...editing,
      ...values,
      required_count: Number(values.required_count),
      total_amount: Number(values.total_amount),
      total_price: Number(values.total_price),
      duration_value: Number(values.duration_value),
      duration_unit: values.duration_unit,
    };
    const isEdit = !!editing.id;
    const res = isEdit
      ? await API.put('/api/group_buy/packages', payload)
      : await API.post('/api/group_buy/packages', payload);
    if (res.data.success) {
      showSuccess(isEdit ? t('更新成功') : t('创建成功'));
      setEditing(null);
      load();
    } else {
      showError(res.data.message);
    }
  };

  const remove = async (id) => {
    const res = await API.delete(`/api/group_buy/packages/${id}`);
    if (res.data.success) {
      showSuccess(t('删除成功'));
      load();
    } else {
      showError(res.data.message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: t('套餐名称'), dataIndex: 'name' },
    { title: t('成团人数'), dataIndex: 'required_count', width: 90 },
    {
      title: t('总额度'),
      dataIndex: 'total_amount',
      render: (v) => renderShareAmount(v),
    },
    {
      title: t('总价'),
      dataIndex: 'total_price',
      render: (v) => `¥${Number(v).toFixed(2)}`,
    },
    {
      title: t('每人'),
      dataIndex: 'per',
      render: (_, r) =>
        `¥${(Number(r.total_price) / r.required_count).toFixed(2)} / ${renderShareAmount(
          Math.floor(r.total_amount / r.required_count),
        )}`,
    },
    {
      title: t('成团时限'),
      dataIndex: 'duration_value',
      render: (v, r) => `${v} ${durationUnitLabel(t, r.duration_unit)}`,
    },
    {
      title: t('状态'),
      dataIndex: 'enabled',
      render: (v) =>
        v ? (
          <Tag color='green'>{t('启用')}</Tag>
        ) : (
          <Tag color='grey'>{t('停用')}</Tag>
        ),
    },
    {
      title: t('操作'),
      dataIndex: 'op',
      render: (_, record) => (
        <Space>
          <Button size='small' onClick={() => openEdit(record)}>
            {t('编辑')}
          </Button>
          <Popconfirm
            title={t('确认删除该套餐？')}
            onConfirm={() => remove(record.id)}
          >
            <Button size='small' type='danger'>
              {t('删除')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <Space style={{ marginBottom: 12 }}>
        <Button theme='solid' type='primary' onClick={openCreate}>
          {t('新建套餐')}
        </Button>
        <Button onClick={load}>{t('刷新')}</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={packages}
        loading={loading}
        pagination={false}
      />
      <Modal
        title={editing && editing.id ? t('编辑拼团套餐') : t('新建拼团套餐')}
        visible={!!editing}
        onOk={submit}
        onCancel={() => setEditing(null)}
        okText={t('保存')}
        cancelText={t('取消')}
      >
        <Form getFormApi={setFormApi}>
          <Form.Input
            field='name'
            label={t('套餐名称')}
            rules={[{ required: true, message: t('请输入套餐名称') }]}
          />
          <Form.Input field='description' label={t('套餐描述')} />
          <Form.InputNumber
            field='required_count'
            label={t('成团人数')}
            min={2}
            step={1}
          />
          <Form.InputNumber
            field='total_amount'
            label={t('总额度（充值数量，成员均分）')}
            extraText={t('每人到账 = 总额度 ÷ 成团人数，需能被整除')}
            min={1}
            step={1}
          />
          <Form.InputNumber
            field='total_price'
            label={t('总价（元，成员均分）')}
            extraText={t('每人支付 = 总价 ÷ 成团人数')}
            min={0.01}
            step={1}
          />
          <Form.InputNumber
            field='duration_value'
            label={t('成团时限')}
            min={1}
            step={1}
          />
          <Form.Select
            field='duration_unit'
            label={t('时限单位')}
            optionList={durationUnitOptions(t)}
            style={{ width: 160 }}
          />
          <Form.Switch field='enabled' label={t('启用')} />
        </Form>
      </Modal>
    </Card>
  );
};

const Orders = () => {
  const { t } = useTranslation();
  const sm = orderStatusMap(t);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(null);

  const load = async (p = page, s = status) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/group_buy/orders?p=${p}&page_size=${PAGE_SIZE}&status=${s}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setOrders(data.items || []);
        setTotal(data.total || 0);
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
    load(1, status);
    setPage(1);
  }, [status]);

  const viewDetail = async (record) => {
    const res = await API.get(`/api/group_buy/orders/${record.id}`);
    if (res.data.success) {
      setDetail(res.data.data);
    } else {
      showError(res.data.message);
    }
  };

  const cancel = async (id) => {
    const res = await API.post(`/api/group_buy/orders/${id}/cancel`);
    if (res.data.success) {
      showSuccess(t('已作废并触发退款'));
      load();
    } else {
      showError(res.data.message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: t('拼团编号'), dataIndex: 'group_no' },
    { title: t('套餐'), dataIndex: 'package_name' },
    {
      title: t('进度'),
      dataIndex: 'paid_count',
      render: (v, r) => `${v}/${r.required_count}`,
    },
    {
      title: t('每人支付'),
      dataIndex: 'per_share_price',
      render: (v) => `¥${Number(v).toFixed(2)}`,
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      render: (v) => (
        <Tag color={sm[v]?.color || 'grey'}>{sm[v]?.text || v}</Tag>
      ),
    },
    {
      title: t('创建时间'),
      dataIndex: 'create_time',
      render: (v) => (v ? timestamp2string(v) : '-'),
    },
    {
      title: t('操作'),
      dataIndex: 'op',
      render: (_, record) => (
        <Space>
          <Button size='small' onClick={() => viewDetail(record)}>
            {t('查看')}
          </Button>
          {record.status === 'pending' && (
            <Popconfirm
              title={t('确认作废并对已支付成员退款？')}
              onConfirm={() => cancel(record.id)}
            >
              <Button size='small' type='danger'>
                {t('作废')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const participantColumns = [
    { title: t('用户ID'), dataIndex: 'user_id', width: 90 },
    { title: t('用户名'), dataIndex: 'username' },
    { title: t('订单号'), dataIndex: 'trade_no' },
    {
      title: t('支付金额'),
      dataIndex: 'pay_money',
      render: (v) => `¥${Number(v).toFixed(2)}`,
    },
    { title: t('支付状态'), dataIndex: 'pay_status' },
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
            { label: t('拼团中'), value: 'pending' },
            { label: t('已成团'), value: 'success' },
            { label: t('已失败'), value: 'failed' },
          ]}
        />
        <Button onClick={() => load()}>{t('刷新')}</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={orders}
        loading={loading}
        pagination={{
          currentPage: page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: (p) => {
            setPage(p);
            load(p, status);
          },
        }}
      />
      <Modal
        title={t('拼团成员')}
        visible={!!detail}
        footer={null}
        onCancel={() => setDetail(null)}
      >
        <Table
          columns={participantColumns}
          dataSource={detail?.participants || []}
          pagination={false}
        />
      </Modal>
    </Card>
  );
};

const RefundQueue = () => {
  const { t } = useTranslation();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/group_buy/refunds?p=${p}&page_size=${PAGE_SIZE}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setRecords(data.items || []);
        setTotal(data.total || 0);
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
    load(1);
  }, []);

  const markRefunded = async (id) => {
    const res = await API.post(`/api/group_buy/refunds/${id}/done`);
    if (res.data.success) {
      showSuccess(t('已标记退款'));
      load();
    } else {
      showError(res.data.message);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: t('拼团ID'), dataIndex: 'group_buy_id', width: 90 },
    { title: t('用户ID'), dataIndex: 'user_id', width: 90 },
    { title: t('用户名'), dataIndex: 'username' },
    { title: t('订单号'), dataIndex: 'trade_no' },
    {
      title: t('支付金额'),
      dataIndex: 'pay_money',
      render: (v) => `¥${Number(v).toFixed(2)}`,
    },
    {
      title: t('操作'),
      dataIndex: 'op',
      render: (_, record) => (
        <Popconfirm
          title={t('确认已在支付平台手动退款？')}
          onConfirm={() => markRefunded(record.id)}
        >
          <Button size='small' theme='solid' type='primary'>
            {t('标记已退款')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card>
      <Space style={{ marginBottom: 12 }}>
        <Typography.Text type='tertiary'>
          {t(
            '以下为无法自动退款的渠道（如易支付），请在支付平台手动退款后标记',
          )}
        </Typography.Text>
        <Button onClick={() => load()}>{t('刷新')}</Button>
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
            load(p);
          },
        }}
      />
    </Card>
  );
};

const GroupBuyAdmin = () => {
  const { t } = useTranslation();
  return (
    <div className='mt-[60px] px-2'>
      <Tabs type='line'>
        <Tabs.TabPane tab={t('套餐管理')} itemKey='packages'>
          <Packages />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('拼团订单')} itemKey='orders'>
          <Orders />
        </Tabs.TabPane>
        <Tabs.TabPane tab={t('待退款')} itemKey='refunds'>
          <RefundQueue />
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default GroupBuyAdmin;

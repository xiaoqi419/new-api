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
  Empty,
  Form,
  Modal,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess, timestamp2string } from '../../helpers';

const statusMeta = (t) => ({
  0: { color: 'orange', text: t('待处理') },
  1: { color: 'green', text: t('已开票') },
  2: { color: 'red', text: t('已驳回') },
});

const InvoiceCard = ({ t }) => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [titleType, setTitleType] = useState(1);
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const formRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/invoice/self?p=1&page_size=20');
      const { success, message, data } = res.data;
      if (success) {
        setInvoices(data.items || []);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    }
    setLoading(false);
  };

  const loadEligibleOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await API.get('/api/invoice/eligible_orders');
      const { success, message, data } = res.data;
      if (success) {
        setEligibleOrders(data || []);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    }
    setOrdersLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openApply = () => {
    setSelectedOrderIds([]);
    setTitleType(1);
    setApplyOpen(true);
    loadEligibleOrders();
  };

  const selectedTotal = eligibleOrders
    .filter((o) => selectedOrderIds.includes(o.id))
    .reduce((sum, o) => sum + (o.money || 0), 0);

  const submitApply = async (values) => {
    if (selectedOrderIds.length === 0) {
      showError(t('请至少选择一个已支付订单'));
      return;
    }
    try {
      const res = await API.post('/api/invoice/', {
        order_ids: selectedOrderIds,
        title_type: titleType,
        title: values.title,
        tax_number: values.tax_number || '',
        email: values.email || '',
        remark: values.remark || '',
      });
      if (res.data.success) {
        showSuccess(t('发票申请已提交'));
        setApplyOpen(false);
        load();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(e.message);
    }
  };

  const download = async (record) => {
    try {
      const res = await API.get(`/api/invoice/download/${record.id}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice_${record.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showError(e.message);
    }
  };

  const meta = statusMeta(t);

  const columns = [
    { title: t('金额'), dataIndex: 'amount' },
    { title: t('抬头'), dataIndex: 'title' },
    {
      title: t('状态'),
      dataIndex: 'status',
      render: (text, record) => {
        const m = meta[text] || { color: 'grey', text: t('未知') };
        return (
          <div className='flex items-center gap-1'>
            <Tag color={m.color} shape='circle'>
              {m.text}
            </Tag>
            {text === 2 && record.reject_reason && (
              <Typography.Text type='danger' size='small'>
                {record.reject_reason}
              </Typography.Text>
            )}
          </div>
        );
      },
    },
    {
      title: t('申请时间'),
      dataIndex: 'created_time',
      render: (text) => (text ? timestamp2string(text) : '-'),
    },
    {
      title: '',
      dataIndex: 'operate',
      render: (text, record) =>
        record.status === 1 ? (
          <Button size='small' type='tertiary' onClick={() => download(record)}>
            {t('下载')}
          </Button>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <Card className='!rounded-2xl' bordered>
      <div className='flex items-center justify-between mb-4'>
        <Typography.Title heading={5} style={{ margin: 0 }}>
          {t('发票')}
        </Typography.Title>
        <Button type='primary' theme='solid' onClick={openApply}>
          {t('申请发票')}
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={invoices}
        rowKey='id'
        loading={loading}
        pagination={false}
        size='small'
        empty={<Empty description={t('暂无发票申请')} />}
      />

      <Modal
        title={t('申请发票')}
        visible={applyOpen}
        onCancel={() => setApplyOpen(false)}
        onOk={() => formRef.current?.submitForm()}
        okText={t('提交')}
        cancelText={t('取消')}
      >
        <Form
          getFormApi={(api) => (formRef.current = api)}
          onSubmit={submitApply}
        >
          <div className='mb-3'>
            <Typography.Text strong>{t('选择已支付订单')}</Typography.Text>
            <Table
              className='mt-2'
              columns={[
                { title: t('订单号'), dataIndex: 'trade_no', ellipsis: true },
                {
                  title: t('金额'),
                  dataIndex: 'money',
                  render: (v) => `$${Number(v || 0).toFixed(2)}`,
                },
                {
                  title: t('支付时间'),
                  dataIndex: 'complete_time',
                  render: (v) => (v ? timestamp2string(v) : '-'),
                },
              ]}
              dataSource={eligibleOrders}
              rowKey='id'
              loading={ordersLoading}
              pagination={false}
              size='small'
              scroll={{ y: 200 }}
              rowSelection={{
                selectedRowKeys: selectedOrderIds,
                onChange: (keys) => setSelectedOrderIds(keys),
              }}
              empty={<Empty description={t('暂无可开票订单')} />}
            />
            <div className='mt-2'>
              <Typography.Text type='secondary'>
                {t('合计开票金额')}：
              </Typography.Text>
              <Typography.Text strong>
                ${selectedTotal.toFixed(2)}
              </Typography.Text>
            </div>
          </div>
          <Form.RadioGroup
            field='title_type'
            label={t('抬头类型')}
            initValue={1}
            onChange={(e) => setTitleType(e.target.value)}
          >
            <Form.Radio value={1}>{t('个人')}</Form.Radio>
            <Form.Radio value={2}>{t('企业')}</Form.Radio>
          </Form.RadioGroup>
          <Form.Input
            field='title'
            label={t('发票抬头')}
            placeholder={t('请输入发票抬头')}
            rules={[{ required: true, message: t('请输入发票抬头') }]}
          />
          {titleType === 2 && (
            <Form.Input
              field='tax_number'
              label={t('税号')}
              placeholder={t('请输入企业税号')}
              rules={[{ required: true, message: t('请输入企业税号') }]}
            />
          )}
          <Form.Input
            field='email'
            label={t('接收邮箱')}
            placeholder={t('用于接收电子发票')}
          />
          <Form.TextArea
            field='remark'
            label={t('备注')}
            placeholder={t('选填')}
          />
        </Form>
      </Modal>
    </Card>
  );
};

export default InvoiceCard;

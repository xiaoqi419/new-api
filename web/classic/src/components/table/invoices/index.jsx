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
import { useTranslation } from 'react-i18next';
import {
  Button,
  Empty,
  Form,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import CardPro from '../../common/ui/CardPro';
import CardTable from '../../common/ui/CardTable';
import {
  API,
  showError,
  showSuccess,
  timestamp2string,
} from '../../../helpers';
import { createCardProPagination } from '../../../helpers/utils';
import { useIsMobile } from '../../../hooks/common/useIsMobile';

const ITEMS_PER_PAGE = 10;

const statusMeta = (t) => ({
  0: { color: 'orange', text: t('待处理') },
  1: { color: 'green', text: t('已开票') },
  2: { color: 'red', text: t('已驳回') },
});

const InvoicesTable = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');

  const [issueTarget, setIssueTarget] = useState(null);
  const [issueFile, setIssueFile] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const fileRef = useRef(null);

  const [rejectTarget, setRejectTarget] = useState(null);
  const rejectFormRef = useRef(null);

  const loadInvoices = async (page = activePage, size = pageSize) => {
    setLoading(true);
    const statusQuery = statusFilter === '' ? '' : `&status=${statusFilter}`;
    try {
      const res = await API.get(
        `/api/invoice/admin/?p=${page}&page_size=${size}${statusQuery}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setInvoices(data.items || []);
        setTotal(data.total || 0);
        setActivePage(data.page <= 0 ? 1 : data.page);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadInvoices(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handlePageChange = (page) => {
    setActivePage(page);
    loadInvoices(page, pageSize);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setActivePage(1);
    loadInvoices(1, size);
  };

  const submitIssue = async () => {
    if (!issueFile) {
      showError(t('请先选择发票 PDF 文件'));
      return;
    }
    setIssuing(true);
    try {
      const fd = new FormData();
      fd.append('file', issueFile);
      const res = await API.post(
        `/api/invoice/admin/${issueTarget.id}/issue`,
        fd,
      );
      if (res.data.success) {
        showSuccess(t('已开票'));
        setIssueTarget(null);
        setIssueFile(null);
        loadInvoices();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(e.message);
    }
    setIssuing(false);
  };

  const submitReject = async (values) => {
    try {
      const res = await API.post(
        `/api/invoice/admin/${rejectTarget.id}/reject`,
        { reason: values.reason || '' },
      );
      if (res.data.success) {
        showSuccess(t('已驳回'));
        setRejectTarget(null);
        loadInvoices();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(e.message);
    }
  };

  const downloadInvoice = async (record) => {
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
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: t('用户名'), dataIndex: 'username' },
    { title: t('金额'), dataIndex: 'amount' },
    {
      title: t('抬头'),
      dataIndex: 'title',
      render: (text, record) => (
        <span>
          {text}
          <Tag className='ml-1' size='small' shape='circle'>
            {record.title_type === 2 ? t('企业') : t('个人')}
          </Tag>
        </span>
      ),
    },
    {
      title: t('税号'),
      dataIndex: 'tax_number',
      render: (text) => text || '-',
    },
    {
      title: t('邮箱'),
      dataIndex: 'email',
      render: (text) => text || '-',
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      render: (text) => {
        const m = meta[text] || { color: 'grey', text: t('未知') };
        return (
          <Tag color={m.color} shape='circle'>
            {m.text}
          </Tag>
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
      fixed: 'right',
      render: (text, record) => (
        <Space wrap>
          {record.status === 0 && (
            <>
              <Button
                size='small'
                type='primary'
                theme='light'
                onClick={() => {
                  setIssueTarget(record);
                  setIssueFile(null);
                }}
              >
                {t('开票')}
              </Button>
              <Button
                size='small'
                type='danger'
                onClick={() => setRejectTarget(record)}
              >
                {t('驳回')}
              </Button>
            </>
          )}
          {record.status === 1 && (
            <Button
              size='small'
              type='tertiary'
              onClick={() => downloadInvoice(record)}
            >
              {t('下载')}
            </Button>
          )}
          {record.status === 2 && record.reject_reason && (
            <Typography.Text type='danger' size='small'>
              {record.reject_reason}
            </Typography.Text>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <CardPro
        type='type1'
        descriptionArea={
          <div className='flex items-center justify-between w-full'>
            <Typography.Title heading={6} style={{ margin: 0 }}>
              {t('发票管理')}
            </Typography.Title>
          </div>
        }
        actionsArea={
          <div className='flex items-center gap-2'>
            <Select
              placeholder={t('全部状态')}
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140 }}
              showClear
              size='small'
            >
              <Select.Option value=''>{t('全部状态')}</Select.Option>
              <Select.Option value={0}>{t('待处理')}</Select.Option>
              <Select.Option value={1}>{t('已开票')}</Select.Option>
              <Select.Option value={2}>{t('已驳回')}</Select.Option>
            </Select>
            <Button size='small' type='tertiary' onClick={() => loadInvoices()}>
              {t('刷新')}
            </Button>
          </div>
        }
        paginationArea={createCardProPagination({
          currentPage: activePage,
          pageSize: pageSize,
          total: total,
          onPageChange: handlePageChange,
          onPageSizeChange: handlePageSizeChange,
          isMobile: isMobile,
          t: t,
        })}
        t={t}
      >
        <CardTable
          columns={columns}
          dataSource={invoices}
          rowKey='id'
          loading={loading}
          scroll={{ x: 'max-content' }}
          hidePagination={true}
          empty={
            <Empty
              image={
                <IllustrationNoResult style={{ width: 150, height: 150 }} />
              }
              darkModeImage={
                <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
              }
              description={t('暂无发票申请')}
              style={{ padding: 30 }}
            />
          }
          className='rounded-xl overflow-hidden'
          size='middle'
        />
      </CardPro>

      {/* 开票弹窗 */}
      <Modal
        title={t('上传发票 PDF')}
        visible={!!issueTarget}
        onCancel={() => {
          setIssueTarget(null);
          setIssueFile(null);
        }}
        onOk={submitIssue}
        okText={t('确认开票')}
        cancelText={t('取消')}
        confirmLoading={issuing}
      >
        <div className='flex flex-col gap-3'>
          <Typography.Text type='tertiary'>
            {t('为用户')} {issueTarget?.username}{' '}
            {t('上传开具的发票文件（PDF，≤10MB）')}
          </Typography.Text>
          <input
            type='file'
            accept='application/pdf'
            ref={fileRef}
            style={{ display: 'none' }}
            onChange={(e) => setIssueFile(e.target.files?.[0] || null)}
          />
          <div className='flex items-center gap-2'>
            <Button onClick={() => fileRef.current?.click()}>
              {t('选择文件')}
            </Button>
            <Typography.Text>
              {issueFile ? issueFile.name : t('未选择文件')}
            </Typography.Text>
          </div>
        </div>
      </Modal>

      {/* 驳回弹窗 */}
      <Modal
        title={t('驳回发票申请')}
        visible={!!rejectTarget}
        onCancel={() => setRejectTarget(null)}
        onOk={() => rejectFormRef.current?.submitForm()}
        okText={t('确认驳回')}
        cancelText={t('取消')}
      >
        <Form
          getFormApi={(api) => (rejectFormRef.current = api)}
          onSubmit={submitReject}
        >
          <Form.TextArea
            field='reason'
            label={t('驳回原因')}
            placeholder={t('请填写驳回原因')}
          />
        </Form>
      </Modal>
    </>
  );
};

export default InvoicesTable;

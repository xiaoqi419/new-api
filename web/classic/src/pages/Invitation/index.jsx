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
  Col,
  Input,
  Row,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  API,
  copy,
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

const Invitation = () => {
  const { t } = useTranslation();
  const sm = statusMap(t);
  const [affLink, setAffLink] = useState('');
  const [affCount, setAffCount] = useState(0);
  const [pendingQuota, setPendingQuota] = useState(0);
  const [paidQuota, setPaidQuota] = useState(0);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadAff = useCallback(async () => {
    const res = await API.get('/api/user/aff');
    const { success, message, data } = res.data;
    if (success) {
      setAffLink(`${window.location.origin}/register?aff=${data}`);
    } else {
      showError(message);
    }
  }, []);

  const loadSelf = useCallback(async () => {
    const res = await API.get('/api/user/self');
    const { success, data } = res.data;
    if (success) {
      setAffCount(data.aff_count || 0);
    }
  }, []);

  const loadRebate = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/user/self/rebate?p=${p}&page_size=${PAGE_SIZE}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setPendingQuota(data.pending_quota || 0);
        setPaidQuota(data.paid_quota || 0);
        setRecords(data.records?.items || []);
        setTotal(data.records?.total || 0);
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
    loadAff();
    loadSelf();
    loadRebate(1);
  }, [loadAff, loadSelf, loadRebate]);

  const handleCopy = async () => {
    await copy(affLink);
    showSuccess(t('邀请链接已复制到剪切板'));
  };

  const columns = [
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
      title: t('返现额度'),
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
  ];

  return (
    <div className='mt-[60px] px-2'>
      <Card style={{ marginBottom: 12 }}>
        <Typography.Title heading={5}>{t('邀请链接')}</Typography.Title>
        <Row gutter={8} style={{ marginTop: 8 }}>
          <Col span={20}>
            <Input value={affLink} readOnly />
          </Col>
          <Col span={4}>
            <Button theme='solid' type='primary' block onClick={handleCopy}>
              {t('复制')}
            </Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Card>
            <Typography.Text type='tertiary'>{t('已邀请好友')}</Typography.Text>
            <Typography.Title heading={3}>{affCount}</Typography.Title>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Typography.Text type='tertiary'>{t('待发放返现')}</Typography.Text>
            <Typography.Title heading={3}>
              {renderQuota(pendingQuota)}
            </Typography.Title>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Typography.Text type='tertiary'>{t('已发放返现')}</Typography.Text>
            <Typography.Title heading={3}>
              {renderQuota(paidQuota)}
            </Typography.Title>
          </Card>
        </Col>
      </Row>

      <Card title={t('返现记录')}>
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
              loadRebate(p);
            },
          }}
        />
      </Card>
    </div>
  );
};

export default Invitation;

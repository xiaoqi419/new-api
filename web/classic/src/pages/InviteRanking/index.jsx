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
import { Banner, Button, Card, Space, Table, Tag } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, renderQuota } from '../../helpers';

const PAGE_SIZE = 10;

const rankColors = { 1: 'amber', 2: 'grey', 3: 'orange' };

const renderRank = (rank) => {
  if (rankColors[rank]) {
    return (
      <Tag
        color={rankColors[rank]}
        shape='circle'
        size='large'
        style={{ fontWeight: 700 }}
      >
        {rank}
      </Tag>
    );
  }
  return <span style={{ paddingLeft: 8 }}>{rank}</span>;
};

const InviteRanking = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/rebate/ranking?p=${p}&page_size=${PAGE_SIZE}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setRows(data.items || []);
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
    load(1);
  }, [load]);

  const columns = [
    {
      title: t('排名'),
      dataIndex: 'rank',
      width: 90,
      render: (_, __, index) => renderRank((page - 1) * PAGE_SIZE + index + 1),
    },
    { title: t('用户ID'), dataIndex: 'user_id', width: 90 },
    { title: t('用户名'), dataIndex: 'username' },
    { title: t('显示名称'), dataIndex: 'display_name' },
    {
      title: t('邀请人数'),
      dataIndex: 'aff_count',
      width: 110,
      render: (v) => <Tag color='blue'>{v}</Tag>,
    },
    {
      title: t('待发放返现'),
      dataIndex: 'rebate_pending',
      render: (v) => renderQuota(v),
    },
    {
      title: t('已发放返现'),
      dataIndex: 'rebate_paid',
      render: (v) => renderQuota(v),
    },
    {
      title: t('返现合计'),
      dataIndex: 'rebate_total',
      render: (v) => renderQuota(v),
    },
  ];

  return (
    <div className='mt-[60px] px-2'>
      <Card>
        <Banner
          type='info'
          description={t('拉新排行榜：按邀请人数倒序展示，附带各邀请人的返现汇总。')}
          style={{ marginBottom: 12 }}
        />
        <Space style={{ marginBottom: 12 }}>
          <Button onClick={() => load(page)}>{t('刷新')}</Button>
        </Space>
        <Table
          columns={columns}
          dataSource={rows}
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
    </div>
  );
};

export default InviteRanking;

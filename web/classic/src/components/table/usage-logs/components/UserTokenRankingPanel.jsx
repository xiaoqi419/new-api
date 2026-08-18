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

import React, { useState } from 'react';
import {
  Button,
  Collapsible,
  Spin,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconChevronDown,
  IconChevronUp,
  IconRefresh,
} from '@douyinfe/semi-icons';
import { API, showError } from '../../../../helpers';

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

const UserTokenRankingPanel = ({ formApi, refresh, t }) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const rangeFromForm = () => {
    let start = 0;
    let end = 0;
    const values = formApi ? formApi.getValues() : {};
    const range = values?.dateRange;
    if (Array.isArray(range) && range.length === 2) {
      if (range[0]) start = Math.floor(new Date(range[0]).getTime() / 1000);
      if (range[1]) end = Math.floor(new Date(range[1]).getTime() / 1000);
    }
    return { start, end };
  };

  const load = async () => {
    setLoading(true);
    try {
      const { start, end } = rangeFromForm();
      const res = await API.get(
        `/api/user_ranking/?dimension=tokens&start=${start}&end=${end}&limit=20`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setRows(data.items || []);
        setLoaded(true);
      } else {
        showError(message);
      }
    } catch {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      load();
    }
  };

  const drillDown = (row) => {
    if (!formApi) return;
    formApi.setValue('username', row.username);
    if (typeof refresh === 'function') {
      refresh();
    }
  };

  const columns = [
    {
      title: t('排名'),
      dataIndex: 'rank',
      width: 80,
      render: (_, __, index) => renderRank(index + 1),
    },
    { title: t('用户ID'), dataIndex: 'user_id', width: 90 },
    { title: t('用户名'), dataIndex: 'username' },
    { title: t('Token 数'), dataIndex: 'value', render: (v) => v },
    {
      title: t('操作'),
      dataIndex: 'op',
      width: 110,
      render: (_, row) => (
        <Button size='small' theme='light' onClick={() => drillDown(row)}>
          {t('查看明细')}
        </Button>
      ),
    },
  ];

  return (
    <div className='mb-2'>
      <div className='flex items-center justify-between'>
        <Button
          type='tertiary'
          size='small'
          icon={open ? <IconChevronUp /> : <IconChevronDown />}
          onClick={toggle}
        >
          {t('用户 Token 排行')}
        </Button>
        {open && (
          <Button
            type='tertiary'
            size='small'
            icon={<IconRefresh />}
            loading={loading}
            onClick={load}
          >
            {t('刷新')}
          </Button>
        )}
      </div>
      <Collapsible isOpen={open}>
        <div className='mt-2'>
          <Typography.Text type='tertiary' size='small'>
            {t('按 Token 消耗排序，点击“查看明细”可下钻到该用户的用量记录。')}
          </Typography.Text>
          <Spin spinning={loading}>
            <Table
              className='mt-2'
              columns={columns}
              dataSource={rows}
              pagination={false}
              size='small'
            />
          </Spin>
        </div>
      </Collapsible>
    </div>
  );
};

export default UserTokenRankingPanel;

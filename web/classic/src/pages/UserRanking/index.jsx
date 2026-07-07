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
import { Banner, Button, Card, DatePicker, Space, Table, Tabs, Tag } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, renderQuota, timestamp2string } from '../../helpers';

const rankColors = { 1: 'amber', 2: 'grey', 3: 'orange' };

const renderRank = (rank) => {
  if (rankColors[rank]) {
    return (
      <Tag color={rankColors[rank]} shape='circle' size='large' style={{ fontWeight: 700 }}>
        {rank}
      </Tag>
    );
  }
  return <span style={{ paddingLeft: 8 }}>{rank}</span>;
};

const UserRanking = () => {
  const { t } = useTranslation();

  const dimensions = [
    { key: 'quota', tab: t('用户消耗'), valueTitle: t('消耗额度'), render: (v) => renderQuota(v) },
    { key: 'requests', tab: t('IP调用'), valueTitle: t('调用次数'), render: (v) => v },
    { key: 'tokens', tab: t('token消耗'), valueTitle: t('Token 数'), render: (v) => v },
    { key: 'ip_count', tab: t('用户IP数'), valueTitle: t('IP 数'), render: (v) => v },
    {
      key: 'ip_per_minute',
      tab: t('1分钟IP数'),
      valueTitle: t('1分钟内IP数'),
      render: (v) => v,
      showIp: true,
    },
  ];

  const [activeKey, setActiveKey] = useState('quota');
  const [dateRange, setDateRange] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const rangeToTs = () => {
    let start = 0;
    let end = 0;
    if (Array.isArray(dateRange) && dateRange.length === 2) {
      if (dateRange[0]) start = Math.floor(new Date(dateRange[0]).getTime() / 1000);
      if (dateRange[1]) end = Math.floor(new Date(dateRange[1]).getTime() / 1000);
    }
    return { start, end };
  };

  const load = async (dimension = activeKey) => {
    setLoading(true);
    try {
      const { start, end } = rangeToTs();
      const res = await API.get(
        `/api/user_ranking/?dimension=${dimension}&start=${start}&end=${end}&limit=20`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setRows(data.items || []);
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
    load(activeKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const current = dimensions.find((d) => d.key === activeKey) || dimensions[0];

  const columns = [
    {
      title: t('排名'),
      dataIndex: 'rank',
      width: 90,
      render: (_, __, index) => renderRank(index + 1),
    },
    { title: t('用户ID'), dataIndex: 'user_id', width: 90 },
    { title: t('用户名'), dataIndex: 'username' },
    {
      title: current.valueTitle,
      dataIndex: 'value',
      render: (v) => current.render(v),
    },
  ];
  if (current.showIp) {
    columns.push({
      title: t('发生时间'),
      dataIndex: 'last_time',
      render: (v) => (v ? timestamp2string(v) : '-'),
    });
    columns.push({ title: t('IP'), dataIndex: 'ip', render: (v) => v || '-' });
  }

  return (
    <div className='mt-[60px] px-2'>
      <Card>
        <Banner
          type='info'
          description={t('用户消耗排行榜，帮助快速发现用户行为和资源使用情况。')}
          style={{ marginBottom: 12 }}
        />
        <Space style={{ marginBottom: 12 }} wrap>
          <DatePicker
            type='dateTimeRange'
            value={dateRange}
            onChange={setDateRange}
            placeholder={[t('开始时间'), t('结束时间')]}
          />
          <Button theme='solid' type='primary' onClick={() => load(activeKey)}>
            {t('查询')}
          </Button>
        </Space>
        <Tabs type='line' activeKey={activeKey} onChange={setActiveKey}>
          {dimensions.map((d) => (
            <Tabs.TabPane tab={d.tab} itemKey={d.key} key={d.key} />
          ))}
        </Tabs>
        {current.showIp && (
          <Banner
            type='warning'
            description={t('实时监控：显示统计窗口内使用过多个 IP 的用户，用于检测异常行为。')}
            style={{ margin: '12px 0' }}
          />
        )}
        <Table columns={columns} dataSource={rows} loading={loading} pagination={false} />
      </Card>
    </div>
  );
};

export default UserRanking;

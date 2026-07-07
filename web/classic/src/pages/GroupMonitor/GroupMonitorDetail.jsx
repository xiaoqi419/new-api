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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Tag,
  Button,
  Spin,
  RadioGroup,
  Radio,
  Empty,
  Typography,
} from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { API } from '../../helpers/api';
import { showError } from '../../helpers';

const STATUS_TAG_COLOR = {
  normal: 'green',
  degraded: 'orange',
  abnormal: 'red',
  nodata: 'grey',
};

const pad2 = (n) => String(n).padStart(2, '0');

const formatTs = (ts) => {
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const GroupMonitorDetail = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const group = searchParams.get('group') || '';

  const [days, setDays] = useState(Number(searchParams.get('days')) || 7);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const statusText = (status) =>
    ({
      normal: t('正常'),
      degraded: t('降级'),
      abnormal: t('异常'),
      nodata: t('无数据'),
    })[status] || t('无数据');

  const loadData = useCallback(async () => {
    if (!group) return;
    setLoading(true);
    try {
      const res = await API.get(
        `/api/group/monitor/detail?group=${encodeURIComponent(group)}&days=${days}`,
      );
      const { success, message, data: payload } = res.data;
      if (success) {
        setData(payload);
      } else {
        showError(message);
      }
    } catch (e) {
      // 拦截器已提示
    } finally {
      setLoading(false);
    }
  }, [group, days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const points = data?.points || [];

  const buildSpec = (filterFn, valueKey, seriesName, color, decimals) => {
    const values = points.filter(filterFn).map((p) => ({
      time: formatTs(p.ts),
      value: Number(p[valueKey].toFixed(decimals)),
    }));
    return {
      type: 'line',
      data: [{ id: 'data', values }],
      xField: 'time',
      yField: 'value',
      point: { visible: values.length < 60 },
      line: { style: { stroke: color, lineWidth: 2 } },
      axes: [{ orient: 'left' }, { orient: 'bottom' }],
    };
  };

  const charts = [
    {
      key: 'availability',
      title: t('可用率') + ' (%)',
      spec: buildSpec(
        (p) => p.availability >= 0,
        'availability',
        t('可用率'),
        '#52c41a',
        2,
      ),
    },
    {
      key: 'latency',
      title: t('平均延迟') + ' (s)',
      spec: buildSpec(
        (p) => p.success > 0,
        'avg_latency',
        t('平均延迟'),
        '#1677ff',
        2,
      ),
    },
    {
      key: 'throughput',
      title: t('吞吐') + ' (t/s)',
      spec: buildSpec(
        (p) => p.success > 0 && p.throughput > 0,
        'throughput',
        t('吞吐'),
        '#722ed1',
        1,
      ),
    },
  ];

  const hasPoints = points.some((p) => p.success > 0 || p.error > 0);

  return (
    <div className='p-4'>
      {/* 头部 */}
      <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
        <div className='flex items-center gap-3'>
          <Button
            icon={<ArrowLeft size={16} />}
            theme='light'
            type='tertiary'
            onClick={() => navigate('/console/channel-monitor')}
          >
            {t('返回')}
          </Button>
          <Typography.Title heading={4} style={{ margin: 0 }}>
            {data?.display_name || group}
          </Typography.Title>
          {data && (
            <Tag color={STATUS_TAG_COLOR[data.status] || 'grey'} shape='circle'>
              {statusText(data.status)}
            </Tag>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          <RadioGroup
            type='button'
            buttonSize='small'
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            <Radio value={7}>{t('7 天')}</Radio>
            <Radio value={15}>{t('15 天')}</Radio>
            <Radio value={30}>{t('30 天')}</Radio>
          </RadioGroup>
          <Button
            icon={<RefreshCw size={14} />}
            size='small'
            theme='borderless'
            type='tertiary'
            loading={loading}
            onClick={loadData}
          />
        </div>
      </div>

      {/* 汇总指标 */}
      {data && (
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4'>
          <Card className='!rounded-2xl' bodyStyle={{ padding: 16 }}>
            <div className='text-xs text-[var(--semi-color-text-2)]'>
              {t('可用率')}
            </div>
            <div className='text-xl font-semibold'>
              {data.availability >= 0
                ? `${data.availability.toFixed(2)}%`
                : '-'}
            </div>
          </Card>
          <Card className='!rounded-2xl' bodyStyle={{ padding: 16 }}>
            <div className='text-xs text-[var(--semi-color-text-2)]'>
              {t('平均延迟')}
            </div>
            <div className='text-xl font-semibold'>
              {data.avg_latency > 0 ? `${data.avg_latency.toFixed(2)}s` : '-'}
            </div>
          </Card>
          <Card className='!rounded-2xl' bodyStyle={{ padding: 16 }}>
            <div className='text-xs text-[var(--semi-color-text-2)]'>
              {t('吞吐')}
            </div>
            <div className='text-xl font-semibold'>
              {data.throughput > 0 ? `${data.throughput.toFixed(1)} t/s` : '-'}
            </div>
          </Card>
          <Card className='!rounded-2xl' bodyStyle={{ padding: 16 }}>
            <div className='text-xs text-[var(--semi-color-text-2)]'>
              {t('请求数')}
            </div>
            <div className='text-xl font-semibold'>{data.request_count}</div>
          </Card>
        </div>
      )}

      {/* 曲线 */}
      <Spin spinning={loading}>
        {!hasPoints && !loading ? (
          <Empty
            title={t('暂无数据')}
            description={t('所选时间范围内该分组没有请求记录')}
          />
        ) : (
          <div className='grid grid-cols-1 gap-4'>
            {charts.map((c) => (
              <Card
                key={c.key}
                title={c.title}
                className='!rounded-2xl'
                bodyStyle={{ padding: 8 }}
              >
                <div style={{ height: 260 }}>
                  <VChart spec={c.spec} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>
    </div>
  );
};

export default GroupMonitorDetail;

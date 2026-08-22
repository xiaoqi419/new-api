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

import React, { useEffect, useMemo, useState } from 'react';
import { Typography, Spin, Empty } from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { API } from '../../../../../helpers';
import UptimeStrip from '../../perf/UptimeStrip';
import {
  formatThroughput,
  formatLatency,
  formatSuccessPct,
  successRateColor,
  averageDefined,
} from '../../perf/format';

const { Text } = Typography;

const fmtTs = (ts) => {
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmtDateTime = (ts) => {
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// 根据成功率得到运行状态文案与配色（与状态条配色一致）
const statusInfo = (rate, t) => {
  if (!Number.isFinite(rate)) return { text: t('无数据'), color: '#9ca3af' };
  if (rate >= 90) return { text: t('正常运行'), color: successRateColor(rate) };
  if (rate >= 70) return { text: t('性能下降'), color: successRateColor(rate) };
  return { text: t('异常'), color: successRateColor(rate) };
};

// 按分组+时间桶展开为图表数据点（仅取后端真实采样值）
const buildChartData = (groups, field) => {
  const out = [];
  groups.forEach((g) => {
    (g.series || []).forEach((point) => {
      const v = point[field];
      if (!Number.isFinite(v)) return;
      if (field !== 'success_rate' && v <= 0) return;
      out.push({
        Time: fmtTs(point.ts),
        Value: Math.round(v * 100) / 100,
        Group: g.group,
      });
    });
  });
  return out;
};

const PerfChart = ({ title, suffix, values, color, yMax }) => {
  if (!values || values.length === 0) return null;
  const seriesCount = new Set(values.map((v) => v.Group)).size;
  const spec = {
    type: 'line',
    autoFit: true,
    data: [{ id: 'perf', values }],
    xField: 'Time',
    yField: 'Value',
    seriesField: 'Group',
    point: { visible: false },
    line: { style: { lineWidth: 2 } },
    axes: [
      {
        orient: 'left',
        min: 0,
        ...(yMax ? { max: yMax } : {}),
        grid: { visible: true },
      },
      { orient: 'bottom', sampling: true, label: { autoRotate: true } },
    ],
    legends: { visible: true, orient: 'bottom', position: 'middle' },
    // 单分组用主题色，多分组交给默认调色板以区分每条线
    ...(color && seriesCount <= 1 ? { color: [color] } : {}),
  };
  return (
    <div>
      <div className='flex items-center justify-between mb-1'>
        <Text className='text-sm font-medium'>{title}</Text>
        {suffix && (
          <Text type='tertiary' size='small'>
            {suffix}
          </Text>
        )}
      </div>
      <div style={{ height: 180 }}>
        <VChart spec={spec} />
      </div>
    </div>
  );
};

const ModelPerformance = ({ modelData, hours = 24, t }) => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);

  const modelName = modelData?.model_name;

  useEffect(() => {
    let active = true;
    if (!modelName) return;
    setLoading(true);
    void API.get('/api/perf-metrics', { params: { model: modelName, hours } })
      .then((res) => {
        if (!active) return;
        setGroups(res.data?.success ? res.data.data?.groups || [] : []);
      })
      .catch(() => {
        if (active) setGroups([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [modelName, hours]);

  const summary = useMemo(() => {
    const avgTps = averageDefined(groups.map((g) => g.avg_tps));
    const avgTtft = averageDefined(groups.map((g) => g.avg_ttft_ms));
    const avgLatency = averageDefined(groups.map((g) => g.avg_latency_ms));
    const rates = groups
      .map((g) => g.success_rate)
      .filter((v) => Number.isFinite(v));
    const successRate =
      rates.length > 0 ? rates.reduce((s, v) => s + v, 0) / rates.length : NaN;
    let lastTs = 0;
    groups.forEach((g) =>
      (g.series || []).forEach((p) => {
        if (p.ts > lastTs) lastTs = p.ts;
      }),
    );
    return { avgTps, avgTtft, avgLatency, successRate, lastTs };
  }, [groups]);

  const availData = useMemo(
    () => buildChartData(groups, 'success_rate'),
    [groups],
  );
  const ttftData = useMemo(
    () => buildChartData(groups, 'avg_ttft_ms'),
    [groups],
  );
  const tpsData = useMemo(() => buildChartData(groups, 'avg_tps'), [groups]);

  if (loading) {
    return (
      <div className='flex justify-center items-center py-10'>
        <Spin />
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <div className='flex justify-center items-center py-10'>
        <Empty description={t('暂无性能数据')} />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-5'>
      {/* 正常运行时间 */}
      <div>
        <div className='flex items-center justify-between mb-1'>
          <Text className='text-base font-medium'>{t('正常运行时间')}</Text>
          <Text
            className='text-sm font-semibold'
            style={{ color: successRateColor(summary.successRate) }}
          >
            {formatSuccessPct(summary.successRate)}
          </Text>
        </div>
        <div className='flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-1'>
          <span>
            {t('可用率')}{' '}
            <span style={{ color: successRateColor(summary.successRate) }}>
              {formatSuccessPct(summary.successRate)}
            </span>
          </span>
          <span>TTFB {formatLatency(summary.avgTtft)}</span>
          <span>RT {formatLatency(summary.avgLatency)}</span>
          <span>
            {t('分组')} {groups.length}
          </span>
        </div>
        {summary.lastTs > 0 && (
          <div className='text-xs text-gray-400 mb-2'>
            {t('最近检查')} {fmtDateTime(summary.lastTs)}
          </div>
        )}

        {/* 各分组运行时间（多分组堆叠，参考站样式） */}
        <div
          className='flex flex-col gap-3 rounded-xl border p-3'
          style={{ borderColor: 'var(--semi-color-border)' }}
        >
          {groups.map((g) => {
            const rates = (g.series || [])
              .map((p) => p.success_rate)
              .filter((v) => Number.isFinite(v));
            let lastTs = 0;
            (g.series || []).forEach((p) => {
              if (p.ts > lastTs) lastTs = p.ts;
            });
            const st = statusInfo(g.success_rate, t);
            return (
              <div key={g.group}>
                <div className='flex items-center justify-between mb-1'>
                  <span className='flex items-center gap-2 text-sm'>
                    <span
                      className='inline-block w-2 h-2 rounded-full'
                      style={{ backgroundColor: st.color }}
                    />
                    <span className='font-medium text-gray-700'>{g.group}</span>
                    <span style={{ color: st.color }}>{st.text}</span>
                  </span>
                  {lastTs > 0 && (
                    <span className='text-xs text-gray-400'>
                      {fmtDateTime(lastTs)}
                    </span>
                  )}
                </div>
                <div className='flex items-center gap-3'>
                  <div className='flex-1'>
                    {rates.length > 0 ? (
                      <UptimeStrip
                        rates={rates}
                        max={48}
                        showLabel={false}
                        t={t}
                      />
                    ) : (
                      <span className='text-xs text-gray-400'>
                        {t('暂无数据')}
                      </span>
                    )}
                  </div>
                  <span
                    className='text-sm font-semibold whitespace-nowrap'
                    style={{ color: successRateColor(g.success_rate) }}
                  >
                    {formatSuccessPct(g.success_rate)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PerfChart
        title={t('可用率')}
        suffix={formatSuccessPct(summary.successRate)}
        values={availData}
        color='#22c55e'
        yMax={100}
      />

      <PerfChart
        title='TTFB'
        suffix={formatLatency(summary.avgTtft)}
        values={ttftData}
        color='#3b82f6'
      />

      <PerfChart
        title={t('吞吐量 (tokens/s)')}
        suffix={formatThroughput(summary.avgTps)}
        values={tpsData}
        color='#6366f1'
      />

      <div className='flex items-center gap-4 text-xs text-gray-500'>
        <span className='flex items-center gap-1'>
          <span
            className='inline-block w-2 h-2 rounded-full'
            style={{ backgroundColor: '#10b981' }}
          />
          {t('正常')}
        </span>
        <span className='flex items-center gap-1'>
          <span
            className='inline-block w-2 h-2 rounded-full'
            style={{ backgroundColor: '#f59e0b' }}
          />
          {t('性能下降')}
        </span>
        <span className='flex items-center gap-1'>
          <span
            className='inline-block w-2 h-2 rounded-full'
            style={{ backgroundColor: '#ef4444' }}
          />
          {t('异常')}
        </span>
      </div>

      <Text type='tertiary' size='small'>
        {t('以上为真实请求采样统计，无监控数据时不予展示。')}
      </Text>
    </div>
  );
};

export default ModelPerformance;

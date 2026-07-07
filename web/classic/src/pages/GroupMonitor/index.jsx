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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { RefreshCw, ChevronRight } from 'lucide-react';
import { API } from '../../helpers/api';
import { showError } from '../../helpers';

const AUTO_REFRESH_SECONDS = 300;

const HEALTH_COLORS = {
  normal: '#52c41a',
  degraded: '#faad14',
  abnormal: '#f5222d',
  nodata: 'var(--semi-color-fill-1)',
};

const STATUS_TAG_COLOR = {
  normal: 'green',
  degraded: 'orange',
  abnormal: 'red',
  nodata: 'grey',
};

const pad2 = (n) => String(n).padStart(2, '0');

const formatTs = (ts) => {
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const formatCountdown = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${pad2(s)}秒`;
};

// 独立的倒计时组件：每秒仅更新自身文本，避免整页（含热力条）每秒重渲染。
const Countdown = ({ resetToken, onExpire, label }) => {
  const [remaining, setRemaining] = useState(AUTO_REFRESH_SECONDS);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setRemaining(AUTO_REFRESH_SECONDS);
  }, [resetToken]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (onExpireRef.current) onExpireRef.current();
          return AUTO_REFRESH_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className='text-xs text-[var(--semi-color-text-2)]'>
      {label}: {formatCountdown(remaining)}
    </span>
  );
};

const GroupMonitor = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const daysRef = useRef(days);
  daysRef.current = days;

  const statusText = (status) =>
    ({
      normal: t('正常'),
      degraded: t('降级'),
      abnormal: t('异常'),
      nodata: t('无数据'),
    })[status] || t('无数据');

  const overallText = (status) =>
    ({
      normal: t('运行正常'),
      degraded: t('部分降级'),
      abnormal: t('存在异常'),
      nodata: t('暂无数据'),
    })[status] || t('暂无数据');

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await API.get(`/api/group/monitor?days=${daysRef.current}`);
      const { success, message, data: payload } = res.data;
      if (success) {
        setData(payload);
      } else {
        showError(message);
      }
    } catch (e) {
      // 拦截器已提示
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [days, loadData]);

  const groups = data?.groups || [];

  const renderMetric = (label, value, valueColor) => (
    <div className='flex flex-col'>
      <span className='text-xs text-[var(--semi-color-text-2)]'>{label}</span>
      <span
        className='text-lg font-semibold'
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );

  const renderHeatmap = (buckets) => (
    <div className='flex items-stretch w-full h-8 gap-px rounded overflow-hidden'>
      {buckets.map((b) => (
        <div
          key={b.ts}
          className='flex-1 min-w-0'
          style={{
            backgroundColor: HEALTH_COLORS[b.health] || HEALTH_COLORS.nodata,
          }}
          title={`${formatTs(b.ts)}  ${
            b.availability >= 0
              ? `${t('可用率')} ${b.availability.toFixed(1)}%  (${t('成功')}${b.success}/${t('失败')}${b.error})`
              : t('无数据')
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className='p-4'>
      {/* 头部 */}
      <div className='flex flex-wrap items-center justify-between gap-3 mb-4'>
        <Typography.Title heading={4} style={{ margin: 0 }}>
          {t('渠道监控')}
        </Typography.Title>
        <div className='flex flex-wrap items-center gap-3'>
          <RadioGroup
            type='button'
            buttonSize='small'
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setRefreshToken((prev) => prev + 1);
            }}
          >
            <Radio value={7}>{t('7 天')}</Radio>
            <Radio value={15}>{t('15 天')}</Radio>
            <Radio value={30}>{t('30 天')}</Radio>
          </RadioGroup>
          {data && (
            <Tag
              color={STATUS_TAG_COLOR[data.overall_status] || 'grey'}
              shape='circle'
            >
              <span className='inline-flex items-center gap-1'>
                <span
                  className='inline-block w-2 h-2 rounded-full'
                  style={{
                    backgroundColor:
                      HEALTH_COLORS[data.overall_status] ||
                      HEALTH_COLORS.nodata,
                  }}
                />
                {overallText(data.overall_status)}
              </span>
            </Tag>
          )}
          <Button
            icon={<RefreshCw size={14} />}
            size='small'
            theme='borderless'
            type='tertiary'
            loading={loading}
            onClick={() => {
              setRefreshToken((prev) => prev + 1);
              loadData();
            }}
          />
          <Countdown
            resetToken={refreshToken}
            onExpire={() => loadData(true)}
            label={t('自动刷新')}
          />
        </div>
      </div>

      <Spin spinning={loading && !data}>
        {groups.length === 0 && !loading ? (
          <Empty title={t('暂无分组')} description={t('未找到任何用户分组')} />
        ) : (
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
            {groups.map((g) => (
              <Card
                key={g.group}
                className='shadow-sm !rounded-2xl'
                bodyStyle={{ padding: 16 }}
              >
                {/* 标题行 */}
                <div className='flex items-center justify-between mb-3'>
                  <span className='font-medium truncate' title={g.display_name}>
                    {g.display_name}
                  </span>
                  <Tag
                    color={STATUS_TAG_COLOR[g.status] || 'grey'}
                    size='small'
                    shape='circle'
                  >
                    {statusText(g.status)}
                  </Tag>
                </div>

                {/* 指标行 */}
                <div className='grid grid-cols-3 gap-2 mb-3'>
                  {renderMetric(
                    t('可用率'),
                    g.availability >= 0 ? `${g.availability.toFixed(2)}%` : '-',
                    g.availability >= 0 ? HEALTH_COLORS[g.status] : undefined,
                  )}
                  {renderMetric(
                    t('平均延迟'),
                    g.avg_latency > 0 ? `${g.avg_latency.toFixed(2)}s` : '-',
                  )}
                  {renderMetric(
                    t('吞吐'),
                    g.throughput > 0 ? `${g.throughput.toFixed(1)} t/s` : '-',
                  )}
                </div>

                {/* 热力条 */}
                {renderHeatmap(g.buckets)}

                {/* 图例 */}
                <div className='flex flex-wrap items-center gap-3 mt-2 text-xs text-[var(--semi-color-text-2)]'>
                  {['normal', 'degraded', 'abnormal'].map((s) => (
                    <span key={s} className='flex items-center gap-1'>
                      <span
                        className='inline-block w-2 h-2 rounded-full'
                        style={{ backgroundColor: HEALTH_COLORS[s] }}
                      />
                      {statusText(s)}
                    </span>
                  ))}
                </div>

                {/* 时间范围 */}
                {data && (
                  <div className='mt-1 text-xs text-[var(--semi-color-text-2)]'>
                    {formatTs(data.start)} - {formatTs(data.end)}
                  </div>
                )}

                {/* 查看详情 */}
                <div
                  className='flex items-center justify-between mt-3 pt-3 border-t border-[var(--semi-color-border)] cursor-pointer text-[var(--semi-color-text-2)] hover:text-[var(--semi-color-primary)]'
                  onClick={() =>
                    navigate(
                      `/console/channel-monitor/detail?group=${encodeURIComponent(g.group)}&days=${days}`,
                    )
                  }
                >
                  <span className='text-sm'>{t('查看详情')}</span>
                  <ChevronRight size={16} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>
    </div>
  );
};

export default GroupMonitor;

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
  Card,
  Empty,
  Progress,
  Spin,
  Space,
  Button,
  Typography,
  Tag,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { Video, Music, Copy, Eye, Clock } from 'lucide-react';
import {
  renderStatus,
  renderType,
  renderPlatform,
  renderDuration,
  renderTimestamp,
} from './TaskLogsColumnDefs';
import {
  TASK_ACTION_FIRST_TAIL_GENERATE,
  TASK_ACTION_GENERATE,
  TASK_ACTION_REFERENCE_GENERATE,
  TASK_ACTION_TEXT_GENERATE,
  TASK_ACTION_REMIX_GENERATE,
} from '../../../constants/common.constant';
import { renderQuota } from '../../../helpers/render';

const ACTIVE_STATUSES = ['', 'NOT_START', 'SUBMITTED', 'QUEUED', 'IN_PROGRESS'];
const VIDEO_ACTIONS = [
  TASK_ACTION_GENERATE,
  TASK_ACTION_TEXT_GENERATE,
  TASK_ACTION_FIRST_TAIL_GENERATE,
  TASK_ACTION_REFERENCE_GENERATE,
  TASK_ACTION_REMIX_GENERATE,
];

// formatElapsed 把秒数格式化为 m:ss 或 h:mm:ss，用于任务进行中的实时耗时展示。
const formatElapsed = (totalSeconds) => {
  const sec = totalSeconds > 0 ? totalSeconds : 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const TaskLogsCards = (taskLogsData) => {
  const {
    logs,
    loading,
    isAdminUser,
    openContentModal,
    openVideoModal,
    openAudioModal,
    copyText,
    t,
  } = taskLogsData;

  // 存在进行中的任务时，每秒刷新一次时钟以驱动实时耗时展示。
  const hasActiveTask =
    Array.isArray(logs) && logs.some((r) => ACTIVE_STATUSES.includes(r.status));
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!hasActiveTask) return undefined;
    const timer = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [hasActiveTask]);

  if (loading && (!logs || logs.length === 0)) {
    return (
      <div className='flex justify-center items-center py-20'>
        <Spin size='large' />
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <Empty
        image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
        darkModeImage={
          <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
        }
        description={t('搜索无结果')}
        style={{ padding: 30 }}
      />
    );
  }

  return (
    <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4'>
      {logs.map((record) => {
        const rawPercent = parseInt((record.progress || '0').replace('%', ''));
        const percent = isNaN(rawPercent) ? 0 : rawPercent;
        const active = ACTIVE_STATUSES.includes(record.status);
        const elapsedSec =
          active && record.submit_time
            ? Math.max(0, nowSec - record.submit_time)
            : null;
        const model =
          record.properties?.origin_model_name ||
          record.properties?.upstream_model_name ||
          '-';
        const detail =
          record.data && !Array.isArray(record.data) ? record.data : null;
        const paramParts = [];
        if (detail?.resolution) paramParts.push(detail.resolution);
        if (detail?.ratio) paramParts.push(detail.ratio);
        if (detail?.duration) paramParts.push(`${detail.duration}s`);
        if (detail?.framespersecond) {
          paramParts.push(`${detail.framespersecond}fps`);
        }
        if (detail && 'generate_audio' in detail) {
          paramParts.push(detail.generate_audio ? t('有声') : t('无声'));
        }
        const paramStr = paramParts.join(' · ');
        const tokens = detail?.usage?.total_tokens;
        const resultUrl = record.result_url;
        const hasResultUrl =
          typeof resultUrl === 'string' && /^https?:\/\//.test(resultUrl);
        const isVideoTask = VIDEO_ACTIONS.includes(record.action);
        const isSunoSuccess =
          record.platform === 'suno' &&
          record.status === 'SUCCESS' &&
          Array.isArray(record.data) &&
          record.data.some((c) => c.audio_url);
        let footerContent = (
          <Typography.Text type='tertiary' size='small'>
            {active ? t('处理中...') : t('无')}
          </Typography.Text>
        );
        if (isSunoSuccess) {
          footerContent = (
            <Button
              theme='borderless'
              type='primary'
              size='small'
              icon={<Music size={14} />}
              onClick={() => openAudioModal(record.data)}
            >
              {t('预览音乐')}
            </Button>
          );
        } else if (record.status === 'SUCCESS' && isVideoTask && hasResultUrl) {
          footerContent = (
            <Button
              theme='borderless'
              type='primary'
              size='small'
              icon={<Video size={14} />}
              onClick={() => openVideoModal(resultUrl)}
            >
              {t('预览视频')}
            </Button>
          );
        } else if (record.status === 'FAILURE') {
          footerContent = (
            <Typography.Text
              type='danger'
              ellipsis={{ showTooltip: true }}
              style={{ maxWidth: '70%' }}
            >
              {record.fail_reason || t('失败')}
            </Typography.Text>
          );
        }
        let durationContent = null;
        if (record.finish_time) {
          durationContent = renderDuration(
            record.submit_time,
            record.finish_time,
          );
        } else if (elapsedSec !== null) {
          durationContent = (
            <Tag
              color='blue'
              shape='circle'
              prefixIcon={<Clock size={14} />}
            >
              {formatElapsed(elapsedSec)}
            </Tag>
          );
        }

        return (
          <Card
            key={record.key}
            bordered
            className='rounded-xl transition-shadow hover:shadow-md'
            bodyStyle={{ padding: 16 }}
            style={{
              boxShadow: active
                ? '0 0 0 1px var(--semi-color-primary)'
                : undefined,
            }}
          >
            {/* 头部：状态 + 类型 + 平台 */}
            <div className='flex items-center justify-between gap-2 mb-3 flex-wrap'>
              <Space spacing={4} wrap>
                {renderStatus(record.status, t)}
                {renderType(record.action, t)}
              </Space>
              {renderPlatform(record.platform, t)}
            </div>

            {/* 进度条 */}
            <Progress
              percent={percent}
              showInfo
              stroke={
                record.status === 'FAILURE'
                  ? 'var(--semi-color-warning)'
                  : undefined
              }
              aria-label='task progress'
            />

            {/* 模型 */}
            <div className='mt-3 flex items-center gap-1 text-sm'>
              <Typography.Text type='tertiary'>{t('模型')}:</Typography.Text>
              <Typography.Text
                ellipsis={{ showTooltip: true }}
                style={{ maxWidth: '72%' }}
              >
                {model}
              </Typography.Text>
            </div>

            {/* 参数 */}
            {paramStr && (
              <div className='mt-1 flex items-center gap-1 text-sm'>
                <Typography.Text type='tertiary'>{t('参数')}:</Typography.Text>
                <Typography.Text>{paramStr}</Typography.Text>
              </div>
            )}

            {/* 计费（token 数为计费基准：扣费 = tokens × 模型倍率 × 分组倍率） */}
            {typeof tokens === 'number' && tokens > 0 && (
              <div className='mt-1 flex items-center gap-1 text-sm'>
                <Typography.Text type='tertiary'>{t('计费')}:</Typography.Text>
                <Typography.Text>
                  {tokens.toLocaleString()} tokens
                </Typography.Text>
              </div>
            )}

            {/* 消耗额度（差额结算后的实际扣费，成功时展示） */}
            {record.status === 'SUCCESS' && record.quota > 0 && (
              <div className='mt-1 flex items-center gap-1 text-sm'>
                <Typography.Text type='tertiary'>
                  {t('消耗额度')}:
                </Typography.Text>
                <Typography.Text strong>
                  {renderQuota(record.quota)}
                </Typography.Text>
              </div>
            )}

            {/* 任务ID */}
            <div className='mt-1 flex items-center gap-1 text-sm'>
              <Typography.Text type='tertiary'>{t('任务ID')}:</Typography.Text>
              <Typography.Text
                ellipsis={{ showTooltip: true }}
                style={{ maxWidth: '60%' }}
              >
                {record.task_id || '-'}
              </Typography.Text>
              {record.task_id && (
                <Copy
                  size={14}
                  className='cursor-pointer opacity-60 hover:opacity-100'
                  onClick={() => copyText(record.task_id)}
                />
              )}
            </div>

            {/* 管理员：渠道 + 用户 */}
            {isAdminUser && (
              <div className='mt-1 flex items-center gap-4 text-sm'>
                <span className='flex items-center gap-1'>
                  <Typography.Text type='tertiary'>
                    {t('渠道')}:
                  </Typography.Text>
                  <Typography.Text>{record.channel_id ?? '-'}</Typography.Text>
                </span>
                <span className='flex items-center gap-1'>
                  <Typography.Text type='tertiary'>
                    {t('用户')}:
                  </Typography.Text>
                  <Typography.Text
                    ellipsis={{ showTooltip: true }}
                    style={{ maxWidth: 90 }}
                  >
                    {record.username || record.user_id || '-'}
                  </Typography.Text>
                </span>
              </div>
            )}

            {/* 时间 + 耗时（进行中实时计时，完成后显示总耗时） */}
            <div className='mt-2 flex items-center justify-between'>
              <Typography.Text type='tertiary' size='small'>
                {record.submit_time ? renderTimestamp(record.submit_time) : '-'}
              </Typography.Text>
              {durationContent}
            </div>

            {/* 底部：结果 / 详情 */}
            <div className='mt-3 pt-3 flex items-center justify-between border-t border-[var(--semi-color-border)]'>
              {footerContent}
              <Button
                theme='borderless'
                type='tertiary'
                size='small'
                icon={<Eye size={14} />}
                onClick={() =>
                  openContentModal(JSON.stringify(record, null, 2))
                }
              >
                {t('详情')}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default TaskLogsCards;

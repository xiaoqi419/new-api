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
import { useNavigate } from 'react-router-dom';
import {
  Banner,
  Button,
  Empty,
  Pagination,
  Progress,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, renderQuota, getQuotaPerUnit } from '../../helpers';
import GroupBuyCountdown from '../../components/groupbuy/GroupBuyCountdown';

const PAGE_SIZE = 12;

const renderShare = (amount) => renderQuota(amount * getQuotaPerUnit());

const tierBounds = (item) => {
  const tiers = item.tiers || [];
  if (tiers.length === 0) {
    return {
      minCount: item.required_count,
      maxCount: item.target_count || item.required_count,
      floor: item.per_share_amount,
      best: item.per_share_amount,
    };
  }
  return {
    minCount: tiers[0].count,
    maxCount: tiers[tiers.length - 1].count,
    floor: tiers[0].per_share_amount,
    best: tiers[tiers.length - 1].per_share_amount,
  };
};

const currentUnlocked = (item) => {
  const tiers = item.tiers || [];
  let amount = tierBounds(item).floor;
  tiers.forEach((tt) => {
    if ((item.paid_count || 0) >= tt.count) amount = tt.per_share_amount;
  });
  return amount;
};

const HallCard = ({ item, t, onJoin }) => {
  const { minCount, maxCount, floor, best } = tierBounds(item);
  const cap = maxCount || 1;
  const percent = Math.min(
    100,
    Math.round(((item.paid_count || 0) / cap) * 100),
  );
  const full = (item.paid_count || 0) >= cap;
  const tiered = minCount !== maxCount;

  return (
    <div className='rounded-2xl overflow-hidden border border-semi-color-border bg-semi-color-bg-1 shadow-sm hover:shadow-lg transition-shadow duration-200 flex flex-col'>
      <div
        className='px-4 pt-4 pb-3 flex items-start justify-between gap-2'
        style={{ background: 'var(--semi-color-primary-light-default)' }}
      >
        <div className='flex flex-col min-w-0'>
          <Typography.Text
            strong
            ellipsis={{ showTooltip: true }}
            style={{ maxWidth: 190 }}
          >
            {item.package_name || t('拼团充值')}
          </Typography.Text>
          <Typography.Text type='tertiary' size='small'>
            {tiered
              ? `${t('阶梯团')} · ${minCount}-${maxCount} ${t('人')}`
              : `${maxCount} ${t('人成团')}`}
          </Typography.Text>
        </div>
        <Tag color={full ? 'green' : 'blue'} shape='circle'>
          {full ? t('已满员') : t('进行中')}
        </Tag>
      </div>

      <div className='p-4 flex flex-col gap-3 flex-1'>
        <div className='flex items-center justify-between'>
          <Typography.Text type='tertiary' size='small'>
            {t('距结束')}
          </Typography.Text>
          <GroupBuyCountdown expireTime={item.expire_time} size='sm' />
        </div>

        <div>
          <div className='flex items-center justify-between mb-1'>
            <Typography.Text size='small'>
              {t('已参与')} {item.paid_count || 0} / {cap} {t('人')}
            </Typography.Text>
            <Typography.Text
              size='small'
              strong
              className='!text-[var(--semi-color-primary)]'
            >
              {t('当前每人得')} {renderShare(currentUnlocked(item))}
            </Typography.Text>
          </div>
          <Progress
            percent={percent}
            stroke='var(--semi-color-primary)'
            aria-label='progress'
          />
        </div>

        <div className='flex items-baseline gap-2'>
          <span className='text-2xl font-bold text-[var(--semi-color-primary)]'>
            ¥{Number(item.per_share_price).toFixed(2)}
          </span>
          <Typography.Text type='tertiary' size='small'>
            / {t('每人')}
          </Typography.Text>
        </div>

        <Typography.Text type='tertiary' size='small'>
          {tiered
            ? `${minCount}${t('人得')} ${renderShare(floor)} → ${maxCount}${t('人得')} ${renderShare(best)}`
            : `${maxCount} ${t('人成团')} · ${t('每人得')} ${renderShare(best)}`}
        </Typography.Text>

        <Button
          theme='solid'
          type='primary'
          block
          style={{ marginTop: 'auto' }}
          onClick={() => onJoin(item.group_no)}
        >
          {full ? t('查看拼团') : t('参与拼团')}
        </Button>
      </div>
    </div>
  );
};

const GroupBuyHall = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/user/groupbuy/hall?p=${p}&page_size=${PAGE_SIZE}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        setEnabled(data.enabled);
        setItems(data.page_info?.items || []);
        setTotal(data.page_info?.total || 0);
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
    load(1);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goDetail = (groupNo) => navigate(`/console/groupbuy?no=${groupNo}`);

  return (
    <div className='mt-[60px] px-2 max-w-6xl mx-auto pb-8'>
      <div className='flex items-center justify-between mb-4'>
        <div>
          <Typography.Title heading={4} style={{ margin: 0 }}>
            {t('拼团大厅')}
          </Typography.Title>
          <Typography.Text type='tertiary' size='small'>
            {t('人越多，每人到账额度越高，快喊好友一起拼')}
          </Typography.Text>
        </div>
        <Button icon={<IconRefresh />} onClick={() => load(page)}>
          {t('刷新')}
        </Button>
      </div>

      {!enabled ? (
        <Banner
          type='info'
          closeIcon={null}
          description={t('管理员未开启拼团充值')}
        />
      ) : loading ? (
        <div className='mt-[60px] flex justify-center'>
          <Spin size='large' />
        </div>
      ) : items.length === 0 ? (
        <Empty
          title={t('暂无进行中的拼团')}
          description={t('去钱包管理发起一个新的拼团吧')}
          style={{ marginTop: 60 }}
        />
      ) : (
        <>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
            {items.map((item) => (
              <HallCard
                key={item.group_no}
                item={item}
                t={t}
                onJoin={goDetail}
              />
            ))}
          </div>
          {total > PAGE_SIZE && (
            <div className='flex justify-center mt-6'>
              <Pagination
                currentPage={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={(p) => {
                  setPage(p);
                  load(p);
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GroupBuyHall;

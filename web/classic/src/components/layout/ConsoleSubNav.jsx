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

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isAdmin, isRoot } from '../../helpers';
import { useSidebar } from '../../hooks/common/useSidebar';

const HIDDEN_CONSOLE_SUBNAV_ITEM_KEYS = new Set([
  'groupbuy_hall',
  'user_ranking',
  'redemption',
  'subscription',
  'groupbuy',
  'rebate',
  'identity_verification',
]);

// oxlint-disable-next-line react/only-export-components -- shared pure filter is intentionally exported with this module.
export const filterHiddenConsoleSubNavItems = (items) =>
  items.filter((item) => !HIDDEN_CONSOLE_SUBNAV_ITEM_KEYS.has(item.key));

// 顶部导航的二级菜单：与侧边栏（SiderBar）共用 useSidebar 的可见性逻辑，
// 确保自定义功能（邀请返现、拼团、排行榜等）在顶栏布局下同样可见。
const ConsoleSubNav = () => {
  const { t } = useTranslation();
  const { isModuleVisible, hasSectionVisibleModules } = useSidebar();

  const links = [{ key: 'detail', text: t('总览'), to: '/console', end: true }];

  if (hasSectionVisibleModules('console')) {
    const consoleItems = [
      {
        key: 'token',
        text: t('API 密钥'),
        to: '/console/token',
        enabled: true,
      },
      { key: 'log', text: t('消费日志'), to: '/console/log', enabled: true },
      {
        key: 'midjourney',
        text: t('绘图日志'),
        to: '/console/midjourney',
        enabled: localStorage.getItem('enable_drawing') === 'true',
      },
      {
        key: 'task',
        text: t('任务日志'),
        to: '/console/task',
        enabled: localStorage.getItem('enable_task') === 'true',
      },
      {
        key: 'video_generation',
        text: t('视频生成'),
        to: '/console/video-generation',
        enabled: true,
        alwaysVisible: true,
      },
      {
        key: 'asset_library',
        text: t('素材库'),
        to: '/console/asset-library',
        enabled: true,
        alwaysVisible: true,
      },
      {
        key: 'channel_monitor',
        text: t('渠道监控'),
        to: '/console/channel-monitor',
        enabled: true,
        alwaysVisible: true,
      },
    ];
    filterHiddenConsoleSubNavItems(consoleItems).forEach((item) => {
      if (
        item.enabled &&
        (item.alwaysVisible || isModuleVisible('console', item.key))
      ) {
        links.push({ key: item.key, text: item.text, to: item.to });
      }
    });
  }

  if (
    hasSectionVisibleModules('chat') &&
    isModuleVisible('chat', 'playground')
  ) {
    links.push({
      key: 'playground',
      text: t('操练场'),
      to: '/console/playground',
    });
  }

  if (hasSectionVisibleModules('personal')) {
    const personalItems = [
      { key: 'topup', text: t('账单'), to: '/console/topup' },
      { key: 'invitation', text: t('邀请中心'), to: '/console/invitation' },
      { key: 'personal', text: t('个人设置'), to: '/console/personal' },
    ];
    filterHiddenConsoleSubNavItems(personalItems).forEach((item) => {
      if (isModuleVisible('personal', item.key)) {
        links.push({ key: item.key, text: item.text, to: item.to });
      }
    });
  }

  if (isAdmin() && hasSectionVisibleModules('admin')) {
    const adminItems = [
      {
        key: 'channel',
        text: t('渠道'),
        to: '/console/channel',
        allowed: true,
      },
      {
        key: 'subscription',
        text: t('订阅'),
        to: '/console/subscription',
        allowed: true,
      },
      { key: 'models', text: t('模型'), to: '/console/models', allowed: true },
      {
        key: 'deployment',
        text: t('模型部署'),
        to: '/console/deployment',
        allowed: true,
      },
      {
        key: 'redemption',
        text: t('兑换码'),
        to: '/console/redemption',
        allowed: true,
      },
      {
        key: 'rebate',
        text: t('邀请返现'),
        to: '/console/rebate',
        allowed: true,
      },
      {
        key: 'groupbuy',
        text: t('拼团管理'),
        to: '/console/groupbuy-admin',
        allowed: true,
      },
      {
        key: 'invite_ranking',
        text: t('拉新排行'),
        to: '/console/invite-ranking',
        allowed: true,
      },
      {
        key: 'user_ranking',
        text: t('用户排行'),
        to: '/console/user-ranking',
        allowed: true,
      },
      { key: 'user', text: t('用户'), to: '/console/user', allowed: true },
      {
        key: 'setting',
        text: t('系统设置'),
        to: '/console/setting',
        allowed: isRoot(),
      },
    ];
    filterHiddenConsoleSubNavItems(adminItems).forEach((item) => {
      if (item.allowed && isModuleVisible('admin', item.key)) {
        links.push({ key: item.key, text: item.text, to: item.to });
      }
    });
  }

  const scrollRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    overflowing: false,
    atStart: true,
    atEnd: false,
  });

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollState({
      overflowing: el.scrollWidth > el.clientWidth + 1,
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    updateScrollState();
    const active = el.querySelector('.app-console-subnav-link.active');
    if (active) {
      active.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, links.length]);

  const handleScrollBy = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(200, Math.round(el.clientWidth * 0.6));
    el.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  return (
    <div className='app-console-subnav'>
      <div className='app-console-subnav-inner'>
        {scrollState.overflowing && (
          <button
            type='button'
            className='app-console-subnav-arrow'
            aria-label={t('向左滚动')}
            disabled={scrollState.atStart}
            onClick={() => handleScrollBy(-1)}
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <div className='app-console-subnav-scroll' ref={scrollRef}>
          {links.map((link) => (
            <NavLink
              key={link.key}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `app-console-subnav-link ${isActive ? 'active' : ''}`
              }
            >
              {link.text}
            </NavLink>
          ))}
        </div>
        {scrollState.overflowing && (
          <button
            type='button'
            className='app-console-subnav-arrow'
            aria-label={t('向右滚动')}
            disabled={scrollState.atEnd}
            onClick={() => handleScrollBy(1)}
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ConsoleSubNav;

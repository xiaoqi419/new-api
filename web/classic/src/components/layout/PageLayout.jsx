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

import HeaderBar from './headerbar';
import { Layout } from '@douyinfe/semi-ui';
import SiderBar from './SiderBar';
import App from '../../App';
import FooterBar from './Footer';
import ConsoleSubNav from './ConsoleSubNav';
import { ToastContainer } from 'react-toastify';
import ErrorBoundary from '../common/ErrorBoundary';
import React, { useContext, useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { useSidebarCollapsed } from '../../hooks/common/useSidebarCollapsed';
import { useTranslation } from 'react-i18next';
import {
  API,
  getLogo,
  getSystemName,
  showError,
  setStatusData,
} from '../../helpers';
import { UserContext } from '../../context/User';
import { StatusContext } from '../../context/Status';
import { useAppearance } from '../../context/Theme';
import { useLocation } from 'react-router-dom';
import { normalizeLanguage } from '../../i18n/language';
const { Sider, Content, Header } = Layout;

const PageLayout = () => {
  const [userState, userDispatch] = useContext(UserContext);
  const [, statusDispatch] = useContext(StatusContext);
  const isMobile = useIsMobile();
  const [collapsed, , setCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { i18n } = useTranslation();
  const location = useLocation();
  const appearance = useAppearance();

  const cardProPages = [
    '/console/channel',
    '/console/log',
    '/console/redemption',
    '/console/user',
    '/console/token',
    '/console/midjourney',
    '/console/task',
    '/console/models',
    '/pricing',
  ];

  // apimart 首页启用全屏分段（fullpage）布局，独立页脚会挤入锁定的视口，
  // 故在首页隐藏 PageLayout 页脚，由首页自身的最后一屏承载页脚信息。
  const isApimartFullpageHome =
    appearance.preset === 'apimart' && location.pathname === '/';
  const shouldHideFooter = location.pathname.startsWith('/console')
    ? true
    : isApimartFullpageHome
      ? true
      : appearance.preset === 'apimart'
        ? false
        : cardProPages.includes(location.pathname);

  const shouldInnerPadding =
    location.pathname.includes('/console') &&
    !location.pathname.startsWith('/console/chat') &&
    location.pathname !== '/console/playground';

  const isConsoleRoute = location.pathname.startsWith('/console');
  const adminConsoleRoutes = [
    '/console/channel',
    '/console/user',
    '/console/redemption',
    '/console/setting',
    '/console/models',
    '/console/deployment',
    '/console/subscription',
  ];
  const isAdminConsoleRoute = adminConsoleRoutes.some((path) =>
    location.pathname.startsWith(path),
  );
  const useApimartTopNav =
    appearance.preset === 'apimart' &&
    isConsoleRoute &&
    (appearance.console_layout === 'topnav' ||
      (appearance.console_layout === 'hybrid' && !isAdminConsoleRoute));
  const showConsoleSubNav = useApimartTopNav;
  const showSider =
    isConsoleRoute && !useApimartTopNav && (!isMobile || drawerOpen);
  const isFixedLayout =
    isConsoleRoute || location.pathname === '/pricing' || isApimartFullpageHome;

  useEffect(() => {
    if (isMobile && drawerOpen && collapsed) {
      setCollapsed(false);
    }
  }, [isMobile, drawerOpen, collapsed, setCollapsed]);

  const loadUser = () => {
    let user = localStorage.getItem('user');
    if (user) {
      let data = JSON.parse(user);
      userDispatch({ type: 'login', payload: data });
    }
  };

  const loadStatus = async () => {
    try {
      const res = await API.get('/api/status');
      const { success, data } = res.data;
      if (success) {
        statusDispatch({ type: 'set', payload: data });
        setStatusData(data);
      } else {
        showError('Unable to connect to server');
      }
    } catch (error) {
      showError('Failed to load status');
    }
  };

  useEffect(() => {
    loadUser();
    loadStatus().catch(console.error);
    let systemName = getSystemName();
    if (systemName) {
      document.title = systemName;
    }
    let logo = getLogo();
    if (logo) {
      let linkElement = document.querySelector("link[rel~='icon']");
      if (linkElement) {
        linkElement.href = logo;
      }
    }
  }, []);

  useEffect(() => {
    let preferredLang;

    if (userState?.user?.setting) {
      try {
        const settings = JSON.parse(userState.user.setting);
        preferredLang = normalizeLanguage(settings.language);
      } catch (e) {
        // Ignore parse errors
      }
    }

    if (!preferredLang) {
      const savedLang = localStorage.getItem('i18nextLng');
      if (savedLang) {
        preferredLang = normalizeLanguage(savedLang);
      }
    }

    if (preferredLang) {
      localStorage.setItem('i18nextLng', preferredLang);
      if (preferredLang !== i18n.language) {
        i18n.changeLanguage(preferredLang);
      }
    }
  }, [i18n, userState?.user?.setting]);

  return (
    <Layout
      className={`app-layout${isFixedLayout ? ' app-layout-fixed' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: isFixedLayout && !isMobile ? 'hidden' : 'visible',
      }}
    >
      <Header
        className='app-floating-header-wrap'
        style={{
          padding: 0,
          height: 'auto',
          lineHeight: 'normal',
          position: 'fixed',
          width: '100%',
          top: 0,
          zIndex: 100,
          background: 'transparent',
        }}
      >
        <HeaderBar
          onMobileMenuToggle={() => setDrawerOpen((prev) => !prev)}
          drawerOpen={drawerOpen}
        />
        {showConsoleSubNav && <ConsoleSubNav />}
      </Header>
      <Layout
        style={{
          overflow: isFixedLayout && !isMobile ? 'auto' : 'visible',
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 auto',
        }}
      >
        {showSider && (
          <Sider
            className='app-sider'
            style={{
              position: 'fixed',
              left: 0,
              top: '64px',
              zIndex: 99,
              border: 'none',
              paddingRight: '0',
              width: 'var(--sidebar-current-width)',
            }}
          >
            <SiderBar
              onNavigate={() => {
                if (isMobile) setDrawerOpen(false);
              }}
            />
          </Sider>
        )}
        <Layout
          style={{
            marginLeft: isMobile
              ? '0'
              : showSider
                ? 'var(--sidebar-current-width)'
                : '0',
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <Content
            className={isFixedLayout ? undefined : 'public-page-content'}
            style={{
              flex: isFixedLayout ? '1 0 auto' : '1 1 auto',
              overflowY: isFixedLayout && !isMobile ? 'hidden' : 'visible',
              WebkitOverflowScrolling: 'touch',
              padding: shouldInnerPadding ? (isMobile ? '5px' : '24px') : '0',
              paddingTop: showConsoleSubNav
                ? 'var(--app-subnav-height)'
                : isApimartFullpageHome
                  ? undefined
                  : shouldInnerPadding
                    ? isMobile
                      ? 'calc(5px + var(--app-floating-header-height) - 60px)'
                      : 'calc(24px + var(--app-floating-header-height) - 60px)'
                    : 'var(--app-floating-header-height)',
              position: 'relative',
              minHeight: 0,
            }}
          >
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </Content>
          {!shouldHideFooter && (
            <Layout.Footer
              style={{
                flex: '0 0 auto',
                width: '100%',
              }}
            >
              <FooterBar />
            </Layout.Footer>
          )}
        </Layout>
      </Layout>
      <ToastContainer />
    </Layout>
  );
};

export default PageLayout;

/*
Copyright (C) 2023-2026 QuantumNous

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
import {
  BadgeCheck,
  Box,
  Clapperboard,
  CreditCard,
  Dices,
  FileText,
  FlaskConical,
  Gauge,
  Gift,
  HandCoins,
  History,
  Images,
  Key,
  LayoutDashboard,
  Radio,
  ReceiptText,
  Rocket,
  ServerCog,
  Settings,
  Ticket,
  TriangleAlert,
  Trophy,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SidebarData } from '@/components/layout/types'
import { ROLE } from '@/lib/roles'

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()

  return {
    navGroups: [
      {
        id: 'chat',
        title: t('Chat'),
        items: [
          {
            title: t('Workbench'),
            url: '/workbench',
            icon: Rocket,
          },
          {
            title: t('Playground'),
            url: '/playground',
            icon: FlaskConical,
          },
        ],
      },
      {
        id: 'general',
        title: t('General'),
        items: [
          {
            title: t('Analytics'),
            url: '/dashboard/overview',
            activeUrls: [
              '/dashboard/models',
              '/dashboard/flow',
              '/dashboard/users',
            ],
            icon: LayoutDashboard,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
          },
          {
            title: t('Consumption Logs'),
            url: '/usage-logs/common',
            activeUrls: ['/usage-logs/drawing', '/usage-logs/task'],
            configUrls: [
              '/usage-logs/common',
              '/usage-logs/drawing',
              '/usage-logs/task',
            ],
            icon: FileText,
          },
          {
            title: t('Channel Monitor'),
            url: '/channel-monitor',
            activeUrls: ['/channel-monitor/detail'],
            icon: Gauge,
          },
        ],
      },
      {
        id: 'media',
        title: t('AI Media'),
        items: [
          {
            title: t('Video Generation'),
            url: '/video-generation',
            icon: Clapperboard,
          },
          {
            title: t('Asset Library'),
            url: '/asset-library',
            icon: Images,
          },
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          {
            title: t('Finance Center'),
            url: '/finance/wallet',
            activeUrls: [
              '/finance/groupbuy',
              '/finance/invoices',
              '/finance/lottery',
              '/groupbuy/detail',
            ],
            configUrls: [
              '/finance/wallet',
              '/finance/groupbuy',
              '/finance/invoices',
              '/finance/lottery',
            ],
            icon: Wallet,
          },
          {
            title: t('Personal Center'),
            url: '/account/profile',
            activeUrls: [
              '/account/invitation',
              '/account/identity-verification',
            ],
            configUrls: [
              '/account/profile',
              '/account/invitation',
              '/account/identity-verification',
            ],
            icon: User,
          },
        ],
      },
      {
        id: 'admin',
        title: t('Admin'),
        items: [
          {
            title: t('Channels'),
            url: '/channels',
            icon: Radio,
          },
          {
            title: t('Models'),
            url: '/models/metadata',
            icon: Box,
          },
          {
            title: t('Users'),
            url: '/users',
            icon: Users,
          },
          {
            title: t('User Ranking'),
            url: '/user-ranking',
            icon: Trophy,
          },
          {
            title: t('Error Reports'),
            url: '/error-reports',
            icon: TriangleAlert,
          },
          {
            title: t('Redemption Codes'),
            url: '/redemption-codes',
            icon: Ticket,
          },
          {
            title: t('Subscriptions'),
            url: '/subscriptions',
            icon: CreditCard,
          },
          {
            title: t('Group Buy'),
            url: '/groupbuy/admin',
            icon: HandCoins,
          },
          {
            title: t('Rebate'),
            url: '/rebate',
            icon: Gift,
          },
          {
            title: t('Invoice Management'),
            url: '/invoices/admin',
            icon: ReceiptText,
          },
          {
            title: t('Identity Verification Management'),
            url: '/identity-verification/admin',
            icon: BadgeCheck,
          },
          {
            title: t('Lottery Management'),
            url: '/lottery/admin',
            icon: Dices,
          },
          {
            title: t('Changelog'),
            url: '/changelog',
            icon: History,
          },
          {
            title: t('System Info'),
            url: '/system-info',
            icon: ServerCog,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('System Settings'),
            url: '/system-settings/site',
            activeUrls: ['/system-settings'],
            icon: Settings,
          },
        ],
      },
    ],
  }
}

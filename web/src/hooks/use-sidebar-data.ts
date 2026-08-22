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
  Building2,
  CreditCard,
  Dices,
  FileText,
  FlaskConical,
  Gauge,
  Gift,
  HandCoins,
  History,
  Key,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Radio,
  ReceiptText,
  Rocket,
  ServerCog,
  Settings,
  Share2,
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
import { useAuthStore } from '@/stores/auth-store'

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()
  const isAgent = useAuthStore((s) => s.auth.user?.is_agent)

  return {
    navGroups: [
      ...(isAgent
        ? [
            {
              id: 'agent',
              title: t('Agent'),
              items: [
                {
                  title: t('Agent Console'),
                  url: '/agent-console',
                  icon: Share2,
                },
              ],
            },
          ]
        : []),
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
            url: '/playground/chat',
            activeUrls: ['/playground/image', '/playground/video'],
            configUrls: ['/playground'],
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
          {
            title: t('Announcements'),
            url: '/announcements',
            icon: Megaphone,
          },
        ],
      },
      {
        id: 'billing',
        title: t('Billing'),
        items: [
          {
            title: t('Finance Center'),
            url: '/finance/wallet',
            configUrls: ['/finance/wallet'],
            icon: Wallet,
          },
          {
            title: t('Invoices'),
            url: '/finance/invoices',
            configUrls: ['/finance/wallet'],
            icon: ReceiptText,
          },
        ],
      },
      {
        id: 'growth',
        title: t('Growth'),
        items: [
          {
            title: t('Group Buy Hall'),
            url: '/finance/groupbuy',
            activeUrls: ['/groupbuy/detail'],
            configUrls: ['/finance/groupbuy'],
            icon: HandCoins,
          },
          {
            title: t('Lucky Draw'),
            url: '/finance/lottery',
            configUrls: ['/finance/groupbuy'],
            icon: Dices,
          },
          {
            title: t('Invitation'),
            url: '/account/invitation',
            configUrls: ['/account/profile'],
            icon: Gift,
          },
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          {
            title: t('Profile'),
            url: '/account/profile',
            configUrls: ['/account/profile'],
            icon: User,
          },
          {
            title: t('Identity Verification'),
            url: '/account/identity-verification',
            configUrls: ['/account/profile'],
            icon: BadgeCheck,
          },
          {
            title: t('Tickets'),
            url: '/tickets',
            activeUrls: ['/tickets/detail'],
            icon: LifeBuoy,
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
            title: t('Agent Management'),
            url: '/agents',
            icon: Building2,
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
            title: t('Ticket Management'),
            url: '/tickets/admin',
            activeUrls: ['/tickets/admin-detail'],
            icon: LifeBuoy,
          },
          {
            title: t('Announcement Management'),
            url: '/announcements/admin',
            icon: Megaphone,
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

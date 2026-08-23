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
import { beforeAll, describe, expect, it, mock } from 'bun:test';

mock.module('@douyinfe/semi-ui', () => ({
  Button: () => null,
  Divider: () => null,
  Nav: Object.assign(() => null, {
    Item: () => null,
    Sub: () => null,
  }),
}));
mock.module('lucide-react', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
}));
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
mock.module('react-router-dom', () => ({
  Link: () => null,
  NavLink: () => null,
  useLocation: () => ({ pathname: '/' }),
}));
mock.module('../../../helpers/render', () => ({ getLucideIcon: () => null }));
mock.module('../../../helpers', () => ({
  isAdmin: () => true,
  isRoot: () => true,
  showError: () => undefined,
}));
mock.module('../../../hooks/common/useMinimumLoadingTime', () => ({
  useMinimumLoadingTime: () => false,
}));
mock.module('../../../hooks/common/useSidebar', () => ({
  useSidebar: () => ({
    hasSectionVisibleModules: () => true,
    isModuleVisible: () => true,
    loading: false,
  }),
}));
mock.module('../../../hooks/common/useSidebarCollapsed', () => ({
  useSidebarCollapsed: () => [false, () => undefined],
}));
mock.module('../components/SkeletonWrapper', () => ({
  default: ({ children }) => children,
}));

let filterHiddenSidebarItems;
let filterHiddenConsoleSubNavItems;

beforeAll(async () => {
  ({ filterHiddenSidebarItems } = await import('../SiderBar.jsx'));
  ({ filterHiddenConsoleSubNavItems } = await import('../ConsoleSubNav.jsx'));
});

const navigationItems = [
  { itemKey: 'groupbuy_hall', text: 'translated-group-buy-hall' },
  { itemKey: 'invoice', text: 'translated-invoice' },
  { itemKey: 'user_ranking', text: 'translated-user-ranking' },
  { itemKey: 'redemption', text: 'translated-redemption' },
  { itemKey: 'subscription', text: 'translated-subscription' },
  { itemKey: 'groupbuy', text: 'translated-group-buy' },
  { itemKey: 'rebate', text: 'translated-rebate' },
  { itemKey: 'identity_verification', text: 'translated-identity' },
  { itemKey: 'lottery', text: 'translated-lottery' },
  { itemKey: 'invitation', text: 'translated-invitation' },
  { itemKey: 'invite_ranking', text: 'translated-acquisition-ranking' },
];

describe('classic sidebar navigation visibility', () => {
  it('hides selected entries by stable item key and preserves unmarked order', () => {
    const filtered = filterHiddenSidebarItems(navigationItems);

    expect(filtered.map((item) => item.itemKey)).toEqual([
      'invoice',
      'lottery',
      'invitation',
      'invite_ranking',
    ]);
  });
});

describe('classic console sub-navigation visibility', () => {
  it('hides selected entries by stable item key and preserves unmarked order', () => {
    const filtered = filterHiddenConsoleSubNavItems(
      navigationItems.map((item) => ({ key: item.itemKey, text: item.text })),
    );

    expect(filtered.map((item) => item.key)).toEqual([
      'invoice',
      'lottery',
      'invitation',
      'invite_ranking',
    ]);
  });
});

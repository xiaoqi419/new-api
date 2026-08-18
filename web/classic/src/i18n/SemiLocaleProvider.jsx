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

import { LocaleProvider } from '@douyinfe/semi-ui';
import zh_CN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN';
import en_GB from '@douyinfe/semi-ui/lib/es/locale/source/en_GB';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

const SemiLocaleProvider = ({ children }) => {
  const { i18n } = useTranslation();
  const semiLocale = useMemo(
    () => ({ zh: zh_CN, en: en_GB })[i18n.language] || zh_CN,
    [i18n.language],
  );
  return <LocaleProvider locale={semiLocale}>{children}</LocaleProvider>;
};

export default SemiLocaleProvider;

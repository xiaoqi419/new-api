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

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { StatusContext } from '../Status';
import {
  AppearanceContext,
  ActualThemeContext,
  appearancePresetBundles,
  normalizeAppearance,
  resolveAppearancePreset,
  SetThemeContext,
  ThemeContext,
} from '.';

const getStoredAppearance = () => {
  try {
    const raw = localStorage.getItem('ui_appearance');
    if (!raw) {
      return normalizeAppearance(appearancePresetBundles.apimart);
    }
    return resolveAppearancePreset(raw);
  } catch {
    return normalizeAppearance(appearancePresetBundles.apimart);
  }
};

// 检测系统主题偏好
const getSystemTheme = () => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
};

export const ThemeProvider = ({ children }) => {
  const [statusState] = useContext(StatusContext);
  const [storedAppearance] = useState(getStoredAppearance);
  const appearance = useMemo(
    () =>
      resolveAppearancePreset(
        statusState?.status?.ui_appearance || storedAppearance,
      ),
    [statusState?.status?.ui_appearance, storedAppearance],
  );

  // 用户显式选择的主题（未选择时为 null，回退到管理员设定的默认 color_mode）
  const [theme, _setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme-mode') || null;
    } catch {
      return null;
    }
  });

  const [systemTheme, setSystemTheme] = useState(getSystemTheme());

  // 计算实际应用的主题：允许用户切换时，优先用用户选择，否则用管理员默认 color_mode
  const effectiveTheme = appearance.allow_user_color_mode
    ? theme || appearance.color_mode
    : appearance.color_mode;
  const actualTheme = effectiveTheme === 'auto' ? systemTheme : effectiveTheme;

  // 监听系统主题变化
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleSystemThemeChange = (e) => {
        setSystemTheme(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleSystemThemeChange);

      return () => {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      };
    }
  }, []);

  // 应用主题到DOM
  useEffect(() => {
    const body = document.body;
    if (actualTheme === 'dark') {
      body.setAttribute('theme-mode', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      body.removeAttribute('theme-mode');
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.dataset.uiPreset = appearance.preset;
    document.documentElement.dataset.consoleLayout = appearance.console_layout;
    document.documentElement.dataset.contentWidth = appearance.content_width;
  }, [actualTheme, appearance]);

  const setTheme = useCallback((newTheme) => {
    let themeValue;

    if (typeof newTheme === 'boolean') {
      // 向后兼容原有的 boolean 参数
      themeValue = newTheme ? 'dark' : 'light';
    } else if (typeof newTheme === 'string') {
      // 新的字符串参数支持 'light', 'dark', 'auto'
      themeValue = newTheme;
    } else {
      themeValue = 'auto';
    }

    _setTheme(themeValue);
    localStorage.setItem('theme-mode', themeValue);
  }, []);

  return (
    <SetThemeContext.Provider value={setTheme}>
      <ActualThemeContext.Provider value={actualTheme}>
        <ThemeContext.Provider value={effectiveTheme}>
          <AppearanceContext.Provider value={appearance}>
            {children}
          </AppearanceContext.Provider>
        </ThemeContext.Provider>
      </ActualThemeContext.Provider>
    </SetThemeContext.Provider>
  );
};

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
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  useMemo,
} from 'react';
import { StatusContext } from '../Status';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const ActualThemeContext = createContext(null);
export const useActualTheme = () => useContext(ActualThemeContext);

const SetThemeContext = createContext(null);
export const useSetTheme = () => useContext(SetThemeContext);

export const classicAppearance = {
  preset: 'classic',
  color_mode: 'auto',
  console_layout: 'sidebar',
  allow_user_color_mode: false,
  footer_variant: 'default',
  content_width: 'normal',
};

export const apimartAppearance = {
  preset: 'apimart',
  color_mode: 'light',
  console_layout: 'sidebar',
  allow_user_color_mode: true,
  footer_variant: 'wordmark',
  content_width: 'wide',
};

// 本项目默认外观为 apimart（开箱即截图效果）。
export const defaultAppearance = apimartAppearance;

export const appearancePresetBundles = {
  classic: classicAppearance,
  apimart: apimartAppearance,
};

const AppearanceContext = createContext(defaultAppearance);
export const useAppearance = () => useContext(AppearanceContext);

const enumOrDefault = (value, allowed, fallback) =>
  allowed.includes(value) ? value : fallback;

export const normalizeAppearance = (appearance = {}) => {
  let value = appearance || {};
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = {};
    }
  }
  return {
    preset: enumOrDefault(value.preset, ['classic', 'apimart'], 'apimart'),
    color_mode: enumOrDefault(
      value.color_mode,
      ['light', 'dark', 'auto'],
      'light',
    ),
    console_layout: enumOrDefault(
      value.console_layout,
      ['sidebar', 'topnav', 'hybrid'],
      'sidebar',
    ),
    allow_user_color_mode: value.allow_user_color_mode === true,
    footer_variant: enumOrDefault(
      value.footer_variant,
      ['default', 'wordmark'],
      'wordmark',
    ),
    content_width: enumOrDefault(
      value.content_width,
      ['normal', 'compact', 'wide'],
      'wide',
    ),
  };
};

export const resolveAppearancePreset = (appearance = {}) => {
  const normalized = normalizeAppearance(appearance);
  const isLegacyNoopApimart =
    normalized.preset === 'apimart' &&
    normalized.color_mode === classicAppearance.color_mode &&
    normalized.console_layout === classicAppearance.console_layout &&
    normalized.allow_user_color_mode ===
      classicAppearance.allow_user_color_mode &&
    normalized.footer_variant === classicAppearance.footer_variant &&
    normalized.content_width === classicAppearance.content_width;

  if (isLegacyNoopApimart) {
    return normalizeAppearance(appearancePresetBundles.apimart);
  }

  return normalized;
};

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

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
  useContext,
} from 'react';

export const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

export const ActualThemeContext = createContext(null);
export const useActualTheme = () => useContext(ActualThemeContext);

export const SetThemeContext = createContext(null);
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

export const AppearanceContext = createContext(defaultAppearance);
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

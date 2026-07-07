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

import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Select,
  Spin,
  Switch,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, setStatusData, showError, showSuccess } from '../../helpers';
import {
  appearancePresetBundles,
  defaultAppearance,
  normalizeAppearance,
  resolveAppearancePreset,
  useAppearance,
} from '../../context/Theme';
import { StatusContext } from '../../context/Status';

const OPTION_KEY = 'ui_setting.appearance';

const presetCards = [
  {
    key: 'classic',
    title: '当前默认',
    description: '保留当前后台布局和操作习惯，适合密集管理场景。',
  },
  {
    key: 'apimart',
    title: 'APIMart 风格',
    description: '深色产品化控制台、顶部导航、居中内容和模型市场体验。',
  },
];

const AppearanceSetting = () => {
  const { t } = useTranslation();
  const currentAppearance = useAppearance();
  const [statusState, statusDispatch] = useContext(StatusContext);
  const [appearance, setAppearance] = useState(currentAppearance);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedPreset = useMemo(
    () => appearance?.preset || 'classic',
    [appearance?.preset],
  );

  const updateAppearance = (patch) => {
    setAppearance((prev) => normalizeAppearance({ ...prev, ...patch }));
  };

  const selectPreset = (presetKey) => {
    setAppearance(
      normalizeAppearance({
        ...appearance,
        ...(appearancePresetBundles[presetKey] || defaultAppearance),
      }),
    );
  };

  const loadOptions = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      const option = data.find((item) => item.key === OPTION_KEY);
      if (!option?.value) {
        setAppearance(resolveAppearancePreset(currentAppearance));
        return;
      }
      try {
        setAppearance(resolveAppearancePreset(JSON.parse(option.value)));
      } catch (error) {
        setAppearance(resolveAppearancePreset(currentAppearance));
      }
    } catch (error) {
      showError(t('加载外观主题失败'));
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async () => {
    const res = await API.get('/api/status', {
      disableDuplicate: true,
      params: { _: Date.now() },
    });
    const { success, data, message } = res.data;
    if (!success) {
      showError(message || t('刷新状态失败'));
      return;
    }
    statusDispatch({ type: 'set', payload: data });
    setStatusData(data);
  };

  const syncAppearanceImmediately = (normalized) => {
    if (!statusState?.status) {
      return;
    }
    const nextStatus = {
      ...statusState.status,
      ui_appearance: normalized,
    };
    statusDispatch({ type: 'set', payload: nextStatus });
    setStatusData(nextStatus);
  };

  const saveAppearance = async () => {
    setSaving(true);
    try {
      const normalized = normalizeAppearance(appearance);
      const res = await API.put('/api/option/', {
        key: OPTION_KEY,
        value: JSON.stringify(normalized),
      });
      const { success, message } = res.data;
      if (!success) {
        showError(message || t('保存外观主题失败'));
        return;
      }
      syncAppearanceImmediately(normalized);
      await refreshStatus();
      setAppearance(normalized);
      showSuccess(t('外观主题已更新'));
    } catch (error) {
      showError(t('保存外观主题失败'));
    } finally {
      setSaving(false);
    }
  };

  const resetAppearance = () => {
    setAppearance(
      normalizeAppearance({
        ...defaultAppearance,
      }),
    );
  };

  useEffect(() => {
    loadOptions();
  }, []);

  return (
    <Spin spinning={loading}>
      <div className='space-y-4'>
        <Banner
          type='info'
          fullMode={false}
          title={t('外观主题')}
          description={t(
            '管理员控制全站主题，普通用户默认不会看到主题切换入口。',
          )}
        />

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
          {presetCards.map((preset) => {
            const active = selectedPreset === preset.key;
            return (
              <Card
                key={preset.key}
                className={`cursor-pointer !rounded-xl transition-all ${active ? '!border-blue-500' : ''}`}
                onClick={() => selectPreset(preset.key)}
              >
                <div className='flex items-start justify-between gap-4'>
                  <div>
                    <Typography.Title heading={5} className='!mb-2'>
                      {t(preset.title)}
                    </Typography.Title>
                    <Typography.Text type='tertiary'>
                      {t(preset.description)}
                    </Typography.Text>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex-shrink-0 ${active ? 'bg-blue-500 border-blue-500' : 'border-semi-color-border'}`}
                  />
                </div>
                <div className='mt-5 rounded-lg border border-semi-color-border overflow-hidden'>
                  {preset.key === 'apimart' ? (
                    <div className='bg-[#030405] p-4 text-white'>
                      <div className='h-4 w-28 rounded bg-white/80 mb-4' />
                      <div className='grid grid-cols-3 gap-2 mb-3'>
                        <div className='h-12 rounded bg-white/10 border border-white/10' />
                        <div className='h-12 rounded bg-white/10 border border-white/10' />
                        <div className='h-12 rounded bg-white/10 border border-white/10' />
                      </div>
                      <div className='h-24 rounded bg-white/5 border border-white/10' />
                    </div>
                  ) : (
                    <div className='bg-semi-color-bg-0 p-4'>
                      <div className='h-4 w-28 rounded bg-semi-color-fill-2 mb-4' />
                      <div className='flex gap-2'>
                        <div className='h-28 w-16 rounded bg-semi-color-fill-1' />
                        <div className='flex-1 grid grid-cols-2 gap-2'>
                          <div className='rounded bg-semi-color-fill-1' />
                          <div className='rounded bg-semi-color-fill-1' />
                          <div className='rounded bg-semi-color-fill-1' />
                          <div className='rounded bg-semi-color-fill-1' />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        <Card className='!rounded-xl' title={t('基础外观')}>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <Typography.Text strong>{t('颜色模式')}</Typography.Text>
              <Select
                className='w-full mt-2'
                value={appearance.color_mode}
                onChange={(value) => updateAppearance({ color_mode: value })}
                optionList={[
                  { label: t('浅色模式'), value: 'light' },
                  { label: t('深色模式'), value: 'dark' },
                  { label: t('自动模式'), value: 'auto' },
                ]}
              />
            </div>

            <div>
              <Typography.Text strong>{t('控制台布局')}</Typography.Text>
              <Select
                className='w-full mt-2'
                value={appearance.console_layout}
                onChange={(value) =>
                  updateAppearance({ console_layout: value })
                }
                optionList={[
                  { label: t('左侧导航'), value: 'sidebar' },
                  { label: t('顶部导航'), value: 'topnav' },
                  { label: t('混合布局'), value: 'hybrid' },
                ]}
              />
            </div>

            <div>
              <Typography.Text strong>{t('页脚样式')}</Typography.Text>
              <Select
                className='w-full mt-2'
                value={appearance.footer_variant}
                onChange={(value) =>
                  updateAppearance({ footer_variant: value })
                }
                optionList={[
                  { label: t('默认页脚'), value: 'default' },
                  { label: t('大字标页脚'), value: 'wordmark' },
                ]}
              />
            </div>

            <div>
              <Typography.Text strong>{t('内容宽度')}</Typography.Text>
              <Select
                className='w-full mt-2'
                value={appearance.content_width}
                onChange={(value) => updateAppearance({ content_width: value })}
                optionList={[
                  { label: t('标准'), value: 'normal' },
                  { label: t('紧凑'), value: 'compact' },
                  { label: t('宽屏'), value: 'wide' },
                ]}
              />
            </div>
          </div>

          <div className='flex items-center justify-between mt-5 p-3 rounded-lg bg-semi-color-fill-0'>
            <div>
              <Typography.Text strong>
                {t('允许普通用户切换明暗模式')}
              </Typography.Text>
              <div className='text-xs text-semi-color-text-2 mt-1'>
                {t('关闭后，普通用户将使用管理员设置的颜色模式。')}
              </div>
            </div>
            <Switch
              checked={appearance.allow_user_color_mode}
              onChange={(checked) =>
                updateAppearance({ allow_user_color_mode: checked })
              }
            />
          </div>
        </Card>

        <div className='flex justify-end gap-3'>
          <Button onClick={resetAppearance}>{t('重置为默认主题')}</Button>
          <Button
            type='primary'
            theme='solid'
            loading={saving}
            onClick={saveAppearance}
          >
            {t('保存外观设置')}
          </Button>
        </div>
      </div>
    </Spin>
  );
};

export default AppearanceSetting;

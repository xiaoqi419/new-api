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

import React, { useContext, useEffect, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Input,
  Select,
  Space,
  Spin,
  TabPane,
  Tabs,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API, setStatusData, showError, showSuccess } from '../../helpers';
import { StatusContext } from '../../context/Status';
import {
  defaultApimartHomeConfig,
  modelSizeOptions,
  modelToneOptions,
  normalizeApimartHomeConfig,
  providerIconOptions,
} from '../../constants/apimartHome';

const OPTION_KEY = 'ui_setting.apimart_home';

const newItems = {
  stats: { value: '100+', label: '指标名称' },
  featured_models: {
    name: 'New Model API',
    vendor: 'Provider',
    price: '$0.01',
    size: 'small',
    tone: 'cyan',
    icon: 'openai',
    image: '',
  },
  steps: {
    step: '01',
    title: '步骤标题',
    description: '步骤描述',
  },
  api_use_cases: {
    name: 'Custom API',
    title: 'API 标题',
    description: 'API 描述',
    bullets: ['能力说明'],
    button: '探索 API',
    image: '/cover-4.webp',
  },
  value_props: {
    index: '01',
    title: '卖点标题',
    description: '卖点描述',
  },
  providers: { name: 'Provider', icon: 'openai' },
  faq: { question: '问题标题', answer: '回答内容' },
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const Field = ({ label, children }) => (
  <label className='block'>
    <Typography.Text strong>{label}</Typography.Text>
    <div className='mt-2'>{children}</div>
  </label>
);

const ArrayCard = ({ title, description, children, onAdd, addText }) => (
  <Card
    className='!rounded-xl'
    title={
      <div>
        <Typography.Title heading={5} className='!mb-1'>
          {title}
        </Typography.Title>
        {description && (
          <Typography.Text type='tertiary'>{description}</Typography.Text>
        )}
      </div>
    }
    headerExtraContent={
      <Button icon={<Plus size={14} />} onClick={onAdd}>
        {addText}
      </Button>
    }
  >
    <div className='space-y-4'>{children}</div>
  </Card>
);

const ApimartHomeSetting = () => {
  const { t } = useTranslation();
  const [statusState, statusDispatch] = useContext(StatusContext);
  const [home, setHome] = useState(defaultApimartHomeConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateHero = (patch) => {
    setHome((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        ...patch,
      },
    }));
  };

  const updateSectionTitles = (patch) => {
    setHome((prev) => ({
      ...prev,
      section_titles: {
        ...prev.section_titles,
        ...patch,
      },
    }));
  };

  const updateItem = (section, index, patch) => {
    setHome((prev) => ({
      ...prev,
      [section]: prev[section].map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const addItem = (section) => {
    setHome((prev) => ({
      ...prev,
      [section]: [...prev[section], clone(newItems[section])],
    }));
  };

  const removeItem = (section, index) => {
    setHome((prev) => ({
      ...prev,
      [section]: prev[section].filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const loadOptions = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      const { success, message, data } = res.data;
      if (!success) {
        showError(message || t('加载 APIMart 首页配置失败'));
        return;
      }
      const option = data.find((item) => item.key === OPTION_KEY);
      setHome(
        normalizeApimartHomeConfig(
          option?.value || statusState?.status?.apimart_home,
        ),
      );
    } catch (error) {
      showError(t('加载 APIMart 首页配置失败'));
    } finally {
      setLoading(false);
    }
  };

  const syncStatus = (nextHome) => {
    if (!statusState?.status) {
      return;
    }
    const nextStatus = {
      ...statusState.status,
      apimart_home: nextHome,
    };
    statusDispatch({ type: 'set', payload: nextStatus });
    setStatusData(nextStatus);
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

  const saveHome = async () => {
    setSaving(true);
    try {
      const normalized = normalizeApimartHomeConfig(home);
      const res = await API.put('/api/option/', {
        key: OPTION_KEY,
        value: JSON.stringify(normalized),
      });
      const { success, message } = res.data;
      if (!success) {
        showError(message || t('保存 APIMart 首页配置失败'));
        return;
      }
      setHome(normalized);
      syncStatus(normalized);
      await refreshStatus();
      showSuccess(t('APIMart 首页配置已保存'));
    } catch (error) {
      showError(t('保存 APIMart 首页配置失败'));
    } finally {
      setSaving(false);
    }
  };

  const resetHome = () => {
    setHome(clone(defaultApimartHomeConfig));
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
          title={t('APIMart 首页配置')}
          description={t(
            '这里配置 APIMart 风格首页的热门模型、API 展示、卖点、供应商和 FAQ。保存后首页立即使用这些内容。',
          )}
        />

        <Tabs type='card' keepDOM={false}>
          <TabPane tab={t('首屏')} itemKey='hero'>
            <Card className='!rounded-xl' title={t('首屏文案')}>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Field label={t('主标题')}>
                  <Input
                    value={home.hero.title}
                    onChange={(value) => updateHero({ title: value })}
                  />
                </Field>
                <Field label={t('副标题')}>
                  <Input
                    value={home.hero.subtitle}
                    onChange={(value) => updateHero({ subtitle: value })}
                  />
                </Field>
                <Field label={t('辅助说明')}>
                  <Input
                    value={home.hero.subnote}
                    onChange={(value) => updateHero({ subnote: value })}
                  />
                </Field>
                <Field label={t('主按钮文案')}>
                  <Input
                    value={home.hero.primary_button_text}
                    onChange={(value) =>
                      updateHero({ primary_button_text: value })
                    }
                  />
                </Field>
                <Field label={t('副按钮文案')}>
                  <Input
                    value={home.hero.secondary_button_text}
                    onChange={(value) =>
                      updateHero({ secondary_button_text: value })
                    }
                  />
                </Field>
              </div>
            </Card>

            <Card className='!rounded-xl' title={t('区块标题')}>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Field label={t('热门模型标题')}>
                  <Input
                    value={home.section_titles.hot_models}
                    onChange={(value) =>
                      updateSectionTitles({ hot_models: value })
                    }
                  />
                </Field>
                <Field label={t('三步接入标题')}>
                  <Input
                    value={home.section_titles.steps}
                    onChange={(value) => updateSectionTitles({ steps: value })}
                  />
                </Field>
                <Field label={t('三步接入副标题')}>
                  <Input
                    value={home.section_titles.steps_subtitle}
                    onChange={(value) =>
                      updateSectionTitles({ steps_subtitle: value })
                    }
                  />
                </Field>
                <Field label={t('API 展示标题')}>
                  <Input
                    value={home.section_titles.api_use_cases}
                    onChange={(value) =>
                      updateSectionTitles({ api_use_cases: value })
                    }
                  />
                </Field>
                <Field label={t('卖点标题')}>
                  <Input
                    value={home.section_titles.value_props}
                    onChange={(value) =>
                      updateSectionTitles({ value_props: value })
                    }
                  />
                </Field>
                <Field label={t('供应商标题')}>
                  <Input
                    value={home.section_titles.providers}
                    onChange={(value) =>
                      updateSectionTitles({ providers: value })
                    }
                  />
                </Field>
                <Field label={t('FAQ 标题')}>
                  <Input
                    value={home.section_titles.faq}
                    onChange={(value) => updateSectionTitles({ faq: value })}
                  />
                </Field>
              </div>
              <Typography.Text type='tertiary'>
                {t('标题里可使用 {site} 自动替换为当前站点名称。')}
              </Typography.Text>
            </Card>

            <ArrayCard
              title={t('统计数字')}
              description={t('首屏下方的 4 个指标，可增删。')}
              addText={t('新增指标')}
              onAdd={() => addItem('stats')}
            >
              {home.stats.map((item, index) => (
                <div
                  className='grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end'
                  key={index}
                >
                  <Field label={t('数值')}>
                    <Input
                      value={item.value}
                      onChange={(value) =>
                        updateItem('stats', index, { value })
                      }
                    />
                  </Field>
                  <Field label={t('标题')}>
                    <Input
                      value={item.label}
                      onChange={(value) =>
                        updateItem('stats', index, { label: value })
                      }
                    />
                  </Field>
                  <Button
                    type='danger'
                    theme='light'
                    icon={<Trash2 size={14} />}
                    onClick={() => removeItem('stats', index)}
                  />
                </div>
              ))}
            </ArrayCard>
          </TabPane>

          <TabPane tab={t('热门模型')} itemKey='models'>
            <ArrayCard
              title={t('热门 AI API 模型')}
              description={t('对应首页模型拼图区域。尺寸会影响卡片占位。')}
              addText={t('新增模型')}
              onAdd={() => addItem('featured_models')}
            >
              {home.featured_models.map((item, index) => (
                <Card className='!rounded-lg' key={index}>
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                    <Field label={t('模型名称')}>
                      <Input
                        value={item.name}
                        onChange={(value) =>
                          updateItem('featured_models', index, { name: value })
                        }
                      />
                    </Field>
                    <Field label={t('供应商')}>
                      <Input
                        value={item.vendor}
                        onChange={(value) =>
                          updateItem('featured_models', index, {
                            vendor: value,
                          })
                        }
                      />
                    </Field>
                    <Field label={t('价格标签')}>
                      <Input
                        value={item.price}
                        onChange={(value) =>
                          updateItem('featured_models', index, { price: value })
                        }
                      />
                    </Field>
                    <Field label={t('背景图 URL')}>
                      <Input
                        value={item.image || ''}
                        placeholder='/cover-1.webp 或 https://...'
                        onChange={(value) =>
                          updateItem('featured_models', index, {
                            image: value,
                          })
                        }
                      />
                    </Field>
                    <Field label={t('图标')}>
                      <Select
                        value={item.icon}
                        optionList={providerIconOptions.map((option) => ({
                          ...option,
                          label: t(option.label),
                        }))}
                        onChange={(value) =>
                          updateItem('featured_models', index, { icon: value })
                        }
                      />
                    </Field>
                    <Field label={t('卡片尺寸')}>
                      <Select
                        value={item.size}
                        optionList={modelSizeOptions.map((option) => ({
                          ...option,
                          label: t(option.label),
                        }))}
                        onChange={(value) =>
                          updateItem('featured_models', index, { size: value })
                        }
                      />
                    </Field>
                    <Field label={t('色调')}>
                      <Select
                        value={item.tone}
                        optionList={modelToneOptions.map((option) => ({
                          ...option,
                          label: t(option.label),
                        }))}
                        onChange={(value) =>
                          updateItem('featured_models', index, { tone: value })
                        }
                      />
                    </Field>
                  </div>
                  <div className='flex justify-end mt-3'>
                    <Button
                      type='danger'
                      theme='light'
                      icon={<Trash2 size={14} />}
                      onClick={() => removeItem('featured_models', index)}
                    >
                      {t('删除')}
                    </Button>
                  </div>
                </Card>
              ))}
            </ArrayCard>
          </TabPane>

          <TabPane tab={t('API 展示')} itemKey='api'>
            <ArrayCard
              title={t('适合任何项目的 API')}
              description={t('对应 Chat API / Image API / Video API 标签页。')}
              addText={t('新增 API')}
              onAdd={() => addItem('api_use_cases')}
            >
              {home.api_use_cases.map((item, index) => (
                <Card className='!rounded-lg' key={index}>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                    <Field label={t('标签名称')}>
                      <Input
                        value={item.name}
                        onChange={(value) =>
                          updateItem('api_use_cases', index, { name: value })
                        }
                      />
                    </Field>
                    <Field label={t('按钮文案')}>
                      <Input
                        value={item.button}
                        onChange={(value) =>
                          updateItem('api_use_cases', index, { button: value })
                        }
                      />
                    </Field>
                    <Field label={t('展示图片 URL')}>
                      <Input
                        value={item.image || ''}
                        placeholder='/cover-4.webp 或 https://...'
                        onChange={(value) =>
                          updateItem('api_use_cases', index, { image: value })
                        }
                      />
                    </Field>
                    <Field label={t('标题')}>
                      <Input
                        value={item.title}
                        onChange={(value) =>
                          updateItem('api_use_cases', index, { title: value })
                        }
                      />
                    </Field>
                    <Field label={t('要点，每行一个')}>
                      <TextArea
                        rows={3}
                        value={(item.bullets || []).join('\n')}
                        onChange={(value) =>
                          updateItem('api_use_cases', index, {
                            bullets: value
                              .split('\n')
                              .map((line) => line.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className='mt-3'>
                    <Field label={t('描述')}>
                      <TextArea
                        rows={3}
                        value={item.description}
                        onChange={(value) =>
                          updateItem('api_use_cases', index, {
                            description: value,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className='flex justify-end mt-3'>
                    <Button
                      type='danger'
                      theme='light'
                      icon={<Trash2 size={14} />}
                      onClick={() => removeItem('api_use_cases', index)}
                    >
                      {t('删除')}
                    </Button>
                  </div>
                </Card>
              ))}
            </ArrayCard>
          </TabPane>

          <TabPane tab={t('步骤和卖点')} itemKey='values'>
            <ArrayCard
              title={t('三步接入')}
              addText={t('新增步骤')}
              onAdd={() => addItem('steps')}
            >
              {home.steps.map((item, index) => (
                <div
                  className='grid grid-cols-1 md:grid-cols-[100px_1fr_2fr_auto] gap-3 items-end'
                  key={index}
                >
                  <Field label={t('编号')}>
                    <Input
                      value={item.step}
                      onChange={(value) =>
                        updateItem('steps', index, { step: value })
                      }
                    />
                  </Field>
                  <Field label={t('标题')}>
                    <Input
                      value={item.title}
                      onChange={(value) =>
                        updateItem('steps', index, { title: value })
                      }
                    />
                  </Field>
                  <Field label={t('描述')}>
                    <Input
                      value={item.description}
                      onChange={(value) =>
                        updateItem('steps', index, { description: value })
                      }
                    />
                  </Field>
                  <Button
                    type='danger'
                    theme='light'
                    icon={<Trash2 size={14} />}
                    onClick={() => removeItem('steps', index)}
                  />
                </div>
              ))}
            </ArrayCard>

            <ArrayCard
              title={t('平台卖点')}
              addText={t('新增卖点')}
              onAdd={() => addItem('value_props')}
            >
              {home.value_props.map((item, index) => (
                <Card className='!rounded-lg' key={index}>
                  <div className='grid grid-cols-1 md:grid-cols-[100px_1fr] gap-3'>
                    <Field label={t('编号')}>
                      <Input
                        value={item.index}
                        onChange={(value) =>
                          updateItem('value_props', index, { index: value })
                        }
                      />
                    </Field>
                    <Field label={t('标题')}>
                      <Input
                        value={item.title}
                        onChange={(value) =>
                          updateItem('value_props', index, { title: value })
                        }
                      />
                    </Field>
                  </div>
                  <div className='mt-3'>
                    <Field label={t('描述')}>
                      <TextArea
                        rows={2}
                        value={item.description}
                        onChange={(value) =>
                          updateItem('value_props', index, {
                            description: value,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className='flex justify-end mt-3'>
                    <Button
                      type='danger'
                      theme='light'
                      icon={<Trash2 size={14} />}
                      onClick={() => removeItem('value_props', index)}
                    >
                      {t('删除')}
                    </Button>
                  </div>
                </Card>
              ))}
            </ArrayCard>
          </TabPane>

          <TabPane tab={t('供应商和 FAQ')} itemKey='faq'>
            <ArrayCard
              title={t('供应商 Logo')}
              addText={t('新增供应商')}
              onAdd={() => addItem('providers')}
            >
              {home.providers.map((item, index) => (
                <div
                  className='grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end'
                  key={index}
                >
                  <Field label={t('名称')}>
                    <Input
                      value={item.name}
                      onChange={(value) =>
                        updateItem('providers', index, { name: value })
                      }
                    />
                  </Field>
                  <Field label={t('图标')}>
                    <Select
                      value={item.icon}
                      optionList={providerIconOptions.map((option) => ({
                        ...option,
                        label: t(option.label),
                      }))}
                      onChange={(value) =>
                        updateItem('providers', index, { icon: value })
                      }
                    />
                  </Field>
                  <Button
                    type='danger'
                    theme='light'
                    icon={<Trash2 size={14} />}
                    onClick={() => removeItem('providers', index)}
                  />
                </div>
              ))}
            </ArrayCard>

            <ArrayCard
              title={t('常见问题')}
              addText={t('新增 FAQ')}
              onAdd={() => addItem('faq')}
            >
              {home.faq.map((item, index) => (
                <Card className='!rounded-lg' key={index}>
                  <Field label={t('问题')}>
                    <Input
                      value={item.question}
                      onChange={(value) =>
                        updateItem('faq', index, { question: value })
                      }
                    />
                  </Field>
                  <div className='mt-3'>
                    <Field label={t('回答')}>
                      <TextArea
                        rows={3}
                        value={item.answer}
                        onChange={(value) =>
                          updateItem('faq', index, { answer: value })
                        }
                      />
                    </Field>
                  </div>
                  <div className='flex justify-end mt-3'>
                    <Button
                      type='danger'
                      theme='light'
                      icon={<Trash2 size={14} />}
                      onClick={() => removeItem('faq', index)}
                    >
                      {t('删除')}
                    </Button>
                  </div>
                </Card>
              ))}
            </ArrayCard>
          </TabPane>
        </Tabs>

        <div className='flex justify-end'>
          <Space>
            <Button icon={<RotateCcw size={14} />} onClick={resetHome}>
              {t('恢复默认首页')}
            </Button>
            <Button
              type='primary'
              theme='solid'
              loading={saving}
              onClick={saveHome}
            >
              {t('保存首页配置')}
            </Button>
          </Space>
        </div>
      </div>
    </Spin>
  );
};

export default ApimartHomeSetting;

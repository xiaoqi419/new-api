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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tag,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { API, copy, renderQuota, showError, showSuccess } from '../../helpers';
import { fetchTokenKey } from '../../helpers/token';

const { Title, Text } = Typography;

const MODEL_OPTIONS = [
  { label: 'doubao-seedance-2-0-260128', value: 'doubao-seedance-2-0-260128' },
  {
    label: 'doubao-seedance-2-0-fast-260128',
    value: 'doubao-seedance-2-0-fast-260128',
  },
];
const RESOLUTION_OPTIONS = ['480p', '720p', '1080p'];
const RATIO_OPTIONS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'];

const isSuccessStatus = (s) => (s || '').toUpperCase() === 'SUCCESS';
const isFailStatus = (s) => (s || '').toUpperCase().includes('FAIL');

const setAt = (list, i, v) => list.map((x, idx) => (idx === i ? v : x));
const removeAt = (list, i) => list.filter((_, idx) => idx !== i);

const extractError = (e) => {
  const d = e.response?.data;
  if (d?.error?.message) return d.error.message;
  if (d?.message) {
    try {
      const inner = JSON.parse(d.message);
      if (inner?.error?.message) return inner.error.message;
    } catch (_) {
      /* message 非 JSON，直接返回 */
    }
    return d.message;
  }
  return e.message;
};

const VideoGeneration = () => {
  const { t } = useTranslation();

  const [apiKey, setApiKey] = useState('');
  const [tokenOptions, setTokenOptions] = useState([]);
  const [assets, setAssets] = useState([]);

  const [mode, setMode] = useState('text');
  const [prompt, setPrompt] = useState('');
  const [firstFrame, setFirstFrame] = useState('');
  const [lastFrame, setLastFrame] = useState('');
  const [refImages, setRefImages] = useState(['']);
  const [refVideos, setRefVideos] = useState([]);
  const [refAudios, setRefAudios] = useState([]);
  const [model, setModel] = useState('doubao-seedance-2-0-260128');
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(false);
  const [watermark, setWatermark] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get('/api/token/?p=1&size=100');
        const { success, data } = res.data;
        if (!success) {
          showError(t('加载令牌失败'));
          return;
        }
        const items = Array.isArray(data) ? data : data?.items || [];
        const active = items.filter((tk) => tk.status === 1);
        const opts = [];
        for (const tk of active) {
          try {
            const key = await fetchTokenKey(tk.id);
            opts.push({
              label: `${tk.name || '#' + tk.id} (sk-${key.slice(0, 6)}…)`,
              value: 'sk-' + key,
            });
          } catch (_) {
            /* 跳过取密钥失败的令牌 */
          }
        }
        setTokenOptions(opts);
        if (opts.length > 0) {
          setApiKey(opts[0].value);
        } else {
          showError(t('没有可用的启用令牌，请先在「API 密钥」创建一个'));
        }
      } catch (e) {
        showError(extractError(e));
      }
    })();
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAssets = useCallback(async () => {
    try {
      const res = await API.get('/api/ark_asset');
      const { success, data } = res.data;
      if (success) {
        setAssets((data || []).filter((a) => a.status === 'Active'));
      }
    } catch (e) {
      /* 素材库为可选，失败不阻断 */
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const buildContent = () => {
    const items = [];
    const push = (url, type, role) => {
      const u = (url || '').trim();
      if (!u) return;
      items.push({ type, [type]: { url: u }, role });
    };
    if (mode === 'first' || mode === 'firstlast') {
      push(firstFrame, 'image_url', 'first_frame');
    }
    if (mode === 'firstlast') {
      push(lastFrame, 'image_url', 'last_frame');
    }
    if (mode === 'reference') {
      refImages.forEach((u) => push(u, 'image_url', 'reference_image'));
      refVideos.forEach((u) => push(u, 'video_url', 'reference_video'));
      refAudios.forEach((u) => push(u, 'audio_url', 'reference_audio'));
    }
    return items;
  };

  const buildBody = () => {
    const metadata = {
      resolution,
      ratio,
      generate_audio: generateAudio,
      watermark,
    };
    const content = buildContent();
    if (content.length > 0) metadata.content = content;
    return {
      model,
      prompt: prompt.trim(),
      seconds: String(duration),
      metadata,
    };
  };

  const pollTask = useCallback(
    (taskId) => {
      const tick = async () => {
        try {
          const res = await axios.get(`/v1/video/generations/${taskId}`, {
            headers: { Authorization: 'Bearer ' + apiKey },
          });
          const data = res.data?.data || {};
          setProgress(data.progress || '');
          if (isSuccessStatus(data.status)) {
            setPolling(false);
            setResult({ url: data.result_url, quota: data.quota });
            showSuccess(t('视频生成完成'));
            return;
          }
          if (isFailStatus(data.status)) {
            setPolling(false);
            setErrorMsg(data.fail_reason || t('生成失败'));
            return;
          }
          timerRef.current = setTimeout(tick, 5000);
        } catch (e) {
          setPolling(false);
          setErrorMsg(extractError(e));
        }
      };
      tick();
    },
    [apiKey, t],
  );

  const handleSubmit = async () => {
    if (!apiKey) {
      showError(t('没有可用令牌'));
      return;
    }
    if (!prompt.trim()) {
      showError(t('请填写提示词'));
      return;
    }
    if (mode === 'first' && !firstFrame.trim()) {
      showError(t('请填写首帧图片 URL 或选择素材库素材'));
      return;
    }
    if (mode === 'firstlast' && (!firstFrame.trim() || !lastFrame.trim())) {
      showError(t('首尾帧模式需同时填写首帧和尾帧'));
      return;
    }
    if (mode === 'reference' && buildContent().length === 0) {
      showError(t('参考模式请至少提供一个参考素材（图/视频/音频）'));
      return;
    }
    clearTimeout(timerRef.current);
    setSubmitting(true);
    setErrorMsg('');
    setResult(null);
    setProgress('');
    try {
      const res = await axios.post('/v1/video/generations', buildBody(), {
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
      });
      const taskId = res.data?.task_id || res.data?.id;
      if (!taskId) {
        setErrorMsg(t('提交失败：未返回任务 ID'));
        return;
      }
      setPolling(true);
      pollTask(taskId);
    } catch (e) {
      setErrorMsg(extractError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const assetOptions = assets.map((a) => ({
    label: `${a.name || a.asset_id} (asset://${a.asset_id})`,
    value: `asset://${a.asset_id}`,
  }));

  const renderImageInput = (value, onChange, placeholder) => (
    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
      <Input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{ flex: 1 }}
      />
      {assetOptions.length > 0 && (
        <Select
          style={{ width: 150 }}
          placeholder={t('素材库')}
          optionList={assetOptions}
          onChange={onChange}
        />
      )}
    </div>
  );

  const renderList = (label, list, setList, max, type) => (
    <div style={{ width: '100%' }}>
      <Text strong>{`${label} (${list.length}/${max})`}</Text>
      {list.map((url, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Input
            value={url}
            onChange={(v) => setList(setAt(list, i, v))}
            placeholder={
              type === 'image' ? t('https:// 或 asset://') : t('公网 URL')
            }
            style={{ flex: 1 }}
          />
          {type === 'image' && assetOptions.length > 0 && (
            <Select
              style={{ width: 130 }}
              placeholder={t('素材库')}
              optionList={assetOptions}
              onChange={(v) => setList(setAt(list, i, v))}
            />
          )}
          <Button
            theme='borderless'
            type='danger'
            onClick={() => setList(removeAt(list, i))}
          >
            {t('删除')}
          </Button>
        </div>
      ))}
      {list.length < max && (
        <Button
          theme='light'
          style={{ marginTop: 8 }}
          onClick={() => setList([...list, ''])}
        >
          {t('+ 添加')}
        </Button>
      )}
    </div>
  );

  return (
    <div className='mt-[60px] px-2'>
      <Title heading={4} style={{ marginBottom: 4 }}>
        {t('视频生成')}
      </Title>
      <Text type='tertiary'>
        {t(
          '即梦 Seedance 2.0：文生 / 图生（首帧）/ 首尾帧 / 多模态参考（图·视频·音频）。素材填公网 URL 或从素材库选择（asset://，真人请走素材库，无需活体）。',
        )}
      </Text>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} md={12} style={{ marginBottom: 16 }}>
          <Card title={t('参数')}>
            <Space
              vertical
              align='start'
              spacing='loose'
              style={{ width: '100%' }}
            >
              <div style={{ width: '100%' }}>
                <Text strong>{t('API 密钥')}</Text>
                <Select
                  style={{ width: '100%' }}
                  value={apiKey}
                  onChange={setApiKey}
                  optionList={tokenOptions}
                  filter
                  allowCreate
                  placeholder={t('选择你的令牌，或粘贴 sk- 密钥')}
                />
                <Text type='tertiary' size='small'>
                  {t('默认使用你的第一个启用令牌，可切换或粘贴其他 sk- 密钥')}
                </Text>
              </div>

              <div style={{ width: '100%' }}>
                <Text strong>{t('生成模式')}</Text>
                <Select
                  style={{ width: '100%' }}
                  value={mode}
                  onChange={setMode}
                  optionList={[
                    { label: t('文生视频'), value: 'text' },
                    { label: t('图生视频·首帧'), value: 'first' },
                    { label: t('首尾帧视频'), value: 'firstlast' },
                    {
                      label: t('多模态参考（图/视频/音频）'),
                      value: 'reference',
                    },
                  ]}
                />
              </div>

              <div style={{ width: '100%' }}>
                <Text strong>{t('提示词')}</Text>
                <TextArea
                  rows={3}
                  value={prompt}
                  onChange={setPrompt}
                  placeholder={t(
                    '描述画面内容；参考模式可用「图片1」「视频1」「音频1」指代素材（按同类出现顺序）',
                  )}
                />
              </div>

              {(mode === 'first' || mode === 'firstlast') && (
                <div style={{ width: '100%' }}>
                  <Text strong>{t('首帧图片')}</Text>
                  {renderImageInput(
                    firstFrame,
                    setFirstFrame,
                    t('https:// 或 asset://'),
                  )}
                </div>
              )}

              {mode === 'firstlast' && (
                <div style={{ width: '100%' }}>
                  <Text strong>{t('尾帧图片')}</Text>
                  {renderImageInput(
                    lastFrame,
                    setLastFrame,
                    t('https:// 或 asset://'),
                  )}
                </div>
              )}

              {mode === 'reference' && (
                <>
                  {renderList(t('参考图'), refImages, setRefImages, 9, 'image')}
                  {renderList(
                    t('参考视频'),
                    refVideos,
                    setRefVideos,
                    3,
                    'video',
                  )}
                  {renderList(
                    t('参考音频'),
                    refAudios,
                    setRefAudios,
                    3,
                    'audio',
                  )}
                </>
              )}

              <div style={{ width: '100%' }}>
                <Text strong>{t('模型')}</Text>
                <Select
                  style={{ width: '100%' }}
                  value={model}
                  onChange={setModel}
                  filter
                  allowCreate
                  optionList={MODEL_OPTIONS}
                />
              </div>

              <Row gutter={12} style={{ width: '100%' }}>
                <Col span={12}>
                  <Text strong>{t('分辨率')}</Text>
                  <Select
                    style={{ width: '100%' }}
                    value={resolution}
                    onChange={setResolution}
                    optionList={RESOLUTION_OPTIONS.map((r) => ({
                      label: r,
                      value: r,
                    }))}
                  />
                </Col>
                <Col span={12}>
                  <Text strong>{t('宽高比')}</Text>
                  <Select
                    style={{ width: '100%' }}
                    value={ratio}
                    onChange={setRatio}
                    optionList={RATIO_OPTIONS.map((r) => ({
                      label: r,
                      value: r,
                    }))}
                  />
                </Col>
              </Row>

              <div style={{ width: '100%' }}>
                <Text strong>
                  {t('时长（秒）：')}
                  {duration}
                </Text>
                <Slider
                  min={4}
                  max={15}
                  value={duration}
                  onChange={setDuration}
                />
              </div>

              <Space>
                <Switch checked={generateAudio} onChange={setGenerateAudio} />
                <Text>{t('生成音频')}</Text>
                <Switch checked={watermark} onChange={setWatermark} />
                <Text>{t('水印')}</Text>
              </Space>

              <Button
                theme='solid'
                block
                loading={submitting || polling}
                onClick={handleSubmit}
              >
                {polling ? t('生成中...') : t('生成视频')}
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12} style={{ marginBottom: 16 }}>
          <Card title={t('结果')}>
            {errorMsg && (
              <Banner
                type='danger'
                description={errorMsg}
                closeIcon={null}
                style={{ marginBottom: 12 }}
              />
            )}
            {(submitting || polling) && !result && (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin size='large' />
                <div style={{ marginTop: 12 }}>
                  <Text type='tertiary'>
                    {t('任务处理中')} {progress}
                  </Text>
                </div>
              </div>
            )}
            {result && result.url && (
              <Space vertical align='start' style={{ width: '100%' }}>
                <video
                  src={result.url}
                  controls
                  style={{ width: '100%', borderRadius: 8, background: '#000' }}
                />
                {typeof result.quota === 'number' && (
                  <Tag color='blue'>
                    {t('本次消耗：')}
                    {renderQuota(result.quota)}
                  </Tag>
                )}
                <Space>
                  <Button
                    theme='solid'
                    onClick={() => window.open(result.url, '_blank')}
                  >
                    {t('下载 / 打开')}
                  </Button>
                  <Button
                    theme='light'
                    onClick={async () => {
                      if (await copy(result.url)) showSuccess(t('已复制链接'));
                    }}
                  >
                    {t('复制链接')}
                  </Button>
                </Space>
                <Text type='tertiary' size='small'>
                  {t('视频链接有效期约 24 小时，请及时转存。')}
                </Text>
              </Space>
            )}
            {!submitting && !polling && !result && !errorMsg && (
              <Text type='tertiary'>{t('填写左侧参数后点击「生成视频」')}</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default VideoGeneration;

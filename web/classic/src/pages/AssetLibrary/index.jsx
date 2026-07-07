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
  Button,
  Card,
  Col,
  Input,
  Popconfirm,
  Row,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  API,
  copy,
  showError,
  showSuccess,
  timestamp2string,
} from '../../helpers';

const { Title, Text } = Typography;

const isTerminal = (status) => status === 'Active' || status === 'Failed';

const AssetLibrary = () => {
  const { t } = useTranslation();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const timerRef = useRef(null);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/ark_asset');
      const { success, message, data } = res.data;
      if (success) {
        setAssets(data || []);
      } else {
        showError(message || t('加载失败'));
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAssets();
    return () => clearTimeout(timerRef.current);
  }, [fetchAssets]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    const hasPending = assets.some((a) => !isTerminal(a.status));
    if (hasPending) {
      timerRef.current = setTimeout(fetchAssets, 5000);
    }
    return () => clearTimeout(timerRef.current);
  }, [assets, fetchAssets]);

  const handleAdd = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//.test(trimmed)) {
      showError(t('请填写公网可访问的图片 URL（http/https）'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await API.post('/api/ark_asset', {
        name: name.trim(),
        url: trimmed,
        asset_type: 'Image',
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('已提交，正在处理'));
        setName('');
        setUrl('');
        fetchAssets();
      } else {
        showError(message || t('添加失败'));
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (assetId) => {
    try {
      const res = await API.delete(`/api/ark_asset/${assetId}`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('已删除'));
        fetchAssets();
      } else {
        showError(message || t('删除失败'));
      }
    } catch (e) {
      showError(e.message);
    }
  };

  const handleCopy = async (assetId) => {
    const ref = `asset://${assetId}`;
    if (await copy(ref)) {
      showSuccess(t('已复制引用：') + ref);
    } else {
      showError(ref);
    }
  };

  const renderStatus = (status) => {
    if (status === 'Active') {
      return <Tag color='green'>{t('已就绪')}</Tag>;
    }
    if (status === 'Failed') {
      return <Tag color='red'>{t('失败')}</Tag>;
    }
    return <Tag color='orange'>{t('处理中')}</Tag>;
  };

  const columns = [
    {
      title: t('预览'),
      dataIndex: 'url',
      width: 80,
      render: (assetUrl) =>
        assetUrl ? (
          <img
            src={assetUrl}
            alt=''
            style={{
              width: 44,
              height: 44,
              objectFit: 'cover',
              borderRadius: 6,
            }}
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        ) : (
          '-'
        ),
    },
    { title: t('名称'), dataIndex: 'name' },
    { title: t('类型'), dataIndex: 'asset_type' },
    { title: t('状态'), dataIndex: 'status', render: renderStatus },
    {
      title: t('引用 ID'),
      dataIndex: 'asset_id',
      render: (assetId) => (
        <Button
          theme='borderless'
          type='primary'
          size='small'
          onClick={() => handleCopy(assetId)}
        >
          {`asset://${assetId}`}
        </Button>
      ),
    },
    {
      title: t('创建时间'),
      dataIndex: 'created_time',
      render: (ts) => (ts ? timestamp2string(ts) : '-'),
    },
    {
      title: t('操作'),
      dataIndex: 'op',
      render: (_, record) => (
        <Popconfirm
          title={t('确定删除该素材？')}
          onConfirm={() => handleDelete(record.asset_id)}
        >
          <Button theme='light' type='danger' size='small'>
            {t('删除')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className='mt-[60px] px-2'>
      <Title heading={4} style={{ marginBottom: 4 }}>
        {t('素材库')}
      </Title>
      <Text type='tertiary'>
        {t(
          '上传人脸/形象图片到私域素材库，处理完成后可在视频生成中通过 asset:// 引用。仅支持公网可访问的图片 URL。',
        )}
      </Text>

      <Card style={{ marginTop: 16, marginBottom: 16 }} title={t('添加素材')}>
        <Row gutter={12} type='flex' align='middle'>
          <Col xs={24} md={6} style={{ marginBottom: 8 }}>
            <Input
              value={name}
              onChange={setName}
              placeholder={t('名称（可选）')}
            />
          </Col>
          <Col xs={24} md={14} style={{ marginBottom: 8 }}>
            <Input
              value={url}
              onChange={setUrl}
              placeholder={t('公网图片 URL（http/https）')}
            />
          </Col>
          <Col xs={24} md={4} style={{ marginBottom: 8 }}>
            <Button
              theme='solid'
              block
              loading={submitting}
              onClick={handleAdd}
            >
              {t('添加')}
            </Button>
          </Col>
        </Row>
      </Card>

      <Card title={t('我的素材')}>
        <Table
          columns={columns}
          dataSource={assets}
          loading={loading}
          rowKey='id'
          pagination={false}
          empty={t('暂无素材')}
        />
      </Card>
    </div>
  );
};

export default AssetLibrary;

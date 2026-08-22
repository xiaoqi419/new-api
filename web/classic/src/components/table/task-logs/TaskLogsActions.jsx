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

import React from 'react';
import { Typography, Switch, Button } from '@douyinfe/semi-ui';
import { IconEyeOpened, IconRefresh } from '@douyinfe/semi-icons';

const { Text } = Typography;

const TaskLogsActions = ({
  autoRefresh,
  setAutoRefresh,
  hasActiveTasks,
  refresh,
  loading,
  t,
}) => {
  return (
    <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
      <div className='flex items-center text-orange-500 mb-2 md:mb-0'>
        <IconEyeOpened className='mr-2' />
        <Text>{t('任务记录')}</Text>
        {autoRefresh && hasActiveTasks && (
          <span className='ml-2 inline-flex items-center gap-1 text-xs text-[var(--semi-color-success)]'>
            <span className='relative flex h-2 w-2'>
              <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--semi-color-success)] opacity-75'></span>
              <span className='relative inline-flex rounded-full h-2 w-2 bg-[var(--semi-color-success)]'></span>
            </span>
            {t('实时刷新中')}
          </span>
        )}
      </div>
      <div className='flex items-center gap-3'>
        <div className='flex items-center gap-1'>
          <Text type='tertiary' size='small'>
            {t('自动刷新')}
          </Text>
          <Switch checked={autoRefresh} onChange={setAutoRefresh} size='small' />
        </div>
        <Button
          icon={<IconRefresh />}
          size='small'
          theme='light'
          loading={loading}
          onClick={refresh}
        >
          {t('刷新')}
        </Button>
      </div>
    </div>
  );
};

export default TaskLogsActions;

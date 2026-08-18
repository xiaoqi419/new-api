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
import { Button, Modal } from '@douyinfe/semi-ui';
import { MOBILE_BREAKPOINT } from '../../../../hooks/common/useIsMobile';
import { CodexUsageLoader } from './CodexUsageModal';

const CODEX_USAGE_MODAL_CLASS_NAME = 'codex-usage-modal';

const getCodexUsageModalLayout = () => {
  if (typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT) {
    return {
      width: 'calc(100vw - 16px)',
      style: {
        top: 0,
        maxWidth: 'calc(100vw - 16px)',
        margin: '8px auto',
      },
      bodyStyle: {
        maxHeight: 'calc(100vh - 164px)',
        overflowY: 'auto',
        padding: '16px 16px 12px',
      },
    };
  }

  return {
    width: 900,
    style: {
      top: 0,
      margin: '16px auto',
      maxWidth: 'min(900px, 92vw)',
    },
    bodyStyle: {
      maxHeight: 'calc(100vh - 188px)',
      overflowY: 'auto',
      padding: '20px 24px 16px',
    },
  };
};

export const openCodexUsageModal = ({ t, record, payload, onCopy }) => {
  const tt = typeof t === 'function' ? t : (value) => value;
  const layout = getCodexUsageModalLayout();

  Modal.info({
    title: tt('Codex 帐号与用量'),
    className: CODEX_USAGE_MODAL_CLASS_NAME,
    centered: false,
    width: layout.width,
    style: layout.style,
    bodyStyle: layout.bodyStyle,
    content: (
      <CodexUsageLoader
        t={tt}
        record={record}
        initialPayload={payload}
        onCopy={onCopy}
      />
    ),
    footer: (
      <div className='flex justify-end gap-2'>
        <Button type='primary' theme='solid' onClick={() => Modal.destroyAll()}>
          {tt('关闭')}
        </Button>
      </div>
    ),
  });
};

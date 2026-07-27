/*
Copyright (C) 2023-2026 QuantumNous

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
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'

import type { GroupBuyParticipant } from '../types'

interface MembersListProps {
  participants: GroupBuyParticipant[]
}

export function MembersList({ participants }: MembersListProps) {
  const { t } = useTranslation()

  if (participants.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('No members yet, be the first to join')}
      </p>
    )
  }

  return (
    <div className='flex flex-wrap gap-2'>
      {participants.map((p) => {
        const paid = p.pay_status === 'paid'
        return (
          <StatusBadge
            key={`${p.username}-${p.pay_status}`}
            label={`${p.username} · ${paid ? t('Paid') : t('Awaiting payment')}`}
            variant={paid ? 'success' : 'warning'}
            copyable={false}
          />
        )
      })}
    </div>
  )
}

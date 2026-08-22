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
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ClickCaptcha } from '@/components/click-captcha'
import { Dialog } from '@/components/dialog'
import type { ClickCaptchaSolution } from '@/features/auth/types'

interface ClickCaptchaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fires the moment the last character is clicked, so the caller can submit right away. */
  onSolved: (solution: ClickCaptchaSolution) => void
}

/**
 * Asks for the click captcha only once a form is otherwise ready to submit, so the
 * puzzle costs no space on the page and no challenge is spent on a form that never
 * gets sent. The dialog unmounts when closed, which is what gives every attempt a
 * fresh image.
 */
export function ClickCaptchaDialog({
  open,
  onOpenChange,
  onSolved,
}: ClickCaptchaDialogProps) {
  const { t } = useTranslation()

  // ClickCaptcha reloads whenever this callback changes identity, so it has to be
  // stable no matter what the caller passes.
  const onSolvedRef = useRef(onSolved)
  useEffect(() => {
    onSolvedRef.current = onSolved
  }, [onSolved])

  const handleSolvedChange = useCallback(
    (solution: ClickCaptchaSolution | null) => {
      if (solution) onSolvedRef.current(solution)
    },
    []
  )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Security check')}
      // sm: prefix required, plain max-w-sm loses to the shared sm:max-w-2xl.
      contentClassName='sm:max-w-sm'
      headerClassName='text-left'
      contentHeight='auto'
    >
      <ClickCaptcha onSolvedChange={handleSolvedChange} />
    </Dialog>
  )
}

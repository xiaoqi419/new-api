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
import i18next from 'i18next'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import type { ClickCaptchaSolution } from '@/features/auth/types'
import { useStatus } from '@/hooks/use-status'

/**
 * State for the self-hosted click captcha, shaped like useTurnstile so a form can
 * carry both without special cases.
 */
export function useClickCaptcha() {
  const { status } = useStatus()
  const [solution, setSolution] = useState<ClickCaptchaSolution | null>(null)
  const [resetSignal, setResetSignal] = useState(0)

  const isClickCaptchaEnabled = status?.click_captcha_enabled === true

  const validateClickCaptcha = (): boolean => {
    if (isClickCaptchaEnabled && !solution) {
      toast.info(i18next.t('Please complete the image verification first'))
      return false
    }
    return true
  }

  /**
   * The server spends a challenge on the first check, right or wrong, so any
   * failed submit has to start over with a fresh image.
   */
  const resetClickCaptcha = useCallback(() => {
    setSolution(null)
    setResetSignal((value) => value + 1)
  }, [])

  const captchaQuery = solution
    ? { captcha_id: solution.id, captcha_points: solution.points }
    : {}

  return {
    isClickCaptchaEnabled,
    solution,
    setSolution,
    resetSignal,
    resetClickCaptcha,
    validateClickCaptcha,
    captchaQuery,
  }
}

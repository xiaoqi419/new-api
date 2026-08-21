import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

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
import { Monitor, Moon, Sun } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/context/theme-provider'

// 点一下往后走一档,三档循环。
const NEXT_THEME = { light: 'dark', dark: 'system', system: 'light' } as const

export function ThemeSwitch() {
  const { t } = useTranslation()
  const { theme, resolvedTheme, setTheme } = useTheme()

  /* 同步 meta[theme-color](手机浏览器地址栏底色)。直接读页面实际背景色,而不是
   * 写死一组黑白。依赖用 resolvedTheme 而不是 theme,「跟随系统」时也才能跟着变。 */
  useEffect(() => {
    const metaThemeColor = document.querySelector("meta[name='theme-color']")
    if (!metaThemeColor) return
    const page =
      document.querySelector<HTMLElement>('[data-public-surface]') ||
      document.body
    const pageColor = getComputedStyle(page).backgroundColor
    if (pageColor) metaThemeColor.setAttribute('content', pageColor)
  }, [resolvedTheme])

  let Icon = Sun
  let stateLabel = t('Light')
  if (theme === 'system') {
    Icon = Monitor
    stateLabel = t('System')
  } else if (theme === 'dark') {
    Icon = Moon
    stateLabel = t('Dark')
  }

  return (
    <Button
      variant='ghost'
      size='icon'
      className='public-theme-switch text-foreground h-9 w-9'
      onClick={() => setTheme(NEXT_THEME[theme])}
      aria-label={`${t('Toggle theme')} — ${stateLabel}`}
      title={`${t('Toggle theme')} — ${stateLabel}`}
    >
      <Icon className='size-[1.2rem]' />
    </Button>
  )
}

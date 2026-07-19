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
import { type CSSProperties, useEffect, useRef, useState } from 'react'

const pad = (n: number) => String(n).padStart(2, '0')

const msLeft = (expireTime: number) =>
  Math.max(0, (expireTime || 0) * 1000 - Date.now())

interface FlipUnitProps {
  value: number
  label?: string
  size: 'sm' | 'lg'
}

function FlipUnit({ value, label, size }: FlipUnitProps) {
  const boxStyle: CSSProperties =
    size === 'lg'
      ? { minWidth: 40, padding: '6px 8px', fontSize: 22 }
      : { minWidth: 30, padding: '3px 5px', fontSize: 15 }
  return (
    <div className='flex flex-col items-center'>
      <div
        className='rounded-md text-center font-mono leading-none font-bold text-white'
        style={{
          background: 'linear-gradient(180deg,#3b4252 0%,#1e2330 100%)',
          boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.12)',
          ...boxStyle,
        }}
      >
        {pad(value)}
      </div>
      {label ? (
        <span className='text-muted-foreground mt-1 text-[10px]'>{label}</span>
      ) : null}
    </div>
  )
}

interface GroupBuyCountdownProps {
  expireTime: number
  size?: 'sm' | 'lg'
  showLabels?: boolean
  onExpire?: () => void
}

/** Flip-style countdown to a Unix-second expiry timestamp. */
export function GroupBuyCountdown({
  expireTime,
  size = 'sm',
  showLabels = false,
  onExpire,
}: GroupBuyCountdownProps) {
  const [remaining, setRemaining] = useState(() => msLeft(expireTime))
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    setRemaining(msLeft(expireTime))
    const timer = setInterval(() => {
      const next = msLeft(expireTime)
      setRemaining(next)
      if (next <= 0) {
        clearInterval(timer)
        onExpireRef.current?.()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [expireTime])

  const totalSec = Math.floor(remaining / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  const sep = (
    <span
      className='text-muted-foreground font-bold'
      style={{ fontSize: size === 'lg' ? 20 : 13 }}
    >
      :
    </span>
  )

  return (
    <div className='flex items-center gap-1'>
      {days > 0 ? (
        <>
          <FlipUnit value={days} label={showLabels ? 'D' : ''} size={size} />
          {sep}
        </>
      ) : null}
      <FlipUnit value={hours} label={showLabels ? 'H' : ''} size={size} />
      {sep}
      <FlipUnit value={minutes} label={showLabels ? 'M' : ''} size={size} />
      {sep}
      <FlipUnit value={seconds} label={showLabels ? 'S' : ''} size={size} />
    </div>
  )
}

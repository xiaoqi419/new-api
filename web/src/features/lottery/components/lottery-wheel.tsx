import { useEffect, useRef, useState } from 'react'

import { Coins, Gift, RotateCw } from '@/components/icons'
import { cn } from '@/lib/utils'

import { WHEEL_COLORS } from '../constants'
import type { PrizeType } from '../types'

interface WheelSegment {
  label: string
  color?: string
  type?: PrizeType
}

interface LotteryWheelProps {
  segments: WheelSegment[]
  spinning: boolean
  prizeIndex: number
  onStop: () => void
  onDraw: () => void
  centerLabel: string
  centerSubLabel: string
  disabled: boolean
  size?: number
}

const SPIN_DURATION_MS = 4200
const EXTRA_TURNS = 6

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function iconForType(type?: PrizeType) {
  if (type === 'redraw') return RotateCw
  if (type === 'empty') return Gift
  return Coins
}

export function LotteryWheel({
  segments,
  spinning,
  prizeIndex,
  onStop,
  onDraw,
  centerLabel,
  centerSubLabel,
  disabled,
  size = 340,
}: LotteryWheelProps) {
  const [rotation, setRotation] = useState(0)
  const stoppedRef = useRef(true)

  const count = Math.max(segments.length, 1)
  const segAngle = 360 / count
  const cx = size / 2
  const cy = size / 2
  const r = size / 2

  useEffect(() => {
    if (!spinning || !stoppedRef.current) return
    stoppedRef.current = false

    const target = prizeIndex % count
    const segCenter = target * segAngle + segAngle / 2
    const base = rotation - (rotation % 360)
    const nextRotation = base + EXTRA_TURNS * 360 + (360 - segCenter)
    setRotation(nextRotation)

    const timer = window.setTimeout(() => {
      stoppedRef.current = true
      onStop()
    }, SPIN_DURATION_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning])

  const ringWidth = 26
  const innerR = r - ringWidth
  const labelRadius = innerR * 0.6
  const iconRadius = innerR * 0.86
  const dotCount = count * 3
  const dotRadius = r - ringWidth / 2

  return (
    <div className='relative' style={{ width: size, height: size }}>
      {/* 顶部指针 */}
      <div
        className='absolute top-1 left-1/2 z-20 -translate-x-1/2'
        style={{
          width: 0,
          height: 0,
          borderLeft: '13px solid transparent',
          borderRight: '13px solid transparent',
          borderTop: '26px solid #FBBF24',
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))',
        }}
      />

      {/* 红色外圈 + 灯点 */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className='absolute inset-0 z-0'
      >
        <circle cx={cx} cy={cy} r={r - 1} fill='#DC2626' />
        <circle
          cx={cx}
          cy={cy}
          r={r - 1}
          fill='none'
          stroke='#B91C1C'
          strokeWidth={2}
        />
        {Array.from({ length: dotCount }).map((_, i) => {
          const a = (360 / dotCount) * i
          const p = polar(cx, cy, dotRadius, a)
          return (
            <circle
              key={`dot-${a}`}
              cx={p.x}
              cy={p.y}
              r={3.2}
              fill={i % 2 === 0 ? '#FEF3C7' : '#FCA5A5'}
            />
          )
        })}
      </svg>

      {/* 可旋转扇区盘 */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className='absolute inset-0 z-10'
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning
            ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.15, 0.9, 0.25, 1)`
            : 'none',
        }}
      >
        {segments.map((seg, i) => {
          const start = i * segAngle
          const end = start + segAngle
          const p1 = polar(cx, cy, innerR, start)
          const p2 = polar(cx, cy, innerR, end)
          const largeArc = segAngle > 180 ? 1 : 0
          const d = `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${innerR} ${innerR} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`
          const fill = seg.color || WHEEL_COLORS[i % WHEEL_COLORS.length]
          const midAngle = start + segAngle / 2
          const lp = polar(cx, cy, labelRadius, midAngle)
          const ip = polar(cx, cy, iconRadius, midAngle)
          const Icon = iconForType(seg.type)
          return (
            <g key={`${seg.label}@${start}`}>
              <path d={d} fill={fill} stroke='#FFFFFF' strokeWidth={1.5} />
              <text
                x={lp.x}
                y={lp.y}
                fill='#7c2d12'
                fontSize={13}
                fontWeight={700}
                textAnchor='middle'
                dominantBaseline='middle'
                transform={`rotate(${midAngle}, ${lp.x}, ${lp.y})`}
              >
                {seg.label.slice(0, 8)}
              </text>
              <g
                transform={`translate(${ip.x - 9}, ${ip.y - 9}) rotate(${midAngle}, 9, 9)`}
              >
                <Icon size={18} color='#B45309' />
              </g>
            </g>
          )
        })}
      </svg>

      {/* 中心抽奖按钮 */}
      <button
        type='button'
        onClick={onDraw}
        disabled={disabled}
        className={cn(
          'absolute left-1/2 top-1/2 z-20 flex size-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-4 border-white bg-gradient-to-b from-red-500 to-red-600 text-white shadow-lg transition-transform',
          disabled
            ? 'cursor-not-allowed opacity-70'
            : 'cursor-pointer hover:scale-105 active:scale-95'
        )}
      >
        <span className='text-lg leading-none font-bold'>{centerLabel}</span>
        <span className='mt-1 text-[11px] leading-none opacity-90'>
          {centerSubLabel}
        </span>
      </button>
    </div>
  )
}

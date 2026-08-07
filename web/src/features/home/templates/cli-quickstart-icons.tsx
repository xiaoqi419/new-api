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
import type { ReactNode } from 'react'

/** Animated brand marks for the CLI Quickstart tool cards, identifying the CLI
 * a card configures (nominative use). Each is the tool's own logo, animated
 * with a line-by-line stroke draw + fill reveal + expanding ripples + breathe
 * (the reference site's signature). All animations live in cli-quickstart.css,
 * are gated on scroll-in, and are disabled under prefers-reduced-motion. */

const CLAUDE_PATH =
  'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z'

const OPENAI_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z'

const GEMINI_PATH =
  'M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z'

/** Small 4-point concave sparkle centered at (cx, cy) with outer radius r. */
function sparkPath(cx: number, cy: number, r: number): string {
  const i = r * 0.16
  return `M${cx} ${cy - r} Q${cx + i} ${cy - i} ${cx + r} ${cy} Q${cx + i} ${cy + i} ${cx} ${cy + r} Q${cx - i} ${cy + i} ${cx - r} ${cy} Q${cx - i} ${cy - i} ${cx} ${cy - r} Z`
}

const GEMINI_SPARKS = [
  { id: 'a', cx: 2.5, cy: 3, r: 2, delay: '0s', dur: '3.4s' },
  { id: 'b', cx: 21.5, cy: 3.5, r: 1.5, delay: '0.7s', dur: '4.2s' },
  { id: 'c', cx: 22, cy: 21, r: 1.9, delay: '1.2s', dur: '3.8s' },
  { id: 'd', cx: 3, cy: 21, r: 1.4, delay: '1.8s', dur: '4.6s' },
]

/** Logo with expanding ripple rings behind and a breathing SVG frame. */
function RippleLogo({
  color,
  children,
}: {
  color: string
  children: ReactNode
}) {
  return (
    <div className='lit-logo' style={{ color }}>
      <span className='lit-ripple lit-ripple-1' />
      <span className='lit-ripple lit-ripple-2' />
      <span className='lit-ripple lit-ripple-3' />
      <svg viewBox='0 0 24 24' className='lit-logo-svg lit-breathe'>
        {children}
      </svg>
    </div>
  )
}

function ClaudeMark() {
  return (
    <RippleLogo color='#d97757'>
      <path className='lit-outline' d={CLAUDE_PATH} pathLength={1} />
      <path className='lit-fill' d={CLAUDE_PATH} fill='#d97757' />
    </RippleLogo>
  )
}

function OpenAIMark() {
  return (
    <RippleLogo color='var(--foreground)'>
      <g className='lit-rotate'>
        <path className='lit-outline' d={OPENAI_PATH} pathLength={1} />
        <path className='lit-fill' d={OPENAI_PATH} fill='var(--foreground)' />
      </g>
    </RippleLogo>
  )
}

function GeminiMark() {
  return (
    <RippleLogo color='#3186ff'>
      <defs>
        <linearGradient
          id='lit-gemini-grad'
          x1='0%'
          y1='0%'
          x2='100%'
          y2='100%'
        >
          <stop offset='0%' stopColor='#f94543' />
          <stop offset='50%' stopColor='#3186ff' />
          <stop offset='100%' stopColor='#08b962' />
        </linearGradient>
      </defs>
      {GEMINI_SPARKS.map((s) => (
        <path
          key={s.id}
          className='tool-twinkle'
          style={{ animationDelay: s.delay, animationDuration: s.dur }}
          d={sparkPath(s.cx, s.cy, s.r)}
          fill='url(#lit-gemini-grad)'
        />
      ))}
      <path className='lit-outline' d={GEMINI_PATH} pathLength={1} />
      <path className='lit-fill' d={GEMINI_PATH} fill='url(#lit-gemini-grad)' />
    </RippleLogo>
  )
}

function GenericMark() {
  const d = sparkPath(12, 12, 11)
  return (
    <RippleLogo color='var(--primary)'>
      <path className='lit-outline' d={d} pathLength={1} />
      <path className='lit-fill' d={d} fill='var(--primary)' />
    </RippleLogo>
  )
}

const WORDMARK_SPARKS = [
  { id: 'a', cx: 13, cy: 13, r: 4.6, delay: '0s', dur: '3.4s' },
  { id: 'b', cx: 127, cy: 15, r: 3.4, delay: '0.7s', dur: '4.2s' },
  { id: 'c', cx: 131, cy: 43, r: 4.2, delay: '1.2s', dur: '3.8s' },
  { id: 'd', cx: 10, cy: 45, r: 3.2, delay: '1.8s', dur: '4.6s' },
]

/** Gap between one glyph starting to draw and the next, so the word builds up
 * letter by letter instead of all at once. */
const WORDMARK_GLYPH_STAGGER_MS = 320

/** How long after a glyph starts drawing its gradient fill appears; slightly
 * shorter than the draw so the outline is still closing as the colour lands. */
const WORDMARK_FILL_DELAY_MS = 900

/**
 * Hero wordmark carrying the same treatment as the tool marks further down the
 * page: stroke draw, gradient fill reveal, expanding ripples and a slow
 * breathe. Its warm peach → coral → magenta ramp lives in cli-quickstart.css.
 */
export function SystemWordmark({ text }: { text: string }) {
  const glyphs = [...text].map((ch, i) => ({
    ch,
    delay: i * WORDMARK_GLYPH_STAGGER_MS,
  }))
  return (
    <div className='lit-logo lit-wordmark'>
      <span className='lit-ripple lit-ripple-1' />
      <span className='lit-ripple lit-ripple-2' />
      <span className='lit-ripple lit-ripple-3' />
      <svg
        viewBox='0 0 140 56'
        className='lit-logo-svg lit-breathe'
        role='img'
        aria-label={text}
      >
        <defs>
          {/* userSpaceOnUse, not the default objectBoundingBox: the glyphs are
              individually animated tspans, and a bounding-box gradient would
              restart the whole ramp inside every single letter. */}
          <linearGradient
            id='lit-wordmark-grad'
            gradientUnits='userSpaceOnUse'
            x1='16'
            y1='10'
            x2='124'
            y2='46'
          >
            <stop offset='0%' stopColor='var(--wordmark-from)' />
            <stop offset='50%' stopColor='var(--wordmark-via)' />
            <stop offset='100%' stopColor='var(--wordmark-to)' />
          </linearGradient>
        </defs>
        {WORDMARK_SPARKS.map((s) => (
          <path
            key={s.id}
            className='tool-twinkle'
            style={{ animationDelay: s.delay, animationDuration: s.dur }}
            d={sparkPath(s.cx, s.cy, s.r)}
            fill='url(#lit-wordmark-grad)'
          />
        ))}
        <text
          className='lit-wordmark-outline'
          x='70'
          y='41'
          textAnchor='middle'
        >
          {glyphs.map((g) => (
            <tspan key={g.delay} style={{ animationDelay: `${g.delay}ms` }}>
              {g.ch}
            </tspan>
          ))}
        </text>
        <text
          className='lit-wordmark-fill'
          x='70'
          y='41'
          textAnchor='middle'
          fill='url(#lit-wordmark-grad)'
        >
          {glyphs.map((g) => (
            <tspan
              key={g.delay}
              style={{
                animationDelay: `${g.delay + WORDMARK_FILL_DELAY_MS}ms`,
              }}
            >
              {g.ch}
            </tspan>
          ))}
        </text>
      </svg>
    </div>
  )
}

/** Renders the animated mark for a tool icon key, defaulting to a generic spark. */
export function ToolIcon({ icon }: { icon?: string }) {
  switch ((icon || '').toLowerCase()) {
    case 'claude':
      return <ClaudeMark />
    case 'openai':
      return <OpenAIMark />
    case 'gemini':
      return <GeminiMark />
    default:
      return <GenericMark />
  }
}

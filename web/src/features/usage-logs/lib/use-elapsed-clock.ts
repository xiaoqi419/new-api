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
import { useSyncExternalStore } from 'react'

/**
 * A process-wide 1 Hz clock shared by every realtime elapsed-time cell. A
 * single interval runs only while at least one subscriber is mounted, so
 * tables with no in-progress rows never spin a timer.
 */
const listeners = new Set<() => void>()
let intervalId: ReturnType<typeof setInterval> | null = null
let currentSec = Math.floor(Date.now() / 1000)

function emit() {
  currentSec = Math.floor(Date.now() / 1000)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (intervalId === null) {
    currentSec = Math.floor(Date.now() / 1000)
    intervalId = setInterval(emit, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }
}

const noopSubscribe = (): (() => void) => () => {}
const getSnapshot = () => currentSec

/**
 * Returns the current epoch time in seconds, re-rendering the caller once per
 * second while `enabled` is true. When disabled it subscribes to nothing and
 * simply returns the last known value.
 */
export function useNowSeconds(enabled: boolean): number {
  return useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    getSnapshot,
    getSnapshot
  )
}

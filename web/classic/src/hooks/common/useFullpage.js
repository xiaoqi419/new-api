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

import { useCallback, useEffect, useRef, useState } from 'react';

const TRANSITION_MS = 900;
const WHEEL_THRESHOLD = 12;
const TOUCH_THRESHOLD = 50;
// Leave a small tolerance so sub-pixel overflow does not trap the section.
const INNER_SCROLL_TOLERANCE = 2;

/**
 * Lightweight fullpage controller: hijacks wheel/touch/keyboard to move
 * between full-viewport sections one at a time. When a section's content is
 * taller than the viewport it scrolls internally first, then advances.
 *
 * @param {number} sectionCount total number of sections
 * @param {boolean} enabled when false the hook is inert (native scrolling)
 */
export const useFullpage = (sectionCount, enabled = true) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const lockedRef = useRef(false);
  const sectionRefs = useRef([]);
  const touchStartYRef = useRef(0);

  const setSectionRef = useCallback(
    (index) => (el) => {
      sectionRefs.current[index] = el;
    },
    [],
  );

  const goTo = useCallback(
    (index) => {
      if (!enabled) return;
      const clamped = Math.max(0, Math.min(sectionCount - 1, index));
      if (clamped === activeIndexRef.current || lockedRef.current) return;
      lockedRef.current = true;
      activeIndexRef.current = clamped;
      setActiveIndex(clamped);
      window.setTimeout(() => {
        lockedRef.current = false;
      }, TRANSITION_MS);
    },
    [enabled, sectionCount],
  );

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
  }, [sectionCount]);

  useEffect(() => {
    if (!enabled) return undefined;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return undefined;

    // Returns true if the active section can still scroll internally in the
    // given direction; in that case we let the native scroll happen.
    const canScrollInside = (direction) => {
      const el = sectionRefs.current[activeIndexRef.current];
      if (!el) return false;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - clientHeight <= INNER_SCROLL_TOLERANCE) return false;
      if (direction > 0) {
        return scrollTop + clientHeight < scrollHeight - INNER_SCROLL_TOLERANCE;
      }
      return scrollTop > INNER_SCROLL_TOLERANCE;
    };

    const onWheel = (e) => {
      if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;
      const direction = e.deltaY > 0 ? 1 : -1;
      if (canScrollInside(direction)) return;
      e.preventDefault();
      if (lockedRef.current) return;
      goTo(activeIndexRef.current + direction);
    };

    const onTouchStart = (e) => {
      touchStartYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      const deltaY = touchStartYRef.current - e.touches[0].clientY;
      if (Math.abs(deltaY) < TOUCH_THRESHOLD) return;
      const direction = deltaY > 0 ? 1 : -1;
      if (canScrollInside(direction)) return;
      if (e.cancelable) e.preventDefault();
      if (lockedRef.current) return;
      touchStartYRef.current = e.touches[0].clientY;
      goTo(activeIndexRef.current + direction);
    };

    const onKeyDown = (e) => {
      if (['ArrowDown', 'PageDown'].includes(e.key)) {
        if (canScrollInside(1)) return;
        e.preventDefault();
        goTo(activeIndexRef.current + 1);
      } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
        if (canScrollInside(-1)) return;
        e.preventDefault();
        goTo(activeIndexRef.current - 1);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, goTo]);

  return { activeIndex, goTo, setSectionRef };
};

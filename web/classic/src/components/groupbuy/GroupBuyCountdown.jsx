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

import React, { useEffect, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');

const FlipUnit = ({ value, label, size }) => {
  const boxStyle =
    size === 'lg'
      ? { minWidth: 40, padding: '6px 8px', fontSize: 22 }
      : { minWidth: 30, padding: '3px 5px', fontSize: 15 };
  return (
    <div className='flex flex-col items-center'>
      <div
        className='rounded-md font-mono font-bold text-center leading-none'
        style={{
          background: 'linear-gradient(180deg,#3b4252 0%,#1e2330 100%)',
          color: '#ffffff',
          boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.12)',
          ...boxStyle,
        }}
      >
        {pad(value)}
      </div>
      {label && (
        <span className='mt-1 text-[10px] text-semi-color-text-2'>{label}</span>
      )}
    </div>
  );
};

/**
 * GroupBuyCountdown 翻牌式倒计时。
 * props: expireTime(秒级时间戳), size('sm'|'lg'), showLabels, onExpire
 */
const GroupBuyCountdown = ({
  expireTime,
  size = 'sm',
  showLabels = false,
  onExpire,
}) => {
  const compute = () => Math.max(0, (expireTime || 0) * 1000 - Date.now());
  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    setRemaining(compute());
    const timer = setInterval(() => {
      const next = compute();
      setRemaining(next);
      if (next <= 0) {
        clearInterval(timer);
        onExpire && onExpire();
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expireTime]);

  const totalSec = Math.floor(remaining / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const sep = (
    <span
      className='font-bold text-semi-color-text-2'
      style={{ fontSize: size === 'lg' ? 20 : 13 }}
    >
      :
    </span>
  );

  return (
    <div className='flex items-center gap-1'>
      {days > 0 && (
        <>
          <FlipUnit value={days} label={showLabels ? '天' : ''} size={size} />
          {sep}
        </>
      )}
      <FlipUnit value={hours} label={showLabels ? '时' : ''} size={size} />
      {sep}
      <FlipUnit value={minutes} label={showLabels ? '分' : ''} size={size} />
      {sep}
      <FlipUnit value={seconds} label={showLabels ? '秒' : ''} size={size} />
    </div>
  );
};

export default GroupBuyCountdown;

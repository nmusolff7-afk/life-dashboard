import { useEffect, useState } from 'react';

/** Ticking "Thursday, April 23  ·  3:47:12 PM" string, updated every second.
 *  Matches Flask header subtitle format (templates/index.html). */
export function useLiveDateTime(): string {
  const [value, setValue] = useState(() => formatNow());
  useEffect(() => {
    const id = setInterval(() => setValue(formatNow()), 1000);
    return () => clearInterval(id);
  }, []);
  return value;
}

function formatNow(): string {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  const time = `${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${period}`;
  return `${date}  ·  ${time}`;
}

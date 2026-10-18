import { useState, useEffect } from 'react';

/**
 * React hook that tracks window.devicePixelRatio dynamically.
 * Automatically updates and triggers re-render whenever the user:
 * - Drags the window to a monitor with different display scaling / DPI
 * - Uses browser zoom (Ctrl + / Ctrl -)
 * - Changes display scaling in OS settings
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    return window.devicePixelRatio || 1;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateDpr = () => {
      const current = window.devicePixelRatio || 1;
      setDpr((prev) => (Math.abs(prev - current) > 0.001 ? current : prev));
    };

    // Modern browsers support tracking resolution media queries
    let mq: MediaQueryList | null = null;
    try {
      const currentDpr = window.devicePixelRatio || 1;
      mq = window.matchMedia(`(resolution: ${currentDpr}dppx)`);
      if (mq.addEventListener) {
        mq.addEventListener('change', updateDpr);
      } else if ((mq as any).addListener) {
        (mq as any).addListener(updateDpr);
      }
    } catch {
      // Fallback to window resize
    }

    window.addEventListener('resize', updateDpr);

    return () => {
      if (mq) {
        try {
          if (mq.removeEventListener) {
            mq.removeEventListener('change', updateDpr);
          } else if ((mq as any).removeListener) {
            (mq as any).removeListener(updateDpr);
          }
        } catch {
          // ignore
        }
      }
      window.removeEventListener('resize', updateDpr);
    };
  }, [dpr]);

  return dpr;
}

import { useEffect } from 'react';

// Keeps the screen on while `active` - in the gym the phone lies on a bench
// between sets, and a dimmed screen means unlocking it for every set.
//
// The browser drops the lock by itself whenever the tab is hidden (screen
// off, app switch), so it is taken again on `visibilitychange`. Unsupported
// browsers (Firefox before 126, older iOS) and refusals (battery saver, the
// page not visible yet) are ignored: the screen just dims as usual.
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    // One request at a time - a second one in flight would leak a lock.
    let requesting = false;

    async function acquire() {
      if (cancelled || requesting || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) {
        return;
      }
      requesting = true;
      try {
        const lock = await navigator.wakeLock.request('screen');
        // The effect was cleaned up while the request was in flight.
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
      } catch {
        // Not allowed right now - nothing to do, retried on the next visibility change.
      } finally {
        requesting = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void acquire();
    }

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}

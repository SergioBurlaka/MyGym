import { useEffect, useState } from 'react';
import { createWakeLockController, type WakeLockState } from './wakeLockController.js';

export type { WakeLockState } from './wakeLockController.js';

// Keeps the screen on while `active` - in the gym the phone lies on a bench
// between sets, and a dimmed screen means unlocking it for every set.
// The re-acquire rules live in wakeLockController.ts. Returns the current
// state, so the workout page can say when the browser refused the lock.
export function useWakeLock(active: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>({ kind: 'inactive' });

  useEffect(() => {
    if (!active || typeof navigator === 'undefined') {
      setState({ kind: 'inactive' });
      return;
    }
    return createWakeLockController(
      {
        wakeLock: 'wakeLock' in navigator ? navigator.wakeLock : undefined,
        document,
        window,
      },
      setState,
    );
  }, [active]);

  return state;
}

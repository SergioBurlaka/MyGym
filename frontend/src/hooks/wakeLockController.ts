// Keeps a screen wake lock for as long as it is running, independent of React
// so it can be tested with a fake `navigator.wakeLock` (wakeLockController.test.ts).
//
// The lock is lost in more ways than hiding the tab: the system may release it
// on its own while the page stays visible (seen on Android: the screen still
// dimmed mid-workout although the hook had taken the lock). So it is taken
// again on:
// - the sentinel's `release` while the page is visible (after a short pause,
//   so a system that releases straight away does not spin the loop);
// - `visibilitychange` to visible, window `focus` and `pageshow` (bfcache);
// - any tap (`pointerdown`) while it is not held - also the retry after a refusal.

export type WakeLockState =
  | { kind: 'inactive' }
  | { kind: 'unsupported' }
  | { kind: 'pending' }
  | { kind: 'held' }
  | { kind: 'denied'; reason: string };

interface SentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

export interface WakeLockEnv {
  wakeLock: { request(type: 'screen'): Promise<SentinelLike> } | undefined;
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

export const RELEASE_RETRY_MS = 1000;

export function createWakeLockController(env: WakeLockEnv, onState: (state: WakeLockState) => void): () => void {
  const { wakeLock, document: doc, window: win } = env;
  if (!wakeLock) {
    onState({ kind: 'unsupported' });
    return () => {};
  }

  let sentinel: SentinelLike | null = null;
  let stopped = false;
  // One request at a time - a second one in flight would leak a lock.
  let requesting = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  async function acquire() {
    if (stopped || requesting || doc.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
    requesting = true;
    try {
      const lock = await wakeLock!.request('screen');
      if (stopped) {
        // Stopped while the request was in flight.
        void lock.release().catch(() => {});
        return;
      }
      sentinel = lock;
      lock.addEventListener('release', () => {
        if (sentinel !== lock || stopped) return;
        sentinel = null;
        onState({ kind: 'pending' });
        if (doc.visibilityState === 'visible' && retryTimer === null) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void acquire();
          }, RELEASE_RETRY_MS);
        }
      });
      onState({ kind: 'held' });
    } catch (err) {
      if (!stopped) onState({ kind: 'denied', reason: err instanceof Error && err.name ? err.name : 'Error' });
    } finally {
      requesting = false;
    }
  }

  function onVisibilityChange() {
    if (doc.visibilityState === 'visible') void acquire();
  }
  function onRetry() {
    void acquire();
  }

  onState({ kind: 'pending' });
  void acquire();
  doc.addEventListener('visibilitychange', onVisibilityChange);
  doc.addEventListener('pointerdown', onRetry);
  win.addEventListener('focus', onRetry);
  win.addEventListener('pageshow', onRetry);

  return () => {
    stopped = true;
    if (retryTimer !== null) clearTimeout(retryTimer);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    doc.removeEventListener('pointerdown', onRetry);
    win.removeEventListener('focus', onRetry);
    win.removeEventListener('pageshow', onRetry);
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    sentinel = null;
  };
}

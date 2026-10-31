import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWakeLockController, RELEASE_RETRY_MS, type WakeLockEnv, type WakeLockState } from './wakeLockController.js';

class FakeSentinel {
  released = false;
  private listeners: Array<() => void> = [];
  addEventListener(_type: 'release', listener: () => void) {
    this.listeners.push(listener);
  }
  async release() {
    this.systemRelease();
  }
  // What the browser does on its own (tab hidden, system decision).
  systemRelease() {
    if (this.released) return;
    this.released = true;
    this.listeners.forEach((l) => l());
  }
}

function makeEnv() {
  const docTarget = new EventTarget();
  const winTarget = new EventTarget();
  const doc = Object.assign(docTarget, { visibilityState: 'visible' as DocumentVisibilityState });
  const sentinels: FakeSentinel[] = [];
  let refuse: Error | null = null;
  const request = vi.fn(async () => {
    if (refuse) throw refuse;
    const s = new FakeSentinel();
    sentinels.push(s);
    return s;
  });
  const env = {
    wakeLock: { request },
    document: doc,
    window: winTarget,
  } as unknown as WakeLockEnv;
  const states: WakeLockState[] = [];
  return {
    env,
    doc,
    winTarget,
    sentinels,
    request,
    states,
    onState: (s: WakeLockState) => states.push(s),
    refuseWith: (err: Error | null) => {
      refuse = err;
    },
    held: () => sentinels.filter((s) => !s.released).length,
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);
const last = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];

describe('createWakeLockController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports unsupported when the browser has no wakeLock', () => {
    const t = makeEnv();
    createWakeLockController({ ...t.env, wakeLock: undefined }, t.onState);
    expect(t.states).toEqual([{ kind: 'unsupported' }]);
  });

  it('takes the lock on start', async () => {
    const t = makeEnv();
    createWakeLockController(t.env, t.onState);
    await flush();
    expect(last(t.states)).toEqual({ kind: 'held' });
    expect(t.held()).toBe(1);
  });

  it('takes the lock again after the system releases it while visible', async () => {
    const t = makeEnv();
    createWakeLockController(t.env, t.onState);
    await flush();
    t.sentinels[0]!.systemRelease();
    expect(last(t.states)).toEqual({ kind: 'pending' });
    await vi.advanceTimersByTimeAsync(RELEASE_RETRY_MS);
    expect(t.request).toHaveBeenCalledTimes(2);
    expect(t.held()).toBe(1);
    expect(last(t.states)).toEqual({ kind: 'held' });
  });

  it('waits for the page to be visible again after hiding', async () => {
    const t = makeEnv();
    createWakeLockController(t.env, t.onState);
    await flush();
    t.doc.visibilityState = 'hidden';
    t.sentinels[0]!.systemRelease();
    await vi.advanceTimersByTimeAsync(RELEASE_RETRY_MS);
    expect(t.request).toHaveBeenCalledTimes(1);
    t.doc.visibilityState = 'visible';
    t.doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(t.held()).toBe(1);
  });

  it('does not keep retrying on a timer when the retry after a release is refused', async () => {
    const t = makeEnv();
    createWakeLockController(t.env, t.onState);
    await flush();
    const err = new Error('nope');
    err.name = 'NotAllowedError';
    t.refuseWith(err);
    t.sentinels[0]!.systemRelease();
    await vi.advanceTimersByTimeAsync(RELEASE_RETRY_MS * 10);
    expect(t.request).toHaveBeenCalledTimes(2);
    expect(last(t.states)).toEqual({ kind: 'denied', reason: 'NotAllowedError' });
  });

  it('reports a refusal with its reason and retries on a tap', async () => {
    const t = makeEnv();
    const err = new Error('nope');
    err.name = 'NotAllowedError';
    t.refuseWith(err);
    createWakeLockController(t.env, t.onState);
    await flush();
    expect(last(t.states)).toEqual({ kind: 'denied', reason: 'NotAllowedError' });
    t.refuseWith(null);
    t.doc.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(last(t.states)).toEqual({ kind: 'held' });
  });

  it('re-acquires on focus and pageshow, never holding two locks', async () => {
    const t = makeEnv();
    createWakeLockController(t.env, t.onState);
    // Events while the first request is still in flight must not start a second one.
    t.winTarget.dispatchEvent(new Event('focus'));
    t.winTarget.dispatchEvent(new Event('pageshow'));
    await flush();
    expect(t.request).toHaveBeenCalledTimes(1);
    t.sentinels[0]!.systemRelease();
    t.winTarget.dispatchEvent(new Event('pageshow'));
    await flush();
    expect(t.held()).toBe(1);
    // The pending release retry finds the lock already held.
    await vi.advanceTimersByTimeAsync(RELEASE_RETRY_MS);
    expect(t.held()).toBe(1);
  });

  it('releases the lock and stops listening on cleanup', async () => {
    const t = makeEnv();
    const stop = createWakeLockController(t.env, t.onState);
    await flush();
    stop();
    expect(t.held()).toBe(0);
    t.doc.dispatchEvent(new Event('pointerdown'));
    await vi.advanceTimersByTimeAsync(RELEASE_RETRY_MS);
    expect(t.request).toHaveBeenCalledTimes(1);
  });

  it('releases a lock that arrives after cleanup', async () => {
    const t = makeEnv();
    const stop = createWakeLockController(t.env, t.onState);
    stop();
    await flush();
    expect(t.request).toHaveBeenCalledTimes(1);
    expect(t.held()).toBe(0);
  });
});

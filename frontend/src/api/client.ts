import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL,
  withCredentials: true, // send the httpOnly refresh cookie
});

// Refresh this long before the access token actually expires, so a request
// fired right at the boundary never goes out with a dead token.
const REFRESH_AHEAD_MS = 60_000;

let accessToken: string | null = null;
let accessTokenExp = 0; // ms epoch, 0 = unknown/none
let refreshPromise: Promise<string | null> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let onSessionLost: (() => void) | null = null;

function decodeExp(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  accessTokenExp = token ? decodeExp(token) : 0;
  scheduleRefresh();
}

export function getAccessToken() {
  return accessToken;
}

/** Called once the refresh cookie is definitively rejected (not on network errors). */
export function setOnSessionLost(cb: (() => void) | null) {
  onSessionLost = cb;
}

// Keep the access token alive while the tab is open: a timer refreshes it
// shortly before `exp`. Mobile browsers freeze timers in background tabs, so
// the visibility/online listeners below cover waking the phone between sets.
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (!accessToken || !accessTokenExp) return;
  const delay = Math.max(accessTokenExp - Date.now() - REFRESH_AHEAD_MS, 0);
  refreshTimer = setTimeout(() => void refreshAccessToken(), delay);
}

function refreshIfStale() {
  if (accessToken && accessTokenExp - Date.now() < REFRESH_AHEAD_MS) {
    void refreshAccessToken();
  }
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfStale();
  });
  window.addEventListener('focus', refreshIfStale);
  window.addEventListener('online', refreshIfStale);
}

/**
 * Single-flight refresh shared by every caller (startup, timer, 401 retry),
 * so the rotating refresh token is never sent twice in parallel.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<string | null> {
  try {
    const res = await axios.post<{ accessToken: string }>(
      `${baseURL}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    setAccessToken(res.data.accessToken);
    return res.data.accessToken;
  } catch (err) {
    // A network hiccup (phone just woke up, gym wifi) says nothing about the
    // session - keep the current token and let the next attempt retry.
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      setAccessToken(null);
      onSessionLost?.();
    }
    return null;
  }
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      const newToken = await refreshAccessToken();
      if (newToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);

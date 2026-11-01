import { useEffect, useRef } from 'react';
import { api, ApiError } from './api';

type OwnerIdentity = { id: string; role: 'landlord' | 'tenant' } | null;
type Refresh = (signal?: AbortSignal) => Promise<void>;

/** Poll only a revision token; full scoped data is fetched when it changes. */
export function watchMeterOwnerUpdates(user: OwnerIdentity, refresh: Refresh) {
  if (!user || user.role !== 'landlord') return () => {};
  let stopped = false, busy = false, revision: string | undefined;
  let timer: ReturnType<typeof window.setInterval> | undefined, controller: AbortController | undefined;
  const visible = () => document.visibilityState !== 'hidden';
  function stop() {
    stopped = true;
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined; controller?.abort();
    document.removeEventListener('visibilitychange', visibilityChanged);
  }
  async function poll() {
    if (stopped || busy || !visible()) return;
    busy = true; const request = new AbortController(); controller = request;
    try {
      const next = await api<{ revision: string }>('/meter/updates', { signal: request.signal });
      if (stopped || request.signal.aborted || !visible() || typeof next.revision !== 'string' || !/^[a-f0-9]{64}$/.test(next.revision)) return;
      // Refresh once on the first response, including jobs finished before this tab opened.
      if (revision === undefined || revision !== next.revision) {
        await refresh(request.signal);
        if (!stopped && !request.signal.aborted) revision = next.revision;
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) stop();
      // A transient network error is retried by the next visible poll.
    } finally { busy = false; if (controller === request) controller = undefined; }
  }
  function visibilityChanged() {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    if (stopped) return;
    if (!visible()) { controller?.abort(); return; }
    void poll(); timer = window.setInterval(() => { void poll(); }, 10000);
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  visibilityChanged();
  return stop;
}

export function useMeterOwnerUpdates(user: OwnerIdentity, refresh: Refresh) {
  const latest = useRef(refresh); latest.current = refresh;
  useEffect(() => watchMeterOwnerUpdates(user, signal => latest.current(signal)), [user?.id, user?.role]);
}

import { useEffect, useRef, useState } from 'react';

const preferenceKey = 'trozy.sidebar';
const matches = (query: string) => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

export function useWorkspaceShell() {
  const [narrow, setNarrow] = useState(() => matches('(max-width: 900px)'));
  const [autoCompact, setAutoCompact] = useState(() => matches('(max-width: 1199px)'));
  const [preference, setPreference] = useState<boolean | null>(() => {
    try { const value = localStorage.getItem(preferenceKey); return value === 'compact' ? true : value === 'expanded' ? false : null; }
    catch { return null; }
  });
  const [mobile, setMobile] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const compact = !narrow && (preference ?? autoCompact);

  useEffect(() => {
    const mobileQuery = window.matchMedia?.('(max-width: 900px)');
    const compactQuery = window.matchMedia?.('(max-width: 1199px)');
    const resize = () => {
      const next = mobileQuery?.matches ?? false;
      setNarrow(next); setAutoCompact(compactQuery?.matches ?? false);
      if (!next) setMobile(false);
    };
    mobileQuery?.addEventListener('change', resize);
    compactQuery?.addEventListener('change', resize);
    return () => { mobileQuery?.removeEventListener('change', resize); compactQuery?.removeEventListener('change', resize); };
  }, []);

  useEffect(() => {
    if (!mobile || !narrow) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLButtonElement>('.sidebar-close')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobile(false); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [])
        .filter(control => !control.closest('.sidebar-bottom'));
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keyboard);
      if (!matches('(max-width: 900px)')) document.querySelector<HTMLButtonElement>('.desktop-sidebar-toggle')?.focus();
      else if (previous?.isConnected) previous.focus();
    };
  }, [mobile, narrow]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !mobile &&
          !target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
        event.preventDefault(); searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [mobile]);

  function toggleCompact() {
    const next = !compact;
    setPreference(next);
    try { localStorage.setItem(preferenceKey, next ? 'compact' : 'expanded'); } catch { /* Session preference still works. */ }
  }

  return { compact, narrow, mobile, setMobile, toggleCompact, sidebarRef, menuRef, searchRef };
}

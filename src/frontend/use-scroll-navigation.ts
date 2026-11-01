import { useCallback, useEffect, useRef, useState } from 'react';

type ScrollNavigationOptions = { locked?: boolean; resetKey: string };
const hideAfter = 140;
const downTravel = 24;
const upTravel = 12;
const scrollPosition = () => Math.max(0, Number.isFinite(window.scrollY) ? window.scrollY : 0);

/** Keep navigation available when needed without occupying the reading viewport. */
export function useScrollNavigation({ locked = false, resetKey }: ScrollNavigationOptions) {
  const [hidden, setHidden] = useState(false);
  const lockedRef = useRef(locked);
  const tracking = useRef({ y: 0, direction: 0, travel: 0 });
  lockedRef.current = locked;

  const reveal = useCallback(() => {
    tracking.current = { y: scrollPosition(), direction: 0, travel: 0 };
    setHidden(false);
  }, []);

  useEffect(() => {
    reveal();
  }, [locked, resetKey, reveal]);

  useEffect(() => {
    let frame: number | undefined;
    tracking.current = { y: scrollPosition(), direction: 0, travel: 0 };
    const update = () => {
      frame = undefined;
      const y = scrollPosition();
      const previous = tracking.current;
      const delta = y - previous.y;
      previous.y = y;
      if (lockedRef.current || y <= hideAfter) {
        previous.direction = 0;
        previous.travel = 0;
        setHidden(false);
        return;
      }
      if (delta === 0) return;
      const direction = Math.sign(delta);
      previous.travel = direction === previous.direction ? previous.travel + Math.abs(delta) : Math.abs(delta);
      previous.direction = direction;
      if (direction > 0 && previous.travel >= downTravel) setHidden(true);
      else if (direction < 0 && previous.travel >= upTravel) setHidden(false);
    };
    const scroll = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', scroll);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  return { hidden: hidden && !locked, reveal };
}

import { useState, useEffect } from 'react';

const BREAKPOINT = 768;

// Single source of truth for "are we on a phone-sized viewport" — every
// mobile-specific branch in the app reads this instead of inventing its own
// threshold, so it always agrees with the @media(max-width:768px) CSS rules.
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= BREAKPOINT);

  useEffect(() => {
    let raf = null;
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        setIsMobile(window.innerWidth <= BREAKPOINT);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return isMobile;
}

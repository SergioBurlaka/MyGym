import { useEffect } from 'react';

// The browser tab (and a screen reader on navigation) names the page:
// "Progress · MyGym", not "MyGym" on every route (WCAG 2.4.2). The title is
// built with `t` in render, so a language switch re-runs this with the new one.
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · MyGym` : 'MyGym';
    return () => {
      document.title = 'MyGym';
    };
  }, [title]);
}

import 'react';

// React 18 doesn't know the boolean `inert` attribute yet: an unknown prop is
// passed to the DOM as-is, so `inert=""` sets it and `undefined` removes it.
// Drop this file after moving to React 19, which types `inert` as boolean.
declare module 'react' {
  interface HTMLAttributes<T> {
    inert?: '';
  }
}

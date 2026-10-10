import type { RootOptions } from 'react-dom/client';

// React 19 hands every error an error boundary catches to the root's
// onCaughtError, whose default is console.error(error), in production too. Each
// boundary here reports its own failure once, in componentDidCatch: the desk
// backdrops (DeskBackdrop, DeskBackdropLayer) with one tagged console.warn, the
// app's last-resort AppErrorBoundary with one console.error, since the whole page
// is gone. React's report on top of that would be the second line, and a
// console.error for a backdrop the page survives. So the root stays quiet for a
// boundary that reports, and warns once for one that does not
// (getDerivedStateFromError alone), which would otherwise fail silently.
// onUncaughtError keeps React's default: an error no boundary caught stays loud.
export const onCaughtError: NonNullable<RootOptions['onCaughtError']> = (error, { componentStack, errorBoundary }) => {
  if (typeof errorBoundary?.componentDidCatch !== 'function') console.warn('[boundary]', error, componentStack ?? '');
};

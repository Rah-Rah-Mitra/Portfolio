import React from 'react';

// The four "+" registration marks every blueprint-framed object wears.
export const Corners: React.FC = () => (
  <>
    <i className="corner tl" aria-hidden="true" />
    <i className="corner tr" aria-hidden="true" />
    <i className="corner bl" aria-hidden="true" />
    <i className="corner br" aria-hidden="true" />
  </>
);

// Spreader-bar glyph drawn above every hoisted card.
export const Spreader: React.FC = () => (
  <svg aria-hidden="true" width="44" height="18" viewBox="0 0 44 18" className="spreader">
    <path d="M4 18 22 5m18 13L22 5" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <circle cx="22" cy="3.4" r="2.4" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
);

// A card that rides the window's hoist rig: the physics loop translates/rotates
// it via [data-hoist]. Content goes inside a .blueprint frame supplied by callers.
export const Hoist: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div data-hoist className={className ? `hoist ${className}` : 'hoist'}>
    <Spreader />
    {children}
  </div>
);

export const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <span className="wb-kicker">{children}</span>
    <hr className="wb-rule" />
  </>
);

export const AppIcon: React.FC<{ path: string; size?: number }> = ({ path, size = 21 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={path} />
  </svg>
);

import React, { useEffect, useRef, useState } from 'react';
import { useOptionalAppearance } from '../contexts/AppearanceContext';

const AppearanceViewMenu: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const appearance = useOptionalAppearance();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', keys);
    };
  }, [open]);

  if (!appearance) return null;
  return (
    <div className="appearance-view-menu" ref={rootRef}>
      <button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{compact ? '•••' : 'View'}</button>
      {open && <div role="menu" aria-label="View menu">
        <button type="button" role="menuitem" onClick={() => { appearance.openPreferences('header', 'appearance'); setOpen(false); }}>Appearance…</button>
        <button type="button" role="menuitem" onClick={() => { appearance.openPreferences('header', 'desktop'); setOpen(false); }}>Desktop Background…</button>
        <button type="button" role="menuitem" onClick={() => { appearance.setBackgroundPaused(!appearance.preferences.backgroundPaused); setOpen(false); }}>{appearance.preferences.backgroundPaused ? 'Resume Background' : 'Pause Background'}</button>
        <button type="button" role="menuitem" onClick={() => { appearance.openPreferences('header', 'window'); setOpen(false); }}>Window &amp; Dock…</button>
        <span role="separator" />
        <button type="button" role="menuitem" onClick={() => { appearance.openPreferences('header'); setOpen(false); }}>Preferences… <kbd>⌘,</kbd></button>
      </div>}
    </div>
  );
};

export default AppearanceViewMenu;

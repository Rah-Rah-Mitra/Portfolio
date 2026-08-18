import React, { useEffect, useRef, useState } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import { useOptionalWorkstation } from '../contexts/WorkstationContext';

const nativeContextTargets = 'a, button, input, select, textarea, label, video, audio, canvas, img, p, h1, h2, h3, h4, h5, h6, li, dl, table, [role="dialog"], [role="navigation"], [contenteditable="true"]';

const DesktopAppearanceMenu: React.FC = () => {
  const appearance = useAppearance();
  const workstation = useOptionalWorkstation();
  const [menu, setMenu] = useState<{ x: number; y: number; target: HTMLElement } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const open = (event: MouseEvent) => {
      if (window.matchMedia?.('(max-width: 920px)').matches) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const field = target?.closest<HTMLElement>('[data-desktop-field]');
      if (!target || !field || target.closest(nativeContextTargets)) return;
      event.preventDefault();
      setMenu({ x: Math.min(event.clientX, window.innerWidth - 240), y: Math.min(event.clientY, window.innerHeight - 380), target: field });
    };
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener('contextmenu', open);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('contextmenu', open);
      document.removeEventListener('pointerdown', close);
    };
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    items[0]?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null);
        menu.target.focus({ preventScroll: true });
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const active = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
      const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [menu]);

  if (!menu) return null;
  const choose = (action: () => void) => {
    action();
    setMenu(null);
  };
  return (
    <div ref={menuRef} className="desktop-context-menu" role="menu" aria-label="Desktop menu" style={{ left: menu.x, top: menu.y }}>
      <p>OPTICAL DESKTOP</p>
      {(['dark', 'light', 'system'] as const).map((scheme) => <button key={scheme} type="button" role="menuitemradio" aria-checked={appearance.preferences.scheme === scheme} onClick={() => choose(() => appearance.setScheme(scheme))}>{scheme[0].toUpperCase() + scheme.slice(1)}</button>)}
      <hr />
      <button type="button" role="menuitemradio" aria-checked={appearance.preferences.background === 'nbody'} onClick={() => choose(() => appearance.setBackgroundTheme('nbody'))}>N-body Field</button>
      <button type="button" role="menuitemradio" aria-checked={appearance.preferences.background === 'fluid'} onClick={() => choose(() => appearance.setBackgroundTheme('fluid'))}>Fluid Field</button>
      <button type="button" role="menuitem" onClick={() => choose(() => appearance.setBackgroundPaused(!appearance.preferences.backgroundPaused))}>{appearance.preferences.backgroundPaused ? 'Resume Background' : 'Pause Background'}</button>
      <button type="button" role="menuitem" onClick={() => choose(appearance.resetBackground)}>Reset Background</button>
      <hr />
      {workstation?.enabled && <button type="button" role="menuitem" onClick={() => choose(() => workstation.showDesktop('link'))}>Show Desktop</button>}
      <button type="button" role="menuitem" onClick={() => choose(() => appearance.openPreferences('context-menu'))}>Open Preferences…</button>
    </div>
  );
};

export default DesktopAppearanceMenu;

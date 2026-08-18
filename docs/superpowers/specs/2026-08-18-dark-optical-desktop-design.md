# Dark Optical Desktop Design

## Product contract

The portfolio remains an evidence-first document inside a workstation shell. Dark is the first-visit and no-JavaScript appearance, while Light and System remain persistent choices. Appearance, accent, background, and window material are independent preferences so changing wallpaper never changes portfolio facts or navigation.

The default capable Guided experience is Dark + Teal + N-body. Quick Scan keeps the selected color scheme and accent but never loads a simulation Worker, Fluid renderer, or background WebGL context.

## Interaction design

- The application rail becomes a rounded floating dock with explicit focused, open-background, minimized, and idle states.
- Desktop windows use rounded opaque reading bodies and an optional translucent focused titlebar. Red closes, yellow minimizes, and green toggles maximize/restore. Snapping remains in View/Window menus and keyboard controls.
- Right-click is intercepted only on the desktop field. Text, links, controls, media, windows, and the dock keep the native browser menu.
- The desktop menu offers scheme, background, pause/reset, Show Desktop, and Preferences. The same actions are available through View, a titlebar More menu, `Ctrl/Cmd+,`, and the mobile header.
- Preferences is a single non-modal utility window on desktop and a full-screen sheet below 921px. Its tabs are Appearance, Desktop, Window, and Accessibility.

## Appearance model

Persist a validated `portfolio-appearance-v1` record. Invalid records resolve to the defaults rather than partially applying unsafe values.

- Scheme: Dark, Light, System; default Dark.
- Accent: Teal, Sky, Amber, Violet, Rose; default Teal.
- Background: N-body or Fluid; default N-body.
- Window tint: Neutral, Graphite, Accent; default Graphite.
- Titlebar opacity: 85–100%; default 92%.
- Dock size: Small, Medium, Large; default Medium.
- Reduced transparency forces opaque titlebars while retaining the saved material preference.

Dark tokens are the CSS source defaults. A small head bootstrap applies a valid saved Light or System choice before first paint and synchronizes `color-scheme` and `theme-color`.

## N-body background

Adapt the two-dimensional complex Fast Multipole Method published by keyframe41 under MIT/Public Domain terms. The site describes it as a two-dimensional logarithmic gravitational analogue, never a three-dimensional inverse-square solver.

The solver uses positive masses, an adaptive quadtree, multipole/local series, softened direct near-field acceleration, and kick-drift-kick leapfrog integration. A dedicated Worker owns preallocated typed-array storage. Visible animation ticks drive at most two fixed substeps and transferable position buffers are recycled.

Default N-body values are Galaxy, seed 41, 2,048 requested bodies, order 8, leaf capacity 48, gravity 1, time scale 1, softening 0.012, and 38% trail persistence. User ranges and presets follow the approved product plan. Effective bodies may be reduced by capability or a rolling 24ms worker-step budget, but never automatically raised again in the same session.

OffscreenCanvas 2D is preferred. A main-thread Canvas2D fallback consumes the same frame messages at a reduced body cap. Engineer View reports requested/effective bodies, tree depth, expansion order, step time, and sampled relative error.

## Runtime policy

One `DesktopBackgroundController` owns the selected renderer. Backgrounds pause for hidden documents, Quick Scan, Save-Data, non-overridden reduced motion, global motion pause, and focused heavy labs. Fluid and Three.js use an exclusive GPU lease; the background freezes before relinquishing its context.

No recruiter evidence, résumé, contact action, or project link depends on scheme, background, Preferences, FX, Worker, Canvas, WebGL, or JavaScript.

## Accessibility and performance

- Maintain WCAG AA in every scheme/accent combination and preserve forced-colors behavior.
- Menus use roving focus, arrow navigation, Home/End, Escape, click-away dismissal, and focus restoration.
- Mobile has no drag, resize, or desktop-context-menu requirement.
- Initial JS/CSS stays at or below 250KB gzip; workstation/world stays at or below 350KB gzip; the new lazy background and Worker code stays at or below 80KB gzip.
- Balanced N-body produces no main-thread task above 50ms during the ten-second acceptance trace.

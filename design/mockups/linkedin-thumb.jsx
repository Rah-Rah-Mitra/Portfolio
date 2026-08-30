// linkedin-thumb.jsx — LinkedIn featured-card thumbnail, 1200×627, 3s seamless loop.
// Industry wireframe grammar: steel cable routed over sheaves, meshing gears,
// counterweight on the fall line, nameplate swinging from spreader pins.
const { CompositionStage, useComposition, useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle } = window;

const C = {
  bg: '#f2f2f3', panel: '#f8f8f9', ink: '#1d1f20',
  accent: '#5980a6', mid: '#416180', deep: '#35516d',
  hair: 'rgba(29,31,32,0.30)', faint: 'rgba(29,31,32,0.10)', dim: '#63686e',
};
const F = {
  head: '"Barlow Condensed","Arial Narrow",sans-serif',
  body: 'Barlow,system-ui,sans-serif',
};

function gearPath(r, ri, teeth) {
  const pts = [], s = (Math.PI * 2) / teeth;
  for (let k = 0; k < teeth; k++) {
    const a = k * s;
    pts.push([r * Math.cos(a + s * 0.08), r * Math.sin(a + s * 0.08)]);
    pts.push([r * Math.cos(a + s * 0.42), r * Math.sin(a + s * 0.42)]);
    pts.push([ri * Math.cos(a + s * 0.54), ri * Math.sin(a + s * 0.54)]);
    pts.push([ri * Math.cos(a + s * 0.96), ri * Math.sin(a + s * 0.96)]);
  }
  return 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ') + ' Z';
}

function Gear({ x, y, r, teeth, angle, spokes = 4 }) {
  const ri = r * 0.82, rs = ri * 0.62;
  const arms = Array.from({ length: spokes }, (_, i) => {
    const a = (i * Math.PI * 2) / spokes;
    return <line key={i} x1="0" y1="0" x2={(rs * Math.cos(a)).toFixed(1)} y2={(rs * Math.sin(a)).toFixed(1)} strokeWidth="1" />;
  });
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle.toFixed(2)})`} stroke={C.mid} fill="none">
      <path d={gearPath(r, ri, teeth)} strokeWidth="1.2" />
      <circle r={rs} strokeWidth="0.8" />
      {arms}
      <circle r="2.2" fill={C.mid} stroke="none" />
    </g>
  );
}

function Sheave({ x, y, r, angle }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={C.mid} fill="none">
      <circle r={r} strokeWidth="1.3" />
      <circle r={r - 4} strokeWidth="0.8" />
      <g transform={`rotate(${angle.toFixed(2)})`}>
        <path d={`M${-(r - 4)} 0H${r - 4}M0 ${-(r - 4)}V${r - 4}`} strokeWidth="1" />
      </g>
      <circle r="1.6" fill={C.mid} stroke="none" />
    </g>
  );
}

function Cross({ x, y }) {
  return <path d={`M${x - 5} ${y}h10M${x} ${y - 5}v10`} stroke={C.mid} strokeWidth="1" opacity="0.85" />;
}

function CornerMark({ pos }) {
  const s = { position: 'absolute', width: 9, height: 9, pointerEvents: 'none', ...pos };
  return (
    <svg style={s} viewBox="0 0 9 9">
      <path d="M4.5 0v9M0 4.5h9" stroke={C.mid} strokeWidth="1" />
    </svg>
  );
}

function Piece({ sway }) {
  const { T, authoredTotal } = useComposition();
  const P = authoredTotal || 3;
  const ph = (2 * Math.PI * T) / P;
  const amp = sway == null ? 1.5 : sway;
  const a = amp * Math.sin(ph);                    // plate sway, 1 cycle / loop
  const spin = (360 * T) / P;                      // 1 turn / loop
  const wy = 172 + 14 * Math.sin(ph + Math.PI);    // counterweight bob, antiphase
  const ar = (a * Math.PI) / 180;
  const rot = (x, y, cx, cy) => [cx + (x - cx) * Math.cos(ar) - (y - cy) * Math.sin(ar), cy + (x - cx) * Math.sin(ar) + (y - cy) * Math.cos(ar)];
  const [p1x, p1y] = rot(430, 208, 600, 86);
  const [p2x, p2y] = rot(770, 208, 600, 86);
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, color: C.ink, fontFamily: F.body, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(0deg, ${C.faint} 0 1px, transparent 1px 44px), repeating-linear-gradient(90deg, ${C.faint} 0 1px, transparent 1px 44px)`, opacity: 0.55 }} />
      <svg width="1200" height="627" viewBox="0 0 1200 627" style={{ position: 'absolute', inset: 0 }}>
        <Cross x={26} y={26} /><Cross x={1174} y={26} /><Cross x={26} y={601} /><Cross x={1174} y={601} />
        {/* runway beam + hangers + winch mast */}
        <path d="M36 50h1128M36 54h1128" stroke={C.hair} strokeWidth="1" fill="none" />
        <path d="M430 54v18M770 54v18M1040 54v18M150 54v58" stroke={C.hair} strokeWidth="1" fill="none" />
        <path d="M150 186v404M144 590h12" stroke={C.hair} strokeWidth="1" fill="none" />
        {/* baseline + marching datum */}
        <path d="M36 590h1128" stroke={C.hair} strokeWidth="1" fill="none" />
        <path d="M36 590h1128" stroke={C.accent} strokeWidth="1.4" fill="none" strokeDasharray="4 8" strokeDashoffset={(-(T / P) * 48).toFixed(1)} opacity="0.8" />
        {/* cable: winch → sheave A → sheave B → deflection → counterweight */}
        <path d={`M150 114 Q288 94 416 74 L444 72 Q600 96 756 72 L784 72 Q914 68 1028 74 L1054 88 L1054 ${(wy - 24).toFixed(1)}`} stroke={C.accent} strokeWidth="1.4" fill="none" />
        {/* spreader drops, pivoting with the plate */}
        <path d={`M430 100 L${p1x.toFixed(1)} ${p1y.toFixed(1)}M770 100 L${p2x.toFixed(1)} ${p2y.toFixed(1)}`} stroke={C.accent} strokeWidth="1.2" fill="none" />
        <circle cx={p1x.toFixed(1)} cy={p1y.toFixed(1)} r="2.4" fill="none" stroke={C.mid} strokeWidth="1.1" />
        <circle cx={p2x.toFixed(1)} cy={p2y.toFixed(1)} r="2.4" fill="none" stroke={C.mid} strokeWidth="1.1" />
        <Sheave x={430} y={86} r={14} angle={spin * 2} />
        <Sheave x={770} y={86} r={14} angle={-spin * 2} />
        <Sheave x={1040} y={86} r={14} angle={spin * 2} />
        {/* winch drum + meshing pinion (ratio 2:1 — integer turns, seamless loop) */}
        <Gear x={150} y={150} r={36} teeth={12} angle={spin} spokes={4} />
        <Gear x={204} y={150} r={18} teeth={8} angle={-spin * 2 + 22.5} spokes={3} />
        {/* counterweight riding the fall line */}
        <g transform={`translate(1054 ${wy.toFixed(1)})`}>
          <rect x="-13" y="-24" width="26" height="48" fill={C.accent} stroke={C.deep} strokeWidth="1" />
          <path d="M-13 -8 L13 0 M-13 4 L13 12" stroke={C.deep} strokeWidth="0.8" fill="none" />
        </g>
      </svg>
      {/* the hoisted nameplate */}
      <div style={{ position: 'absolute', left: 280, top: 208, width: 640, boxSizing: 'border-box', padding: '18px 34px 22px', background: C.panel, border: `1px solid ${C.hair}`, transform: `rotate(${a.toFixed(3)}deg)`, transformOrigin: '320px -122px' }}>
        <CornerMark pos={{ left: -5, top: -5 }} /><CornerMark pos={{ right: -5, top: -5 }} /><CornerMark pos={{ left: -5, bottom: -5 }} /><CornerMark pos={{ right: -5, bottom: -5 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 17, letterSpacing: '0.2em', color: C.deep, fontFamily: F.head, fontWeight: 600 }}>PORTFOLIO — FIELD REGISTRY 2026</span>
          <span style={{ fontSize: 15, letterSpacing: '0.12em', color: C.dim }}>REV 09</span>
        </div>
        <h1 style={{ margin: '6px 0 2px', fontFamily: F.head, fontWeight: 600, fontSize: 100, lineHeight: 0.92, letterSpacing: '0.01em', textTransform: 'uppercase' }}>Rahul Mitra</h1>
        <p style={{ margin: '0 0 14px', fontFamily: F.head, fontWeight: 600, fontSize: 31, lineHeight: 1.1, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.deep }}>Systems Architect &amp; AI Engineer</p>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ display: 'inline-block', background: C.accent, color: C.bg, fontFamily: F.head, fontWeight: 600, fontSize: 24, lineHeight: 1, letterSpacing: '0.12em', padding: '11px 24px' }}>VIEW THE WORKBENCH →</span>
          <span style={{ fontFamily: F.head, fontWeight: 600, fontSize: 21, letterSpacing: '0.1em', color: C.dim }}>ISE × CS × MATH — NUS</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(window.LI_TWEAK_DEFAULTS || { motionEditor: true, sway: 1.5 });
  return (
    <React.Fragment>
      <CompositionStage width={1200} height={627} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={C.bg}>
        <Piece sway={t.sway} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Rig motion" />
        <TweakSlider label="Plate sway" value={t.sway} min={0} max={4} step={0.1} unit="°" onChange={(v) => setTweak('sway', v)} />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}
window.LinkedInThumb = App;

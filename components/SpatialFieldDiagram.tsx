import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';

const landmarks = [
  [84, 72], [128, 124], [197, 64], [256, 112], [334, 74], [390, 142],
  [108, 234], [173, 196], [247, 252], [318, 207], [412, 250], [362, 314],
] as const;

const splats = [
  [290, 145, 4], [300, 151, 6], [311, 142, 3], [317, 157, 5], [329, 149, 3],
  [284, 161, 3], [306, 168, 4], [326, 171, 4], [339, 161, 2],
] as const;

const SpatialFieldDiagram: React.FC = () => {
  const frameRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const handlePointer = (event: PointerEvent) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const rect = frame.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      frame.style.setProperty('--field-x', `${x * 7}px`);
      frame.style.setProperty('--field-y', `${y * 5}px`);
    };
    const reset = () => {
      frame.style.setProperty('--field-x', '0px');
      frame.style.setProperty('--field-y', '0px');
    };
    frame.addEventListener('pointermove', handlePointer, { passive: true });
    frame.addEventListener('pointerleave', reset);
    return () => {
      frame.removeEventListener('pointermove', handlePointer);
      frame.removeEventListener('pointerleave', reset);
    };
  }, []);

  const lensLabel = theme === 'light' ? 'BUILD LENS / SYSTEM MAP' : 'SECURE LENS / ATTACK SURFACE';

  return (
    <div ref={frameRef} className="spatial-field" aria-label="Spatial intelligence concept map">
      <div className="field-toolbar" aria-hidden="true">
        <span>{lensLabel}</span>
        <span>FRAME W</span>
        <span>σ = uncertainty</span>
      </div>
      <svg viewBox="0 0 480 360" preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="spatial-title spatial-desc">
        <title id="spatial-title">A localization-inspired map of Rahul's engineering domains</title>
        <desc id="spatial-desc">A pose path travels through observations for perception, optimization, software systems, and secure deployment. The diagram is a portfolio visual motif, not a claim of a completed localization project.</desc>
        <defs>
          <pattern id="occupancy-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" className="field-grid-line" />
          </pattern>
          <marker id="pose-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0 0L6 3L0 6Z" className="field-arrow" />
          </marker>
        </defs>
        <rect x="0" y="0" width="480" height="360" fill="url(#occupancy-grid)" />

        <g className="field-contours" aria-hidden="true">
          <path d="M22 296C88 254 125 302 183 278S299 230 358 264 430 306 470 286" />
          <path d="M18 316C92 274 137 326 197 299S300 251 363 284 430 328 470 309" />
        </g>

        <g className="field-landmarks" aria-hidden="true">
          {landmarks.map(([x, y], index) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r={index % 3 === 0 ? 4 : 2.5} />
              <path d={`M${x - 7} ${y}H${x + 7}M${x} ${y - 7}V${y + 7}`} />
            </g>
          ))}
        </g>

        <g className="field-splats" aria-hidden="true">
          {splats.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}
        </g>

        <g className="field-uncertainty" aria-hidden="true">
          <ellipse cx="129" cy="215" rx="42" ry="18" transform="rotate(-18 129 215)" />
          <ellipse cx="351" cy="114" rx="30" ry="12" transform="rotate(24 351 114)" />
          <ellipse cx="339" cy="286" rx="48" ry="20" transform="rotate(-8 339 286)" />
        </g>

        <path
          className="field-pose-path"
          d="M52 283C94 257 87 212 132 206S177 238 216 204 246 118 296 142 340 223 387 197 416 122 445 98"
          markerEnd="url(#pose-arrow)"
        />
        <g className="field-poses" aria-hidden="true">
          <g transform="translate(53 282) rotate(-28)"><path d="M-9 0H9M3-5L9 0 3 5" /></g>
          <g transform="translate(132 206) rotate(8)"><path d="M-9 0H9M3-5L9 0 3 5" /></g>
          <g transform="translate(216 204) rotate(-46)"><path d="M-9 0H9M3-5L9 0 3 5" /></g>
          <g transform="translate(296 142) rotate(26)"><path d="M-9 0H9M3-5L9 0 3 5" /></g>
          <g transform="translate(387 197) rotate(-34)"><path d="M-9 0H9M3-5L9 0 3 5" /></g>
        </g>

        <g className="camera-frustums" aria-hidden="true">
          <path d="M78 118L110 94V142ZM110 94L132 112 110 142" />
          <path d="M372 245L403 220V271ZM403 220L430 247 403 271" />
        </g>

        <g className="field-labels" aria-hidden="true">
          <text x="32" y="42">OBSERVATION FIELD</text>
          <text x="82" y="188">PERCEPTION</text>
          <text x="208" y="186">OPTIMIZATION</text>
          <text x="323" y="186">DEPLOYMENT</text>
          <text x="317" y="103">SPARSE RECONSTRUCTION</text>
          <text x="302" y="324">UNCERTAINTY / DECISION</text>
        </g>
      </svg>
      <p className="field-caption">Visual bridge: 3D vision foundations → spatial reasoning → optimization → deployed systems.</p>
    </div>
  );
};

export default SpatialFieldDiagram;

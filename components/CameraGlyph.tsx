import React from 'react';

interface CameraGlyphProps {
  angle?: number;
  className?: string;
}

const CameraGlyph: React.FC<CameraGlyphProps> = ({ angle = 0, className = '' }) => (
  <svg
    className={`camera-glyph ${className}`}
    viewBox="0 0 52 34"
    aria-hidden="true"
    style={{ '--camera-angle': `${angle}deg` } as React.CSSProperties}
  >
    <g className="camera-glyph-rig">
      <path className="camera-frustum-shape" d="M19 17 48 4v26Z" />
      <rect className="camera-body-shape" x="4" y="8" width="18" height="18" rx="2" />
      <circle className="camera-lens-shape" cx="15" cy="17" r="4.2" />
      <path className="camera-axis-shape" d="M15 17h28M15 17V2" />
    </g>
  </svg>
);

export default CameraGlyph;

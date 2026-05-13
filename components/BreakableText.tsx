import React, { useRef, useEffect, useMemo, useState } from 'react';
import { layout, prepare } from '@chenglou/pretext';
import { useEffects } from '../contexts/PhysicsContext';

interface BreakableTextProps {
  text: string;
  className?: string;
  physicsEnabled?: boolean;
}

const BreakableText: React.FC<BreakableTextProps> = ({ text, className, physicsEnabled = true }) => {
  const { registerWords, settings } = useEffects();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [lineCount, setLineCount] = useState(1);

  const parts = useMemo(() => text.split(/(\s+)/), [text]);

  useEffect(() => {
    if (physicsEnabled && containerRef.current) {
      const wordElements = Array.from(containerRef.current.querySelectorAll('span[data-word]')) as HTMLElement[];
      if (wordElements.length > 0) {
        const unregister = registerWords(wordElements);
        return unregister;
      }
    }
  }, [parts, registerWords, physicsEnabled]);

  useEffect(() => {
    if (!settings.pretext.enabled || !containerRef.current) {
      setLineCount(1);
      return;
    }

    const element = containerRef.current;
    const measure = () => {
      const styles = window.getComputedStyle(element);
      const width = element.getBoundingClientRect().width;
      if (!width) return;

      const font = styles.font || `${styles.fontSize} ${styles.fontFamily}`;
      const parsedLineHeight = Number.parseFloat(styles.lineHeight);
      const fallbackLineHeight = Number.parseFloat(styles.fontSize) * 1.35;
      const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fallbackLineHeight;
      const prepared = prepare(text, font, { letterSpacing: Number.parseFloat(styles.letterSpacing) || 0 });
      const result = layout(prepared, width, lineHeight);
      setLineCount(Math.max(1, result.lineCount));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [settings.pretext.enabled, text]);
  
  if (!physicsEnabled) {
    return <span className={className}>{text}</span>;
  }

  const effectClass = settings.pretext.enabled ? `pretext-effect pretext-${settings.pretext.mode}` : '';

  return (
    <span
      ref={containerRef}
      className={`${className ?? ''} ${effectClass}`.trim()}
      data-pretext-lines={lineCount}
      style={{ '--pretext-intensity': settings.pretext.intensity } as React.CSSProperties}
    >
      {parts.map((part, i) =>
        /\s+/.test(part) ? (
          <React.Fragment key={i}>{part}</React.Fragment>
        ) : (
          <span key={i} data-word={part} style={{ display: 'inline-block' }}>
            {part}
          </span>
        )
      )}
    </span>
  );
};

export default BreakableText;

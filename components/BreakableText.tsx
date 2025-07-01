
import React, { useRef, useEffect, useMemo } from 'react';
import { usePhysics } from '../contexts/PhysicsContext';

interface BreakableTextProps {
  text: string;
  className?: string;
}

const BreakableText: React.FC<BreakableTextProps> = ({ text, className }) => {
  const { registerWords } = usePhysics();
  const containerRef = useRef<HTMLSpanElement>(null);

  const parts = useMemo(() => text.split(/(\s+)/), [text]);

  useEffect(() => {
    if (containerRef.current) {
      const wordElements = Array.from(containerRef.current.querySelectorAll('span[data-word]')) as HTMLElement[];
      if (wordElements.length > 0) {
        const unregister = registerWords(wordElements);
        return unregister;
      }
    }
  }, [parts, registerWords]);

  return (
    <span ref={containerRef} className={className}>
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

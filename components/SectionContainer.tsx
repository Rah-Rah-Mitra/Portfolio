import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useSectionView } from '../hooks/useSectionView';
import { JOURNEY_STAGES } from '../constants';
import CameraGlyph from './CameraGlyph';

interface SectionContainerProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

const SectionContainer: React.FC<SectionContainerProps> = ({ id, children, className = '', title, subtitle }) => {
  const { theme } = useTheme();
  const sectionRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);
  const stage = useMemo(() => JOURNEY_STAGES.find((candidate) => candidate.id === id), [id]);
  const stageIndex = stage ? JOURNEY_STAGES.indexOf(stage) : -1;

  // Track when 40%+ of this section enters the viewport (fires once per profile)
  useSectionView(id ?? title ?? 'unknown', theme, sectionRef);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setRevealed(true);
      observer.disconnect();
    }, { rootMargin: '0px 0px -10%', threshold: 0.08 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id={id}
      className={`portfolio-section chapter-section ${revealed ? 'is-revealed' : ''} ${className}`}
      data-tone={stage?.tone ?? 'utility'}
      data-enter={stageIndex % 2 === 0 ? 'from-left' : 'from-right'}
      aria-labelledby={title && id ? `${id}-title` : undefined}
    >
      <div className="chapter-field" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <div className="section-frame chapter-reveal">
        {title && (
          <div className="section-heading">
            <h2 id={id ? `${id}-title` : undefined}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
            {stage && (
              <div className="chapter-frame" aria-hidden="true">
                <CameraGlyph angle={stage.angle} />
                <span>{stage.frame}</span>
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
};

export default SectionContainer;

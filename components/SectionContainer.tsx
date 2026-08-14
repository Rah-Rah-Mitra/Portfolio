import React, { useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useSectionView } from '../hooks/useSectionView';

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

  // Track when 40%+ of this section enters the viewport (fires once per profile)
  useSectionView(id ?? title ?? 'unknown', theme, sectionRef);

  return (
    <section ref={sectionRef} id={id} className={`portfolio-section ${className}`}>
      <div className="section-frame">
        {title && (
          <div className="section-heading">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
};

export default SectionContainer;

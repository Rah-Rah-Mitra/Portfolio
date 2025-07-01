
import React from 'react';
import BreakableText from './BreakableText';

interface SectionContainerProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

const SectionContainer: React.FC<SectionContainerProps> = ({ id, children, className = '', title, subtitle }) => {
  return (
    <section id={id} className={`py-16 md:py-24 ${className}`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {title && (
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-sky-400 mb-4">
              <BreakableText text={title} />
            </h2>
            {subtitle && <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto"><BreakableText text={subtitle} /></p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
};

export default SectionContainer;
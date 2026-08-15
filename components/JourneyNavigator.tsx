import React, { useEffect, useMemo, useState } from 'react';
import { JOURNEY_STAGES } from '../constants';
import { track } from '../lib/analytics';
import CameraGlyph from './CameraGlyph';

const JourneyNavigator: React.FC = () => {
  const [activeId, setActiveId] = useState<string>(JOURNEY_STAGES[0].id);
  const activeIndex = useMemo(() => Math.max(0, JOURNEY_STAGES.findIndex((stage) => stage.id === activeId)), [activeId]);

  useEffect(() => {
    const sections = JOURNEY_STAGES
      .map((stage) => document.getElementById(stage.id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveId(visible.target.id);
    }, { rootMargin: '-24% 0px -62%', threshold: [0, 0.16, 0.45] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const progress = JOURNEY_STAGES.length > 1 ? activeIndex / (JOURNEY_STAGES.length - 1) : 0;

  return (
    <nav
      className="journey-navigator"
      aria-label="Camera journey through the portfolio"
      style={{ '--journey-progress': progress } as React.CSSProperties}
    >
      <div className="journey-readout" aria-live="polite">
        <span>Camera {String(activeIndex + 1).padStart(2, '0')} / {String(JOURNEY_STAGES.length).padStart(2, '0')}</span>
        <strong>{JOURNEY_STAGES[activeIndex].label}</strong>
      </div>
      <ol>
        {JOURNEY_STAGES.map((stage, index) => {
          const active = stage.id === activeId;
          return (
            <li key={stage.id} className={active ? 'is-active' : ''}>
              <a
                href={`#${stage.id}`}
                aria-current={active ? 'location' : undefined}
                onClick={() => track('journey_marker_clicked', { section: stage.id, camera_index: index + 1 })}
              >
                <CameraGlyph angle={stage.angle} />
                <span>{stage.label}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default JourneyNavigator;

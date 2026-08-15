import React, { useEffect, useState } from 'react';
import { ResumeProfile } from '../types';
import SectionContainer from './SectionContainer';
import { useTheme } from '../contexts/ThemeContext';
import { track, triggerSessionReplay } from '../lib/analytics';
import CameraGlyph from './CameraGlyph';

interface ResumesSectionProps {
  id: string;
  resumes: ResumeProfile[];
}

const ResumesSection: React.FC<ResumesSectionProps> = ({ id, resumes }) => {
  const { theme } = useTheme();
  const lens = theme === 'light' ? 'build' : 'secure';
  const ordered = [...resumes].sort((a, b) => Number(Boolean(b.recommendedFor?.includes(lens))) - Number(Boolean(a.recommendedFor?.includes(lens))));
  const [activeResumeId, setActiveResumeId] = useState('');
  const activeResume = ordered.find((resume) => resume.id === activeResumeId) ?? ordered[0];
  const activeResumeIndex = Math.max(0, ordered.findIndex((resume) => resume.id === activeResume?.id));

  useEffect(() => {
    setActiveResumeId(ordered[0]?.id ?? '');
  }, [lens]);

  const trackDownload = (resume: ResumeProfile, format: 'pdf' | 'docx') => {
    triggerSessionReplay('resume_download', { source: resume.id });
    track('resume_download_clicked', { role: resume.role, format });
  };

  return (
    <SectionContainer
      id={id}
      title="Choose the résumé for the role"
      subtitle="Seven ATS-friendly variants share one factual record and emphasize different engineering contexts. Every edition is available as PDF and editable DOCX."
      className="resumes-section"
    >
      <div className="resume-guide">
        <p><strong>{lens === 'build' ? 'Build lens' : 'Secure lens'}:</strong> recommended documents appear first. Unsure which one fits? Ask the portfolio assistant for a grounded recommendation.</p>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('portfolio:openAssistant', { detail: { prompt: 'Which résumé should I download?' } }))}>
          Ask for a recommendation
        </button>
      </div>
      <div className="resume-targeting-bay">
        <div className="resume-role-selector" role="tablist" aria-label="Role-targeted résumé variants">
          {ordered.map((resume, index) => {
            const recommended = resume.recommendedFor?.includes(lens);
            return (
              <button
                key={resume.id}
                id={`resume-tab-${resume.id}`}
                type="button"
                role="tab"
                aria-selected={resume.id === activeResume?.id}
                aria-controls="resume-panel"
                onClick={() => setActiveResumeId(resume.id)}
              >
                <CameraGlyph angle={(index - 3) * 3} />
                <span>{resume.role}</span>
                {recommended && <small>Recommended</small>}
              </button>
            );
          })}
        </div>
        {activeResume && (
          <article
            key={activeResume.id}
            id="resume-panel"
            className="resume-entry resume-active-view"
            data-accent={activeResume.accent}
            role="tabpanel"
            aria-labelledby={`resume-tab-${activeResume.id}`}
          >
            <div className="resume-copy">
              <div className="resume-labels">
                <span>Target {String(activeResumeIndex + 1).padStart(2, '0')} / {String(ordered.length).padStart(2, '0')}</span>
                <span>2026-08 edition</span>
                {activeResume.recommendedFor?.includes(lens) && <span className="recommended-label">Recommended for this lens</span>}
              </div>
              <h3>{activeResume.role}</h3>
              <p>{activeResume.headline}</p>
              <div className="resume-keywords" aria-label="Résumé emphasis">
                {activeResume.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
              </div>
            </div>
            <div className="resume-actions">
              <a href={activeResume.pdfUrl} download data-analytics-id={`resume-pdf-${activeResume.id}`} onClick={() => trackDownload(activeResume, 'pdf')}>
                Download PDF <span className="sr-only">for {activeResume.role}</span>
              </a>
              <a href={activeResume.docxUrl} download data-analytics-id={`resume-docx-${activeResume.id}`} onClick={() => trackDownload(activeResume, 'docx')}>
                Download DOCX <span className="sr-only">for {activeResume.role}</span>
              </a>
            </div>
          </article>
        )}
      </div>
    </SectionContainer>
  );
};

export default ResumesSection;

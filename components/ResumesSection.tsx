import React from 'react';
import { ResumeProfile } from '../types';
import SectionContainer from './SectionContainer';
import { useTheme } from '../contexts/ThemeContext';
import { track, triggerSessionReplay } from '../lib/analytics';

interface ResumesSectionProps {
  id: string;
  resumes: ResumeProfile[];
}

const ResumesSection: React.FC<ResumesSectionProps> = ({ id, resumes }) => {
  const { theme } = useTheme();
  const lens = theme === 'light' ? 'build' : 'secure';
  const ordered = [...resumes].sort((a, b) => Number(Boolean(b.recommendedFor?.includes(lens))) - Number(Boolean(a.recommendedFor?.includes(lens))));

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
      <div className="resume-ledger">
        {ordered.map((resume) => {
          const recommended = resume.recommendedFor?.includes(lens);
          return (
            <article key={resume.id} className="resume-entry" data-accent={resume.accent}>
              <div className="resume-copy">
                <div className="resume-labels">
                  <span>2026-08 edition</span>
                  {recommended && <span className="recommended-label">Recommended for this lens</span>}
                </div>
                <h3>{resume.role}</h3>
                <p>{resume.headline}</p>
                <div className="resume-keywords" aria-label="Résumé emphasis">
                  {resume.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
                </div>
              </div>
              <div className="resume-actions">
                <a href={resume.pdfUrl} download data-analytics-id={`resume-pdf-${resume.id}`} onClick={() => trackDownload(resume, 'pdf')}>
                  Download PDF <span className="sr-only">for {resume.role}</span>
                </a>
                <a href={resume.docxUrl} download data-analytics-id={`resume-docx-${resume.id}`} onClick={() => trackDownload(resume, 'docx')}>
                  Download DOCX <span className="sr-only">for {resume.role}</span>
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </SectionContainer>
  );
};

export default ResumesSection;

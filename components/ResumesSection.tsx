import React from 'react';
import { ResumeProfile } from '../types';
import SectionContainer from './SectionContainer';
import { ArrowDownTrayIcon, DocumentTextIcon } from './icons/GenericIcons';
import { track, triggerSessionReplay } from '../lib/analytics';

interface ResumesSectionProps {
  id: string;
  resumes: ResumeProfile[];
}

const accentClasses: Record<ResumeProfile['accent'], string> = {
  cyan: 'border-cyan-400/45 text-cyan-300 hover:border-cyan-300 hover:shadow-cyan-500/20',
  red: 'border-red-500/45 text-red-300 hover:border-red-400 hover:shadow-red-500/20',
  violet: 'border-violet-400/45 text-violet-300 hover:border-violet-300 hover:shadow-violet-500/20',
  green: 'border-emerald-400/45 text-emerald-300 hover:border-emerald-300 hover:shadow-emerald-500/20',
  amber: 'border-amber-400/45 text-amber-300 hover:border-amber-300 hover:shadow-amber-500/20',
  blue: 'border-blue-400/45 text-blue-300 hover:border-blue-300 hover:shadow-blue-500/20',
};

const ResumeCard: React.FC<{ resume: ResumeProfile }> = ({ resume }) => {
  const accent = accentClasses[resume.accent];

  return (
    <article className={`flex h-full flex-col rounded-lg border bg-gray-950/80 p-5 shadow-2xl backdrop-blur transition-all duration-300 ${accent}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-current/35 bg-current/10">
          <DocumentTextIcon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-current">Target resume</p>
          <h3 className="mt-1 text-2xl font-bold text-white">{resume.role}</h3>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-gray-300">{resume.headline}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {resume.keywords.map((keyword) => (
          <span key={keyword} className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-300">
            {keyword}
          </span>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-6">
        <a
          href={resume.pdfUrl}
          download
          data-analytics-id={`resume-pdf-${resume.id}`}
          onClick={() => {
            triggerSessionReplay('resume_download', { source: resume.id });
            track('resume_download_clicked', { role: resume.role, format: 'pdf' });
          }}
          className="inline-flex items-center gap-2 rounded-md border border-current/45 px-3 py-2 text-sm font-semibold text-current transition-colors hover:bg-white/10"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          PDF
        </a>
        <a
          href={resume.docxUrl}
          download
          data-analytics-id={`resume-docx-${resume.id}`}
          onClick={() => {
            triggerSessionReplay('resume_download', { source: resume.id });
            track('resume_download_clicked', { role: resume.role, format: 'docx' });
          }}
          className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-gray-200 transition-colors hover:border-current hover:text-current"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          DOCX
        </a>
      </div>
    </article>
  );
};

const ResumesSection: React.FC<ResumesSectionProps> = ({ id, resumes }) => {
  return (
    <SectionContainer
      id={id}
      title="Role-Targeted Resumes"
      subtitle="Five recruiter-ready variants tuned for Singapore graduate and early-career applications, each available as PDF and DOCX."
      className="bg-gray-950"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        {resumes.map((resume) => (
          <ResumeCard key={resume.id} resume={resume} />
        ))}
      </div>
    </SectionContainer>
  );
};

export default ResumesSection;

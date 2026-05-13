import React from 'react';
import { EnvelopeIcon } from './icons/GenericIcons';
import { GithubIcon, InstagramIcon, LinkedInIcon } from './icons/SocialIcons';
import { track } from '../lib/analytics';

interface FooterProps {
  id: string;
  name: string;
  email: string;
  linkedinUrl?: string;
  githubUrl?: string;
  instagramUrl?: string;
}

const Footer: React.FC<FooterProps> = ({ id, name, email, linkedinUrl, githubUrl, instagramUrl }) => {
  const currentYear = new Date().getFullYear();
  return (
    <footer id={id} className="scroll-mt-28 border-t border-white/10 bg-gray-950 px-4 py-8 text-gray-300 dark:bg-black">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300 dark:text-red-300">Contact</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Build, research, or collaborate</h2>
          <p className="mt-2 text-sm text-gray-400">&copy; {currentYear} {name}. React, Three.js, and a fairly lively effects lab.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`mailto:${email}`}
            onClick={() => track('contact_email_clicked', { location: 'footer' })}
            className="inline-flex items-center gap-2 rounded-md border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/20 dark:border-red-400/35 dark:bg-red-500/10 dark:text-red-100 dark:hover:bg-red-500/20"
          >
            <EnvelopeIcon className="h-5 w-5" />
            Email
          </a>
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('social_link_clicked', { platform: 'linkedin', location: 'footer' })}
              className="rounded-md border border-white/10 p-2 text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
              aria-label="LinkedIn"
            >
              <LinkedInIcon className="h-5 w-5" />
            </a>
          )}
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('social_link_clicked', { platform: 'github', location: 'footer' })}
              className="rounded-md border border-white/10 p-2 text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
              aria-label="GitHub"
            >
              <GithubIcon className="h-5 w-5" />
            </a>
          )}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('social_link_clicked', { platform: 'instagram', location: 'footer' })}
              className="rounded-md border border-white/10 p-2 text-gray-300 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
              aria-label="Instagram"
            >
              <InstagramIcon className="h-5 w-5" />
            </a>
          )}
        </div>
      </div>
    </footer>
  );
};

export default Footer;

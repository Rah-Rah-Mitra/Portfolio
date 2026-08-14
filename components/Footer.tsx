import React from 'react';
import { SITE_CONFIG } from '../siteConfig';
import { track } from '../lib/analytics';

interface FooterProps {
  id: string;
  name: string;
  email: string;
  linkedinUrl?: string;
  githubUrl?: string;
  instagramUrl?: string;
}

const Footer: React.FC<FooterProps> = ({ id, name, email, linkedinUrl, githubUrl }) => (
  <footer id={id} className="site-footer">
    <div className="footer-frame">
      <div className="footer-intro">
        <h2>Build an intelligent system worth trusting.</h2>
        <p className="footer-context">Contact · Singapore</p>
        <p>I am open to engineering roles and collaborations across software, AI, optimization, spatial intelligence, solution architecture, and responsible security.</p>
      </div>
      <div className="footer-actions">
        <a href={`mailto:${email}`} onClick={() => track('contact_email_clicked', { location: 'footer' })}>Email Rahul</a>
        {linkedinUrl && <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('social_link_clicked', { platform: 'linkedin', location: 'footer' })}>LinkedIn<span className="sr-only"> (opens in a new tab)</span></a>}
        {githubUrl && <a href={githubUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('social_link_clicked', { platform: 'github', location: 'footer' })}>GitHub<span className="sr-only"> (opens in a new tab)</span></a>}
      </div>
      <div className="footer-base">
        <p>© {new Date().getFullYear()} {name}. Engineered with React, Three.js, and optional experimental layers.</p>
        <a href={SITE_CONFIG.canonicalUrl}>rahul-mitra.com</a>
      </div>
    </div>
  </footer>
);

export default Footer;

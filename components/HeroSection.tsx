import React from 'react';
import { PortfolioData } from '../types';
import { SECTION_IDS } from '../constants';
import { LinkedInIcon, GithubIcon } from './icons/SocialIcons';
import { track, themeToProfile } from '../lib/analytics';
import { useTheme } from '../contexts/ThemeContext';
import { useEffects } from '../contexts/PhysicsContext';
import SpatialFieldDiagram from './SpatialFieldDiagram';
import { resumeAssetUrl } from '../siteConfig';

interface HeroSectionProps {
  id: string;
  data: Pick<PortfolioData, 'name' | 'profileImageUrl' | 'linkedinUrl' | 'githubUrl'>;
}

const HeroSection: React.FC<HeroSectionProps> = ({ id, data }) => {
  const { theme } = useTheme();
  const { openWorld } = useEffects();
  const isSecure = theme === 'dark';

  const openAssistant = () => {
    window.dispatchEvent(new CustomEvent('portfolio:openAssistant', { detail: { source: 'hero' } }));
    track('cta_clicked', { label: 'Ask this portfolio', profile: themeToProfile(theme) });
  };

  const openEffects = () => {
    window.dispatchEvent(new CustomEvent('portfolio:openEffects', { detail: { source: 'hero' } }));
    track('cta_clicked', { label: 'Open effects lab', profile: themeToProfile(theme) });
  };

  return (
    <section id={id} className="hero-section" aria-labelledby="hero-title">
      <div className="hero-coordinate" aria-hidden="true">W / 01°17′N · 103°51′E</div>
      <div className="hero-layout">
        <div className="hero-copy">
          <div className="hero-identity">
            <img
              src={data.profileImageUrl}
              alt={isSecure ? 'Abstract security profile illustration' : 'Rahul Mitra outdoors on Mount Kinabalu'}
              width="88"
              height="88"
              decoding="async"
              fetchPriority="high"
            />
            <p>
              <span>Rahul Mitra</span>
              NUS ISE · Computer Science · Mathematics
            </p>
          </div>

          <h1 id="hero-title">I build intelligent systems from perception and uncertainty to optimization and deployment.</h1>
          <p className="hero-summary">
            Multidisciplinary engineer connecting software, AI, optimization, and 3D perception—from mathematical foundations to secure, deployed systems.
          </p>

          <div className="hero-lens-note" role="status">
            <span aria-hidden="true" />
            {isSecure
              ? 'Secure lens · responsible-disclosure evidence foregrounded · NUS 3D Computer Vision distinction.'
              : 'Build lens · systems and optimization evidence foregrounded · NUS 3D Computer Vision distinction.'}
          </div>

          <div className="hero-actions" aria-label="Portfolio actions">
            <a
              href={`#${SECTION_IDS.PROJECTS}`}
              className="button button-primary"
              onClick={() => track('cta_clicked', { label: 'View selected work', profile: themeToProfile(theme) })}
            >
              View selected work
            </a>
            <a
              href={resumeAssetUrl(isSecure ? 'cyber-security' : 'general', 'pdf')}
              className="button button-secondary"
              download
              onClick={() => track('resume_download_clicked', { role: isSecure ? 'Cyber Security' : 'General / Master CV', format: 'pdf' })}
            >
              Download resume
            </a>
            <button type="button" className="button button-quiet" data-open-assistant onClick={openAssistant}>Ask this portfolio</button>
          </div>

          <div className="hero-links">
            {data.linkedinUrl && (
              <a href={data.linkedinUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('social_link_clicked', { platform: 'linkedin', location: 'hero' })}>
                <LinkedInIcon className="h-5 w-5" /> LinkedIn
              </a>
            )}
            {data.githubUrl && (
              <a href={data.githubUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('social_link_clicked', { platform: 'github', location: 'hero' })}>
                <GithubIcon className="h-5 w-5" /> GitHub
              </a>
            )}
            <button type="button" data-open-effects onClick={openEffects}>Open effects lab</button>
            <button type="button" data-open-world onClick={() => openWorld('hero_spatial_link')}>Open spatial portfolio map</button>
          </div>
        </div>

        <SpatialFieldDiagram />
      </div>

      <div className="hero-proof-strip" aria-label="Fast portfolio facts">
        <p><strong>NUS distinction</strong><span>Top student, 3D Computer Vision (class of 24)</span></p>
        <p><strong>Optimization</strong><span>Hybrid flow-shop digital twin and constraint programming</span></p>
        <p><strong>Engineering range</strong><span>Open source, civic tech, AI systems, and security research</span></p>
      </div>
    </section>
  );
};

export default HeroSection;

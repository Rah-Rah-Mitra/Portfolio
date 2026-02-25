import React, { useEffect, useRef } from 'react';
import { PortfolioData } from '../types';
import { SECTION_IDS } from '../constants';
import { LinkedInIcon, GithubIcon, InstagramIcon } from './icons/SocialIcons';
import BreakableText from './BreakableText';
import TypedHeader from './TypedHeader';
import { useTheme } from '../contexts/ThemeContext';
import GlitchHeader from './GlitchHeader';
import { track, themeToProfile } from '../lib/analytics';

interface HeroSectionProps {
  id: string;
  data: Pick<PortfolioData, 'name' | 'tagline' | 'bio' | 'profileImageUrl' | 'linkedinUrl' | 'githubUrl' | 'instagramUrl'>;
}

/**
 * Floating 3D profile orb.
 * The image sits inside a preserve-3d container that continuously floats
 * via the `float-3d` CSS animation defined in index.html.
 * On mouse move over the hero, we add a gentle parallax rotation.
 */
const ProfileOrb: React.FC<{ src: string; name: string }> = ({ src, name }) => {
  const orbRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const hero = orbRef.current?.closest('section');
    if (!hero) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const rect = hero.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (orbRef.current) {
          orbRef.current.style.transform = `perspective(800px) rotateY(${x * 14}deg) rotateX(${-y * 10}deg)`;
        }
      });
    };

    const handleMouseLeave = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (orbRef.current) {
        orbRef.current.style.transform = '';
        orbRef.current.style.transition = 'transform 1s cubic-bezier(0.23, 1, 0.32, 1)';
        setTimeout(() => {
          if (orbRef.current) orbRef.current.style.transition = '';
        }, 1000);
      }
    };

    hero.addEventListener('mousemove', handleMouseMove, { passive: true });
    hero.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      hero.removeEventListener('mousemove', handleMouseMove);
      hero.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div
      ref={orbRef}
      className="orb-3d"
      style={{
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Glow ring behind image */}
      <div
        className="absolute inset-0 rounded-full bg-blue-500/20 dark:bg-red-500/20 blur-2xl scale-110"
        style={{ transform: 'translateZ(-10px)' }}
        aria-hidden="true"
      />
      <img
        src={src}
        alt={name}
        loading="eager"
        decoding="async"
        className="rounded-full w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 object-cover border-4 border-blue-500 dark:border-red-500 shadow-2xl relative z-10"
        style={{ transform: 'translateZ(0)' }}
      />
      {/* Specular highlight — top edge sheen */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1/4 bg-white/10 rounded-full blur-xl pointer-events-none"
        style={{ transform: 'translateZ(20px)' }}
        aria-hidden="true"
      />
    </div>
  );
};

const HeroSection: React.FC<HeroSectionProps> = ({ id, data }) => {
  const { theme } = useTheme();

  return (
    <section
      id={id}
      className="min-h-screen flex items-center justify-center text-white relative overflow-hidden pt-20 hero-bg"
    >
      {/* 3D perspective grid background */}
      <div className="hero-grid-bg absolute inset-0 pointer-events-none" aria-hidden="true" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 z-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-12">
          {/* Text column */}
          <div className="md:w-3/5 text-center md:text-left">
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold mb-4 h-24 flex items-center justify-center md:justify-start">
              {theme === 'light' ? (
                <TypedHeader name={data.name} />
              ) : (
                <GlitchHeader name={data.name} />
              )}
            </h1>

            <div className="text-xl sm:text-2xl lg:text-3xl text-gray-300 mb-6 font-medium">
              <BreakableText text={data.tagline} />
            </div>

            <div className="text-lg text-gray-400 mb-8 leading-relaxed max-w-2xl mx-auto md:mx-0">
              <BreakableText text={data.bio} />
            </div>

            <div className="flex justify-center md:justify-start space-x-4 mb-8">
              {data.linkedinUrl && (
                <a
                  href={data.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('social_link_clicked', { platform: 'linkedin', location: 'hero' })}
                  className="text-gray-400 hover:text-blue-400 dark:hover:text-red-500 transition-colors duration-300 transform hover:scale-110"
                >
                  <LinkedInIcon className="w-8 h-8" />
                </a>
              )}
              {data.githubUrl && (
                <a
                  href={data.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('social_link_clicked', { platform: 'github', location: 'hero' })}
                  className="text-gray-400 hover:text-blue-400 dark:hover:text-red-500 transition-colors duration-300 transform hover:scale-110"
                >
                  <GithubIcon className="w-8 h-8" />
                </a>
              )}
              {data.instagramUrl && (
                <a
                  href={data.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('social_link_clicked', { platform: 'instagram', location: 'hero' })}
                  className="text-gray-400 hover:text-blue-400 dark:hover:text-red-500 transition-colors duration-300 transform hover:scale-110"
                >
                  <InstagramIcon className="w-8 h-8" />
                </a>
              )}
            </div>

            <a
              href={`#${SECTION_IDS.ACHIEVEMENTS}`}
              onClick={() => track('cta_clicked', { label: 'View My Work', profile: themeToProfile(theme) })}
              className="inline-block bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 dark:from-red-600 dark:to-rose-700 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-300"
            >
              View My Work
            </a>
          </div>

          {/* 3D floating profile orb */}
          <div className="md:w-2/5 flex justify-center items-center">
            <div className="float-3d-container relative">
              <ProfileOrb src={data.profileImageUrl} name={data.name} />
            </div>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2">
        <a href={`#${SECTION_IDS.ACHIEVEMENTS}`} aria-label="Scroll to achievements">
          <svg
            className="w-8 h-8 text-gray-500 animate-bounce"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </a>
      </div>
    </section>
  );
};

export default HeroSection;

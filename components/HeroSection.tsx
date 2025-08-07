import React from 'react';
import { PortfolioData } from '../types';
import { SECTION_IDS } from '../constants';
import { LinkedInIcon, GithubIcon, InstagramIcon } from './icons/SocialIcons';
import BreakableText from './BreakableText';
import TypedHeader from './TypedHeader';
import { useTheme } from '../contexts/ThemeContext';
import GlitchHeader from './GlitchHeader';

interface HeroSectionProps {
  id: string;
  data: Pick<PortfolioData, 'name' | 'tagline' | 'bio' | 'profileImageUrl' | 'linkedinUrl' | 'githubUrl' | 'instagramUrl'>;
}

const HeroSection: React.FC<HeroSectionProps> = ({ id, data }) => {
  const { theme } = useTheme();

  return (
    <section id={id} className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900 dark:from-black dark:via-gray-900 dark:to-black text-white relative overflow-hidden pt-20">
      <div className="absolute inset-0 opacity-10">
        {/* Subtle background pattern or animation if desired */}
      </div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 z-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="md:w-3/5 text-center md:text-left">
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold mb-4 h-24 flex items-center justify-center md:justify-start">
              {theme === 'light' ? (
                <TypedHeader name={data.name} />
              ) : (
                <GlitchHeader name={data.name} />
              )}
            </h1>
            <div className="text-xl sm:text-2xl lg:text-3xl text-gray-300 mb-6 font-medium">
              <BreakableText text={data.tagline}/>
            </div>
            <div className="text-lg text-gray-400 mb-8 leading-relaxed max-w-2xl mx-auto md:mx-0">
               <BreakableText text={data.bio} />
            </div>

            <div className="flex justify-center md:justify-start space-x-4 mb-8">
              {data.linkedinUrl && (
                <a href={data.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 dark:hover:text-red-500 transition-colors duration-300">
                  <LinkedInIcon className="w-8 h-8" />
                </a>
              )}
              {data.githubUrl && (
                <a href={data.githubUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 dark:hover:text-red-500 transition-colors duration-300">
                  <GithubIcon className="w-8 h-8" />
                </a>
              )}
              {data.instagramUrl && (
                <a href={data.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 dark:hover:text-red-500 transition-colors duration-300">
                  <InstagramIcon className="w-8 h-8" />
                </a>
              )}
            </div>
            <a
              href={`#${SECTION_IDS.ACHIEVEMENTS}`}
              className="inline-block bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 dark:from-red-600 dark:to-rose-700 dark:hover:from-red-700 dark:hover:to-rose-800 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-300"
            >
              View My Work
            </a>
          </div>
          <div className="md:w-2/5 flex justify-center">
            <img
              src={data.profileImageUrl}
              alt={data.name}
              className="rounded-full w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 object-cover border-4 border-blue-500 dark:border-red-500 shadow-2xl"
            />
          </div>
        </div>
      </div>
       {/* Optional: Add a subtle down arrow or scroll cue */}
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2">
        <a href={`#${SECTION_IDS.ACHIEVEMENTS}`} aria-label="Scroll to achievements">
          <svg className="w-8 h-8 text-gray-500 animate-bounce" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M19 9l-7 7-7-7"></path>
          </svg>
        </a>
      </div>
    </section>
  );
};

export default HeroSection;
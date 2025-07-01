
import React from 'react';
import SectionContainer from './SectionContainer';
import { EnvelopeIcon } from './icons/GenericIcons';
import { LinkedInIcon, GithubIcon, TwitterIcon } from './icons/SocialIcons';

interface ContactSectionProps {
  id: string;
  email: string;
  linkedinUrl?: string;
  githubUrl?: string;
  twitterUrl?: string;
}

const ContactSection: React.FC<ContactSectionProps> = ({ id, email, linkedinUrl, githubUrl, twitterUrl }) => {
  return (
    <SectionContainer 
      id={id} 
      title="Get In Touch"
      subtitle="I'm always open to discussing new projects, creative ideas, or opportunities to be part of something great. Feel free to reach out!"
      className="bg-gray-900"
    >
      <div className="max-w-lg mx-auto text-center">
        <div className="bg-gray-800 p-8 md:p-10 rounded-xl shadow-2xl">
          <div className="flex items-center justify-center mb-6 text-emerald-400">
            <EnvelopeIcon className="w-10 h-10 mr-3" />
            <a 
              href={`mailto:${email}`} 
              className="text-xl md:text-2xl font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              {email}
            </a>
          </div>
          <p className="text-gray-400 mb-8">
            Alternatively, connect with me on social media:
          </p>
          <div className="flex justify-center space-x-6">
            {linkedinUrl && (
              <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-emerald-400 transition-colors duration-300 transform hover:scale-110">
                <LinkedInIcon className="w-8 h-8" />
              </a>
            )}
            {githubUrl && (
              <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-emerald-400 transition-colors duration-300 transform hover:scale-110">
                <GithubIcon className="w-8 h-8" />
              </a>
            )}
            {twitterUrl && (
              <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-emerald-400 transition-colors duration-300 transform hover:scale-110">
                <TwitterIcon className="w-8 h-8" />
              </a>
            )}
          </div>
        </div>
      </div>
    </SectionContainer>
  );
};

export default ContactSection;
    
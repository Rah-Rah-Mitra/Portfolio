import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { DeveloperIcon, ShieldIcon } from './icons/ThemeIcons';
import { ChevronDownIcon } from './icons/GenericIcons';

interface ProfileSwitcherProps {
  triggerLocation: 'navbar_desktop' | 'navbar_mobile';
}

const ProfileSwitcher: React.FC<ProfileSwitcherProps> = ({ triggerLocation }) => {
  const { currentProfile, switchProfile } = useTheme();

  const nextProfileName = currentProfile === 'software_engineer' ? 'Cybersecurity' : 'Software Engineer';
  const currentProfileName = currentProfile === 'software_engineer' ? 'Software Engineer' : 'Cybersecurity';

  return (
    <button
      onClick={() => switchProfile(triggerLocation)}
      aria-label={`Switch to ${nextProfileName} profile`}
      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-gray-300 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 dark:focus:ring-red-500 transition-colors"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Profile</span>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        {currentProfile === 'software_engineer' ? (
          <DeveloperIcon className="h-5 w-5" />
        ) : (
          <ShieldIcon className="h-5 w-5" />
        )}
        <span>{currentProfileName}</span>
      </span>
      <ChevronDownIcon className="h-4 w-4 text-gray-400" />
    </button>
  );
};

export default ProfileSwitcher;

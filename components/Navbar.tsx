import React, { useState, useEffect, useMemo, useRef } from 'react';
import { NAVIGATION_LINKS } from '../constants';
import { Bars3Icon, XMarkIcon } from './icons/GenericIcons';
import { track } from '../lib/analytics';
import { useTheme, Theme } from '../contexts/ThemeContext';
import { softwareEngineerData, cybersecurityData } from '../portfolioData';

interface NavbarProps {
  name: string;
}

const Navbar: React.FC<NavbarProps> = ({ name }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [focusedProfileIndex, setFocusedProfileIndex] = useState(0);
  const desktopProfileButtonRef = useRef<HTMLButtonElement>(null);
  const mobileProfileButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileCardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastProfileTrigger = useRef<'desktop' | 'mobile'>('desktop');
  const { theme, setTheme } = useTheme();
  
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const profileOptions = useMemo(() => [
    {
      theme: 'light' as Theme,
      name: softwareEngineerData.name,
      tagline: softwareEngineerData.tagline,
      avatar: softwareEngineerData.profileImageUrl,
    },
    {
      theme: 'dark' as Theme,
      name: cybersecurityData.name,
      tagline: cybersecurityData.tagline,
      avatar: cybersecurityData.profileImageUrl,
    },
  ], []);

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const activeIndex = profileOptions.findIndex((option) => option.theme === theme);
    const initialIndex = activeIndex === 0 ? 1 : 0;
    setFocusedProfileIndex(initialIndex);
  }, [isProfileMenuOpen, profileOptions, theme]);

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    profileCardRefs.current[focusedProfileIndex]?.focus();
  }, [focusedProfileIndex, isProfileMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        profileMenuRef.current?.contains(target) ||
        desktopProfileButtonRef.current?.contains(target) ||
        mobileProfileButtonRef.current?.contains(target)
      ) {
        return;
      }
      setIsProfileMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const closeProfileMenu = () => {
    setIsProfileMenuOpen(false);
    const targetButton = lastProfileTrigger.current === 'desktop'
      ? desktopProfileButtonRef.current
      : mobileProfileButtonRef.current;
    targetButton?.focus();
  };

  const handleProfileSwitch = (nextTheme: Theme) => {
    if (nextTheme !== theme) {
      setTheme(nextTheme);
    }
    setIsProfileMenuOpen(false);
  };

  const handleProfileTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    trigger: 'desktop' | 'mobile'
  ) => {
    lastProfileTrigger.current = trigger;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsProfileMenuOpen((prev) => !prev);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsProfileMenuOpen(true);
      setFocusedProfileIndex(event.key === 'ArrowDown' ? 0 : profileOptions.length - 1);
    }
  };

  const handleProfileMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeProfileMenu();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedProfileIndex((prev) => (prev + 1) % profileOptions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedProfileIndex((prev) => (prev - 1 + profileOptions.length) % profileOptions.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedOption = profileOptions[focusedProfileIndex];
      handleProfileSwitch(selectedOption.theme);
    }
  };

  return (
    <nav className={`fixed w-full z-50 transition-all duration-300 ease-in-out ${isScrolled || isOpen ? 'bg-gray-800 dark:bg-gray-900' : 'bg-transparent'}`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex-shrink-0">
            <a href="#home" className="text-2xl font-bold text-white hover:text-blue-400 dark:hover:text-red-500 transition-colors">
              {initials}
            </a>
          </div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-4">
              {NAVIGATION_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => track('nav_link_clicked', { destination: link.label })}
                  className="text-gray-300 hover:bg-gray-700 hover:text-blue-400 dark:hover:text-red-500 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="relative">
                <button
                  ref={desktopProfileButtonRef}
                  type="button"
                  onClick={() => {
                    lastProfileTrigger.current = 'desktop';
                    setIsProfileMenuOpen((prev) => !prev);
                  }}
                  onKeyDown={(event) => handleProfileTriggerKeyDown(event, 'desktop')}
                  aria-haspopup="menu"
                  aria-expanded={isProfileMenuOpen}
                  aria-controls="profile-menu"
                  className="inline-flex items-center gap-2 rounded-full border border-gray-600 bg-gray-800/80 px-3 py-2 text-sm text-gray-200 hover:border-blue-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 dark:hover:border-red-500 dark:focus:ring-red-500 transition-colors"
                >
                  <img
                    src={theme === 'light' ? softwareEngineerData.profileImageUrl : cybersecurityData.profileImageUrl}
                    alt={`${name} avatar`}
                    className="h-7 w-7 rounded-full object-cover ring-2 ring-gray-500"
                  />
                  <span className="hidden lg:inline">Profile</span>
                </button>
                {isProfileMenuOpen && (
                  <div
                    id="profile-menu"
                    ref={profileMenuRef}
                    role="menu"
                    aria-label="Profile switcher"
                    onKeyDown={handleProfileMenuKeyDown}
                    className="absolute right-0 mt-3 w-80 rounded-xl border border-gray-700 bg-gray-900/95 p-3 shadow-2xl backdrop-blur-sm"
                  >
                    <div className="space-y-3">
                      {profileOptions.map((option, index) => {
                        const isActive = option.theme === theme;
                        return (
                          <button
                            key={option.theme}
                            ref={(element) => {
                              profileCardRefs.current[index] = element;
                            }}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            onClick={() => handleProfileSwitch(option.theme)}
                            className={`group w-full rounded-lg border p-3 text-left transition-all focus:outline-none focus:ring-2 ${
                              isActive
                                ? 'border-blue-400 ring-2 ring-blue-400/80 dark:border-red-500 dark:ring-red-500/80'
                                : 'border-gray-700 hover:border-blue-400 dark:hover:border-red-500'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <img src={option.avatar} alt={`${option.name} avatar`} className="h-12 w-12 rounded-full object-cover" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-white">{option.name}</p>
                                  {isActive && (
                                    <>
                                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-300 dark:bg-red-500/20 dark:text-red-300">
                                        Current
                                      </span>
                                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs text-white dark:bg-red-500">
                                        ✓
                                      </span>
                                    </>
                                  )}
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-gray-300">{option.tagline}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="md:hidden flex items-center">
            <div className="relative">
              <button
                ref={mobileProfileButtonRef}
                type="button"
                onClick={() => {
                  lastProfileTrigger.current = 'mobile';
                  setIsProfileMenuOpen((prev) => !prev);
                }}
                onKeyDown={(event) => handleProfileTriggerKeyDown(event, 'mobile')}
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                aria-controls="profile-menu-mobile"
                className="inline-flex items-center rounded-full border border-gray-600 bg-gray-800/80 p-1 text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-red-500"
              >
                <img
                  src={theme === 'light' ? softwareEngineerData.profileImageUrl : cybersecurityData.profileImageUrl}
                  alt={`${name} avatar`}
                  className="h-8 w-8 rounded-full object-cover"
                />
              </button>
              {isProfileMenuOpen && (
                <div
                  id="profile-menu-mobile"
                  ref={profileMenuRef}
                  role="menu"
                  aria-label="Profile switcher"
                  onKeyDown={handleProfileMenuKeyDown}
                  className="absolute right-0 mt-3 w-72 rounded-xl border border-gray-700 bg-gray-900/95 p-3 shadow-2xl"
                >
                  <div className="space-y-3">
                    {profileOptions.map((option, index) => {
                      const isActive = option.theme === theme;
                      return (
                        <button
                          key={`mobile-${option.theme}`}
                          ref={(element) => {
                            profileCardRefs.current[index] = element;
                          }}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          onClick={() => handleProfileSwitch(option.theme)}
                          className={`w-full rounded-lg border p-3 text-left focus:outline-none focus:ring-2 ${
                            isActive
                              ? 'border-blue-400 ring-2 ring-blue-400/80 dark:border-red-500 dark:ring-red-500/80'
                              : 'border-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <img src={option.avatar} alt={`${option.name} avatar`} className="h-10 w-10 rounded-full object-cover" />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-white">{option.name}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-gray-300">{option.tagline}</p>
                            </div>
                            {isActive && (
                              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-300 dark:bg-red-500/20 dark:text-red-300">
                                Current
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={toggleMenu}
              type="button"
              className="ml-2 inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 dark:focus:ring-red-500"
              aria-controls="mobile-menu"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              {isOpen ? (
                <XMarkIcon className="block h-6 w-6" />
              ) : (
                <Bars3Icon className="block h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu, show/hide based on menu state. */}
      {isOpen && (
        <div className="md:hidden bg-gray-800 dark:bg-gray-900" id="mobile-menu">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {NAVIGATION_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => { setIsOpen(false); track('nav_link_clicked', { destination: link.label }); }}
                className="text-gray-300 hover:bg-gray-700 hover:text-blue-400 dark:hover:text-red-500 block px-3 py-2 rounded-md text-base font-medium transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

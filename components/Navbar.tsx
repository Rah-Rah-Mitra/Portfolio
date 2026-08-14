import React, { useEffect, useRef, useState } from 'react';
import { NAVIGATION_LINKS } from '../constants';
import { Bars3Icon, XMarkIcon } from './icons/GenericIcons';
import ThemeToggle from './ThemeToggle';
import { track } from '../lib/analytics';

interface NavbarProps {
  name: string;
}

const Navbar: React.FC<NavbarProps> = ({ name }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState(NAVIGATION_LINKS[0]?.href ?? '#work');
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 18);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const sections = NAVIGATION_LINKS
      .map((link) => document.querySelector<HTMLElement>(link.href))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveHref(`#${visible.target.id}`);
    }, { rootMargin: '-18% 0px -68%', threshold: [0, 0.2, 0.6] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const followLink = (label: string) => {
    setIsOpen(false);
    track('nav_link_clicked', { destination: label });
  };

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to portfolio content</a>
      <header className={`site-header ${isScrolled || isOpen ? 'is-scrolled' : ''}`}>
        <nav className="nav-frame" aria-label="Primary navigation">
          <a href="#home" className="brand-lockup" aria-label={`RM ${name}, home`}>
            <span className="brand-mark" aria-hidden="true">RM</span>
            <span className="brand-copy">
              <strong>{name}</strong>
              <small>intelligent systems</small>
            </span>
          </a>

          <div className="desktop-nav">
            {NAVIGATION_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                aria-current={activeHref === link.href ? 'location' : undefined}
                data-analytics-id={`nav-${link.label.toLowerCase()}`}
                onClick={() => followLink(link.label)}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="nav-actions">
            <ThemeToggle />
            <button
              ref={menuButtonRef}
              type="button"
              className="menu-button"
              onClick={() => setIsOpen((current) => !current)}
              aria-controls="mobile-menu"
              aria-expanded={isOpen}
            >
              <span className="sr-only">{isOpen ? 'Close navigation' : 'Open navigation'}</span>
              {isOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        <div id="mobile-menu" className={`mobile-nav ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
          {NAVIGATION_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              tabIndex={isOpen ? 0 : -1}
              aria-current={activeHref === link.href ? 'location' : undefined}
              onClick={() => followLink(link.label)}
            >
              {link.label}
            </a>
          ))}
        </div>
      </header>
    </>
  );
};

export default Navbar;

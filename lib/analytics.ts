/// <reference types="vite/client" />

/**
 * Analytics — PostHog event tracking
 *
 * All portfolio events are typed here so every call site is
 * checked at compile time. Add new events by extending AnalyticsEvent.
 *
 * PostHog keys are public-facing (write-only by design), so it is
 * safe to ship them in client-side code.
 */
import posthog from 'posthog-js';

// ─────────────────────────────────────────────────────────────────────────────
// TYPED EVENT MAP
// ─────────────────────────────────────────────────────────────────────────────

export type Profile = 'software_engineer' | 'cybersecurity';

export type AnalyticsEvent =
  // ── Profile / theme ────────────────────────────────────────────────────────
  | { event: 'profile_viewed';    props: { profile: Profile } }
  | { event: 'profile_switched';  props: { from: Profile; to: Profile } }

  // ── Navigation / scroll depth ──────────────────────────────────────────────
  | { event: 'section_viewed';    props: { section: string; profile: Profile } }
  | { event: 'nav_link_clicked';  props: { destination: string } }

  // ── Hero CTA ───────────────────────────────────────────────────────────────
  | { event: 'cta_clicked';       props: { label: string; profile: Profile } }

  // ── Social / contact ───────────────────────────────────────────────────────
  | { event: 'social_link_clicked';  props: { platform: 'linkedin' | 'github' | 'instagram'; location: 'hero' | 'contact' } }
  | { event: 'contact_email_clicked'; props: Record<string, never> }

  // ── Achievements ───────────────────────────────────────────────────────────
  | { event: 'achievement_viewed';   props: { title: string; category: string; index: number; profile: Profile } }
  | { event: 'achievement_hovered';  props: { title: string; hover_duration_ms: number } }

  // ── Easter egg: physics mode ───────────────────────────────────────────────
  | { event: 'physics_mode_toggled'; props: { mode: 'hammer' | 'gravity_well'; action: 'activated' | 'deactivated' } };

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

export function initAnalytics(): void {
  const key  = import.meta.env.VITE_POSTHOG_KEY  as string | undefined;
  const host = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

  if (!key) {
    console.warn('[analytics] VITE_POSTHOG_KEY not set — tracking disabled.');
    return;
  }

  posthog.init(key, {
    api_host: host ?? 'https://us.i.posthog.com',

    // Capture an automatic $pageview on init
    capture_pageview: true,

    // Respect DNT headers and cookie consent
    respect_dnt: true,

    // Use localStorage instead of cookies for the anonymous ID
    persistence: 'localStorage',

    // Disable session recording — we only want event analytics
    disable_session_recording: true,

    // Autocapture clicks/inputs off — we fire explicit events only
    autocapture: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPED TRACK HELPER
// ─────────────────────────────────────────────────────────────────────────────

export function track<E extends AnalyticsEvent['event']>(
  event: E,
  props: Extract<AnalyticsEvent, { event: E }>['props'],
): void {
  try {
    posthog.capture(event, props as Record<string, unknown>);
  } catch {
    // Never let analytics errors surface to users
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE HELPER — converts the theme string to a readable profile name
// ─────────────────────────────────────────────────────────────────────────────

export function themeToProfile(theme: 'light' | 'dark'): Profile {
  return theme === 'light' ? 'software_engineer' : 'cybersecurity';
}

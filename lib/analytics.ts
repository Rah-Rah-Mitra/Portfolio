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
  | { event: 'physics_mode_toggled'; props: { mode: 'hammer' | 'gravity_well'; action: 'activated' | 'deactivated' } }
  | { event: 'effect_control_changed'; props: { effect: string; control: string; value: string } }
  | { event: 'project_link_clicked'; props: { title: string; destination: string } }
  | { event: 'event_project_link_clicked'; props: { event: string; project: string } }
  | { event: 'event_link_clicked'; props: { event: string; destination: string } }
  | { event: 'chatbot_command_submitted'; props: { used_model: string; command_count: string } };

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

// Public write-only key — safe to embed in client code.
// PostHog project keys only allow event ingestion, not data retrieval.
const POSTHOG_KEY  = import.meta.env.VITE_POSTHOG_KEY  ?? 'phc_Du7oytV0G71MoNKsFMGluZCLle9EofUcEDPeINSvzPR';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';
let analyticsEnabled = false;

export function initAnalytics(): void {
  if (import.meta.env.DEV) {
    return;
  }

  analyticsEnabled = true;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,

    // Capture an automatic $pageview on init
    capture_pageview: true,

    // Do NOT respect DNT — this silently disables all tracking if the browser
    // has "Do Not Track" enabled (common in dev browsers like Chrome).
    respect_dnt: false,

    // Use localStorage instead of cookies for the anonymous ID
    persistence: 'localStorage',

    // Disable session recording — event analytics only
    disable_session_recording: true,

    // Autocapture off — we fire explicit typed events only
    autocapture: false,

    loaded(ph) {
      if (import.meta.env.DEV) {
        console.log('[analytics] PostHog ready. Distinct ID:', ph.get_distinct_id());
      }
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPED TRACK HELPER
// ─────────────────────────────────────────────────────────────────────────────

export function track<E extends AnalyticsEvent['event']>(
  event: E,
  props: Extract<AnalyticsEvent, { event: E }>['props'],
): void {
  if (!analyticsEnabled) {
    return;
  }

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

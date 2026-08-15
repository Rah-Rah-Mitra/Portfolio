/// <reference types="vite/client" />

import type {
  CaptureResult,
  LogAttributes,
  LogSeverityLevel,
  PostHogConfig,
  Properties,
} from 'posthog-js';

type PostHogClient = (typeof import('posthog-js'))['default'];

export type Profile = 'software_engineer' | 'cybersecurity';
export type PanelName = 'effects_lab' | 'ask_the_page' | 'ask_this_portfolio';

export type UrlTargetSummary = {
  target_type: 'preset' | 'external' | 'invalid';
  target_label?: string;
  target_host: string;
};

type ReplayReason =
  | 'api_error'
  | 'ask_page_command'
  | 'frontend_exception'
  | 'high_intent_click'
  | 'npc_dialogue_opened'
  | 'resume_download'
  | 'world_opened';

export type AnalyticsEvent =
  | { event: 'profile_viewed'; props: { profile: Profile } }
  | { event: 'profile_switched'; props: { from: Profile; to: Profile } }
  | { event: 'section_viewed'; props: { section: string; profile: Profile } }
  | { event: 'scroll_depth_reached'; props: { depth: 25 | 50 | 75 | 90; profile: Profile } }
  | { event: 'nav_link_clicked'; props: { destination: string } }
  | { event: 'journey_marker_clicked'; props: { section: string; camera_index: number } }
  | { event: 'cta_clicked'; props: { label: string; profile: Profile } }
  | { event: 'social_link_clicked'; props: { platform: 'linkedin' | 'github' | 'instagram'; location: 'hero' | 'contact' | 'footer' } }
  | { event: 'contact_email_clicked'; props: Partial<{ location: 'contact' | 'footer' }> }
  | { event: 'achievement_viewed'; props: { title: string; category: string; index: number; profile: Profile } }
  | { event: 'achievement_proof_opened'; props: { title: string } }
  | { event: 'achievement_hovered'; props: { title: string; hover_duration_ms: number } }
  | { event: 'physics_mode_toggled'; props: { mode: 'hammer' | 'gravity_well'; action: 'activated' | 'deactivated' } }
  | { event: 'effect_control_changed'; props: { effect: string; control: string; value: string } }
  | { event: 'effect_preset_applied'; props: { effect: string; preset: string } }
  | { event: 'project_link_clicked'; props: { title: string; destination: string } }
  | { event: 'selected_project_view_changed'; props: { project: string; source: string } }
  | { event: 'featured_projects_toggled'; props: { expanded: boolean; visible_count: number } }
  | { event: 'project_archive_toggled'; props: { expanded: boolean; visible_count: number } }
  | { event: 'archive_search_changed'; props: { query_length: number; result_count: number } }
  | { event: 'resume_download_clicked'; props: { role: string; format: 'docx' | 'pdf' } }
  | { event: 'qr_target_selected'; props: UrlTargetSummary }
  | { event: 'qr_code_clicked'; props: UrlTargetSummary }
  | { event: 'qr_code_downloaded'; props: UrlTargetSummary & { format: 'png' | 'svg' } }
  | { event: 'event_project_link_clicked'; props: { event: string; project: string } }
  | { event: 'event_link_clicked'; props: { event: string; destination: string } }
  | { event: 'field_notes_filter_changed'; props: { filter: string } }
  | { event: 'panel_opened'; props: { panel: PanelName; source: string } }
  | { event: 'panel_closed'; props: { panel: PanelName; reason: string; duration_ms: number } }
  | { event: 'chatbot_quick_action_clicked'; props: { action: string; command_count: string } }
  | { event: 'chatbot_command_submitted'; props: { used_model: string; command_count: string; status: string; fallback_reason?: string } }
  | { event: 'api_request_completed'; props: { route: string; status: number | 'network_error'; ok: boolean; duration_ms: number; response_source: string } }
  | { event: 'world_opened'; props: { source: string } }
  | { event: 'world_closed'; props: { reason: string; duration_ms: number } }
  | { event: 'pointer_lock_changed'; props: { locked: boolean } }
  | { event: 'npc_dialogue_opened'; props: { npc_id: string; title: string; method: string } }
  | { event: 'world_link_clicked'; props: { npc_id: string; title: string; destination_host: string } }
  | { event: 'session_replay_triggered'; props: { reason: ReplayReason; source?: string } }
  | { event: 'frontend_exception_captured'; props: { area: string; error_name: string } };

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const POSTHOG_UI_HOST = import.meta.env.VITE_POSTHOG_UI_HOST ?? 'https://us.posthog.com';
const ANALYTICS_DEBUG = import.meta.env.VITE_ANALYTICS_DEBUG === 'true';
const SERVICE_VERSION = import.meta.env.VITE_APP_VERSION ?? 'portfolio-web';
const SENSITIVE_PROPERTY_PARTS = ['authorization', 'email', 'input', 'message', 'pageState', 'prompt', 'reply', 'token'];

let analyticsEnabled = false;
let analyticsConfigured = false;
let posthogClient: PostHogClient | null = null;
let analyticsLoadPromise: Promise<boolean> | null = null;
const pendingAnalyticsActions: Array<(client: PostHogClient) => void> = [];

const getViewportBucket = () => {
  if (typeof window === 'undefined') return 'server';
  const width = window.innerWidth;
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

const getReferrerHost = () => {
  if (typeof document === 'undefined' || !document.referrer) return 'direct';
  try {
    return new URL(document.referrer).hostname || 'direct';
  } catch {
    return 'unknown';
  }
};

const getCurrentProfile = (): Profile => {
  if (typeof window === 'undefined') return 'software_engineer';
  return themeToProfile(window.localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
};

const getBaseProperties = (): Properties => ({
  app_surface: 'portfolio',
  active_profile: getCurrentProfile(),
  viewport_bucket: getViewportBucket(),
  referrer_host: getReferrerHost(),
});

const redactSensitiveProperties = (properties: Properties): Properties => {
  const next = { ...properties };
  Object.keys(next).forEach((key) => {
    const normalized = key.toLowerCase();
    if (SENSITIVE_PROPERTY_PARTS.some((part) => normalized.includes(part.toLowerCase()))) {
      delete next[key];
    }
  });
  return next;
};

const sanitizeCapture = (capture: CaptureResult | null): CaptureResult | null => {
  if (!capture) return capture;
  return {
    ...capture,
    properties: redactSensitiveProperties(capture.properties ?? {}),
  };
};

const shouldEnableAnalytics = () => Boolean(POSTHOG_KEY) && (!import.meta.env.DEV || ANALYTICS_DEBUG);

const runOrQueueAnalytics = (action: (client: PostHogClient) => void) => {
  if (!analyticsConfigured) return;
  if (analyticsEnabled && posthogClient) {
    action(posthogClient);
    return;
  }
  if (pendingAnalyticsActions.length < 80) pendingAnalyticsActions.push(action);
};

const loadAnalytics = async (): Promise<boolean> => {
  if (!analyticsConfigured) return false;
  if (analyticsEnabled && posthogClient) return true;
  if (analyticsLoadPromise) return analyticsLoadPromise;

  analyticsLoadPromise = (async () => {
    try {
      const { default: posthog } = await import('posthog-js');
      posthogClient = posthog;
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        ui_host: POSTHOG_UI_HOST,
        defaults: '2026-01-30',
        capture_pageview: 'history_change',
        capture_pageleave: true,
        respect_dnt: false,
        persistence: 'localStorage+cookie',
        person_profiles: 'identified_only',
        property_denylist: SENSITIVE_PROPERTY_PARTS,
        before_send: sanitizeCapture,
        autocapture: {
          dom_event_allowlist: ['click', 'change', 'submit'],
          element_allowlist: ['a', 'button', 'form', 'input', 'select', 'textarea', 'label'],
          element_attribute_ignorelist: ['value', 'placeholder'],
          capture_copied_text: false,
        },
        capture_heatmaps: true,
        enable_heatmaps: true,
        capture_dead_clicks: {
          element_attribute_ignorelist: ['value', 'placeholder'],
        },
        rageclick: {
          content_ignorelist: true,
          css_selector_ignorelist: ['.ph-no-capture', '.ph-no-rageclick', '.effect-range'],
        },
        capture_exceptions: true,
        disable_session_recording: false,
        enable_recording_console_log: false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '.ph-mask, [data-private]',
          blockSelector: '.ph-no-capture, [data-block-replay]',
        },
        logs: {
          captureConsoleLogs: false,
          serviceName: 'rahul-portfolio-web',
          environment: import.meta.env.MODE,
          serviceVersion: SERVICE_VERSION,
          maxLogsPerInterval: 100,
        },
        capture_performance: {
          network_timing: true,
          web_vitals: true,
          web_vitals_attribution: true,
        },
        rate_limiting: {
          events_per_second: 8,
          events_burst_limit: 32,
        },
        loaded(ph) {
          ph.register_once({ first_seen_profile: getCurrentProfile() });
          ph.register(getBaseProperties());
          if (ANALYTICS_DEBUG) console.log('[analytics] PostHog ready. Distinct ID:', ph.get_distinct_id());
        },
      } satisfies Partial<PostHogConfig>);

      analyticsEnabled = true;
      pendingAnalyticsActions.splice(0).forEach((action) => {
        try { action(posthog); } catch { /* Analytics is non-critical. */ }
      });
      return true;
    } catch (error) {
      analyticsLoadPromise = null;
      if (ANALYTICS_DEBUG) console.warn('[analytics] PostHog could not be loaded.', error);
      return false;
    }
  })();

  return analyticsLoadPromise;
};

export function initAnalytics(): boolean {
  if (!shouldEnableAnalytics()) {
    analyticsEnabled = false;
    analyticsConfigured = false;
    if (ANALYTICS_DEBUG && !POSTHOG_KEY) console.warn('[analytics] VITE_POSTHOG_KEY is missing; PostHog is disabled.');
    return false;
  }

  analyticsConfigured = true;
  if (typeof window === 'undefined') {
    void loadAnalytics();
    return true;
  }

  let fallbackTimer = 0;
  const begin = () => {
    window.removeEventListener('pointerdown', begin, true);
    window.removeEventListener('keydown', begin, true);
    window.clearTimeout(fallbackTimer);
    void loadAnalytics();
  };
  window.addEventListener('pointerdown', begin, { once: true, capture: true });
  window.addEventListener('keydown', begin, { once: true, capture: true });
  fallbackTimer = window.setTimeout(begin, 30_000);
  return true;
}

export function getPostHogClient() {
  return posthogClient;
}

export function isAnalyticsEnabled(): boolean {
  return analyticsEnabled;
}

export function track<E extends AnalyticsEvent['event']>(
  event: E,
  props: Extract<AnalyticsEvent, { event: E }>['props'],
): void {
  runOrQueueAnalytics((client) => {
    try {
      client.capture(event, {
        ...getBaseProperties(),
        ...(props as Record<string, unknown>),
      });
    } catch {
      // Analytics must never affect the portfolio experience.
    }
  });
}

export function logClientEvent(level: LogSeverityLevel, body: string, attributes: LogAttributes = {}): void {
  runOrQueueAnalytics((client) => {
    try {
      client.captureLog({
        level,
        body,
        attributes: redactSensitiveProperties({
          ...getBaseProperties(),
          ...attributes,
        }),
      });
    } catch {
      // No-op by design.
    }
  });
}

export function captureAnalyticsException(error: unknown, properties: { area: string } & Properties): void {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  triggerSessionReplay('frontend_exception', { source: properties.area });
  track('frontend_exception_captured', { area: String(properties.area), error_name: errorName });

  runOrQueueAnalytics((client) => {
    try {
      client.captureException(error, redactSensitiveProperties({
        ...getBaseProperties(),
        ...properties,
      }));
    } catch {
      // No-op by design.
    }
  });
  void loadAnalytics();
}

export function triggerSessionReplay(reason: ReplayReason, properties: { source?: string } = {}): void {
  runOrQueueAnalytics((client) => {
    try {
      client.startSessionRecording({ sampling: true, event_trigger: true });
      client.capture('session_replay_triggered', {
        ...getBaseProperties(),
        reason,
        ...properties,
      });
    } catch {
      // Replay should be opportunistic, never required.
    }
  });
}

export function summarizeUrlTarget(rawTarget: string, targetLabel?: string): UrlTargetSummary {
  try {
    const parsed = new URL(rawTarget);
    return {
      target_type: targetLabel ? 'preset' : 'external',
      target_label: targetLabel,
      target_host: parsed.hostname || 'unknown',
    };
  } catch {
    return {
      target_type: 'invalid',
      target_label: targetLabel,
      target_host: 'invalid',
    };
  }
}

export function themeToProfile(theme: 'light' | 'dark'): Profile {
  return theme === 'light' ? 'software_engineer' : 'cybersecurity';
}

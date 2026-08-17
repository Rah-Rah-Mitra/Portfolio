import type { PortfolioWorldEvent, SceneId } from '../types';

export const PORTFOLIO_WORLD_EVENT = 'portfolio:world-event';
export const EXPLORE_CONTROL_EVENT = 'portfolio:explore-control';

export type ExploreControlDetail = { action: 'enter' | 'exit'; sceneId: SceneId };

export const dispatchPortfolioWorldEvent = (event: PortfolioWorldEvent) => {
  window.dispatchEvent(new CustomEvent<PortfolioWorldEvent>(PORTFOLIO_WORLD_EVENT, { detail: event }));
};

export const dispatchExploreControl = (detail: ExploreControlDetail) => {
  window.dispatchEvent(new CustomEvent<ExploreControlDetail>(EXPLORE_CONTROL_EVENT, { detail }));
};

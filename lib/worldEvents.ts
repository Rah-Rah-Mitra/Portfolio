import type { PortfolioWorldEvent } from '../types';

export const PORTFOLIO_WORLD_EVENT = 'portfolio:world-event';

export const dispatchPortfolioWorldEvent = (event: PortfolioWorldEvent) => {
  window.dispatchEvent(new CustomEvent<PortfolioWorldEvent>(PORTFOLIO_WORLD_EVENT, { detail: event }));
};

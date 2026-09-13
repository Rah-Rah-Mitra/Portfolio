import { configure } from '@testing-library/react';

// jsdom suites in this repo mount components that reveal content through
// IntersectionObserver, rAF and layout effects, so testing-library's 1s default
// async budget is a race rather than a deadline. Under full-suite load the
// jsdom project runs ~20 files concurrently and several of them lost that race
// intermittently — project-showcase first, then workstation-integration,
// optical-bench and workbench-deeplink as the suite grew.
//
// Raising the budget here rather than per-file: the cause is shared (load), and
// a per-file fix is whack-a-mole that only lands after each new flake has
// already cost someone a red run. Nothing is weakened — a genuinely broken
// assertion still fails, it just gets long enough to be measured fairly.
configure({ asyncUtilTimeout: 5000 });

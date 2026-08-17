export type Coordinate = [number, number];
export type SpatialOverlay = 'eligibility' | 'capacity';

export type SyntheticPlot = {
  id: 'north' | 'east' | 'south' | 'west';
  label: string;
  coordinate: Coordinate;
  eligible: boolean;
  capacity: number;
};

export const DEFAULT_MARKER: Coordinate = [45, 44];

export const SYNTHETIC_PLOTS: readonly SyntheticPlot[] = [
  { id: 'north', label: 'North', coordinate: [18, 18], eligible: true, capacity: 3 },
  { id: 'east', label: 'East', coordinate: [82, 22], eligible: true, capacity: 5 },
  { id: 'south', label: 'South', coordinate: [65, 78], eligible: false, capacity: 4 },
  { id: 'west', label: 'West', coordinate: [20, 72], eligible: true, capacity: 2 },
];

export type SpatialDistance = {
  plot: SyntheticPlot;
  distance: number;
  nearestEligibleRegion: boolean;
};

export type SpatialState = {
  marker: Coordinate;
  distances: SpatialDistance[];
  nearestEligible: SyntheticPlot;
  route: { from: Coordinate; to: Coordinate };
  overlays: Record<SpatialOverlay, boolean>;
};

export const clampCoordinate = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

const distanceBetween = ([ax, ay]: Coordinate, [bx, by]: Coordinate) =>
  Math.round(Math.hypot(ax - bx, ay - by) * 100) / 100;

const resolveSpatialState = (marker: Coordinate, overlays: SpatialState['overlays']): SpatialState => {
  const normalized: Coordinate = [clampCoordinate(marker[0]), clampCoordinate(marker[1])];
  const rawDistances = SYNTHETIC_PLOTS.map((plot) => ({ plot, distance: distanceBetween(normalized, plot.coordinate) }));
  const nearestEligibleEntry = rawDistances
    .filter(({ plot }) => plot.eligible)
    .reduce((nearest, entry) => entry.distance < nearest.distance ? entry : nearest);
  return {
    marker: normalized,
    distances: rawDistances.map((entry) => ({ ...entry, nearestEligibleRegion: entry.plot.id === nearestEligibleEntry.plot.id })),
    nearestEligible: nearestEligibleEntry.plot,
    route: { from: [...normalized], to: [...nearestEligibleEntry.plot.coordinate] },
    overlays: { ...overlays },
  };
};

export const createSpatialState = (): SpatialState => resolveSpatialState(DEFAULT_MARKER, { eligibility: false, capacity: false });

export const moveSpatialMarker = (state: SpatialState, marker: Coordinate): SpatialState =>
  resolveSpatialState(marker, state.overlays);

export const toggleSpatialOverlay = (state: SpatialState, overlay: SpatialOverlay): SpatialState => ({
  ...state,
  overlays: { ...state.overlays, [overlay]: !state.overlays[overlay] },
});

export const resetSpatialState = (_state?: SpatialState): SpatialState => createSpatialState();

export type AbilityId = 'smash' | 'gravityWell' | 'fluid';

export type SliderMetadata = {
  min: number;
  max: number;
  step: number;
};

export type AbilityDefinition<TParams extends Record<string, number>> = {
  defaults: TParams;
  sliders: { [K in keyof TParams]: SliderMetadata };
};

export type SmashParams = {
  force: number;
  areaWidthRatio: number;
  areaHeightRatio: number;
  restitutionInfluence: number;
};

export type GravityWellParams = {
  radiusRatio: number;
  acceleration: number;
  falloff: number;
};

export type FluidParams = {
  viscosity: number;
  density: number;
  particleCount: number;
  solverIterations: number;
  interactionForce: number;
};

export type AbilityConfig = {
  smash: AbilityDefinition<SmashParams>;
  gravityWell: AbilityDefinition<GravityWellParams>;
  fluid: AbilityDefinition<FluidParams>;
};

export const abilityConfig: AbilityConfig = {
  smash: {
    defaults: {
      force: 0.05,
      areaWidthRatio: 0.4,
      areaHeightRatio: 0.4,
      restitutionInfluence: 0.4,
    },
    sliders: {
      force: { min: 0.005, max: 0.2, step: 0.005 },
      areaWidthRatio: { min: 0.1, max: 1, step: 0.05 },
      areaHeightRatio: { min: 0.1, max: 1, step: 0.05 },
      restitutionInfluence: { min: 0, max: 1, step: 0.05 },
    },
  },
  gravityWell: {
    defaults: {
      radiusRatio: 0.4,
      acceleration: 0.02,
      falloff: 1,
    },
    sliders: {
      radiusRatio: { min: 0.1, max: 1, step: 0.05 },
      acceleration: { min: 0.001, max: 0.1, step: 0.001 },
      falloff: { min: 0.1, max: 3, step: 0.1 },
    },
  },
  fluid: {
    defaults: {
      viscosity: 0.1,
      density: 1,
      particleCount: 200,
      solverIterations: 4,
      interactionForce: 0.015,
    },
    sliders: {
      viscosity: { min: 0, max: 1, step: 0.01 },
      density: { min: 0.1, max: 5, step: 0.1 },
      particleCount: { min: 50, max: 2000, step: 50 },
      solverIterations: { min: 1, max: 20, step: 1 },
      interactionForce: { min: 0.001, max: 0.1, step: 0.001 },
    },
  },
};

export type AbilityParamsMap = {
  [K in AbilityId]: AbilityConfig[K]['defaults'];
};

export const defaultAbilityParams: AbilityParamsMap = {
  smash: { ...abilityConfig.smash.defaults },
  gravityWell: { ...abilityConfig.gravityWell.defaults },
  fluid: { ...abilityConfig.fluid.defaults },
};

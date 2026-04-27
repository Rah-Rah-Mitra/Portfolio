export type FluidQuality = 'low' | 'medium' | 'high';

export interface FluidQualityConfig {
  particleCount: number;
  solverIterations: number;
}

export interface FluidParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  density: number;
  pressure: number;
}

interface PointerState {
  x: number;
  y: number;
  radius: number;
  strength: number;
  isDown: boolean;
}

interface Repulsor {
  x: number;
  y: number;
  radius: number;
}

const QUALITY_CONFIG: Record<FluidQuality, FluidQualityConfig> = {
  low: { particleCount: 96, solverIterations: 2 },
  medium: { particleCount: 156, solverIterations: 3 },
  high: { particleCount: 240, solverIterations: 4 },
};

const REST_DENSITY = 7.5;
const PRESSURE_STIFFNESS = 0.12;
const VISCOSITY = 0.25;
const SMOOTHING_RADIUS = 28;
const CELL_SIZE = SMOOTHING_RADIUS;
const PARTICLE_RADIUS = 6;
const BOUNDARY_DAMPING = -0.24;

export class FluidSystem {
  private particles: FluidParticle[] = [];
  private width: number;
  private height: number;
  private quality: FluidQuality;
  private pointer: PointerState = {
    x: 0,
    y: 0,
    radius: 100,
    strength: 0,
    isDown: false,
  };
  private grid = new Map<string, number[]>();

  constructor(width: number, height: number, quality: FluidQuality) {
    this.width = width;
    this.height = height;
    this.quality = quality;
    this.seedParticles();
  }

  static getQualityConfig(quality: FluidQuality): FluidQualityConfig {
    return QUALITY_CONFIG[quality];
  }

  setBounds(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  setPointer(state: Partial<PointerState>): void {
    this.pointer = {
      ...this.pointer,
      ...state,
    };
  }

  setQuality(quality: FluidQuality): void {
    if (this.quality === quality) {
      return;
    }

    this.quality = quality;
    this.seedParticles();
  }

  getQuality(): FluidQuality {
    return this.quality;
  }

  getParticles(): FluidParticle[] {
    return this.particles;
  }

  getParticleRadius(): number {
    return PARTICLE_RADIUS;
  }

  step(dt: number, repulsors: Repulsor[]): void {
    if (!this.particles.length) {
      return;
    }

    this.applyPointerAndGravity(dt);
    this.buildGrid();

    const iterations = QUALITY_CONFIG[this.quality].solverIterations;
    for (let i = 0; i < iterations; i += 1) {
      this.computeDensityPressure();
      this.solvePressureAndViscosity(dt);
      this.applyRepulsors(repulsors);
      this.resolveBounds();
      this.buildGrid();
    }

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    this.resolveBounds();
  }

  private seedParticles(): void {
    const count = QUALITY_CONFIG[this.quality].particleCount;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * (this.width / Math.max(this.height, 1)))));
    const spacing = Math.max(PARTICLE_RADIUS * 1.6, Math.min(this.width / (cols + 1), 22));
    const rows = Math.max(1, Math.ceil(count / cols));

    this.particles = [];

    let id = 0;
    for (let row = 0; row < rows && id < count; row += 1) {
      for (let col = 0; col < cols && id < count; col += 1) {
        this.particles.push({
          id,
          x: 40 + col * spacing,
          y: 40 + row * spacing,
          vx: 0,
          vy: 0,
          density: REST_DENSITY,
          pressure: 0,
        });
        id += 1;
      }
    }
  }

  private applyPointerAndGravity(dt: number): void {
    const gravity = 48;

    for (const p of this.particles) {
      p.vy += gravity * dt;
      p.vx *= 0.996;
      p.vy *= 0.996;

      if (!this.pointer.isDown || this.pointer.strength === 0) {
        continue;
      }

      const dx = p.x - this.pointer.x;
      const dy = p.y - this.pointer.y;
      const distanceSq = dx * dx + dy * dy;
      const radiusSq = this.pointer.radius * this.pointer.radius;

      if (distanceSq >= radiusSq) {
        continue;
      }

      const distance = Math.sqrt(Math.max(distanceSq, 0.0001));
      const falloff = 1 - distance / this.pointer.radius;
      const force = this.pointer.strength * falloff * dt;
      p.vx += (dx / distance) * force;
      p.vy += (dy / distance) * force;
    }
  }

  private buildGrid(): void {
    this.grid.clear();

    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      const key = this.toCellKey(p.x, p.y);
      const existing = this.grid.get(key);

      if (existing) {
        existing.push(i);
      } else {
        this.grid.set(key, [i]);
      }
    }
  }

  private computeDensityPressure(): void {
    const radiusSq = SMOOTHING_RADIUS * SMOOTHING_RADIUS;

    for (const p of this.particles) {
      let density = 0;
      const neighbors = this.getNeighborParticles(p.x, p.y);

      for (const n of neighbors) {
        const dx = n.x - p.x;
        const dy = n.y - p.y;
        const distSq = dx * dx + dy * dy;

        if (distSq >= radiusSq) {
          continue;
        }

        density += this.poly6Kernel(radiusSq - distSq);
      }

      p.density = Math.max(density, REST_DENSITY * 0.3);
      p.pressure = PRESSURE_STIFFNESS * Math.max(0, p.density - REST_DENSITY);
    }
  }

  private solvePressureAndViscosity(dt: number): void {
    for (const p of this.particles) {
      let forceX = 0;
      let forceY = 0;
      const neighbors = this.getNeighborParticles(p.x, p.y);

      for (const n of neighbors) {
        if (p.id === n.id) {
          continue;
        }

        const dx = n.x - p.x;
        const dy = n.y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0 || distance >= SMOOTHING_RADIUS) {
          continue;
        }

        const nx = dx / distance;
        const ny = dy / distance;

        const pressureTerm = (p.pressure + n.pressure) / (2 * n.density);
        const spikyGradient = this.spikyGradientKernel(distance);

        forceX -= nx * pressureTerm * spikyGradient;
        forceY -= ny * pressureTerm * spikyGradient;

        const velocityDifferenceX = n.vx - p.vx;
        const velocityDifferenceY = n.vy - p.vy;
        const viscosityLaplacian = this.viscosityLaplacian(distance);

        forceX += VISCOSITY * velocityDifferenceX * viscosityLaplacian;
        forceY += VISCOSITY * velocityDifferenceY * viscosityLaplacian;
      }

      p.vx += forceX * dt;
      p.vy += forceY * dt;
    }
  }

  private applyRepulsors(repulsors: Repulsor[]): void {
    if (!repulsors.length) {
      return;
    }

    for (const p of this.particles) {
      for (const repulsor of repulsors) {
        const dx = p.x - repulsor.x;
        const dy = p.y - repulsor.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = repulsor.radius + PARTICLE_RADIUS;

        if (distance >= minDistance || distance === 0) {
          continue;
        }

        const overlap = minDistance - distance;
        const nx = dx / distance;
        const ny = dy / distance;

        p.x += nx * overlap;
        p.y += ny * overlap;
        p.vx += nx * 0.9;
        p.vy += ny * 0.9;
      }
    }
  }

  private resolveBounds(): void {
    const maxX = this.width - PARTICLE_RADIUS;
    const maxY = this.height - PARTICLE_RADIUS;

    for (const p of this.particles) {
      if (p.x < PARTICLE_RADIUS) {
        p.x = PARTICLE_RADIUS;
        p.vx *= BOUNDARY_DAMPING;
      } else if (p.x > maxX) {
        p.x = maxX;
        p.vx *= BOUNDARY_DAMPING;
      }

      if (p.y < PARTICLE_RADIUS) {
        p.y = PARTICLE_RADIUS;
        p.vy *= BOUNDARY_DAMPING;
      } else if (p.y > maxY) {
        p.y = maxY;
        p.vy *= BOUNDARY_DAMPING;
      }
    }
  }

  private getNeighborParticles(x: number, y: number): FluidParticle[] {
    const cellX = Math.floor(x / CELL_SIZE);
    const cellY = Math.floor(y / CELL_SIZE);
    const neighbors: FluidParticle[] = [];

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const key = `${cellX + dx},${cellY + dy}`;
        const indices = this.grid.get(key);

        if (!indices) {
          continue;
        }

        for (const index of indices) {
          neighbors.push(this.particles[index]);
        }
      }
    }

    return neighbors;
  }

  private toCellKey(x: number, y: number): string {
    return `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`;
  }

  private poly6Kernel(radiusDeltaSq: number): number {
    return radiusDeltaSq * radiusDeltaSq * radiusDeltaSq * 0.00000002;
  }

  private spikyGradientKernel(distance: number): number {
    const q = 1 - distance / SMOOTHING_RADIUS;
    return q * q * 0.8;
  }

  private viscosityLaplacian(distance: number): number {
    return Math.max(0, (SMOOTHING_RADIUS - distance) / SMOOTHING_RADIUS);
  }
}

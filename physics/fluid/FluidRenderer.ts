import { Theme } from '../../contexts/ThemeContext';
import { FluidParticle } from './FluidSystem';

interface ThemePalette {
  base: string;
  glow: string;
  highlight: string;
}

const THEME_PALETTES: Record<Theme, ThemePalette> = {
  light: {
    base: 'rgba(59, 130, 246, 0.18)',
    glow: 'rgba(147, 197, 253, 0.18)',
    highlight: 'rgba(191, 219, 254, 0.42)',
  },
  dark: {
    base: 'rgba(239, 68, 68, 0.15)',
    glow: 'rgba(252, 165, 165, 0.12)',
    highlight: 'rgba(254, 202, 202, 0.3)',
  },
};

export class FluidRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private theme: Theme;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number, theme: Theme) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.theme = theme;
  }

  setBounds(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  render(particles: FluidParticle[], radius: number, isActive: boolean): void {
    this.ctx.clearRect(0, 0, this.width, this.height);

    if (!isActive || !particles.length) {
      return;
    }

    const palette = THEME_PALETTES[this.theme];
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';

    for (const particle of particles) {
      const gradient = this.ctx.createRadialGradient(
        particle.x,
        particle.y,
        radius * 0.2,
        particle.x,
        particle.y,
        radius * 2.3,
      );
      gradient.addColorStop(0, palette.highlight);
      gradient.addColorStop(0.45, palette.base);
      gradient.addColorStop(1, palette.glow);

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, radius * 2.3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }
}

import React, { useEffect, useRef } from 'react';
import { useEffects } from '../contexts/PhysicsContext';
import { useTheme } from '../contexts/ThemeContext';

const FluidBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { settings } = useEffects();
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animationId = 0;
    let start = performance.now();

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * scale);
      canvas.height = Math.floor(window.innerHeight * scale);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };

    const draw = (time: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const elapsed = (time - start) / 1000;
      const speed = media.matches || !settings.fluid.enabled ? 0 : settings.fluid.speed;
      const intensity = settings.fluid.enabled ? settings.fluid.intensity / 100 : 0;
      const accent = theme === 'light' ? '34, 211, 238' : '248, 113, 113';
      const secondary = theme === 'light' ? '59, 130, 246' : '168, 85, 247';

      context.clearRect(0, 0, width, height);
      context.fillStyle = theme === 'light' ? 'rgba(3, 7, 18, 0.92)' : 'rgba(0, 0, 0, 0.94)';
      context.fillRect(0, 0, width, height);

      const layers = 5;
      for (let layer = 0; layer < layers; layer += 1) {
        const yBase = height * (0.2 + layer * 0.16);
        const amplitude = (38 + layer * 16) * intensity;
        const frequency = 0.006 + layer * 0.0013;
        const phase = elapsed * speed * (0.4 + layer * 0.12) + layer * 1.7;

        context.beginPath();
        for (let x = -40; x <= width + 40; x += 16) {
          const y = yBase + Math.sin(x * frequency + phase) * amplitude + Math.cos(x * frequency * 0.7 - phase) * amplitude * 0.5;
          if (x === -40) context.moveTo(x, y);
          else context.lineTo(x, y);
        }

        context.strokeStyle = `rgba(${layer % 2 ? secondary : accent}, ${0.06 + intensity * 0.16})`;
        context.lineWidth = 1 + layer * 0.4;
        context.shadowColor = `rgba(${layer % 2 ? secondary : accent}, ${0.14 + intensity * 0.18})`;
        context.shadowBlur = 18;
        context.stroke();
        context.shadowBlur = 0;
      }

      const gridSize = 64;
      context.strokeStyle = `rgba(${accent}, ${0.025 + intensity * 0.035})`;
      context.lineWidth = 1;
      for (let x = 0; x < width; x += gridSize) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      animationId = window.requestAnimationFrame(draw);
    };

    resize();
    start = performance.now();
    animationId = window.requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [settings.fluid.enabled, settings.fluid.speed, settings.fluid.intensity, theme]);

  return <canvas ref={canvasRef} className="fluid-background" aria-hidden="true" />;
};

export default FluidBackground;

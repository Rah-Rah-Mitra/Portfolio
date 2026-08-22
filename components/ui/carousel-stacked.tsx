import * as React from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  MotionConfig,
  type PanInfo,
  type MotionValue,
} from 'motion/react';
import { cn } from '../../lib/utils';
import { Badge } from './badge';

// Adapted from the shadcnspace "carousel-07" stacked carousel: same drag/spring
// mechanics, generalised to accept slides as a prop, report the centered slide,
// and stay operable without a pointer (previous/next buttons + tap-to-activate).

export interface StackedSlide {
  id: string;
  image?: string;
  title: string;
  description: string;
  badge: string;
  monogram: string;
  accentClass: string;
}

interface CarouselConfig {
  distanceDivisor: number;
  velocityDivisor: number;
  sensitivity: number;
  xMultiplier: number;
  yMultiplier: number;
  rotationMultiplier: number;
  scaleReduction: number;
}

const getCarouselConfig = (width: number): CarouselConfig => {
  if (width < 640) {
    return {
      distanceDivisor: 120,
      velocityDivisor: 500,
      sensitivity: 180,
      xMultiplier: 90,
      yMultiplier: 20,
      rotationMultiplier: 8,
      scaleReduction: 0.06,
    };
  }
  if (width < 1024) {
    return {
      distanceDivisor: 160,
      velocityDivisor: 650,
      sensitivity: 220,
      xMultiplier: 130,
      yMultiplier: 30,
      rotationMultiplier: 10,
      scaleReduction: 0.09,
    };
  }
  return {
    distanceDivisor: 200,
    velocityDivisor: 800,
    sensitivity: 250,
    xMultiplier: 170,
    yMultiplier: 40,
    rotationMultiplier: 12,
    scaleReduction: 0.12,
  };
};

const wrapIndex = (value: number, total: number): number => ((value % total) + total) % total;

interface CarouselStackedProps {
  slides: StackedSlide[];
  onActiveChange?: (index: number) => void;
  onSlideActivate?: (index: number) => void;
  className?: string;
}

const CarouselStacked: React.FC<CarouselStackedProps> = ({ slides, onActiveChange, onSlideActivate, className }) => {
  const scrollProgress = useMotionValue(0);
  const startProgress = React.useRef(0);
  const [windowWidth, setWindowWidth] = React.useState(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeIndexRef = React.useRef(0);

  const total = slides.length;

  React.useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    const publish = (progress: number) => {
      const index = wrapIndex(Math.round(progress), total);
      if (index === activeIndexRef.current) return;
      activeIndexRef.current = index;
      setActiveIndex(index);
      onActiveChange?.(index);
    };
    publish(scrollProgress.get());
    return scrollProgress.on('change', publish);
  }, [onActiveChange, scrollProgress, total]);

  const config = React.useMemo(
    () => getCarouselConfig(windowWidth),
    [windowWidth],
  );

  const settleTo = (target: number) => {
    animate(scrollProgress, target, {
      type: 'spring',
      stiffness: 200,
      damping: 30,
      mass: 1,
    });
  };

  const handleDragStart = () => {
    startProgress.current = scrollProgress.get();
  };

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const dragDistance = info.offset.x;
    const velocity = info.velocity.x;

    const distanceShift = -dragDistance / config.distanceDivisor;
    const velocityShift = -velocity / config.velocityDivisor;

    let totalShift = Math.round(distanceShift + velocityShift);
    totalShift = Math.max(-3, Math.min(3, totalShift));

    const target = Math.round(startProgress.current) + totalShift;
    settleTo(target);
  };

  const step = (direction: -1 | 1) => {
    settleTo(Math.round(scrollProgress.get()) + direction);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('flex flex-col items-center justify-center w-full select-none', className)}>
        <div className="relative w-full h-72 sm:h-96 lg:h-[26rem] flex items-center justify-center overflow-hidden">
          {/* Transparent drag surface */}
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDrag={(_, info) => {
              const delta = -info.delta.x / config.sensitivity;
              scrollProgress.set(scrollProgress.get() + delta);
            }}
            onDragEnd={handleDragEnd}
            onTap={() => onSlideActivate?.(activeIndexRef.current)}
            className="absolute inset-0 z-50 cursor-grab active:cursor-grabbing"
            aria-hidden="true"
          />

          {slides.map((slide, index) => (
            <Card
              key={slide.id}
              slide={slide}
              index={index}
              total={total}
              activeIndex={activeIndex}
              progress={scrollProgress}
              config={config}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 mt-3" role="group" aria-label="Project showcase controls">
          <button
            type="button"
            className="project-carousel-step"
            onClick={() => step(-1)}
            aria-label="Show previous showcase card"
          >
            ‹ Prev
          </button>
          <p className="project-carousel-readout" aria-live="polite">
            <span>{String(activeIndex + 1).padStart(2, '0')}</span> / {String(total).padStart(2, '0')}
          </p>
          <button
            type="button"
            className="project-carousel-step"
            onClick={() => step(1)}
            aria-label="Show next showcase card"
          >
            Next ›
          </button>
        </div>
      </div>
    </MotionConfig>
  );
};

interface CardProps {
  slide: StackedSlide;
  index: number;
  total: number;
  activeIndex: number;
  progress: MotionValue<number>;
  config: CarouselConfig;
}

const circularDistance = (a: number, b: number, total: number): number => {
  const raw = Math.abs(a - b) % total;
  return Math.min(raw, total - raw);
};

const Card = ({ slide, index, total, activeIndex, progress, config }: CardProps) => {
  const offset = useTransform(progress, (p) => {
    let diff = (index - p) % total;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return diff;
  });

  const x = useTransform(offset, (o) => o * config.xMultiplier);
  const rotate = useTransform(offset, (o) => {
    const absO = Math.abs(o);
    if (absO < 0.05) return 0;
    return o * config.rotationMultiplier;
  });
  const y = useTransform(offset, (o) => {
    const absO = Math.abs(o);
    if (absO < 0.05) return 0;
    return absO * config.yMultiplier;
  });
  const scale = useTransform(
    offset,
    (o) => 1 - Math.abs(o) * config.scaleReduction,
  );
  const opacity = useTransform(
    offset,
    [-total / 2, -total / 2 + 0.5, 0, total / 2 - 0.5, total / 2],
    [0, 1, 1, 1, 0],
  );
  const zIndex = useTransform(offset, (o) =>
    Math.round(100 - Math.abs(o) * 10),
  );
  const shadeOpacity = useTransform(
    offset,
    [-2, -0.5, 0, 0.5, 2],
    [0.5, 0.2, 0, 0.2, 0.5],
  );
  const captionOpacity = useTransform(offset, [-0.5, 0, 0.5], [0, 1, 0]);

  // Only the cards near the front mount their image, so a large archive does
  // not fetch every asset at once.
  const nearFront = circularDistance(index, activeIndex, total) <= 4;

  return (
    <motion.div
      style={{
        x,
        rotate,
        y,
        scale,
        opacity,
        zIndex,
      }}
      data-carousel-card={slide.id}
      data-front={index === activeIndex ? 'true' : 'false'}
      className={cn(
        'absolute rounded-2xl overflow-hidden bg-muted group pointer-events-none',
        'w-40 h-52 sm:w-52 sm:h-72 lg:w-60 lg:h-80',
      )}
    >
      {slide.image && nearFront ? (
        <img
          src={slide.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      ) : (
        <div className={cn('absolute inset-0 project-card-plate pointer-events-none', slide.accentClass)} aria-hidden="true">
          <span className="project-card-monogram">{slide.monogram}</span>
        </div>
      )}

      <motion.div
        style={{ opacity: shadeOpacity }}
        className="absolute inset-0 bg-black pointer-events-none"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      <Badge className="absolute top-3 right-3 sm:top-4 sm:right-4 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-white/95 backdrop-blur-md text-[.6rem] sm:text-xs font-bold uppercase tracking-widest text-black hover:bg-white/95">
        {slide.badge}
      </Badge>

      <div className="absolute bottom-4 left-3 right-3 sm:bottom-6 sm:left-4 sm:right-4 text-white text-center sm:text-left">
        <motion.p
          style={{ opacity: captionOpacity }}
          className="text-sm sm:text-base lg:text-lg font-bold leading-tight mb-0.5 sm:mb-1 drop-shadow-md"
        >
          {slide.title}
        </motion.p>
        <motion.p
          style={{ opacity: captionOpacity }}
          className="hidden sm:block text-xs text-white/70 line-clamp-2 italic font-medium"
        >
          {slide.description}
        </motion.p>
      </div>
    </motion.div>
  );
};

export default CarouselStacked;

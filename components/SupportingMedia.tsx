import React, { useEffect, useRef, useState } from 'react';
import type { ProjectMedia } from '../types';

export const SupportingMedia: React.FC<{
  media: ProjectMedia;
  policy: { attach: boolean; motionEnabled: boolean };
  className?: string;
}> = ({ media, policy, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wasAttachedRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    if (!policy.attach) {
      if (wasAttachedRef.current) {
        video.pause();
        video.load();
        setPlaying(false);
      }
      wasAttachedRef.current = false;
      return undefined;
    }
    wasAttachedRef.current = true;
    const observer = new IntersectionObserver(([entry]) => {
      const nextVisible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= .2);
      setVisible(nextVisible);
      if (!nextVisible) { video.pause(); setPlaying(false); }
    }, { threshold: [0, .2, .6] });
    observer.observe(video);
    return () => { video.pause(); observer.disconnect(); };
  }, [policy.attach]);

  useEffect(() => {
    if ((!policy.motionEnabled || !visible) && videoRef.current) {
      videoRef.current.pause(); setPlaying(false);
    }
  }, [policy.motionEnabled, visible]);

  const label = media.id.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
  const toggle = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) { video.pause(); setPlaying(false); }
    else { await video.play(); setPlaying(true); }
  };

  return <figure className={className ? `supporting-media ${className}` : 'supporting-media'} data-media-id={media.id}>
    <video ref={videoRef} aria-label={media.alt} poster={media.posterSrc} muted playsInline loop preload="none">
      {policy.attach && media.webmSrc && <source src={media.webmSrc} type="video/webm" />}
      {policy.attach && media.mp4Src && <source src={media.mp4Src} type="video/mp4" />}
    </video>
    {policy.attach && policy.motionEnabled && <button type="button" onClick={() => void toggle()}>{playing ? `Pause ${label}` : `Play ${label}`}</button>}
    {media.transcript && <details><summary>Visual transcript</summary><p>{media.transcript}</p></details>}
  </figure>;
};

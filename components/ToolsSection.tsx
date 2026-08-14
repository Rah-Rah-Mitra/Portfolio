import React, { useEffect, useMemo, useState } from 'react';
import SectionContainer from './SectionContainer';
import { SITE_CONFIG } from '../siteConfig';
import { useTheme } from '../contexts/ThemeContext';
import { summarizeUrlTarget, track } from '../lib/analytics';

interface ToolsSectionProps { id: string; }

const QR_TARGETS = [
  { id: 'portfolio', label: 'Portfolio', url: SITE_CONFIG.canonicalUrl },
  { id: 'linkedin', label: 'LinkedIn', url: SITE_CONFIG.social.linkedin },
  { id: 'github', label: 'GitHub', url: SITE_CONFIG.social.github },
] as const;

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const ToolsSection: React.FC<ToolsSectionProps> = ({ id }) => {
  const { theme } = useTheme();
  const [targetUrl, setTargetUrl] = useState<string>(SITE_CONFIG.canonicalUrl);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  const [shouldLoadQr, setShouldLoadQr] = useState(false);
  const cleanedTarget = targetUrl.trim() || SITE_CONFIG.canonicalUrl;
  const selectedPreset = QR_TARGETS.find((target) => target.url === cleanedTarget);
  const summary = summarizeUrlTarget(cleanedTarget, selectedPreset?.label);
  const colors = useMemo(() => theme === 'light'
    ? { dark: '#123b3a', light: '#f4f0e6' }
    : { dark: '#6f2931', light: '#f4f0e6' }, [theme]);

  useEffect(() => {
    const section = document.getElementById(id);
    if (!section || !('IntersectionObserver' in window)) {
      setShouldLoadQr(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setShouldLoadQr(true);
      observer.disconnect();
    }, { rootMargin: '420px 0px' });
    observer.observe(section);
    return () => observer.disconnect();
  }, [id]);

  useEffect(() => {
    if (!shouldLoadQr) return undefined;
    let cancelled = false;
    setError('');
    void import('qrcode')
      .then(({ toDataURL }) => toDataURL(cleanedTarget, { errorCorrectionLevel: 'H', margin: 2, width: 320, color: colors }))
      .then((dataUrl) => { if (!cancelled) setQrDataUrl(dataUrl); })
      .catch(() => { if (!cancelled) setError('The share code could not be generated for this URL.'); });
    return () => { cancelled = true; };
  }, [cleanedTarget, colors, shouldLoadQr]);

  const downloadPng = () => {
    if (!qrDataUrl) return;
    const anchor = document.createElement('a');
    anchor.href = qrDataUrl;
    anchor.download = 'rahul-mitra-portfolio-qr.png';
    anchor.click();
    track('qr_code_downloaded', { format: 'png', ...summary });
  };

  const downloadSvg = async () => {
    const { toString } = await import('qrcode');
    const svg = await toString(cleanedTarget, { type: 'svg', errorCorrectionLevel: 'H', margin: 2, color: colors });
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'rahul-mitra-portfolio-qr.svg');
    track('qr_code_downloaded', { format: 'svg', ...summary });
  };

  return (
    <SectionContainer
      id={id}
      title="Share bench"
      subtitle="A small practical tool preserved from the original portfolio: generate a clean, downloadable QR code for this site or its primary professional profiles."
      className="share-section"
    >
      <div className="share-workbench">
        <div className="share-controls">
          <div className="bench-note"><span>Utility 01</span><h3>Portfolio share code</h3><p>The canonical portfolio preset always points to rahul-mitra.com.</p></div>
          <div className="preset-row" aria-label="Share target presets">
            {QR_TARGETS.map((target) => (
              <button
                key={target.id}
                type="button"
                aria-pressed={selectedPreset?.id === target.id}
                onClick={() => { setTargetUrl(target.url); track('qr_target_selected', summarizeUrlTarget(target.url, target.label)); }}
              >
                {target.label}
              </button>
            ))}
          </div>
          <label className="share-url-field">
            <span>Target URL</span>
            <input className="ph-no-capture" type="url" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} data-private="true" data-block-replay="true" />
          </label>
          <div className="share-actions">
            <button type="button" onClick={downloadPng} disabled={!qrDataUrl}>Download PNG</button>
            <button type="button" onClick={downloadSvg}>Download SVG</button>
          </div>
          {error && <p className="form-error" role="status">{error}</p>}
        </div>
        <div className="share-output">
          <div className="coordinate-label" aria-hidden="true">share://verified-target</div>
          {qrDataUrl ? (
            <a href={cleanedTarget} target="_blank" rel="noopener noreferrer" onClick={() => track('qr_code_clicked', summary)}>
              <img src={qrDataUrl} alt={`QR code for ${selectedPreset?.label ?? 'the entered URL'}`} />
              <span className="sr-only">Open the QR target in a new tab</span>
            </a>
          ) : <p role="status">Rendering share code…</p>}
        </div>
      </div>
    </SectionContainer>
  );
};

export default ToolsSection;

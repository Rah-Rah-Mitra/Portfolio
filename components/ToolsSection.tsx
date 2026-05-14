import React, { useEffect, useMemo, useState } from 'react';
import * as QRCode from 'qrcode';
import SectionContainer from './SectionContainer';
import { ArrowDownTrayIcon, QrCodeIcon } from './icons/GenericIcons';
import { useTheme } from '../contexts/ThemeContext';
import { track } from '../lib/analytics';

interface ToolsSectionProps {
  id: string;
}

const DEFAULT_PORTFOLIO_URL = 'https://rahul-mitra.vercel.app/';
const QR_TARGETS = [
  { id: 'portfolio', label: 'Portfolio', url: DEFAULT_PORTFOLIO_URL },
  { id: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/in/rahulmitra-dev' },
  { id: 'github', label: 'GitHub', url: 'https://github.com/Rah-Rah-Mitra' },
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
  const [targetUrl, setTargetUrl] = useState(DEFAULT_PORTFOLIO_URL);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');

  const qrColors = useMemo(() => (
    theme === 'light'
      ? { dark: '#031525', light: '#cffafe' }
      : { dark: '#450a0a', light: '#fee2e2' }
  ), [theme]);

  const cleanedTarget = targetUrl.trim() || DEFAULT_PORTFOLIO_URL;
  const selectedPresetId = QR_TARGETS.find((target) => target.url === cleanedTarget)?.id;

  useEffect(() => {
    let cancelled = false;
    setError('');

    QRCode.toDataURL(cleanedTarget, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
      color: qrColors,
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setError('QR code could not be generated for this value.');
      });

    return () => {
      cancelled = true;
    };
  }, [cleanedTarget, qrColors]);

  const handlePngDownload = () => {
    if (!qrDataUrl) return;
    const anchor = document.createElement('a');
    anchor.href = qrDataUrl;
    anchor.download = 'rahul-mitra-portfolio-qr.png';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    track('qr_code_downloaded', { format: 'png', target: cleanedTarget });
  };

  const handleSvgDownload = async () => {
    const svg = await QRCode.toString(cleanedTarget, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 2,
      color: qrColors,
    });
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'rahul-mitra-portfolio-qr.svg');
    track('qr_code_downloaded', { format: 'svg', target: cleanedTarget });
  };

  const selectTarget = (target: (typeof QR_TARGETS)[number]) => {
    setTargetUrl(target.url);
    track('qr_target_selected', { label: target.label, target: target.url });
  };

  return (
    <SectionContainer
      id={id}
      title="Tools"
      subtitle="A compact utility bench for the portfolio, starting with a branded QR generator for fast profile sharing."
      className="bg-gray-900 dark:bg-black"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr,22rem] lg:items-stretch">
        <div className="rounded-lg border border-cyan-300/25 bg-gray-950/80 p-5 shadow-2xl backdrop-blur dark:border-red-400/25">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-cyan-300/35 bg-cyan-300/10 text-cyan-300 dark:border-red-300/35 dark:bg-red-500/10 dark:text-red-300">
              <QrCodeIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 dark:text-red-300">QR generator</p>
              <h3 className="mt-1 text-2xl font-bold text-white">Portfolio share code</h3>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2" aria-label="QR target presets">
            {QR_TARGETS.map((target) => {
              const active = selectedPresetId === target.id;
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => selectTarget(target)}
                  aria-pressed={active}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100 dark:border-red-300 dark:bg-red-500/15 dark:text-red-100'
                      : 'border-white/15 text-gray-300 hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200'
                  }`}
                >
                  {target.label}
                </button>
              );
            })}
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-gray-200">Target URL</span>
            <input
              type="url"
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-cyan-300 dark:focus:border-red-300"
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePngDownload}
              disabled={!qrDataUrl}
              className="inline-flex items-center gap-2 rounded-md border border-cyan-300/45 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-300/45 dark:text-red-100 dark:hover:bg-red-500/10"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              PNG
            </button>
            <button
              type="button"
              onClick={handleSvgDownload}
              className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-gray-200 transition-colors hover:border-cyan-300 hover:text-cyan-200 dark:hover:border-red-300 dark:hover:text-red-200"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              SVG
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-300" role="status">{error}</p>}
        </div>

        <div className="flex min-h-80 items-center justify-center rounded-lg border border-white/10 bg-[radial-gradient(circle_at_30%_15%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.08),rgba(15,23,42,0.62))] p-6 shadow-2xl dark:bg-[radial-gradient(circle_at_30%_15%,rgba(248,113,113,0.18),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.07),rgba(0,0,0,0.68))]">
          <div className="rounded-lg border border-white/20 bg-black/30 p-4 shadow-2xl">
            {qrDataUrl ? (
              <a
                href={cleanedTarget}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('qr_code_clicked', { target: cleanedTarget })}
                className="block rounded-md outline-none ring-offset-2 ring-offset-gray-950 transition-transform hover:scale-[1.015] focus:ring-2 focus:ring-cyan-300 dark:focus:ring-red-300"
                aria-label={`Open ${cleanedTarget}`}
              >
                <img src={qrDataUrl} alt={`QR code for ${cleanedTarget}`} className="h-64 w-64 rounded-md" />
              </a>
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-md border border-white/10 text-sm text-gray-400">
                Rendering...
              </div>
            )}
          </div>
        </div>
      </div>
    </SectionContainer>
  );
};

export default ToolsSection;

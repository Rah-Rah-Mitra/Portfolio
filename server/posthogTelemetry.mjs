import { SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

const serviceName = process.env.POSTHOG_SERVICE_NAME || 'rahul-portfolio-api';
const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
const serviceVersion = process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || 'local';
const logsUrl = process.env.POSTHOG_OTLP_LOGS_URL || 'https://us.i.posthog.com/otlp/v1/logs';
const otlpToken = process.env.POSTHOG_OTLP_TOKEN || process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_KEY;

let provider;
let logger;
let initAttempted = false;

const severityByLevel = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

const severityTextByLevel = {
  trace: 'TRACE',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  fatal: 'FATAL',
};

const sanitizeAttributeValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
};

const sanitizeAttributes = (attributes = {}) => Object.fromEntries(
  Object.entries(attributes)
    .filter(([key]) => !/authorization|email|input|message|prompt|reply|token/i.test(key))
    .map(([key, value]) => [key, sanitizeAttributeValue(value)]),
);

const getLogger = () => {
  if (logger || initAttempted) return logger;
  initAttempted = true;

  if (!otlpToken) return undefined;

  try {
    const exporter = new OTLPLogExporter({
      url: logsUrl,
      headers: {
        Authorization: `Bearer ${otlpToken}`,
      },
    });

    provider = new LoggerProvider({
      resource: resourceFromAttributes({
        'service.name': serviceName,
        'deployment.environment': environment,
        'service.version': serviceVersion,
      }),
      processors: [new SimpleLogRecordProcessor(exporter)],
    });

    logger = provider.getLogger(serviceName);
  } catch {
    logger = undefined;
  }

  return logger;
};

export const emitServerLog = (level, body, attributes = {}) => {
  const activeLogger = getLogger();
  if (!activeLogger) return;

  activeLogger.emit({
    severityNumber: severityByLevel[level] ?? SeverityNumber.INFO,
    severityText: severityTextByLevel[level] ?? 'INFO',
    body,
    attributes: sanitizeAttributes({
      app_surface: 'portfolio',
      ...attributes,
    }),
  });
};

export const flushServerLogs = async () => {
  if (!provider) return;

  try {
    await provider.forceFlush();
  } catch {
    // Logging is best-effort and must not affect API responses.
  }
};

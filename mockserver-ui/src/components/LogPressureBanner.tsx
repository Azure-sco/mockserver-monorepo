import { useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { useLogPressure } from '../hooks/useLogPressure';
import { useDashboardStore } from '../store';
import { totalDropped } from '../lib/logPressure';
import { monospaceFontFamily } from '../theme';
import { uiText } from '../lib/dashboardLocale';

/**
 * Dismissible banner shown in the traffic/log views when MockServer's event log
 * has lost entries — the most common cause of "verification intermittently
 * fails" and "the dashboard is missing requests". Each cause gets its own fix:
 *
 * - **Ring full** (events dropped faster than the single logging thread can
 *   record them): lower the log level, or keep it and set
 *   `maxLoggedMatchFailures`; a bigger `ringBufferSize` only absorbs short bursts.
 * - **In-flight bytes** (large bodies waiting to be logged exceeded the
 *   in-flight cap): lower the log level, or raise `maxEventLogSizeInBytes`.
 * - **Eviction** (recorded entries removed by the retention bound): raise
 *   `maxLogEntries` or `maxEventLogSizeInBytes`.
 *
 * Drops are a warning; eviction alone is informational, since a busy server
 * keeps evicting by design. The counts come from the Prometheus metrics endpoint
 * (see {@link useLogPressure}), which is polled only when the server's
 * configuration says metrics are enabled; the banner stays hidden unless a count
 * is non-zero, so it never appears on a healthy server or when metrics are disabled.
 *
 * Dismissal is remembered at the counts seen at dismiss time: the banner
 * re-appears only if *more* events are dropped. Further eviction alone does not
 * re-show it, so the user is re-warned about ongoing loss without being nagged
 * about a retention bound they have already acknowledged.
 */
interface LogPressureBannerProps {
  connectionParams: ConnectionParams;
}

interface Acknowledged {
  dropped: number;
  evicted: number;
}

const DOCS_URL = 'https://www.mock-server.com/mock_server/performance.html';

function Code({ children }: { children: ReactNode }) {
  return <Box component="code" sx={{ fontFamily: monospaceFontFamily }}>{children}</Box>;
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export default function LogPressureBanner({ connectionParams }: LogPressureBannerProps) {
  // Without the configuration (e.g. refused by control-plane authentication) it cannot
  // know whether metrics are on, so it probes once; a 404 then stops polling.
  const probeMetrics = useDashboardStore(
    (s) => s.serverConfiguration?.['metricsEnabled'] === true || s.serverConfigurationUnavailable,
  );
  const pressure = useLogPressure(connectionParams, probeMetrics);
  // The counts at the moment the user last dismissed the banner (null = never dismissed).
  const [dismissedAt, setDismissedAt] = useState<Acknowledged | null>(null);

  const dropped = pressure ? totalDropped(pressure) : 0;
  const evicted = pressure ? pressure.evicted : 0;

  // A server restart resets the counters to 0, so a current count can regress
  // below the value the user dismissed at. When that happens the acknowledged
  // totals no longer apply — clear them so fresh loss re-shows the banner.
  // (React's "adjust state while rendering" pattern — see useLogPressure.)
  // `effectiveDismissedAt` reflects the reset in this same render.
  let effectiveDismissedAt = dismissedAt;
  if (dismissedAt != null && pressure != null && (dropped < dismissedAt.dropped || evicted < dismissedAt.evicted)) {
    effectiveDismissedAt = null;
    setDismissedAt(null);
  }

  if (pressure == null || (dropped <= 0 && evicted <= 0)) return null;
  if (effectiveDismissedAt != null && dropped <= effectiveDismissedAt.dropped) return null;

  const hasDrops = dropped > 0;

  return (
    <Alert
      severity={hasDrops ? 'warning' : 'info'}
      // Eviction alone grows on every poll of a busy server; announce it politely, not as an alert.
      role={hasDrops ? 'alert' : 'status'}
      aria-live="polite"
      onClose={() => setDismissedAt({ dropped, evicted })}
      sx={{ mx: 1, mt: 1, flexShrink: 0 }}
      data-testid="log-pressure-banner"
    >
      <AlertTitle>{hasDrops ? uiText('Log Events Dropped', '日志事件已丢弃') : uiText('Log Events Evicted', '旧日志事件已淘汰')}</AlertTitle>
      {uiText('Verification and the dashboard may be missing requests.', '请求与响应验证页面和运行面板可能缺少部分请求记录。')}
      <Box component="ul" sx={{ my: 0.5, pl: 2.5 }}>
        {pressure.ringFull > 0 && (
          <li data-testid="log-pressure-ring-full">
            {uiText(
              `${plural(pressure.ringFull, 'event was', 'events were')} dropped because they arrived faster than the single logging thread could record them. If this happens under steady load, lower the log level (`,
              `${pressure.ringFull.toLocaleString()} 条事件因写入速度超过单个日志线程的处理能力而被丢弃。如果在稳定负载下仍出现此问题，可以将 `,
            )}
            <Code>logLevel</Code>{uiText(' ', ' 调低到 ')}<Code>WARN</Code>{uiText(' or ', ' 或 ')}<Code>ERROR</Code>
            {uiText('), or keep the log level and set ', '，也可以保留日志级别，设置 ')}
            <Code>maxLoggedMatchFailures</Code>{uiText(' (e.g. ', '（例如 ')}<Code>10</Code>
            {uiText(') to cap the did-not-match entries logged per request; raising ', '）以限制每次请求的未匹配日志条数。增大 ')}
            <Code>ringBufferSize</Code>{uiText(' only absorbs short bursts.', ' 只能应对短时的流量突增。')}
          </li>
        )}
        {pressure.inFlightBytes > 0 && (
          <li data-testid="log-pressure-in-flight-bytes">
            {uiText(
              `${plural(pressure.inFlightBytes, 'event was', 'events were')} dropped because the request and response bodies waiting to be logged exceeded the in-flight memory cap. Lower the log level (e.g. `,
              `${pressure.inFlightBytes.toLocaleString()} 条事件因待写入日志的请求和响应正文超出内存上限而被丢弃。可以调低日志级别（例如设为 `,
            )}
            <Code>WARN</Code>
            {uiText('), which raises that cap and drains it faster; if you have heap to spare, raise ', '），提高上限并加快写入。如果堆内存充足，可以增大 ')}
            <Code>maxEventLogSizeInBytes</Code>{uiText('.', '。')}
          </li>
        )}
        {pressure.unattributed > 0 && (
          <li data-testid="log-pressure-unattributed">
            {uiText(
              `${plural(pressure.unattributed, 'event was', 'events were')} dropped before being recorded. If this happens under steady load, lower the log level (e.g. `,
              `${pressure.unattributed.toLocaleString()} 条事件在写入日志之前被丢弃。如果在稳定负载下仍出现此问题，可以调低日志级别（例如设为 `,
            )}
            <Code>WARN</Code>{uiText(' or ', ' 或 ')}<Code>ERROR</Code>{uiText(').', '）。')}
          </li>
        )}
        {evicted > 0 && (
          <li data-testid="log-pressure-evicted">
            {uiText(
              `${plural(evicted, 'of the oldest entries was', 'of the oldest entries were')} evicted to stay within the log's retention limit. To keep more history, raise `,
              `为满足日志保留上限，系统淘汰了最早的 ${evicted.toLocaleString()} 条记录。要保留更多历史记录，可以增大 `,
            )}
            <Code>maxLogEntries</Code>{uiText(' or ', ' 或 ')}<Code>maxEventLogSizeInBytes</Code>{uiText('.', '。')}
          </li>
        )}
      </Box>
      <Link
        href={DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        color="inherit"
        underline="always"
        data-testid="log-pressure-banner-learn-more"
      >
        {uiText('Learn more', '了解更多')}
      </Link>
    </Alert>
  );
}

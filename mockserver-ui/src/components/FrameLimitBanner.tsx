import Alert from '@mui/material/Alert';
import { useDashboardStore } from '../store';
import { uiText } from '../lib/dashboardLocale';

interface FrameLimitBannerProps {
  /** Traffic shows no log messages, so only a cut in the request rows concerns it. */
  view: 'dashboard' | 'traffic';
}

/**
 * Shown while the server's latest update reached its size limit, naming what was left out. Log
 * messages may use only part of an update, so they can be cut while every request row still fits.
 */
export default function FrameLimitBanner({ view }: FrameLimitBannerProps) {
  const requestsCut = useDashboardStore((s) => s.frameLimitReached);
  const logMessagesCut = useDashboardStore((s) => s.logMessagesLimitReached) && view === 'dashboard';
  if (!requestsCut && !logMessagesCut) return null;
  const what = requestsCut && logMessagesCut
    ? uiText('Older requests and log messages are', '较早的请求和日志消息')
    : requestsCut ? uiText('Older requests are', '较早的请求') : uiText('Older log messages are', '较早的日志消息');
  return (
    <Alert severity="info" role="status" sx={{ mx: 1, mt: 1, flexShrink: 0 }} data-testid="frame-limit-banner">
      {what}{uiText(' not shown: the latest update reached its size limit. ', '未显示，因为最新一次更新已达到大小上限。')}
      {requestsCut
        ? uiText('Recent requests, with their bodies and log messages, filled it.', '近期的请求及其正文和日志消息已占满本次更新。')
        : uiText('Recent requests logged more than it has room for; for example, a request that matches no expectation logs a message for each expectation it was compared with.', '近期请求产生的日志超过了本次更新的容量。例如，一条未命中规则的请求会为每条参与比较的规则写入一条日志。')}
      {uiText(' Narrow the filter to view the records that are still retained.', '可缩小筛选范围，查看仍保留的记录。')}
    </Alert>
  );
}

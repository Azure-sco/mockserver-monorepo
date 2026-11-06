/**
 * Copy for "Clear Server Logs" (`PUT /mockserver/clear?type=log`), shared by the
 * Clear menu and the Cmd/Ctrl+Shift+L shortcut. Clearing the request log removes
 * recorded requests and their related log messages.
 */
import { uiText } from './dashboardLocale';

const clearLogsLabelZh = '清空请求记录及相关日志';

export const CLEAR_LOGS_MENU_LABEL = uiText('Clear Server Logs', clearLogsLabelZh);
export const CLEAR_LOGS_CONFIRM_LABEL = uiText('Clear logs', clearLogsLabelZh);
export const CLEAR_LOGS_CONFIRM_TITLE = uiText('Clear server logs?', `${clearLogsLabelZh}？`);
export const CLEAR_LOGS_CONFIRM_MESSAGE = uiText(
  'This clears every recorded and proxied request and the log messages associated with them. Expectations are kept. This cannot be undone.',
  '此操作会清空所有接收和代理的请求记录及相关日志。Mock 规则会保留。此操作无法撤销。',
);
export const CLEAR_LOGS_DONE_MESSAGE = uiText('Server logs and recorded requests cleared', '已清空请求记录及相关日志');

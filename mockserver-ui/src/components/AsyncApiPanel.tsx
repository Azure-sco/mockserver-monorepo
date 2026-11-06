import { uiText } from '../lib/dashboardLocale';
import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import HubIcon from '@mui/icons-material/Hub';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { getAsyncApiStatus, AsyncApiUnavailableError } from '../lib/asyncApi';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { humanizeError } from '../lib/errorMessage';
import { monospaceFontFamily } from '../theme';

interface AsyncApiPanelProps {
  connectionParams: ConnectionParams;
}

interface AsyncApiChannel {
  name: string;
  hasSchema?: boolean;
  exampleCount?: number;
}

interface RecordedMessageEntry {
  channel: string;
  key?: string | null;
  payload: string;
  headers?: Record<string, string>;
  timestamp?: string;
  schemaValid?: boolean;
}

interface AsyncApiStatus {
  loaded: boolean;
  specTitle?: string;
  specVersion?: string;
  channels?: AsyncApiChannel[];
  publishers?: number;
  subscribers?: number;
  recordedMessages?: RecordedMessageEntry[];
}

const POLL_INTERVAL_MS = 5000;

function formatTimestamp(ts: string | undefined): string {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

function truncatePayload(payload: string, maxLength = 120): string {
  if (payload.length <= maxLength) return payload;
  return payload.substring(0, maxLength) + '...';
}

export default function AsyncApiPanel({ connectionParams }: AsyncApiPanelProps) {
  const [status, setStatus] = useState<AsyncApiStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  // Auto-refresh the read-only broker status + recorded-message feed.
  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await getAsyncApiStatus(connectionParams, signal);
      setUnavailable(false);
      setUnavailableMessage(null);
      setStatus(result as unknown as AsyncApiStatus);
      setLoadError(null);
    } catch (e) {
      if (signal?.aborted) return;
      if (e instanceof AsyncApiUnavailableError) {
        // the server's 501 names the artifact and where to get it; show that, not a local summary
        setUnavailable(true);
        setUnavailableMessage(e.message);
        setStatus(null);
        setLoadError(null);
        return;
      }
      setLoadError(humanizeError(e).message);
    }
  }, [connectionParams]);

  useAutoRefresh(loadStatus, { intervalMs: POLL_INTERVAL_MS });

  // Manual force-refresh (the existing Refresh button) — same fetch, off-cycle.
  const refresh = useCallback(() => {
    void loadStatus();
  }, [loadStatus]);

  const channels = status?.channels ?? [];
  const recordedMessages = useMemo(() => status?.recordedMessages ?? [], [status]);

  const filteredMessages = useMemo(() => {
    if (!filterText.trim()) return recordedMessages;
    const lower = filterText.toLowerCase();
    return recordedMessages.filter(
      (m) =>
        m.channel.toLowerCase().includes(lower) ||
        m.payload.toLowerCase().includes(lower) ||
        (m.key && m.key.toLowerCase().includes(lower)),
    );
  }, [recordedMessages, filterText]);

  // A loaded spec is not a broker connection: only a publisher or subscriber
  // means MockServer is actually attached to a broker.
  const brokerAttached = (status?.publishers ?? 0) + (status?.subscribers ?? 0) > 0;
  const connectionColor: 'success' | 'warning' | 'error' | 'default' = unavailable
    ? 'error'
    : status?.loaded && brokerAttached
      ? 'success'
      : 'default';

  const connectionLabel = unavailable
    ? uiText('unavailable', "不可用")
    : status?.loaded
      ? brokerAttached
        ? uiText('broker connected', "已连接消息代理")
        : uiText('spec loaded, no broker', "已加载规范，尚未连接消息代理")
      : uiText('no spec loaded', "暂未加载规范");

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <HubIcon fontSize="small" color="primary" />
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {uiText("AsyncAPI Broker Mock", "AsyncAPI 消息代理 Mock")}
        </Typography>
        <Chip
          size="small"
          label={connectionLabel}
          color={connectionColor}
          variant="outlined"
        />
        {status?.loaded && status.specTitle && (
          <Chip
            size="small"
            label={status.specVersion ? `${status.specTitle} · AsyncAPI ${status.specVersion}` : status.specTitle}
            variant="outlined"
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={uiText("Refresh now", "立即刷新")}>
          <IconButton size="small" onClick={refresh} aria-label={uiText("Refresh async status", "刷新异步服务状态")}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {uiText("Live status of the AsyncAPI broker mock — loaded spec, active channels, and messages recorded from broker subscriptions. Load a spec via the Tools menu or the ", "查看 AsyncAPI 消息代理 Mock 的实时状态，包括已加载的规范、生效的通道，以及订阅消息的记录。可通过导入工具或 ")}<code>PUT /mockserver/asyncapi</code>{uiText(" endpoint.", " 端点加载规范。")}
      </Typography>

      {unavailable && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          <AlertTitle>{uiText("Module Unavailable", "模块不可用")}</AlertTitle>
          {unavailableMessage ??
            uiText("The AsyncAPI module (mockserver-async) is not on this server's classpath. Broker mocking requires the mockserver-async jar.", "此服务器的类路径中没有 AsyncAPI 模块。模拟消息代理需要 mockserver-async JAR。")}
        </Alert>
      )}

      {loadError && (
        <Alert
          severity="error"
          sx={{ mb: 1.5 }}
          action={
            <IconButton color="inherit" size="small" onClick={refresh} aria-label={uiText("Retry", "重试")}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          }
        >
          <AlertTitle>{uiText("Could not load async status", "无法加载 AsyncAPI 状态")}</AlertTitle>
          {loadError}
        </Alert>
      )}

      {/* Channels table */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
        {uiText("Channels", "通道")}
      </Typography>
      <Paper variant="outlined" sx={{ p: 1.25, mb: 2 }}>
        {channels.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
            {uiText("No channels loaded. Load an AsyncAPI spec to start mocking broker channels.", "暂未加载通道。加载 AsyncAPI 规范后即可模拟消息代理的通道。")}
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{uiText("Channel / Topic", "通道 / 主题")}</TableCell>
                  <TableCell align="center">{uiText("Schema", "数据结构")}</TableCell>
                  <TableCell align="right">{uiText("Examples", "示例")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {channels.map((ch) => (
                  <TableRow key={ch.name}>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
                        {ch.name}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      {ch.hasSchema ? (
                        <CheckCircleIcon fontSize="small" color="success" />
                      ) : (
                        <ErrorOutlinedIcon fontSize="small" color="disabled" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption">{ch.exampleCount ?? 0}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Publisher/subscriber summary */}
      {status?.loaded && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          <Chip
            size="small"
            label={uiText(`${status.publishers ?? 0} publisher(s)`, `${status.publishers ?? 0} 个发布者`)}
            variant="outlined"
          />
          <Chip
            size="small"
            label={uiText(`${status.subscribers ?? 0} subscriber(s)`, `${status.subscribers ?? 0} 个订阅者`)}
            variant="outlined"
          />
          <Chip
            size="small"
            label={uiText(`${recordedMessages.length} recorded message(s)`, `已记录 ${recordedMessages.length} 条消息`)}
            color={recordedMessages.length > 0 ? 'info' : 'default'}
            variant="outlined"
          />
        </Box>
      )}

      {/* Recorded messages */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {uiText("Recorded Messages", "消息记录")}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          label={uiText("Filter", "筛选")}
          placeholder={uiText("channel, key, or payload...", "通道、键或消息内容…")}
          value={filterText}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterText(e.target.value)}
          sx={{ width: { xs: 140, sm: 220 } }}
        />
      </Box>
      <Paper variant="outlined" sx={{ p: 1.25 }}>
        {filteredMessages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
            {status?.loaded
              ? uiText('No messages recorded yet. Enable consumers with "consume": true in your brokerConfig, then publish messages to see them here.', "暂无消息记录。请在 brokerConfig 中设置 \"consume\": true 启用消费者，再发布消息查看。")
              : uiText('Load an AsyncAPI spec with consumer subscriptions to see recorded messages.', "加载含有消费者订阅的 AsyncAPI 规范后，即可查看记录的消息。")}
          </Typography>
        ) : (
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{uiText("Channel", "通道")}</TableCell>
                  <TableCell>{uiText("Key", "键")}</TableCell>
                  <TableCell>{uiText("Payload", "消息内容")}</TableCell>
                  <TableCell align="center">{uiText("Valid", "是否有效")}</TableCell>
                  <TableCell>{uiText("Time", "时间")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredMessages.map((msg, i) => (
                  <TableRow key={`${msg.channel}-${msg.timestamp ?? i}-${i}`}>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
                        {msg.channel}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
                        {msg.key ?? '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={msg.payload}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: monospaceFontFamily,
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'block',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {truncatePayload(msg.payload)}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      {msg.schemaValid === true && (
                        <CheckCircleIcon fontSize="small" color="success" />
                      )}
                      {msg.schemaValid === false && (
                        <ErrorOutlinedIcon fontSize="small" color="error" />
                      )}
                      {msg.schemaValid == null && (
                        <Typography variant="caption" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(msg.timestamp)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}

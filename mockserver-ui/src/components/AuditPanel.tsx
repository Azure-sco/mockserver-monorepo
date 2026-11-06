import { uiText } from '../lib/dashboardLocale';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import { monospaceFontFamily } from '../theme';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { fetchAuditEntries, type AuditEntry } from '../lib/audit';
import { getConfiguration, updateConfiguration, type Configuration } from '../lib/configuration';
import HumanErrorAlert from './HumanErrorAlert';

interface AuditPanelProps {
  connectionParams: ConnectionParams;
}

/** A missing audit endpoint can return just an HTTP 404 status line. */
function isUnavailable(message: string): boolean {
  return (
    message.includes('404') ||
    message.includes('Not Found') ||
    message.includes('isn’t available')
  );
}

/** Colour the outcome chip: authorized = success, denied = warning/error. */
function outcomeColor(outcome: string): 'success' | 'warning' | 'error' | 'default' {
  const o = outcome.toUpperCase();
  if (o === 'AUTHORIZED' || o === 'ALLOWED') return 'success';
  if (o === 'FORBIDDEN') return 'error';
  if (o === 'UNAUTHENTICATED') return 'warning';
  return 'default';
}

function formatTime(epochTimeMs: number): string {
  if (!Number.isFinite(epochTimeMs)) return '';
  return new Date(epochTimeMs).toLocaleString();
}

/**
 * Case-insensitive substring match across the human-readable fields of an entry.
 * Audit entries are control-plane mutations, not request/response traffic, so the
 * traffic-oriented status:/method:/path: operators of OperatorSearchField don't
 * map cleanly here — a plain substring filter is the honest, trivially-applicable
 * option.
 */
function matchesSearch(entry: AuditEntry, needle: string): boolean {
  const haystack = [
    entry.method,
    entry.path,
    entry.operation,
    entry.sourceAddress,
    entry.principal ?? '',
    entry.principalSource ?? '',
    entry.outcome,
    entry.summary,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export default function AuditPanel({ connectionParams }: AuditPanelProps) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<HumanError | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  // Fetch on mount and whenever the user hits Refresh (refreshTick) — no polling
  // (the audit trail is a control-plane history, not live traffic; the user pulls
  // updates explicitly). The live configuration is fetched alongside the entries
  // so the On/Off status is accurate even when the list is empty. Both calls run
  // together via allSettled so a failure of one does not blank the other: a config
  // failure still lets the (possibly empty) list render, and an audit-list failure
  // still lets the status chip render. State is only ever set after the awaited
  // call resolves, never synchronously inside the effect.
  useEffect(() => {
    const controller = new AbortController();
    async function load(): Promise<void> {
      const [cfgResult, entriesResult] = await Promise.allSettled([
        getConfiguration(connectionParams, controller.signal),
        fetchAuditEntries(connectionParams, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      if (cfgResult.status === 'fulfilled') {
        setConfig(cfgResult.value);
      }
      if (entriesResult.status === 'fulfilled') {
        setEntries(entriesResult.value);
        setLoadError(null);
      } else {
        setLoadError(humanizeError(entriesResult.reason).message);
      }
      setLoading(false);
    }
    void load();
    return () => controller.abort();
  }, [connectionParams, refreshTick]);

  // Loading is toggled here (an event handler, not the effect) so the refresh
  // spinner shows without a synchronous setState inside the effect.
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshTick((t) => t + 1);
  }, []);

  // Apply a single runtime-config change (only controlPlaneAuditReads: the audit
  // trail itself is fixed at startup) and, on success, refetch config + entries.
  // A failed PUT (e.g. control-plane auth rejecting the write) surfaces via the
  // HumanErrorAlert rather than silently — mirrors ConfigurationDialog's apply().
  const applyConfig = useCallback(
    async (partial: Configuration): Promise<void> => {
      setBusy(true);
      setUpdateError(null);
      try {
        await updateConfiguration(connectionParams, partial);
        refresh();
      } catch (e) {
        setUpdateError(humanizeError(e));
      } finally {
        setBusy(false);
      }
    },
    [connectionParams, refresh],
  );

  const auditEnabled = config?.['controlPlaneAuditEnabled'] === true;
  const auditReads = config?.['controlPlaneAuditReads'] === true;
  const configLoaded = config != null;

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const all = entries ?? [];
    if (!needle) return all;
    return all.filter((e) => matchesSearch(e, needle));
  }, [entries, needle]);

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {uiText('Audit Trail', '审计记录')}
        </Typography>
        {configLoaded && (
          <Chip
            size="small"
            label={auditEnabled ? uiText('Audit Trail: On', '审计记录已启用') : uiText('Audit Trail: Off', '审计记录已关闭')}
            color={auditEnabled ? 'success' : 'default'}
            variant={auditEnabled ? 'filled' : 'outlined'}
          />
        )}
        {entries && (
          <Chip
            size="small"
            label={`${entries.length} ${entries.length === 1 ? uiText('entry', '条记录') : uiText('entries', '条记录')}`}
            variant="outlined"
          />
        )}
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder={uiText('Search audit entries', '搜索审计记录')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': uiText('Search audit entries', '搜索审计记录') },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ maxWidth: 260, '& .MuiInputBase-root': { height: 28 } }}
        />
        <Button
          size="small"
          onClick={refresh}
          disabled={loading}
          startIcon={<RefreshIcon fontSize="small" />}
          sx={{ textTransform: 'none' }}
        >
          {uiText('Refresh', '刷新')}
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {uiText('The most recent control-plane changes to this server — mutations to expectations, configuration, and server state (who changed what, and whether it was allowed). This is a separate trail from the data-plane event log of received requests and responses. Newest first. Request headers and bodies are never recorded.', '按时间从新到旧显示近期的控制面变更，包括谁操作了规则、配置或服务状态，以及操作是否获准。审计记录与请求和响应的事件日志分开保存，且不会记录请求头和请求体。')}
      </Typography>

      {configLoaded && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mb: 1.5,
            flexWrap: 'wrap',
          }}
        >
          {!auditEnabled && (
            <Typography variant="body2" color="text.secondary">
              {uiText('The audit trail is off. It can only be switched on when MockServer starts, so a control-plane request cannot switch it off to hide the changes that follow.', '审计记录当前已关闭。只能在启动 MockServer 时启用，避免通过控制面请求关闭记录并隐藏后续变更。')}
            </Typography>
          )}
          <Tooltip
            title={uiText('Also record read operations (e.g. GET /mockserver/expectation), not just mutations.', '除变更外，也记录读取操作（例如 GET /mockserver/expectation）。')}
            arrow
          >
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={auditReads}
                  disabled={busy || !auditEnabled}
                  onChange={(e) => void applyConfig({ controlPlaneAuditReads: e.target.checked })}
                  slotProps={{ input: { 'aria-label': uiText('Also record reads', '同时记录读取操作') } }}
                />
              }
              label={<Typography variant="body2">{uiText('Also record reads', '同时记录读取操作')}</Typography>}
            />
          </Tooltip>
        </Box>
      )}

      {updateError && <HumanErrorAlert error={updateError} sx={{ mb: 1.5 }} />}

      {auditEnabled && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          {uiText('Recording is on. The most recent control-plane changes since the server started appear here; a reset clears them.', '审计记录已启用。此处显示服务启动后的近期控制面变更，重置服务会清空这些记录。')}
        </Alert>
      )}

      {loadError && (
        <Alert
          severity={isUnavailable(loadError) ? 'info' : 'error'}
          sx={{ mb: 1.5 }}
          action={
            <IconButton color="inherit" size="small" onClick={refresh} aria-label={uiText('Retry', '重试')}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          }
        >
          <AlertTitle>
            {isUnavailable(loadError) ? uiText('Audit trail not available', '审计记录不可用') : uiText('Could not load audit trail', '无法加载审计记录')}
          </AlertTitle>
          {isUnavailable(loadError)
            ? uiText('The connected server does not expose an audit trail. This feature requires a newer version of MockServer.', '当前连接的服务未提供审计记录。此功能需要较新版本的 MockServer。')
            : loadError}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 0 }}>
        {filtered.length === 0 ? (
          entries != null && entries.length === 0 ? (
            // Genuinely-empty case. The server records entries only when the
            // audit trail is switched on (controlPlaneAuditEnabled, off by
            // default) — recording is independent of authentication. It is fixed
            // at startup, so when it is off the empty state says how to start the
            // server with it; when it is on it explains what will appear.
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {uiText('No audit entries recorded.', '暂无审计记录。')}
              </Typography>
              {auditEnabled ? (
                <Typography variant="body2" color="text.secondary">
                  {uiText('Recording is on — make a control-plane change (register or clear an expectation, reset, or change configuration) and it will appear here.', '审计记录已启用。注册或清除规则、重置服务、修改配置等控制面操作会显示在这里。')}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {uiText('The control-plane audit trail is off by default. To record control-plane mutations — changes to expectations, configuration, and server state — here, start MockServer with', '控制面审计默认关闭。要记录规则、配置和服务状态等控制面变更，请在启动 MockServer 时配置 ')}{' '}
                  <Box component="code" sx={{ fontFamily: monospaceFontFamily }}>
                    controlPlaneAuditEnabled=true
                  </Box>{' '}
                  {uiText('(system property', '（系统属性 ')}{' '}
                  <Box component="code" sx={{ fontFamily: monospaceFontFamily }}>
                    -Dmockserver.controlPlaneAuditEnabled=true
                  </Box>{' '}
                  {uiText('or environment variable', '或环境变量 ')}{' '}
                  <Box component="code" sx={{ fontFamily: monospaceFontFamily }}>
                    MOCKSERVER_CONTROL_PLANE_AUDIT_ENABLED=true
                  </Box>
                  {uiText(', plus', '）。如果还要记录读取操作，请同时配置 ')}{' '}
                  <Box component="code" sx={{ fontFamily: monospaceFontFamily }}>
                    controlPlaneAuditReads=true
                  </Box>{' '}
                  {uiText('to include reads).', '。')}
                </Typography>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              {entries == null ? uiText('Loading audit trail…', '正在加载审计记录…') : uiText('No entries match your search.', '没有符合搜索条件的记录。')}
            </Typography>
          )
        ) : (
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{uiText('Time', '时间')}</TableCell>
                  <TableCell>{uiText('Operation', '操作')}</TableCell>
                  <TableCell>{uiText('Method', '方法')}</TableCell>
                  <TableCell>{uiText('Path', '路径')}</TableCell>
                  <TableCell>{uiText('Source', '来源')}</TableCell>
                  <TableCell>{uiText('Principal', '操作主体')}</TableCell>
                  <TableCell>{uiText('Outcome', '结果')}</TableCell>
                  <TableCell>{uiText('Summary', '摘要')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((entry, i) => (
                  <TableRow key={`${entry.epochTimeMs}-${i}`}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
                        {formatTime(entry.epochTimeMs)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
                        {entry.operation}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
                        {entry.method}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily, wordBreak: 'break-all' }}>
                        {entry.path}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
                        {entry.sourceAddress}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {entry.principal ? (
                        <Tooltip title={entry.principalSource ? uiText(`via ${entry.principalSource}`, `身份来源：${entry.principalSource}`) : ''}>
                          <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
                            {entry.principal}
                          </Typography>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={entry.outcome}
                        color={outcomeColor(entry.outcome)}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{entry.summary}</Typography>
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

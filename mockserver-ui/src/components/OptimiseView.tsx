import { uiText } from '../lib/dashboardLocale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTransientFlag } from '../hooks/useTransientFlag';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import { useDashboardStore } from '../store';
import { useAutoLoadLlmRows } from '../hooks/useLoadFullRow';
import { groupBySession } from '../lib/sessionGrouping';
import {
  fetchOptimisationReport,
  fetchOptimisationBrief,
  sortSignalsBySeverity,
  buildVerdictText,
  gradeColor,
  type OptimisationReport,
  type OptimisationSignal,
  type OptimisationVerdict,
  type SignalSeverity,
} from '../lib/optimisation';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import HumanErrorAlert from './HumanErrorAlert';
import { monospaceFontFamily, transitions } from '../theme';
import { trackFeature } from '../lib/analytics';
import { combineTraffic } from '../lib/combineTraffic';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const ALL_SESSIONS = '__ALL__';

function formatCost(usd: number): string {
  if (!Number.isFinite(usd)) return '—';
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

function severityColor(severity: SignalSeverity | string): 'error' | 'warning' | 'info' | 'default' {
  switch (severity) {
    case 'HIGH': return 'error';
    case 'MEDIUM': return 'warning';
    case 'LOW': return 'info';
    default: return 'default';
  }
}

/** A 0..1 ratio rendered as a whole-number percent, e.g. 0.62 → "62%". */
function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Return the URL only when it is an absolute http/https URL, otherwise null.
 * Defends an `href` against `javascript:` / `data:` (and other) schemes — the
 * docsUrl comes from the server-rendered report but is still untrusted content.
 */
export function safeHttpUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed === '') return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    // Relative or malformed URLs throw here; treat as unsafe for an external link.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session picker options — built from the same grouping the dashboard already
// uses (sessionGrouping.ts), so the keys the user picks line up with what the
// server groups by. The default option requests a report over ALL traffic.
// ---------------------------------------------------------------------------

interface SessionOption {
  /** Value sent as the `session` query param (empty for "all"). */
  value: string;
  label: string;
}

function useSessionOptions(): SessionOption[] {
  const proxiedRequests = useDashboardStore((s) => s.proxiedRequests);
  const recordedRequests = useDashboardStore((s) => s.recordedRequests);
  const activeExpectations = useDashboardStore((s) => s.activeExpectations);
  useAutoLoadLlmRows();

  return useMemo(() => {
    const all = combineTraffic(proxiedRequests, recordedRequests);
    const sessions = groupBySession(all, activeExpectations);
    const options: SessionOption[] = [{ value: ALL_SESSIONS, label: uiText('All captured LLM traffic', '所有已捕获的 LLM 流量') }];
    const seen = new Set<string>();
    for (const session of sessions) {
      // v1 optimisation groups proxied LLM traffic by upstream host. Isolation-
      // scoped (mocked-conversation) sessions are not cost-relevant and the
      // server groups only by host, so we offer host-grouped sessions only —
      // otherwise selecting an isolation-scoped option would silently return an
      // empty report. See docs/code/llm-mocking.md (optimisation export, v1).
      if (session.scenarioName !== '<unscoped>') continue;
      const key = session.isolationKey;
      if (!key || key === '<unscoped>' || seen.has(key)) continue;
      seen.add(key);
      options.push({ value: key, label: key });
    }
    return options;
  }, [proxiedRequests, recordedRequests, activeExpectations]);
}

// ---------------------------------------------------------------------------
// Hero cards
// ---------------------------------------------------------------------------

interface HeroCardProps {
  label: string;
  value: string;
}

function HeroCard({ label, value }: HeroCardProps) {
  return (
    <Card
      elevation={1}
      sx={{
        p: 1.25,
        transition: transitions.forProps(['box-shadow', 'transform']),
        '&:hover': {
          boxShadow: (t) => t.shadows[4],
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2, mt: 0.25 }}>{value}</Typography>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Verdict banner
// ---------------------------------------------------------------------------

/** True when there is nothing to recommend — render the calm grade-A state. */
function isCalmVerdict(verdict: OptimisationVerdict): boolean {
  return gradeColor(verdict.grade) === 'success'
    && verdict.grade.toUpperCase() === 'A'
    && (verdict.totalEstimatedSavingUsd ?? 0) === 0
    && verdict.highCount === 0
    && verdict.mediumCount === 0
    // also require no LOW findings — a LOW signal (e.g. OUTPUT_TOKEN_BLOAT, which
    // reports no $ saving) still lists an opportunity below, so the calm
    // "nothing to recommend" banner would contradict the opportunities panel.
    && verdict.lowCount === 0;
}

function VerdictBanner({ verdict }: { verdict: OptimisationVerdict }) {
  const color = gradeColor(verdict.grade);
  const calm = isCalmVerdict(verdict);
  const pct = formatPercent(verdict.savingFractionOfSpend);
  const money = formatCost(verdict.totalEstimatedSavingUsd);
  const estSuffix = verdict.costIsEstimated ? ' (est.)' : '';

  if (calm) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }} data-testid="optimise-verdict">
        <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1, color: `${color}.main` }}>
          {verdict.grade}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {uiText('Grade', '评级')} {verdict.grade} {uiText('— no optimisation opportunities detected', '· 未发现可优化项')}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, mb: 1.5, display: 'flex', alignItems: 'center', gap: 2, borderColor: (t) => t.palette[color].main }}
      data-testid="optimise-verdict"
    >
      <Typography variant="h2" sx={{ fontWeight: 800, lineHeight: 1, color: `${color}.main`, minWidth: 48, textAlign: 'center' }}>
        {verdict.grade}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {uiText('Est.', '预计')} {money}{estSuffix} {uiText('recoverable (', '可节省（')}{pct} {uiText('of spend)', '的支出）')}
        </Typography>
        {verdict.rationale && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {verdict.rationale}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Signals panel
// ---------------------------------------------------------------------------

/** A code block with a small copy-to-clipboard button. */
function SnippetBlock({ label, snippet }: { label: string; snippet: string }) {
  const [copied, flashCopied] = useTransientFlag(false);
  const onCopy = useCallback(() => {
    void navigator.clipboard.writeText(snippet).then(() => {
      flashCopied(true, false, 2000);
    });
  }, [snippet, flashCopied]);
  return (
    <Box sx={{ position: 'relative', mt: 0.5 }}>
      <Tooltip title={copied ? uiText('Copied!', '已复制') : uiText(`Copy ${label}`, `复制${label}`)}>
        <IconButton
          size="small"
          onClick={onCopy}
          aria-label={uiText(`Copy ${label}`, `复制${label}`)}
          sx={{ position: 'absolute', top: 2, right: 2 }}
        >
          <ContentCopyIcon sx={{ fontSize: '0.8rem' }} />
        </IconButton>
      </Tooltip>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1,
          pr: 4,
          borderRadius: 1,
          bgcolor: 'action.hover',
          fontFamily: monospaceFontFamily,
          fontSize: '0.7rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowX: 'auto',
        }}
      >
        {snippet}
      </Box>
    </Box>
  );
}

function SignalCard({ signal }: { signal: OptimisationSignal }) {
  const fix = signal.fix;
  return (
    <Paper variant="outlined" sx={{ p: 1.25, mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
        <Chip
          size="small"
          label={signal.severity}
          color={severityColor(signal.severity)}
          variant="filled"
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
        />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{signal.title}</Typography>
        <Box sx={{ flex: 1 }} />
        {signal.estimatedSavingUsd != null && (
          <Chip
            size="small"
            color="success"
            variant="outlined"
            label={uiText(`save ~${formatCost(signal.estimatedSavingUsd)}`, `预计节省 ${formatCost(signal.estimatedSavingUsd)}`)}
            sx={{ height: 20, fontSize: '0.65rem', fontFamily: monospaceFontFamily }}
          />
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{signal.detail}</Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 0.5 }}>
        {signal.affectedCalls.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {uiText('Affected calls:', '受影响的调用')} {signal.affectedCalls.join(', ')}
          </Typography>
        )}
        {signal.estimatedWastedInputTokens != null && (
          <Typography variant="caption" color="text.secondary">
            ~{signal.estimatedWastedInputTokens.toLocaleString()} {uiText('wasted input tokens', '浪费的输入 token')}
          </Typography>
        )}
      </Box>
      {fix ? (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{fix.summary}</Typography>
          {fix.action && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{fix.action}</Typography>
          )}
          {fix.configSnippet && <SnippetBlock label={uiText('config snippet', '配置片段')} snippet={fix.configSnippet} />}
          {fix.exampleExpectation && <SnippetBlock label={uiText('example expectation', '示例 Mock 规则')} snippet={fix.exampleExpectation} />}
          {(() => {
            const docsHref = safeHttpUrl(fix.docsUrl);
            return docsHref ? (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <Box component="a" href={docsHref} target="_blank" rel="noopener noreferrer" sx={{ color: 'primary.main' }}>
                  {uiText('Learn more', '了解更多')}
                </Box>
              </Typography>
            ) : null;
          })()}
        </Box>
      ) : (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {uiText('Recommendation:', '建议')} <Box component="span" sx={{ fontWeight: 400 }}>{signal.recommendation}</Box>
        </Typography>
      )}
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

interface OptimiseViewProps {
  connectionParams: ConnectionParams;
}

type LoadState = 'loading' | 'ok' | 'error';

export default function OptimiseView({ connectionParams }: OptimiseViewProps) {
  const sessionOptions = useSessionOptions();
  const [selected, setSelected] = useState<string>(ALL_SESSIONS);
  const [report, setReport] = useState<OptimisationReport | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<HumanError | null>(null);

  // Flag a displayed report as stale when new traffic arrives after it was
  // fetched. The obvious signal — the NUMBER of captured rows — is wrong here:
  // proxiedRequests/recordedRequests are a capped live window (≤100 each), so
  // their combined length SATURATES at the cap and stops moving, and the stale
  // banner would then never fire again under sustained load. Instead track a
  // signature built from each window's tail row. These store arrays are
  // newest-FIRST (index 0 is the newest; the panels `.reverse()` only for
  // display), so the tail (last element) is the OLDEST row still retained — but
  // at saturation a fresh capture evicts that oldest row as it prepends the
  // newest, so the tail key changes whenever new traffic lands either way. Kept
  // in a ref so `load` need not depend on it (which would otherwise re-fetch on
  // every push).
  const proxiedRequests = useDashboardStore((s) => s.proxiedRequests);
  const recordedRequests = useDashboardStore((s) => s.recordedRequests);
  const liveTrafficSignature =
    `${proxiedRequests.length}:${proxiedRequests[proxiedRequests.length - 1]?.key ?? ''}`
    + `|${recordedRequests.length}:${recordedRequests[recordedRequests.length - 1]?.key ?? ''}`;
  const liveTrafficSignatureRef = useRef(liveTrafficSignature);
  // Mirror the latest signature into the ref via an effect rather than during
  // render (mutating a ref in render is flagged by react-hooks/refs and is unsafe
  // under concurrent rendering). The ref lets `load` read the current signature
  // without depending on it.
  useEffect(() => {
    liveTrafficSignatureRef.current = liveTrafficSignature;
  }, [liveTrafficSignature]);
  // Traffic signature captured into the currently-displayed report (null until loaded).
  const [loadedTrafficSignature, setLoadedTrafficSignature] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<null | 'copy' | 'copyVerdict' | 'download'>(null);
  const [actionError, setActionError] = useState<HumanError | null>(null);
  const [copied, flashCopied] = useTransientFlag(false);
  const [verdictCopied, flashVerdictCopied] = useTransientFlag(false);

  // Map the picker selection to the query the lib expects (omit for "all").
  const query = useMemo(
    () => (selected === ALL_SESSIONS ? {} : { session: selected }),
    [selected],
  );

  // Runs the fetch and reconciles state. Sets the loading state synchronously so
  // the skeleton shows at once, then resolves to ok/error.
  const load = useCallback(
    (signal?: AbortSignal) => {
      setState('loading');
      setError(null);
      fetchOptimisationReport(connectionParams, query, signal)
        .then((r) => {
          if (signal?.aborted) return;
          setReport(r);
          setState('ok');
          // Snapshot the traffic signature this report reflects so later captures mark it stale.
          setLoadedTrafficSignature(liveTrafficSignatureRef.current);
        })
        .catch((e) => {
          if (signal?.aborted) return;
          setReport(null);
          setError(humanizeError(e));
          setState('error');
        });
    },
    [connectionParams, query],
  );

  // Re-fetch on mount and whenever the selected session changes. `load` sets
  // loading state synchronously on purpose so the skeleton appears immediately.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleCopy = useCallback(async () => {
    setBusyAction('copy');
    setActionError(null);
    try {
      const markdown = await fetchOptimisationBrief(connectionParams, query);
      await navigator.clipboard.writeText(markdown);
      flashCopied(true, false, 2000);
    } catch (e) {
      setActionError(humanizeError(e));
    } finally {
      setBusyAction(null);
    }
  }, [connectionParams, query, flashCopied]);

  // Build a compact plain-text verdict CLIENT-SIDE from the already-loaded JSON
  // report (no fetch) and write it to the clipboard.
  const handleCopyVerdict = useCallback(async () => {
    if (!report) return;
    setBusyAction('copyVerdict');
    setActionError(null);
    try {
      await navigator.clipboard.writeText(buildVerdictText(report));
      flashVerdictCopied(true, false, 2000);
    } catch (e) {
      setActionError(humanizeError(e));
    } finally {
      setBusyAction(null);
    }
  }, [report, flashVerdictCopied]);

  const handleDownload = useCallback(async () => {
    setBusyAction('download');
    setActionError(null);
    try {
      const res = await fetchOptimisationReport(connectionParams, query);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const suffix = selected === ALL_SESSIONS ? 'all' : selected.replace(/[^A-Za-z0-9._-]+/g, '_');
      anchor.download = `optimisation-report-${suffix}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionError(humanizeError(e));
    } finally {
      setBusyAction(null);
    }
  }, [connectionParams, query, selected]);

  const totals = report?.totals;
  const hasReport = report != null;
  const isEmpty = hasReport && totals != null && totals.callCount === 0;
  const sortedSignals = useMemo(
    () => (report ? sortSignalsBySeverity(report.signals ?? []) : []),
    [report],
  );

  const avgLatencyMs = totals && totals.callCount > 0 ? totals.totalLatencyMs / totals.callCount : 0;

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
      {/* Header + session picker */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{uiText('LLM Optimise', 'LLM 优化')}</Typography>
        <Tooltip title={uiText('Captured LLM traffic, analysed for deterministic cost-saving opportunities. Export a brief to paste into any LLM.', '根据已捕获的 LLM 流量分析可量化的成本优化机会。可导出摘要并交给 LLM 处理。')}>
          <Chip size="small" label={uiText('LLM cost', 'LLM 成本')} variant="outlined" />
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <TextField
          select
          size="small"
          label={uiText('Session', '会话')}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          sx={{ minWidth: 240, '& .MuiInputBase-root': { fontSize: '0.8rem' } }}
          slotProps={{ htmlInput: { 'aria-label': 'Session' } }}
        >
          {sessionOptions.map((opt) => (
            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.8rem' }}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
        <Tooltip title={uiText('Refresh report', '刷新报告')}>
          <IconButton size="small" onClick={() => { trackFeature('optimise_run'); load(); }} aria-label={uiText('Refresh report', '刷新报告')}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {state === 'error' && error && (
        <HumanErrorAlert error={error} sx={{ mb: 1.5 }} data-testid="optimise-error" />
      )}

      {actionError && (
        <HumanErrorAlert error={actionError} sx={{ mb: 1.5 }} data-testid="optimise-action-error" onClose={() => setActionError(null)} />
      )}

      {state === 'ok' && loadedTrafficSignature !== null && liveTrafficSignature !== loadedTrafficSignature && (
        <Alert
          severity="info"
          data-testid="optimise-stale-banner"
          sx={{ mb: 1.5 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => { trackFeature('optimise_run'); load(); }}
            >
              {uiText('Refresh', '刷新')}
            </Button>
          }
        >
          {uiText('New traffic captured since this report — refresh to update.', '报告生成后已捕获新流量。刷新可查看最新结果。')}
        </Alert>
      )}

      {state === 'loading' && !report && (
        <Box data-testid="optimise-loading">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, mb: 1.5 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Card key={i} elevation={1} sx={{ p: 1.25 }}>
                <Skeleton variant="text" width="55%" height={14} />
                <Skeleton variant="text" width="70%" height={32} />
              </Card>
            ))}
          </Box>
        </Box>
      )}

      {isEmpty && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">{uiText('No LLM traffic captured', '尚未捕获 LLM 流量')}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {uiText('Proxy LLM calls through MockServer, then return here to analyse them for cost-saving opportunities.', '通过 MockServer 代理 LLM 调用，再回到这里分析可节省的成本。')}
          </Typography>
        </Paper>
      )}

      {hasReport && totals && !isEmpty && (
        <>
          {/* Verdict banner — A–F grade + "$X recoverable" headline */}
          {report.verdict && <VerdictBanner verdict={report.verdict} />}

          {/* Hero cards */}
          <Box
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, mb: 1.5 }}
            data-testid="optimise-hero"
          >
            <HeroCard
              label={totals.costIsEstimated ? uiText('Total cost (est.)', '总成本（估算）') : uiText('Total cost', '总成本')}
              value={formatCost(totals.estimatedCostUsd)}
            />
            <HeroCard label={uiText('Input tokens', '输入 token 数')} value={totals.inputTokens.toLocaleString()} />
            <HeroCard label={uiText('Output tokens', '输出 token 数')} value={totals.outputTokens.toLocaleString()} />
            <HeroCard label={uiText('Calls', '调用次数')} value={totals.callCount.toLocaleString()} />
            <HeroCard label={uiText('Avg latency', '平均延迟')} value={formatMs(avgLatencyMs)} />
            <HeroCard label={uiText('Cache hit', '缓存命中')} value={formatPercent(totals.cacheHitRatio)} />
            <HeroCard label={uiText('One-shot', '单次调用')} value={formatPercent(totals.oneShotRate)} />
          </Box>

          {/* Provider / model summary + actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            {(report.session.providers ?? []).map((p) => (
              <Chip key={`prov-${p}`} size="small" variant="outlined" label={p} sx={{ height: 20, fontSize: '0.65rem' }} />
            ))}
            {(report.session.models ?? []).map((m) => (
              <Chip key={`model-${m}`} size="small" variant="outlined" color="primary" label={m} sx={{ height: 20, fontSize: '0.65rem', fontFamily: monospaceFontFamily }} />
            ))}
            <Box sx={{ flex: 1 }} />
            <Button
              variant="outlined"
              size="small"
              startIcon={<ContentCopyIcon sx={{ fontSize: '0.875rem' }} />}
              onClick={() => void handleCopyVerdict()}
              disabled={busyAction !== null}
            >
              {verdictCopied ? uiText('Copied!', '已复制') : busyAction === 'copyVerdict' ? uiText('Copying…', '正在复制…') : uiText('Copy verdict', '复制分析结果')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<ContentCopyIcon sx={{ fontSize: '0.875rem' }} />}
              onClick={() => void handleCopy()}
              disabled={busyAction !== null}
            >
              {copied ? uiText('Copied!', '已复制') : busyAction === 'copy' ? uiText('Copying…', '正在复制…') : uiText('Copy optimisation brief', '复制优化摘要')}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<DownloadIcon sx={{ fontSize: '0.875rem' }} />}
              onClick={() => void handleDownload()}
              disabled={busyAction !== null}
            >
              {busyAction === 'download' ? uiText('Downloading…', '正在下载…') : uiText('Download bundle', '下载分析资料')}
            </Button>
          </Box>

          {/* Detected opportunities */}
          <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {uiText('Detected Opportunities', '发现的优化机会')} {sortedSignals.length > 0 && `(${sortedSignals.length})`}
            </Typography>
            {sortedSignals.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {uiText('No optimisation opportunities detected for this session.', '此会话未发现可优化项。')}
              </Typography>
            ) : (
              <Box data-testid="optimise-signals">
                {sortedSignals.map((signal, i) => (
                  <SignalCard key={`${signal.id}-${i}`} signal={signal} />
                ))}
              </Box>
            )}
          </Paper>

          {/* Per-call table */}
          <Paper variant="outlined" sx={{ p: 1.25 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>{uiText('Calls', '调用次数')}</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label={uiText('Per-call breakdown', '单次调用明细')} data-testid="optimise-call-table">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>{uiText('Model', '模型')}</TableCell>
                    <TableCell align="right">{uiText('In tok', '输入 token')}</TableCell>
                    <TableCell align="right">{uiText('Out tok', '输出 token')}</TableCell>
                    <TableCell align="right">{uiText('Cost', '成本')}</TableCell>
                    <TableCell align="right">{uiText('Latency', '延迟')}</TableCell>
                    <TableCell align="right">{uiText('Tools', '工具')}</TableCell>
                    <TableCell>{uiText('Finish', '结束原因')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(report.calls ?? []).map((call) => (
                    <TableRow key={call.index} hover>
                      <TableCell>{call.index}</TableCell>
                      <TableCell sx={{ fontFamily: monospaceFontFamily, fontSize: '0.72rem' }}>{call.model}</TableCell>
                      <TableCell align="right">{call.inputTokens.toLocaleString()}</TableCell>
                      <TableCell align="right">{call.outputTokens.toLocaleString()}</TableCell>
                      <TableCell align="right">{formatCost(call.estimatedCostUsd)}</TableCell>
                      <TableCell align="right">{formatMs(call.latencyMs)}</TableCell>
                      <TableCell align="right">{call.toolCalls?.length ?? 0}</TableCell>
                      <TableCell>{call.finishReason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}

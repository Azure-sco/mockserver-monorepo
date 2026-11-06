import { uiText } from '../lib/dashboardLocale';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';
import RefreshIcon from '@mui/icons-material/Refresh';
import { transitions, monospaceFontFamily } from '../theme';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { useMetricsPolling } from '../hooks/useMetricsPolling';
import { findSample, metricValue, metricValueByLabel, metricSum, hasMetric, labelValues } from '../lib/prometheusParser';
import { gaugeSeries, gaugeSeriesByLabel, gaugeSeriesSum, ratePerSecond, latestRate } from '../lib/metricsDerive';
import type { MetricsSnapshot } from '../lib/metricsDerive';
import { histogramQuantile } from '../lib/histogramQuantile';
import MetricsLineChart from './MetricsLineChart';

const LATENCY_METRIC = 'mock_server_request_duration_seconds';
const CHAOS_METRIC = 'mock_server_http_chaos_injected_total';
const ACTIVE_CHAOS_METRIC = 'mock_server_active_service_chaos';
const EXPECTATIONS_BY_TYPE_METRIC = 'mock_server_expectations_by_type';
const MCP_TOOL_CALLS_METRIC = 'mock_server_mcp_tool_calls_total';
const AUTO_HALT_METRIC = 'mock_server_chaos_auto_halt';
const LLM_COST_BUDGET_TRIPPED_METRIC = 'mock_server_llm_cost_budget_tripped';
const LLM_COST_USD_METRIC = 'mock_server_llm_cost_usd';
const ASYNC_PUBLISHED_METRIC = 'mock_server_async_messages_published_total';
const ASYNC_CONSUMED_METRIC = 'mock_server_async_messages_consumed_total';
const EXPECTATIONS_BYTES_METRIC = 'mock_server_expectations_bytes';
const MAX_EXPECTATIONS_BYTES_METRIC = 'mock_server_max_expectations_bytes';
const ACCEPT_QUEUE_CONFIGURED_METRIC = 'mock_server_accept_queue_backlog_configured';
const ACCEPT_QUEUE_EFFECTIVE_METRIC = 'mock_server_accept_queue_backlog_effective';
const EVENT_LOG_RETAINED_BYTES_METRIC = 'mock_server_event_log_retained_bytes';
const EVENT_LOG_MAX_RETAINED_BYTES_METRIC = 'mock_server_event_log_max_retained_bytes';
const EVENT_LOG_RETAINED_ENTRIES_METRIC = 'mock_server_event_log_retained_entries';
const EVENT_LOG_MAX_RETAINED_ENTRIES_METRIC = 'mock_server_event_log_max_retained_entries';
const EVENT_LOG_IN_FLIGHT_BYTES_METRIC = 'mock_server_event_log_in_flight_bytes';
const EVENT_LOG_MAX_IN_FLIGHT_BYTES_METRIC = 'mock_server_event_log_max_in_flight_bytes';
const EVENT_LOG_RING_OCCUPANCY_METRIC = 'mock_server_event_log_ring_occupancy';
const EVENT_LOG_RING_CAPACITY_METRIC = 'mock_server_event_log_ring_capacity';

// All HTTP chaos fault types, in display order. Any fault_type the server emits
// that is not listed here still renders (appended, title-cased) so the UI never
// silently drops a future fault type.
const CHAOS_FAULT_ORDER = ['drop', 'error', 'latency', 'truncate', 'malformed', 'slow', 'quota'];

const CHAOS_FAULT_LABELS = new Map<string, string>([
  ['drop', '断开连接'],
  ['error', '错误'],
  ['latency', '延迟'],
  ['truncate', '截断'],
  ['malformed', '畸形响应'],
  ['slow', '慢速响应'],
  ['quota', '配额限制'],
]);

const METRICS_STATUS_LABELS = { loading: '正在加载', disabled: '已关闭', error: '异常' };

function chaosFaultLabel(faultType: string): string {
  const english = faultType.charAt(0).toUpperCase() + faultType.slice(1);
  return uiText(english, CHAOS_FAULT_LABELS.get(faultType) ?? english);
}

/** Converts e.g. "RESPONSE_TEMPLATE" to "Response template". */
function prettyEnumLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/** fault_type values present in the metric, ordered by CHAOS_FAULT_ORDER then first-seen. */
function orderedFaultTypes(present: string[]): string[] {
  const known = CHAOS_FAULT_ORDER.filter((ft) => present.includes(ft));
  const extra = present.filter((ft) => !CHAOS_FAULT_ORDER.includes(ft));
  return [...known, ...extra];
}

interface MetricsViewProps {
  connectionParams: ConnectionParams;
}

// The server's received counter counts every request, including control-plane
// calls such as this view's own 3 s scrape, so the label says so.
const SUMMARY: { name: string; label: string }[] = [
  { name: 'requests_received_count', label: uiText('All requests received', '接收请求总数') },
  { name: 'response_expectations_matched_count', label: uiText('Matched', '已匹配') },
  { name: 'expectations_not_matched_count', label: uiText('Not matched', '未匹配') },
  { name: 'forward_expectations_matched_count', label: uiText('Forwarded', '已转发') },
];

function prettyActionName(metric: string): string {
  return metric
    .replace(/_count$/, '')
    .replace(/_/g, ' ')
    .trim();
}

function formatBytes(bytes: number): string {
  if (bytes < 0 || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i] ?? 'B'}`;
}

/**
 * A "running out of room" panel: the live value charted against its budget so a reader sees
 * "256 MB of a 256 MB budget", not a bare "256 MB" that looks informative and tells them nothing.
 * A budget of 0 means the bound is DISABLED (not "a budget of zero"), so the budget line is dropped
 * and the caption says the limit is off rather than drawing a misleading full bar.
 */
function CapacityChart({
  title,
  budgetLabel,
  history,
  timestamps,
  valueMetric,
  budgetMetric,
  budgetValue,
  valueFormatter,
}: {
  title: string;
  budgetLabel: string;
  history: MetricsSnapshot[];
  timestamps: number[];
  valueMetric: string;
  budgetMetric: string;
  budgetValue: number;
  valueFormatter: (v: number) => string;
}) {
  const bounded = budgetValue > 0;
  return (
    <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        {`${title}${bounded ? '' : uiText(' (no limit set)', '（未设上限）')}`}
      </Typography>
      <MetricsLineChart
        timestamps={timestamps}
        height={200}
        valueFormatter={valueFormatter}
        series={
          bounded
            ? [
                { data: gaugeSeries(history, valueMetric), label: uiText('used', '已使用') },
                { data: gaugeSeries(history, budgetMetric), label: budgetLabel },
              ]
            : [{ data: gaugeSeries(history, valueMetric), label: uiText('used', '已使用') }]
        }
      />
    </Paper>
  );
}

export default function MetricsView({ connectionParams }: MetricsViewProps) {
  const { status, history, latest, error, intervalMs, refresh } = useMetricsPolling(connectionParams, {
    intervalMs: 3000,
    historySize: 60,
  });

  const version = latest ? findSample(latest.samples, 'mock_server_build_info')?.labels.version : undefined;
  const rps = latestRate(history, 'requests_received_count');

  // One wall-clock timestamp per history snapshot, in lockstep with every
  // derived series, so the charts can render a real time x-axis.
  const timestamps = history.map((h) => h.at);

  // KPI "hero" stats — the four headline request counters surfaced as prominent
  // stat cards above the chart stack. Latency p50/p95/p99 join when the server
  // exposes the duration histogram (added below once latencyEnabled is known).
  const heroCounters = latest
    ? SUMMARY.map(({ name, label }) => ({ label, value: metricValue(latest.samples, name) }))
    : [];

  const actionRows = latest
    ? latest.samples
        .filter((s) => s.name.endsWith('_actions_count'))
        .map((s) => ({ name: s.name, label: prettyActionName(s.name), value: s.value }))
        .sort((a, b) => b.value - a.value)
    : [];
  const maxAction = actionRows.reduce((m, r) => Math.max(m, r.value), 0);
  const jvmEnabled = latest ? hasMetric(latest.samples, 'jvm_memory_used_bytes') : false;
  const latencyEnabled = latest ? hasMetric(latest.samples, `${LATENCY_METRIC}_count`) : false;
  // Latency quantiles for the hero stat row (ms). Only meaningful when the
  // duration histogram is exposed; otherwise omitted from the hero cards.
  const latencyHeroStats = latencyEnabled && latest
    ? ([['p50', 0.5], ['p95', 0.95], ['p99', 0.99]] as const).map(([label, q]) => {
        const seconds = histogramQuantile(latest.samples, LATENCY_METRIC, q);
        return { label, text: seconds == null ? '—' : `${(seconds * 1000).toFixed(1)} ms` };
      })
    : [];
  const chaosFaultTypes = latest ? orderedFaultTypes(labelValues(latest.samples, CHAOS_METRIC, 'fault_type')) : [];
  const chaosFaultTotals = latest
    ? chaosFaultTypes.map((ft) => ({ faultType: ft, value: metricValueByLabel(latest.samples, CHAOS_METRIC, 'fault_type', ft) }))
    : [];
  // Active service-scoped chaos is a gauge labeled by fault_type (one series per
  // type), so it is charted by type rather than shown as a single counter.
  const activeChaosFaultTypes = latest ? orderedFaultTypes(labelValues(latest.samples, ACTIVE_CHAOS_METRIC, 'fault_type')) : [];
  const activeServiceChaosEnabled = activeChaosFaultTypes.length > 0;
  const activeChaosTotal = activeChaosFaultTypes.reduce(
    (sum, ft) => sum + (latest ? metricValueByLabel(latest.samples, ACTIVE_CHAOS_METRIC, 'fault_type', ft) : 0),
    0,
  );
  // Auto-halt circuit-breaker counter
  const autoHaltTotal = latest ? metricValue(latest.samples, AUTO_HALT_METRIC) : 0;
  const autoHaltEnabled = latest ? hasMetric(latest.samples, AUTO_HALT_METRIC) : false;

  // LLM cost-budget circuit-breaker counter and cumulative cost
  const llmCostBudgetTrippedTotal = latest ? metricValue(latest.samples, LLM_COST_BUDGET_TRIPPED_METRIC) : 0;
  const llmCostBudgetEnabled = latest ? hasMetric(latest.samples, LLM_COST_BUDGET_TRIPPED_METRIC) : false;
  const llmCostUsdTotal = latest ? metricSum(latest.samples, LLM_COST_USD_METRIC) : 0;

  const chaosEnabled = latest ? (hasMetric(latest.samples, CHAOS_METRIC) || activeServiceChaosEnabled || autoHaltEnabled || llmCostBudgetEnabled) : false;
  // The auto-halt and LLM cost-budget counters are meaningful even at zero (they
  // mean the circuit-breaker is configured and has not fired), so their presence
  // alone qualifies as "has data".
  const chaosHasData = chaosFaultTotals.some((f) => f.value > 0) || activeChaosTotal > 0 || autoHaltEnabled || llmCostBudgetEnabled;

  // Expectations by type — gauge labeled by action_type
  const expectationActionTypes = latest
    ? labelValues(latest.samples, EXPECTATIONS_BY_TYPE_METRIC, 'action_type')
    : [];
  const expectationsByType = latest
    ? expectationActionTypes
        .map((at) => ({ actionType: at, value: metricValueByLabel(latest.samples, EXPECTATIONS_BY_TYPE_METRIC, 'action_type', at) }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];
  const expectationsByTypeEnabled = expectationsByType.length > 0;

  // MCP tool calls — counter labeled by tool (shown cumulative like actions-executed)
  const mcpToolNames = latest
    ? labelValues(latest.samples, MCP_TOOL_CALLS_METRIC, 'tool')
    : [];
  const mcpToolRows = latest
    ? mcpToolNames
        .map((t) => ({ tool: t, value: metricValueByLabel(latest.samples, MCP_TOOL_CALLS_METRIC, 'tool', t) }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];
  const mcpToolCallsEnabled = mcpToolRows.length > 0;

  // Async message activity — two counters (published / consumed) labeled by channel,
  // summed across channels into two cumulative lines on a chart separate from HTTP.
  const asyncPublishedTotal = latest ? metricSum(latest.samples, ASYNC_PUBLISHED_METRIC) : 0;
  const asyncConsumedTotal = latest ? metricSum(latest.samples, ASYNC_CONSUMED_METRIC) : 0;
  const asyncEnabled = latest
    ? hasMetric(latest.samples, ASYNC_PUBLISHED_METRIC) || hasMetric(latest.samples, ASYNC_CONSUMED_METRIC)
    : false;
  const asyncHasData = asyncPublishedTotal > 0 || asyncConsumedTotal > 0;

  // Capacity ("running out of room") signals, alongside JVM heap below. The expectation-store byte
  // total is live whether or not a byte budget is set, so the budget line is drawn only when a bound
  // is in force (> 0). The accept-queue backlog is a configuration ceiling, not a time series, so it
  // is shown as stat numbers; the "effective" (kernel-capped) figure is only present when the server
  // could read the kernel ceiling (Linux) — on other platforms the server omits it and so does this.
  const expectationBytesEnabled = latest ? hasMetric(latest.samples, EXPECTATIONS_BYTES_METRIC) : false;
  const maxExpectationsBytes = latest ? metricValue(latest.samples, MAX_EXPECTATIONS_BYTES_METRIC) : 0;
  const acceptQueueEnabled = latest ? hasMetric(latest.samples, ACCEPT_QUEUE_CONFIGURED_METRIC) : false;
  const acceptQueueConfigured = latest ? metricValue(latest.samples, ACCEPT_QUEUE_CONFIGURED_METRIC) : 0;
  const acceptQueueEffectiveEnabled = latest ? hasMetric(latest.samples, ACCEPT_QUEUE_EFFECTIVE_METRIC) : false;
  const acceptQueueEffective = latest ? metricValue(latest.samples, ACCEPT_QUEUE_EFFECTIVE_METRIC) : 0;

  // Event-log gauges — the same "running out of room" question as the expectation store, so charted
  // in the same section. All eight register together, so one presence check gates the whole group.
  // The byte budgets (max_retained_bytes, max_in_flight_bytes) can be 0 = disabled; the entry cap and
  // ring capacity are always positive. Each latest budget value decides whether its budget line is drawn.
  const eventLogEnabled = latest ? hasMetric(latest.samples, EVENT_LOG_RETAINED_BYTES_METRIC) : false;
  const eventLogMaxRetainedBytes = latest ? metricValue(latest.samples, EVENT_LOG_MAX_RETAINED_BYTES_METRIC) : 0;
  const eventLogMaxRetainedEntries = latest ? metricValue(latest.samples, EVENT_LOG_MAX_RETAINED_ENTRIES_METRIC) : 0;
  const eventLogMaxInFlightBytes = latest ? metricValue(latest.samples, EVENT_LOG_MAX_IN_FLIGHT_BYTES_METRIC) : 0;
  const eventLogRingCapacity = latest ? metricValue(latest.samples, EVENT_LOG_RING_CAPACITY_METRIC) : 0;

  const countFormatter = (v: number) => Math.round(v).toLocaleString();

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {uiText('Metrics', '运行指标')}
        </Typography>
        <Chip
          size="small"
          label={status === 'ok' ? uiText('live', '实时') : uiText(status, METRICS_STATUS_LABELS[status])}
          color={status === 'ok' ? 'success' : status === 'disabled' ? 'default' : status === 'error' ? 'error' : 'warning'}
          variant="outlined"
        />
        {version && <Chip size="small" label={`MockServer ${version}`} variant="outlined" />}
        <Box sx={{ flex: 1 }} />
        {latest && (
          <Typography variant="caption" color="text.secondary">
            {uiText('updated ', '更新于 ')}{new Date(latest.at).toLocaleTimeString()}{uiText(' · every ', '· 每 ')}{Math.round(intervalMs / 1000)}{uiText('s', '秒刷新')}
          </Typography>
        )}
        <Tooltip title={uiText('Refresh now', '立即刷新')}>
          <IconButton size="small" onClick={refresh} aria-label={uiText('Refresh metrics', '刷新指标')}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {status === 'disabled' && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          <AlertTitle>{uiText('Metrics are disabled', '指标采集已关闭')}</AlertTitle>
          {uiText('Start MockServer with metrics enabled to view live metrics here:', '启动 MockServer 时启用指标采集，即可在此查看实时指标：')}
          <Box component="pre" sx={{ mt: 1, mb: 0, p: 1, bgcolor: 'action.hover', borderRadius: 1, typography: 'subtitle2', fontWeight: 400, fontFamily: monospaceFontFamily, overflow: 'auto' }}>
{uiText(`-Dmockserver.metricsEnabled=true
# or environment variable:
MOCKSERVER_METRICS_ENABLED=true`, `-Dmockserver.metricsEnabled=true
# 或设置环境变量：
MOCKSERVER_METRICS_ENABLED=true`)}
          </Box>
        </Alert>
      )}

      {status === 'error' && (
        <Alert severity="error" sx={{ mb: 1.5 }} action={
          <IconButton color="inherit" size="small" onClick={refresh} aria-label={uiText('Retry', '重试')}><RefreshIcon fontSize="small" /></IconButton>
        }>
          <AlertTitle>{uiText('Could not load metrics', '无法加载指标')}</AlertTitle>
          {error}
        </Alert>
      )}

      {status === 'loading' && history.length === 0 && (
        <Box data-testid="metrics-loading-skeleton">
          {/* Hero stat-card row placeholder */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, mb: 1.5 }}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} elevation={1} sx={{ p: 1.25 }}>
                <Skeleton variant="text" width="55%" height={14} />
                <Skeleton variant="text" width="70%" height={32} />
              </Card>
            ))}
          </Box>
          {/* Chart-block placeholders */}
          {[0, 1, 2].map((i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
              <Skeleton variant="text" width="40%" height={16} />
              <Skeleton variant="rounded" height={i === 0 ? 180 : 160} sx={{ mt: 1 }} />
            </Paper>
          ))}
        </Box>
      )}

      {latest && (
        <>
          {/* KPI hero stat cards — headline request counters (and latency
              quantiles when available) presented as prominent cards above the
              chart stack, rather than a monotonous list of identical papers. */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 1,
              mb: 1.5,
            }}
          >
            {heroCounters.map(({ label, value }) => (
              <Card
                key={label}
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
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2, mt: 0.25 }}>
                  {value.toLocaleString()}
                </Typography>
              </Card>
            ))}
            {latencyHeroStats.map(({ label, text }) => (
              <Card
                key={`latency-${label}`}
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
                <Typography variant="caption" color="text.secondary">
                  {uiText('latency ', '延迟 ')}{label}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2, mt: 0.25 }}>
                  {text}
                </Typography>
              </Card>
            ))}
          </Box>

          {/* Throughput */}
          <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Throughput (derived, all requests)', '吞吐量（根据全部请求推算）')}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{rps.toFixed(1)}{uiText(' req/s', '请求/秒')}</Typography>
            </Box>
            <MetricsLineChart
              // One rate per interval between scrapes, stamped at the interval's end.
              timestamps={timestamps.slice(1)}
              height={180}
              series={[{ data: ratePerSecond(history, 'requests_received_count'), label: uiText('req/s', '请求/秒') }]}
              valueFormatter={(v) => `${v.toFixed(1)}/s`}
            />
          </Paper>

          {/* Request latency (only when the server exposes the duration histogram) */}
          {latencyEnabled && latest && (
            <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Request latency — cumulative since server start', '请求延迟（服务启动以来累计）')}</Typography>
              <Box sx={{ mt: 1 }}>
                <MetricsLineChart
                  timestamps={timestamps}
                  height={140}
                  valueFormatter={(v) => `${v.toFixed(1)} ms`}
                  series={[{
                    data: history.map((snapshot) => {
                      const seconds = histogramQuantile(snapshot.samples, LATENCY_METRIC, 0.95);
                      return seconds == null ? 0 : seconds * 1000;
                    }),
                    label: uiText('p95 ms (cumulative)', 'p95 毫秒（累计）'),
                  }]}
                />
              </Box>
            </Paper>
          )}

          {/* HTTP Chaos Faults (only when a chaos metric is present and has non-zero data) */}
          {chaosEnabled && chaosHasData && (
            <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary">{uiText('HTTP Chaos Faults', 'HTTP 混沌故障')}</Typography>
              {chaosFaultTotals.length > 0 && (
                <Box sx={{ display: 'flex', gap: 3, mt: 0.5, flexWrap: 'wrap' }}>
                  {chaosFaultTotals.map(({ faultType, value }) => (
                    <Box key={faultType}>
                      <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                        {value.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{uiText(faultType, CHAOS_FAULT_LABELS.get(faultType) ?? faultType)}{uiText(' faults', '故障')}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
              {chaosFaultTypes.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">{uiText('Faults injected by type (cumulative)', '按类型统计注入的故障（累计）')}</Typography>
                  <MetricsLineChart
                    timestamps={timestamps}
                    height={180}
                    valueFormatter={(v) => Math.round(v).toLocaleString()}
                    series={chaosFaultTypes.map((ft) => ({
                      data: gaugeSeriesByLabel(history, CHAOS_METRIC, 'fault_type', ft),
                      label: chaosFaultLabel(ft),
                    }))}
                  />
                </Box>
              )}
              {activeServiceChaosEnabled && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">{uiText('Active service-scoped chaos by type', '按类型统计生效的服务级混沌规则')}</Typography>
                  <MetricsLineChart
                    timestamps={timestamps}
                    height={180}
                    valueFormatter={(v) => Math.round(v).toLocaleString()}
                    series={activeChaosFaultTypes.map((ft) => ({
                      data: gaugeSeriesByLabel(history, ACTIVE_CHAOS_METRIC, 'fault_type', ft),
                      label: chaosFaultLabel(ft),
                    }))}
                  />
                </Box>
              )}
              {(autoHaltEnabled || llmCostBudgetEnabled) && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{uiText('Circuit Breakers', '熔断保护')}</Typography>
                  {autoHaltEnabled && (
                    <Box sx={{ mt: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary">{uiText('Chaos auto-halt', '混沌测试自动停止')}</Typography>
                        <Chip
                          size="small"
                          label={autoHaltTotal > 0 ? uiText(`${autoHaltTotal} halt${autoHaltTotal === 1 ? '' : 's'}`, `已自动停止 ${autoHaltTotal} 次`) : uiText('no halts', '未自动停止')}
                          color={autoHaltTotal > 0 ? 'error' : 'success'}
                          variant="outlined"
                        />
                      </Box>
                      <MetricsLineChart
                        timestamps={timestamps}
                        height={100}
                        valueFormatter={(v) => Math.round(v).toLocaleString()}
                        series={[{
                          data: gaugeSeries(history, AUTO_HALT_METRIC),
                          label: uiText('auto-halt count', '自动停止次数'),
                        }]}
                      />
                    </Box>
                  )}
                  {llmCostBudgetEnabled && (
                    <Box sx={{ mt: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary">{uiText('LLM cost-budget', 'LLM 费用预算')}</Typography>
                        <Chip
                          size="small"
                          label={llmCostBudgetTrippedTotal > 0 ? uiText(`${llmCostBudgetTrippedTotal} trip${llmCostBudgetTrippedTotal === 1 ? '' : 's'}`, `已触发 ${llmCostBudgetTrippedTotal} 次`) : uiText('within budget', '预算内')}
                          color={llmCostBudgetTrippedTotal > 0 ? 'error' : 'success'}
                          variant="outlined"
                        />
                        {llmCostUsdTotal > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            ${llmCostUsdTotal.toFixed(4)}{uiText(' spent', '已花费')}
                          </Typography>
                        )}
                      </Box>
                      <MetricsLineChart
                        timestamps={timestamps}
                        height={100}
                        valueFormatter={(v) => Math.round(v).toLocaleString()}
                        series={[{
                          data: gaugeSeries(history, LLM_COST_BUDGET_TRIPPED_METRIC),
                          label: uiText('budget trips', '超预算次数'),
                        }]}
                      />
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          )}

          {/* HTTP request activity over time — the four request counters as separate lines */}
          <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary">{uiText('HTTP request activity (cumulative)', 'HTTP 请求活动（累计）')}</Typography>
            <MetricsLineChart
              timestamps={timestamps}
              height={200}
              valueFormatter={(v) => Math.round(v).toLocaleString()}
              series={SUMMARY.map(({ name, label }) => ({ data: gaugeSeries(history, name), label }))}
            />
          </Paper>

          {/* Async message activity — broker messages published/consumed, kept separate from HTTP
              request counts (different semantics/units). Only shown when async metrics have data. */}
          {asyncEnabled && asyncHasData && (
            <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Async message activity (cumulative)', '异步消息活动（累计）')}</Typography>
              <Box sx={{ display: 'flex', gap: 3, mt: 0.5, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {asyncPublishedTotal.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{uiText('published', '已发布')}</Typography>
                </Box>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {asyncConsumedTotal.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{uiText('consumed', '已消费')}</Typography>
                </Box>
              </Box>
              <Box sx={{ mt: 1 }}>
                <MetricsLineChart
                  timestamps={timestamps}
                  height={200}
                  valueFormatter={(v) => Math.round(v).toLocaleString()}
                  series={[
                    { data: gaugeSeriesSum(history, ASYNC_PUBLISHED_METRIC), label: uiText('Published', '已发布') },
                    { data: gaugeSeriesSum(history, ASYNC_CONSUMED_METRIC), label: uiText('Consumed', '已消费') },
                  ]}
                />
              </Box>
            </Paper>
          )}

          {/* Actions executed over time — one line per action type */}
          <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary">{uiText('Actions executed', '已执行的动作')}</Typography>
            {maxAction === 0 ? (
              <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">
                {uiText('No actions executed yet.', '尚未执行任何动作。')}
              </Typography>
            ) : (
              <MetricsLineChart
                timestamps={timestamps}
                height={200}
                valueFormatter={(v) => Math.round(v).toLocaleString()}
                series={actionRows
                  .filter((r) => r.value > 0)
                  .map((r) => ({
                    data: gaugeSeries(history, r.name),
                    label: r.label.charAt(0).toUpperCase() + r.label.slice(1),
                  }))}
              />
            )}
          </Paper>

          {/* Expectations by type — one line per action_type label (gauge) */}
          <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary">{uiText('Expectations by type', '按类型统计 Mock 规则')}</Typography>
            {!expectationsByTypeEnabled ? (
              <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">
                {uiText('No expectations configured.', '尚未配置 Mock 规则。')}
              </Typography>
            ) : (
              <MetricsLineChart
                timestamps={timestamps}
                height={200}
                valueFormatter={(v) => Math.round(v).toLocaleString()}
                series={expectationsByType.map((r) => ({
                  data: gaugeSeriesByLabel(history, EXPECTATIONS_BY_TYPE_METRIC, 'action_type', r.actionType),
                  label: prettyEnumLabel(r.actionType),
                }))}
              />
            )}
          </Paper>

          {/* MCP tool calls — one line per tool label (counter, shown cumulative) */}
          <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary">{uiText('MCP tool calls', 'MCP 工具调用')}</Typography>
            {!mcpToolCallsEnabled ? (
              <Typography variant="body2" sx={{ mt: 0.5 }} color="text.secondary">
                {uiText('No MCP tool calls recorded.', '暂无 MCP 工具调用记录。')}
              </Typography>
            ) : (
              <MetricsLineChart
                timestamps={timestamps}
                height={200}
                valueFormatter={(v) => Math.round(v).toLocaleString()}
                series={mcpToolRows.map((r) => ({
                  data: gaugeSeriesByLabel(history, MCP_TOOL_CALLS_METRIC, 'tool', r.tool),
                  label: r.tool,
                }))}
              />
            )}
          </Paper>

          {/* Capacity ("running out of room") — the event-log and expectation-store sites charted
              against their budgets, plus the accept-queue backlog, shown just above the JVM heap
              section they sit alongside. Each card appears only when the server exposes its metric. */}
          {eventLogEnabled && (
            <>
              <CapacityChart
                title={uiText('Event log — retained memory', '事件日志保留内存')}
                budgetLabel={uiText('budget', '预算')}
                history={history}
                timestamps={timestamps}
                valueMetric={EVENT_LOG_RETAINED_BYTES_METRIC}
                budgetMetric={EVENT_LOG_MAX_RETAINED_BYTES_METRIC}
                budgetValue={eventLogMaxRetainedBytes}
                valueFormatter={formatBytes}
              />
              <CapacityChart
                title={uiText('Event log — retained entries', '事件日志保留条目')}
                budgetLabel={uiText('limit', '上限')}
                history={history}
                timestamps={timestamps}
                valueMetric={EVENT_LOG_RETAINED_ENTRIES_METRIC}
                budgetMetric={EVENT_LOG_MAX_RETAINED_ENTRIES_METRIC}
                budgetValue={eventLogMaxRetainedEntries}
                valueFormatter={countFormatter}
              />
              <CapacityChart
                title={uiText('Event log — in-flight memory', '事件日志处理中内存')}
                budgetLabel={uiText('budget', '预算')}
                history={history}
                timestamps={timestamps}
                valueMetric={EVENT_LOG_IN_FLIGHT_BYTES_METRIC}
                budgetMetric={EVENT_LOG_MAX_IN_FLIGHT_BYTES_METRIC}
                budgetValue={eventLogMaxInFlightBytes}
                valueFormatter={formatBytes}
              />
              <CapacityChart
                title={uiText('Event log — ring buffer', '事件日志环形缓冲区')}
                budgetLabel={uiText('capacity', '容量')}
                history={history}
                timestamps={timestamps}
                valueMetric={EVENT_LOG_RING_OCCUPANCY_METRIC}
                budgetMetric={EVENT_LOG_RING_CAPACITY_METRIC}
                budgetValue={eventLogRingCapacity}
                valueFormatter={countFormatter}
              />
            </>
          )}
          {expectationBytesEnabled && (
            <CapacityChart
              title={uiText('Expectation store memory', 'Mock 规则存储内存')}
              budgetLabel={uiText('budget', '预算')}
              history={history}
              timestamps={timestamps}
              valueMetric={EXPECTATIONS_BYTES_METRIC}
              budgetMetric={MAX_EXPECTATIONS_BYTES_METRIC}
              budgetValue={maxExpectationsBytes}
              valueFormatter={formatBytes}
            />
          )}

          {acceptQueueEnabled && (
            <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Accept queue backlog', '等待接入的连接队列')}</Typography>
              <Box sx={{ display: 'flex', gap: 3, mt: 0.5, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {acceptQueueConfigured.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{uiText('configured (soBacklog)', '配置值（soBacklog）')}</Typography>
                </Box>
                {acceptQueueEffectiveEnabled && (
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {acceptQueueEffective.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{uiText('effective (kernel-capped)', '生效值（受内核上限约束）')}</Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          )}

          {/* JVM runtime (Memory, Threads & GC) — at the bottom; only when the server exposes JVM metrics */}
          {jvmEnabled && latest && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 1 }}>
              <Paper variant="outlined" sx={{ p: 1.25 }}>
                <Typography variant="caption" color="text.secondary">{uiText('JVM heap memory', 'JVM 堆内存')}</Typography>
                <MetricsLineChart
                  timestamps={timestamps}
                  height={200}
                  valueFormatter={formatBytes}
                  series={[
                    { data: gaugeSeriesByLabel(history, 'jvm_memory_used_bytes', 'area', 'heap'), label: uiText('used', '已使用') },
                    { data: gaugeSeriesByLabel(history, 'jvm_memory_committed_bytes', 'area', 'heap'), label: uiText('committed', '已提交') },
                  ]}
                />
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.25 }}>
                <Typography variant="caption" color="text.secondary">{uiText('Threads & GC', '线程和垃圾回收')}</Typography>
                <Box sx={{ display: 'flex', gap: 3, mt: 0.5, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {metricValue(latest.samples, 'jvm_threads_current').toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {uiText('threads (', '线程（')}{metricValue(latest.samples, 'jvm_threads_daemon')}{uiText(' daemon)', '个守护线程）')}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {metricValue(latest.samples, 'jvm_gc_collection_count').toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {uiText('GC collections (', '垃圾回收次数（')}{metricValue(latest.samples, 'jvm_gc_collection_seconds_sum').toFixed(1)}{uiText('s)', '秒）')}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 1 }}>
                  <MetricsLineChart
                    timestamps={timestamps}
                    height={110}
                    series={[{ data: gaugeSeries(history, 'jvm_threads_current'), label: uiText('threads', '线程数') }]}
                  />
                </Box>
              </Paper>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

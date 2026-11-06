import { uiText } from '../lib/dashboardLocale';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Slider from '@mui/material/Slider';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestoreIcon from '@mui/icons-material/Restore';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { usePolling } from '../hooks/usePolling';
import {
  fetchServiceChaos,
  registerServiceChaos,
  removeServiceChaos,
  clearServiceChaos,
  delayMillis,
  summarizeChaosProfile,
  formatTtl,
  buildQuickChaosProfile,
  deriveQuickChaos,
  QUICK_CHAOS_DEFAULT_PERCENT,
  QUICK_CHAOS_LATENCY_MS,
  type HttpChaosProfileDTO,
  type ServiceChaosResponse,
  type QuickChaosMode,
} from '../lib/serviceChaos';
import {
  fetchGrpcHealth,
  setGrpcHealth,
  resetGrpcHealth,
  type ServingStatus,
} from '../lib/grpcHealth';
import {
  fetchTcpChaos,
  registerTcpChaos,
  removeTcpChaos,
  clearTcpChaos,
  summarizeTcpChaosProfile,
  type TcpChaosProfileDTO,
  type TcpChaosResponse,
} from '../lib/tcpChaos';
import {
  NETWORK_PRESETS,
  emptyNetworkPresetFields,
  findNetworkPreset,
  matchNetworkPresetId,
  networkPresetFields,
  summarizeNetworkPreset,
} from '../lib/networkPresets';
import {
  fetchGrpcChaos,
  registerGrpcChaos,
  removeGrpcChaos,
  clearGrpcChaos,
  summarizeGrpcChaosProfile,
  type GrpcChaosResponse,
} from '../lib/grpcChaos';
import {
  buildGrpcChaosProfile,
  EMPTY_GRPC_CHAOS_FORM,
  type GrpcChaosFormState,
} from '../lib/grpcChaosForm';
import {
  startChaosExperiment,
  getChaosExperimentStatus,
  stopChaosExperiment,
  listChaosProfiles,
  saveChaosProfile,
  applyChaosProfile,
  deleteChaosProfile,
  getExperimentHistory,
  formatDuration,
  type ExperimentDefinitionDTO,
  type ExperimentStageDTO,
  type ExperimentStatusDTO,
  type ExperimentHistoryEntryDTO,
  type SloVerdictDTO,
  type SloObjectiveResultDTO,
  type SloResult,
} from '../lib/chaosExperiment';
import {
  getPreemption,
  startPreemption,
  clearPreemption,
  type PreemptionMode,
  type PreemptionStatusDTO,
} from '../lib/preemption';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import LinearProgress from '@mui/material/LinearProgress';
import { getConfiguration, updateConfiguration, type Configuration } from '../lib/configuration';
import { useDashboardStore } from '../store';
import ConfirmDialog from './ConfirmDialog';
import HumanErrorAlert from './HumanErrorAlert';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import { trackFeature } from '../lib/analytics';

// Responsive width helper for fixed-px form fields: full-width on a phone (xs),
// the original fixed pixel width from `sm` up so the desktop layout is unchanged.
const responsiveWidth = (px: number) => ({ width: { xs: '100%', sm: px } });

// Responsive grid layout for chaos field rows — fields fill available width
// and wrap uniformly via CSS Grid auto-fit instead of fixed pixel widths.
const CHAOS_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1, alignItems: 'start' } as const;
const CHAOS_GRID_WIDE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 1, alignItems: 'start' } as const;

// Canned Quick Chaos fault modes, in display order. Each maps to real server fault
// fields via buildQuickChaosProfile: 500s + errorProbability, connection drop, +3s latency.
const QUICK_CHAOS_MODE_OPTIONS: { mode: QuickChaosMode; label: string }[] = [
  { mode: 'errors', label: uiText('500 Errors', '返回 500 错误') },
  { mode: 'reset', label: uiText('Connection Reset', '重置连接') },
  { mode: 'latency', label: uiText('Latency +3s', '延迟增加 3 秒') },
];

// --- SLO verdict display helpers (A1/A2: terminal experiment verdict) ---

type ChipColor = 'success' | 'error' | 'warning' | 'default';

/** Map an SLO result to a MUI Chip colour: PASS green, FAIL red, INCONCLUSIVE amber. */
function sloResultColor(result: SloResult): ChipColor {
  switch (result) {
    case 'PASS':
      return 'success';
    case 'FAIL':
      return 'error';
    default:
      return 'warning';
  }
}

const SLI_LABELS: Record<SloObjectiveResultDTO['sli'], string> = {
  LATENCY_P50: 'p50 latency',
  LATENCY_P95: 'p95 latency',
  LATENCY_P99: 'p99 latency',
  ERROR_RATE: 'error rate',
};

const COMPARATOR_SYMBOLS: Record<SloObjectiveResultDTO['comparator'], string> = {
  LESS_THAN: '<',
  LESS_THAN_OR_EQUAL: '≤',
  GREATER_THAN: '>',
  GREATER_THAN_OR_EQUAL: '≥',
};

/** Format an objective's observed-vs-threshold as e.g. "p95 latency 312 ≤ 200". */
function formatObjective(objective: SloObjectiveResultDTO): string {
  const sli = SLI_LABELS[objective.sli] ?? objective.sli;
  const comparator = COMPARATOR_SYMBOLS[objective.comparator] ?? objective.comparator;
  const observed = objective.observedValue == null ? '—' : String(Math.round(objective.observedValue * 100) / 100);
  return `${sli} ${observed} ${comparator} ${objective.threshold}`;
}

/**
 * Renders the terminal SLO verdict for an experiment: a PASS/FAIL/INCONCLUSIVE
 * chip plus the per-objective observed-vs-threshold breakdown. Only rendered by
 * the caller when a verdict is present.
 */
function ExperimentVerdict({ verdict }: { verdict: SloVerdictDTO }) {
  const objectives = verdict.objectiveResults ?? [];
  return (
    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {uiText('SLO Verdict', 'SLO 判定')}
        </Typography>
        <Chip size="small" color={sloResultColor(verdict.result)} label={verdict.result} />
        {verdict.name && (
          <Typography variant="caption" color="text.secondary">
            {verdict.name}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {verdict.sampleCount} sample{verdict.sampleCount === 1 ? '' : 's'}
        </Typography>
      </Box>
      {objectives.length > 0 && (
        <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {objectives.map((objective, idx) => (
            <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Chip size="small" variant="outlined" color={sloResultColor(objective.result)} label={objective.result} />
              <Typography variant="body2">{formatObjective(objective)}</Typography>
              {objective.detail && (
                <Typography variant="caption" color="text.secondary">
                  {objective.detail}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

interface ServiceChaosPanelProps {
  connectionParams: ConnectionParams;
}

const POLL_INTERVAL_MS = 4000;

interface FormState {
  host: string;
  errorStatus: string;
  errorProbability: string;
  dropProbability: string;
  latencyMs: string;
  ttlMs: string;
  seed: string;
  succeedFirst: string;
  failRequestCount: string;
  retryAfter: string;
  truncateBodyAtFraction: string;
  malformedBody: boolean;
  slowResponseChunkSize: string;
  slowResponseChunkDelayMs: string;
  quotaName: string;
  quotaLimit: string;
  quotaWindowMillis: string;
  quotaErrorStatus: string;
  degradationRampMillis: string;
  outageAfterMillis: string;
  outageDurationMillis: string;
  graphqlErrors: boolean;
  graphqlErrorMessage: string;
  graphqlErrorCode: string;
  graphqlNullifyData: boolean;
}

const EMPTY_FORM: FormState = {
  host: '',
  errorStatus: '',
  errorProbability: '',
  dropProbability: '',
  latencyMs: '',
  ttlMs: '',
  seed: '',
  succeedFirst: '',
  failRequestCount: '',
  retryAfter: '',
  truncateBodyAtFraction: '',
  malformedBody: false,
  slowResponseChunkSize: '',
  slowResponseChunkDelayMs: '',
  quotaName: '',
  quotaLimit: '',
  quotaWindowMillis: '',
  quotaErrorStatus: '',
  degradationRampMillis: '',
  outageAfterMillis: '',
  outageDurationMillis: '',
  graphqlErrors: false,
  graphqlErrorMessage: '',
  graphqlErrorCode: '',
  graphqlNullifyData: true,
};

/**
 * Reject a chaos host target that cannot ever be matched, or null when it is usable.
 *
 * Chaos is *not* a filter: the server keys its registries by host in a plain map and
 * looks the incoming request's Host header up by exact (lower-cased, port-stripped)
 * key — see `ServiceChaosRegistry.get` / `normalizeHost`, and the identical shape in
 * `TcpChaosRegistry`. There is no pattern matching at either level.
 *
 * That is why this panel deliberately does NOT use the shared filter-DSL search
 * field: the DSL's `host:` operator is a glob whose own advertised example is
 * `host:*.example.com`, and a wildcard registered here would be stored as the literal
 * key `*.example.com` and silently never fire. Users fluent in the DSL from the
 * Traffic search box will try exactly that, so the wildcard is caught here with the
 * reason instead of being accepted into a dead registration.
 *
 * Applied to every surface that writes a host into one of those registries: the HTTP
 * register form (`validateForm`), the Quick Chaos strip (`handleQuickToggle`), the TCP
 * register form (`validateTcpForm`), and each stage of the chaos-experiment editor
 * (`buildDefinitionFromEditor`, which feeds both Start Experiment and Save Profile).
 */
function hostTargetError(rawHost: string): string | null {
  const host = rawHost.trim();
  if (host.includes('*')) {
    return uiText('Chaos targets one exact host (matched case-insensitively, port ignored) - wildcards such as *.example.com are not supported here.', '故障配置只匹配一个明确的主机名，忽略大小写和端口。此处不支持 *.example.com 等通配符。');
  }
  if (/^host:/i.test(host)) {
    return uiText('Enter the host on its own - the host: search operator is not used here.', '请仅填写主机名，此处无需使用 host: 搜索操作符。');
  }
  if (host.includes('://')) {
    return uiText('Enter the host on its own - a URL scheme such as https:// is not part of the host key.', '请仅填写主机名，无需 https:// 等 URL 协议。');
  }
  // normalizeHost splits host from port; it never strips a path, so a key
  // carrying one can never be produced from a real Host header.
  if (host.includes('/')) {
    return uiText('Enter the host on its own - a path is not part of the host key.', '请仅填写主机名，无需路径。');
  }
  return null;
}

/** Parse a trimmed numeric field, or undefined when blank. NaN is treated as undefined. */
function num(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

function buildChaosProfile(form: FormState): HttpChaosProfileDTO {
  const profile: HttpChaosProfileDTO = {};
  const errorStatus = num(form.errorStatus);
  if (errorStatus != null) {
    profile.errorStatus = errorStatus;
    // errorProbability only has effect alongside an errorStatus, so it is sent
    // only when a status is present (a stray probability would be a silent no-op).
    const errorProbability = num(form.errorProbability);
    if (errorProbability != null) profile.errorProbability = errorProbability;
    // retryAfter is meaningful only with an error status (e.g. 429, 503)
    if (form.retryAfter.trim()) profile.retryAfter = form.retryAfter.trim();
  }
  const dropProbability = num(form.dropProbability);
  if (dropProbability != null) profile.dropConnectionProbability = dropProbability;
  const latencyMs = num(form.latencyMs);
  if (latencyMs != null) profile.latency = { timeUnit: 'MILLISECONDS', value: latencyMs };
  const seed = num(form.seed);
  if (seed != null) profile.seed = seed;
  const succeedFirst = num(form.succeedFirst);
  if (succeedFirst != null) profile.succeedFirst = succeedFirst;
  const failRequestCount = num(form.failRequestCount);
  if (failRequestCount != null) profile.failRequestCount = failRequestCount;
  // Body corruption
  const truncateBodyAtFraction = num(form.truncateBodyAtFraction);
  if (truncateBodyAtFraction != null) profile.truncateBodyAtFraction = truncateBodyAtFraction;
  if (form.malformedBody) profile.malformedBody = true;
  // Slow (dribbled) response
  const slowResponseChunkSize = num(form.slowResponseChunkSize);
  if (slowResponseChunkSize != null) {
    profile.slowResponseChunkSize = slowResponseChunkSize;
    const slowResponseChunkDelayMs = num(form.slowResponseChunkDelayMs);
    if (slowResponseChunkDelayMs != null) {
      profile.slowResponseChunkDelay = { timeUnit: 'MILLISECONDS', value: slowResponseChunkDelayMs };
    }
  }
  // Quota (rate limiting)
  const quotaName = form.quotaName.trim();
  if (quotaName) profile.quotaName = quotaName;
  const quotaLimit = num(form.quotaLimit);
  if (quotaLimit != null) profile.quotaLimit = quotaLimit;
  const quotaWindowMillis = num(form.quotaWindowMillis);
  if (quotaWindowMillis != null) profile.quotaWindowMillis = quotaWindowMillis;
  const quotaErrorStatus = num(form.quotaErrorStatus);
  if (quotaErrorStatus != null) profile.quotaErrorStatus = quotaErrorStatus;
  // Degradation ramp
  const degradationRampMillis = num(form.degradationRampMillis);
  if (degradationRampMillis != null) profile.degradationRampMillis = degradationRampMillis;
  // Outage window
  const outageAfterMillis = num(form.outageAfterMillis);
  if (outageAfterMillis != null) profile.outageAfterMillis = outageAfterMillis;
  const outageDurationMillis = num(form.outageDurationMillis);
  if (outageDurationMillis != null) profile.outageDurationMillis = outageDurationMillis;
  // GraphQL error envelope
  if (form.graphqlErrors) {
    profile.graphqlErrors = true;
    if (form.graphqlErrorMessage.trim()) profile.graphqlErrorMessage = form.graphqlErrorMessage.trim();
    if (form.graphqlErrorCode.trim()) profile.graphqlErrorCode = form.graphqlErrorCode.trim();
    if (form.graphqlNullifyData) profile.graphqlNullifyData = true;
  }
  return profile;
}

/** Returns a validation message for the form, or null when it is valid to submit. */
function validateForm(form: FormState): string | null {
  if (form.host.trim() === '') return uiText('Host is required', '请输入主机名');
  const hostError = hostTargetError(form.host);
  if (hostError) return hostError;
  const errorStatus = num(form.errorStatus);
  if (form.errorStatus.trim() !== '' && (errorStatus == null || !Number.isInteger(errorStatus) || errorStatus < 100 || errorStatus > 599)) {
    return uiText('Error status must be a whole number between 100 and 599', '错误状态码必须为 100 至 599 之间的整数');
  }
  if (num(form.errorProbability) != null && errorStatus == null) {
    return uiText('Error probability needs an error status (e.g. 503)', '设置错误概率时，请同时填写错误状态码（如 503）');
  }
  if (form.retryAfter.trim() && errorStatus == null) {
    return uiText('Retry-After needs an error status (e.g. 429 or 503)', '设置 Retry-After 时，请同时填写错误状态码（如 429 或 503）');
  }
  for (const [field, label] of [['errorProbability', 'Error probability'], ['dropProbability', 'Drop probability']] as const) {
    const value = num(form[field]);
    if (value != null && (value < 0 || value > 1)) return `${label} must be between 0 and 1`;
  }
  const latencyMs = num(form.latencyMs);
  if (latencyMs != null && latencyMs < 0) return uiText('Latency must be 0 or greater', '延迟必须大于或等于 0');
  const ttl = num(form.ttlMs);
  if (ttl != null && (!Number.isInteger(ttl) || ttl < 1)) return uiText('TTL must be a whole number of milliseconds >= 1', '有效期必须为大于或等于 1 的整数毫秒');
  const succeedFirst = num(form.succeedFirst);
  if (succeedFirst != null && (!Number.isInteger(succeedFirst) || succeedFirst < 0)) return uiText('Succeed first must be a whole number >= 0', '先成功的请求数必须为非负整数');
  const failRequestCount = num(form.failRequestCount);
  if (failRequestCount != null && (!Number.isInteger(failRequestCount) || failRequestCount < 1)) return uiText('Fail request count must be a whole number >= 1', '失败请求数必须为大于或等于 1 的整数');
  // Body corruption
  const truncateBodyAtFraction = num(form.truncateBodyAtFraction);
  if (truncateBodyAtFraction != null && (truncateBodyAtFraction < 0 || truncateBodyAtFraction > 1)) {
    return uiText('Truncate body fraction must be between 0 and 1', '响应体截断比例必须介于 0 和 1 之间');
  }
  // Slow response
  const slowResponseChunkSize = num(form.slowResponseChunkSize);
  if (slowResponseChunkSize != null && (!Number.isInteger(slowResponseChunkSize) || slowResponseChunkSize < 1)) {
    return uiText('Slow response chunk size must be a whole number >= 1', '分块大小必须为大于或等于 1 的整数');
  }
  const slowResponseChunkDelayMs = num(form.slowResponseChunkDelayMs);
  if (slowResponseChunkDelayMs != null && slowResponseChunkDelayMs < 0) {
    return uiText('Slow response chunk delay must be 0 or greater', '块间延迟必须大于或等于 0');
  }
  // Quota
  const quotaLimit = num(form.quotaLimit);
  if (quotaLimit != null && (!Number.isInteger(quotaLimit) || quotaLimit < 1)) {
    return uiText('Quota limit must be a whole number >= 1', '配额上限必须为大于或等于 1 的整数');
  }
  const quotaWindowMillis = num(form.quotaWindowMillis);
  if (quotaWindowMillis != null && (!Number.isInteger(quotaWindowMillis) || quotaWindowMillis < 1)) {
    return uiText('Quota window must be a whole number of milliseconds >= 1', '配额统计窗口必须为大于或等于 1 的整数毫秒');
  }
  const quotaErrorStatus = num(form.quotaErrorStatus);
  if (quotaErrorStatus != null && (!Number.isInteger(quotaErrorStatus) || quotaErrorStatus < 100 || quotaErrorStatus > 599)) {
    return uiText('Quota error status must be a whole number between 100 and 599', '超出配额时的状态码必须为 100 至 599 之间的整数');
  }
  // Degradation ramp
  const degradationRampMillis = num(form.degradationRampMillis);
  if (degradationRampMillis != null && (!Number.isInteger(degradationRampMillis) || degradationRampMillis < 1)) {
    return uiText('Degradation ramp must be a whole number of milliseconds >= 1', '逐步降级时长必须为大于或等于 1 的整数毫秒');
  }
  // Outage window
  const outageAfterMillis = num(form.outageAfterMillis);
  if (outageAfterMillis != null && (!Number.isInteger(outageAfterMillis) || outageAfterMillis < 0)) {
    return uiText('Outage after must be a whole number of milliseconds >= 0', '开始中断前的等待时间必须为非负整数毫秒');
  }
  const outageDurationMillis = num(form.outageDurationMillis);
  if (outageDurationMillis != null && (!Number.isInteger(outageDurationMillis) || outageDurationMillis < 1)) {
    return uiText('Outage duration must be a whole number of milliseconds >= 1', '中断时长必须为大于或等于 1 的整数毫秒');
  }
  // GraphQL-semantic validation: if sub-fields are set, graphqlErrors must be on
  if ((form.graphqlErrorMessage.trim() || form.graphqlErrorCode.trim() || form.graphqlNullifyData) && !form.graphqlErrors) {
    // Only flag if the user actively set message/code — nullifyData defaults to true
    if (form.graphqlErrorMessage.trim() || form.graphqlErrorCode.trim()) {
      return uiText('GraphQL error message/code requires GraphQL errors to be enabled', '填写 GraphQL 错误消息或错误码前，请先启用 GraphQL 错误');
    }
  }
  if (summarizeChaosProfile(buildChaosProfile(form)).length === 0) {
    return uiText('Set at least one fault (error status, drop, latency, body corruption, slow response, quota, or GraphQL error)', '至少配置一种故障，如错误状态码、断开连接、延迟、损坏响应体、慢响应、配额或 GraphQL 错误');
  }
  return null;
}

interface EditFormState {
  errorStatus: string;
  errorProbability: string;
  dropProbability: string;
  latencyMs: string;
  seed: string;
  succeedFirst: string;
  failRequestCount: string;
  retryAfter: string;
  truncateBodyAtFraction: string;
  malformedBody: boolean;
  slowResponseChunkSize: string;
  slowResponseChunkDelayMs: string;
  quotaName: string;
  quotaLimit: string;
  quotaWindowMillis: string;
  quotaErrorStatus: string;
  degradationRampMillis: string;
  outageAfterMillis: string;
  outageDurationMillis: string;
  graphqlErrors: boolean;
  graphqlErrorMessage: string;
  graphqlErrorCode: string;
  graphqlNullifyData: boolean;
}

// --- TCP chaos form state ---

interface TcpFormState {
  host: string;
  latencyMs: string;
  bandwidthBytesPerSec: string;
  down: boolean;
  resetPeer: boolean;
  slowClose: boolean;
  timeout: boolean;
  slicerChunkSize: string;
  limitDataBytes: string;
  ttlMs: string;
}

const EMPTY_TCP_FORM: TcpFormState = {
  host: '',
  latencyMs: '',
  bandwidthBytesPerSec: '',
  down: false,
  resetPeer: false,
  slowClose: false,
  timeout: false,
  slicerChunkSize: '',
  limitDataBytes: '',
  ttlMs: '',
};

function buildTcpChaosProfile(form: TcpFormState): TcpChaosProfileDTO {
  const profile: TcpChaosProfileDTO = {};
  const latMs = num(form.latencyMs);
  if (latMs != null) profile.latencyMs = latMs;
  const bw = num(form.bandwidthBytesPerSec);
  if (bw != null) profile.bandwidthBytesPerSec = bw;
  if (form.down) profile.down = true;
  if (form.resetPeer) profile.resetPeer = true;
  if (form.slowClose) profile.slowClose = true;
  if (form.timeout) profile.timeout = true;
  const slicer = num(form.slicerChunkSize);
  if (slicer != null) profile.slicerChunkSize = slicer;
  const limit = num(form.limitDataBytes);
  if (limit != null) profile.limitDataBytes = limit;
  return profile;
}

function validateTcpForm(form: TcpFormState): string | null {
  if (form.host.trim() === '') return uiText('Host is required', '请输入主机名');
  const hostError = hostTargetError(form.host);
  if (hostError) return hostError;
  const profile = buildTcpChaosProfile(form);
  if (summarizeTcpChaosProfile(profile).length === 0) {
    return uiText('Set at least one fault (latency, bandwidth, down, reset, etc.)', '至少配置一种故障，如延迟、带宽限制、停用或重置连接');
  }
  const ttl = num(form.ttlMs);
  if (ttl != null && (!Number.isInteger(ttl) || ttl < 1)) return uiText('TTL must be a whole number of milliseconds >= 1', '有效期必须为大于或等于 1 的整数毫秒');
  return null;
}

const SERVING_STATUSES: ServingStatus[] = ['SERVING', 'NOT_SERVING', 'UNKNOWN', 'SERVICE_UNKNOWN'];

// --- gRPC fault injection form state ---

const GRPC_STATUS_CODES = [
  'OK', 'CANCELLED', 'UNKNOWN', 'INVALID_ARGUMENT', 'DEADLINE_EXCEEDED',
  'NOT_FOUND', 'ALREADY_EXISTS', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION', 'ABORTED', 'OUT_OF_RANGE', 'UNIMPLEMENTED',
  'INTERNAL', 'UNAVAILABLE', 'DATA_LOSS', 'UNAUTHENTICATED',
] as const;

// GrpcChaosFormState, EMPTY_GRPC_CHAOS_FORM, and buildGrpcChaosProfile live in
// ../lib/grpcChaosForm.ts so this component file only exports React components
// (satisfies react-refresh/only-export-components).

function validateGrpcChaosForm(form: GrpcChaosFormState): string | null {
  if (form.service.trim() === '') return uiText('Service is required', '请输入服务名称');
  const profile = buildGrpcChaosProfile(form);
  if (summarizeGrpcChaosProfile(profile).length === 0) {
    return uiText('Set at least one fault (error code, latency, quota, or streaming fault)', '至少配置一种故障，如错误码、延迟、配额或流故障');
  }
  const ep = num(form.errorProbability);
  if (ep != null && (ep < 0 || ep > 1)) return uiText('Error probability must be between 0 and 1', '错误概率必须介于 0 和 1 之间');
  const latencyMs = num(form.latencyMs);
  if (latencyMs != null && latencyMs < 0) return uiText('Latency must be 0 or greater', '延迟必须大于或等于 0');
  const ttl = num(form.ttlMs);
  if (ttl != null && (!Number.isInteger(ttl) || ttl < 1)) return uiText('TTL must be a whole number of milliseconds >= 1', '有效期必须为大于或等于 1 的整数毫秒');
  const succeedFirst = num(form.succeedFirst);
  if (succeedFirst != null && (!Number.isInteger(succeedFirst) || succeedFirst < 0)) return uiText('Succeed first must be a whole number >= 0', '先成功的请求数必须为非负整数');
  const failRequestCount = num(form.failRequestCount);
  if (failRequestCount != null && (!Number.isInteger(failRequestCount) || failRequestCount < 1)) return uiText('Fail request count must be a whole number >= 1', '失败请求数必须为大于或等于 1 的整数');
  const abortAfterMessages = num(form.abortAfterMessages);
  if (abortAfterMessages != null && (!Number.isInteger(abortAfterMessages) || abortAfterMessages < 1)) return uiText('Abort after messages must be a whole number >= 1', '中止前的消息数必须为大于或等于 1 的整数');
  return null;
}

function servingStatusColor(status: ServingStatus): 'success' | 'error' | 'default' | 'warning' {
  switch (status) {
    case 'SERVING': return 'success';
    case 'NOT_SERVING': return 'error';
    case 'UNKNOWN': return 'default';
    case 'SERVICE_UNKNOWN': return 'warning';
  }
}

// --- Preemption simulation form state ---

const PREEMPTION_MODES: PreemptionMode[] = ['both', 'reject503', 'goaway'];

interface PreemptionFormState {
  mode: PreemptionMode;
  drainMs: string;
  ttlMs: string;
}

const EMPTY_PREEMPTION_FORM: PreemptionFormState = { mode: 'both', drainMs: '', ttlMs: '' };

/** Map a terminal experiment-history status to a MUI Chip colour. */
function historyStatusColor(status: string): ChipColor {
  switch (status) {
    case 'completed':
      return 'success';
    case 'halted_by_auto_halt':
    case 'halted_by_slo_breach':
    case 'aborted_baseline_unhealthy':
      return 'error';
    default:
      return 'default';
  }
}

export default function ServiceChaosPanel({ connectionParams }: ServiceChaosPanelProps) {
  const [data, setData] = useState<ServiceChaosResponse>({ services: {} });
  const [polledAt, setPolledAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<HumanError | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Quick Chaos strip — local (pre-enable) form state. Once enabled, the live values
  // are DERIVED from the polled registry (see quickChaos below); this local state only
  // holds what to register when the user first turns it on.
  const [quickHostInput, setQuickHostInput] = useState('');
  const [quickPercent, setQuickPercent] = useState<number>(QUICK_CHAOS_DEFAULT_PERCENT);
  const [quickModes, setQuickModes] = useState<QuickChaosMode[]>(['errors']);

  // Edit inline form state
  const [editingHost, setEditingHost] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    errorStatus: '', errorProbability: '', dropProbability: '', latencyMs: '',
    seed: '', succeedFirst: '', failRequestCount: '',
    retryAfter: '', truncateBodyAtFraction: '', malformedBody: false,
    slowResponseChunkSize: '', slowResponseChunkDelayMs: '',
    quotaName: '', quotaLimit: '', quotaWindowMillis: '', quotaErrorStatus: '',
    degradationRampMillis: '', outageAfterMillis: '', outageDurationMillis: '',
    graphqlErrors: false, graphqlErrorMessage: '', graphqlErrorCode: '', graphqlNullifyData: true,
  });

  // HTTP service chaos section expand state. Collapsed by default so all three
  // chaos sections (HTTP, gRPC, TCP) start collapsed and the page opens compact.
  const [httpExpanded, setHttpExpanded] = useState(false);

  // gRPC combined panel expand state
  const [grpcPanelExpanded, setGrpcPanelExpanded] = useState(false);
  // gRPC health sub-section expand state
  const [grpcHealthExpanded, setGrpcHealthExpanded] = useState(false);
  // gRPC fault injection sub-section expand state
  const [grpcFaultExpanded, setGrpcFaultExpanded] = useState(false);

  // gRPC health state
  const [grpcHealth, setGrpcHealthState] = useState<Record<string, ServingStatus>>({});
  const [grpcNewService, setGrpcNewService] = useState('');
  const [grpcNewStatus, setGrpcNewStatus] = useState<ServingStatus>('NOT_SERVING');

  // TCP chaos state
  const [tcpExpanded, setTcpExpanded] = useState(false);
  const [tcpData, setTcpData] = useState<TcpChaosResponse>({ hosts: {} });
  // Poll timestamp for the TCP dataset specifically. The TTL countdown must be
  // decremented against the time *this* dataset was fetched, not the HTTP
  // `polledAt` (a different poll loop that keeps advancing while this section is
  // collapsed and its data is frozen).
  const [tcpPolledAt, setTcpPolledAt] = useState(0);
  const [tcpForm, setTcpForm] = useState<TcpFormState>(EMPTY_TCP_FORM);

  // gRPC fault injection chaos state
  const [grpcChaosData, setGrpcChaosData] = useState<GrpcChaosResponse>({ services: {} });
  const [grpcChaosPolledAt, setGrpcChaosPolledAt] = useState(0);
  const [grpcChaosForm, setGrpcChaosForm] = useState<GrpcChaosFormState>(EMPTY_GRPC_CHAOS_FORM);

  // Preemption-simulation state
  const [preemptionExpanded, setPreemptionExpanded] = useState(false);
  const [preemptionData, setPreemptionData] = useState<PreemptionStatusDTO>({
    state: 'inactive', inFlight: 0, drainRemainingMillis: 0,
  });
  const [preemptionForm, setPreemptionForm] = useState<PreemptionFormState>(EMPTY_PREEMPTION_FORM);

  // --- Auto-halt state (effects below, after `refresh` is declared) ---
  const [autoHaltEnabled, setAutoHaltEnabled] = useState<boolean | null>(null);
  const [autoHaltThreshold, setAutoHaltThreshold] = useState<string>('');
  const [autoHaltWindow, setAutoHaltWindow] = useState<string>('');

  // --- Chaos Experiments state ---
  const [experimentsExpanded, setExperimentsExpanded] = useState(false);
  const [experimentStatus, setExperimentStatus] = useState<ExperimentStatusDTO | null>(null);
  const [expName, setExpName] = useState('');
  const [expLoop, setExpLoop] = useState(false);
  const stageIdCounter = useRef(1);
  const [expStages, setExpStages] = useState<Array<{
    id: number;
    durationMs: string;
    host: string;
    errorStatus: string;
    errorProbability: string;
    latencyMs: string;
    dropProbability: string;
  }>>([{
    id: 0, durationMs: '10000', host: '', errorStatus: '', errorProbability: '',
    latencyMs: '', dropProbability: '',
  }]);

  // --- ADV3: saved chaos profile library state ---
  const [savedProfiles, setSavedProfiles] = useState<string[]>([]);
  const [profilesTick, setProfilesTick] = useState(0);
  const refreshProfiles = useCallback(() => setProfilesTick((t) => t + 1), []);

  // --- Experiment history state (fetched on expand, not continuously polled) ---
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyData, setHistoryData] = useState<ExperimentHistoryEntryDTO[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const refreshHistory = useCallback(() => setHistoryTick((t) => t + 1), []);

  // --- Registry / TCP / gRPC-fault / experiment polling ---
  // Migrated from hand-rolled setTimeout loops to the shared usePolling hook so a
  // hidden/background tab stops polling (and re-parsing/re-rendering) entirely and
  // resumes with an immediate poll when shown again. usePolling is used purely as
  // the scheduler (with its built-in visibility gating); each fetcher writes the
  // existing component state exactly as the old loops did — an async fetcher body,
  // not a synchronous setState-in-effect — so the rest of the component and its
  // TTL-countdown timestamps are unchanged. The hasAnyTtl-gated 1s tick (below)
  // is left as-is.
  const chaosPoll = usePolling<ServiceChaosResponse>({
    fetcher: async (signal) => {
      try {
        const response = await fetchServiceChaos(connectionParams, signal);
        setData(response);
        setPolledAt(Date.now());
        setLoadError(null);
        return response;
      } catch (e) {
        if (!signal.aborted) setLoadError(e instanceof Error ? e.message : String(e));
        throw e; // let usePolling schedule the next poll
      }
    },
    intervalMs: POLL_INTERVAL_MS,
  });

  // TCP and gRPC-fault chaos poll only while their section is expanded; the
  // one-shot fetches on mount / refresh (effects below) still populate the
  // collapsed header counts. Both the poll and the one-shot write the same state.
  const tcpPoll = usePolling<TcpChaosResponse>({
    fetcher: async (signal) => {
      const result = await fetchTcpChaos(connectionParams, signal);
      setTcpData(result);
      setTcpPolledAt(Date.now());
      return result;
    },
    intervalMs: POLL_INTERVAL_MS,
    enabled: tcpExpanded,
  });

  const grpcChaosPoll = usePolling<GrpcChaosResponse>({
    fetcher: async (signal) => {
      const result = await fetchGrpcChaos(connectionParams, signal);
      setGrpcChaosData(result);
      setGrpcChaosPolledAt(Date.now());
      return result;
    },
    intervalMs: POLL_INTERVAL_MS,
    enabled: grpcPanelExpanded && grpcFaultExpanded,
  });

  // Preemption state polls only while its section is expanded (like TCP/gRPC); a
  // one-shot fetch on mount / refresh (effect below) keeps the collapsed header
  // badge current. Both write the same state.
  const preemptionPoll = usePolling<PreemptionStatusDTO>({
    fetcher: async (signal) => {
      const result = await getPreemption(connectionParams, signal);
      setPreemptionData(result);
      return result;
    },
    intervalMs: POLL_INTERVAL_MS,
    enabled: preemptionExpanded,
  });

  // Experiment status always polls: faster (2s) while an experiment runs with the
  // section open, the normal 4s while open and idle, and slow (10s) while collapsed.
  const isExperimentRunning = experimentStatus?.status === 'running' || experimentStatus?.status === 'starting';
  const experimentIntervalMs = experimentsExpanded
    ? (isExperimentRunning ? 2000 : POLL_INTERVAL_MS)
    : 10000;
  const experimentPoll = usePolling<ExperimentStatusDTO>({
    fetcher: async (signal) => {
      const status = await getChaosExperimentStatus(connectionParams, signal);
      setExperimentStatus(status);
      return status;
    },
    intervalMs: experimentIntervalMs,
  });

  // usePolling's refresh is a stable callback; destructure so the combined
  // refresh below has stable deps (no per-render identity churn).
  const { refresh: refreshChaosPoll } = chaosPoll;
  const { refresh: refreshTcpPoll } = tcpPoll;
  const { refresh: refreshGrpcChaosPoll } = grpcChaosPoll;
  const { refresh: refreshExperimentPoll } = experimentPoll;
  const { refresh: refreshPreemptionPoll } = preemptionPoll;

  const refresh = useCallback(() => {
    // Re-trigger the refreshTick-keyed fetches (config, saved profiles, the
    // one-shot header-count fetches) AND force each poll to re-run immediately.
    setRefreshTick((t) => t + 1);
    refreshChaosPoll();
    refreshTcpPoll();
    refreshGrpcChaosPoll();
    refreshExperimentPoll();
    refreshPreemptionPoll();
  }, [refreshChaosPoll, refreshTcpPoll, refreshGrpcChaosPoll, refreshExperimentPoll, refreshPreemptionPoll]);

  // --- Auto-halt configuration fetch + apply ---
  useEffect(() => {
    const controller = new AbortController();
    void getConfiguration(connectionParams, controller.signal)
      .then((config) => {
        if (!controller.signal.aborted) {
          setAutoHaltEnabled(config['chaosAutoHaltEnabled'] === true);
          if (typeof config['chaosAutoHaltErrorThreshold'] === 'number') setAutoHaltThreshold(String(config['chaosAutoHaltErrorThreshold']));
          if (typeof config['chaosAutoHaltWindowMillis'] === 'number') setAutoHaltWindow(String(config['chaosAutoHaltWindowMillis']));
        }
      })
      .catch(() => { /* config endpoint unavailable */ });
    return () => controller.abort();
  }, [connectionParams, refreshTick]);

  const applyAutoHaltConfig = useCallback(async (partial: Configuration) => {
    setActionError(null);
    try {
      await updateConfiguration(connectionParams, partial);
      refresh();
    } catch (e) {
      setActionError(humanizeError(e));
    }
  }, [connectionParams, refresh]);

  // Whether any active registration (HTTP service, TCP host, or gRPC service)
  // actually carries a TTL/expiry to count down. The `ttlRemainingMillis` maps
  // are populated by the backend only for registrations that were given a TTL;
  // a registration with no TTL has no entry. When none exist there is nothing to
  // tick down, so the 1s interval below stays off and the panel does not
  // re-render every second.
  const hasAnyTtl = useMemo(() => {
    const anyEntry = (map: Record<string, number> | undefined) =>
      map != null && Object.keys(map).length > 0;
    return (
      anyEntry(data.ttlRemainingMillis) ||
      anyEntry(tcpData.ttlRemainingMillis) ||
      anyEntry(grpcChaosData.ttlRemainingMillis)
    );
  }, [data.ttlRemainingMillis, tcpData.ttlRemainingMillis, grpcChaosData.ttlRemainingMillis]);

  // Tick once a second so TTL countdowns update between polls — but only while at
  // least one registration has a TTL to count down. With zero TTL-bearing
  // registrations the interval would otherwise re-render the whole panel every
  // second for no visible change.
  useEffect(() => {
    if (!hasAnyTtl) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasAnyTtl]);

  // Fetch gRPC health on mount (so the collapsed header chip shows the real count),
  // then keep polling only while the gRPC panel + health sub-section are expanded.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      try {
        const result = await fetchGrpcHealth(connectionParams, controller.signal);
        if (!cancelled) setGrpcHealthState(result);
      } catch {
        // ignore
      } finally {
        if (!cancelled && grpcPanelExpanded && grpcHealthExpanded) timer = setTimeout(() => void poll(), 10000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [connectionParams, grpcPanelExpanded, grpcHealthExpanded, refreshTick]);

  // One-shot TCP chaos fetch on mount / refresh so the collapsed header chip shows
  // the real count. Live updates while expanded are driven by `tcpPoll` above.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void fetchTcpChaos(connectionParams, controller.signal)
      .then((result) => {
        if (!cancelled) {
          setTcpData(result);
          setTcpPolledAt(Date.now());
        }
      })
      .catch(() => { /* header count is best-effort */ });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [connectionParams, refreshTick]);

  // One-shot gRPC fault-injection chaos fetch on mount / refresh so the collapsed
  // header chip shows the real count. Live updates while the gRPC panel + fault
  // sub-section are expanded are driven by `grpcChaosPoll` above.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void fetchGrpcChaos(connectionParams, controller.signal)
      .then((result) => {
        if (!cancelled) {
          setGrpcChaosData(result);
          setGrpcChaosPolledAt(Date.now());
        }
      })
      .catch(() => { /* header count is best-effort */ });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [connectionParams, refreshTick]);

  // One-shot preemption fetch on mount / refresh so the collapsed header badge
  // shows the real state. Live updates while expanded are driven by
  // `preemptionPoll` above.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void getPreemption(connectionParams, controller.signal)
      .then((result) => {
        if (!cancelled) setPreemptionData(result);
      })
      .catch(() => { /* header badge is best-effort */ });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [connectionParams, refreshTick]);

  // ADV3: load saved chaos profile names while the experiments section is open.
  useEffect(() => {
    if (!experimentsExpanded) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const names = await listChaosProfiles(connectionParams, controller.signal);
        if (!cancelled) setSavedProfiles(names);
      } catch {
        // ignore — saved-profile library is best-effort in the UI
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [connectionParams, experimentsExpanded, profilesTick]);

  // Load experiment history when the History sub-section is open (fetched on
  // expand and on an explicit refresh — not continuously polled).
  useEffect(() => {
    if (!experimentsExpanded || !historyExpanded) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      if (!cancelled) setHistoryLoading(true);
      try {
        const entries = await getExperimentHistory(connectionParams, controller.signal);
        if (!cancelled) setHistoryData(entries);
      } catch {
        // ignore — history is best-effort in the UI
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [connectionParams, experimentsExpanded, historyExpanded, historyTick]);

  // Consume a pending chaos draft handed off from a flow's "Add Chaos For This
  // Host/Path" launchpad action: prefill the HTTP register form's host scope and
  // open the (collapsed-by-default) HTTP Service Chaos card, then clear the draft
  // so it applies exactly once. HTTP chaos is host-scoped, so the request's host
  // is the scope field; a draft with only a path still opens the card so the user
  // can fill in the host.
  const pendingChaosDraft = useDashboardStore((s) => s.pendingChaosDraft);
  const clearPendingChaosDraft = useDashboardStore((s) => s.clearPendingChaosDraft);
  useEffect(() => {
    // Clear the one-shot hand-off on teardown so a draft can never survive an
    // unmount mid-apply and re-apply on re-mount.
    if (!pendingChaosDraft) return clearPendingChaosDraft;
    const host = pendingChaosDraft.host?.trim();
    // Consuming a one-shot store hand-off is the legitimate "sync React state
    // from an external system" case; the effect clears the signal so it runs
    // exactly once (same pattern as the Composer/Breakpoints panels).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (host) setForm((prev) => ({ ...prev, host }));
    setHttpExpanded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    clearPendingChaosDraft();
    return clearPendingChaosDraft;
  }, [pendingChaosDraft, clearPendingChaosDraft]);

  const hosts = useMemo(() => Object.keys(data.services).sort(), [data.services]);

  // Remaining TTL for a host, decremented client-side since the last poll.
  const remainingTtl = (host: string): number | undefined => {
    const atPoll = data.ttlRemainingMillis?.[host];
    if (atPoll == null) return undefined;
    return Math.max(0, atPoll - (now - polledAt));
  };

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setActionError(null);
      try {
        await action();
        refresh();
      } catch (e) {
        setActionError(humanizeError(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleRegister = useCallback(() => {
    const validationError = validateForm(form);
    if (validationError !== null) {
      setActionError({ message: validationError });
      return;
    }
    const host = form.host.trim();
    const profile = buildChaosProfile(form);
    const ttl = num(form.ttlMs);
    void runAction(async () => {
      await registerServiceChaos(connectionParams, host, profile, ttl);
      setForm(EMPTY_FORM);
    });
  }, [connectionParams, form, runAction]);

  // --- Quick Chaos strip ---------------------------------------------------
  // Live state is DERIVED from the polled registry so the strip round-trips on load
  // (no hidden client state): a host carrying a canonical Quick-Chaos-shaped rule means
  // "on". When on, the host/percent/modes shown come from that rule; when off, the local
  // form state (quickHostInput/quickPercent/quickModes) drives what to register.
  const quickChaos = useMemo(() => deriveQuickChaos(data.services), [data.services]);
  const quickEnabled = quickChaos != null;
  const quickHost = quickEnabled ? quickChaos.host : quickHostInput;
  // The slider is always driven by local state so the thumb tracks a drag even while
  // a rule is active; the derived (server) percent re-syncs it whenever it changes —
  // on load/adoption, after a commit, or when a PUT fails and the poll snaps back.
  const derivedQuickPercent = quickChaos?.percent ?? null;
  const [lastDerivedQuickPercent, setLastDerivedQuickPercent] = useState<number | null>(null);
  if (derivedQuickPercent !== lastDerivedQuickPercent) {
    setLastDerivedQuickPercent(derivedQuickPercent);
    if (derivedQuickPercent != null) setQuickPercent(derivedQuickPercent);
  }
  const quickPercentValue = quickPercent;
  const quickModesValue = quickEnabled ? quickChaos.modes : quickModes;
  // The slider only governs the probability-scoped modes (errors/reset); latency is not
  // probability-gated server-side, so a latency-only selection disables the slider.
  const quickPercentAppliesToModes =
    quickModesValue.includes('errors') || quickModesValue.includes('reset');

  // Register (or replace) the Quick-Chaos rule for a host with the given modes/percent.
  const applyQuickChaos = useCallback(
    (host: string, modes: QuickChaosMode[], percent: number) =>
      runAction(() =>
        registerServiceChaos(connectionParams, host, buildQuickChaosProfile(modes, percent)),
      ),
    [connectionParams, runAction],
  );

  const handleQuickToggle = useCallback(
    (_e: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      if (checked) {
        const host = quickHostInput.trim();
        if (host === '') {
          setActionError({ message: uiText('Enter a target host to enable Quick Chaos', '输入目标主机后才能启用快速故障注入') });
          return;
        }
        // Quick Chaos registers straight into the same host-keyed registry, so it
        // needs the same exact-host guard as the full form (which goes via validateForm).
        const hostError = hostTargetError(host);
        if (hostError) {
          setActionError({ message: hostError });
          return;
        }
        if (quickModes.length === 0) {
          setActionError({ message: uiText('Select at least one fault mode', '至少选择一种故障模式') });
          return;
        }
        void applyQuickChaos(host, quickModes, quickPercent);
      } else if (quickChaos) {
        void runAction(() => removeServiceChaos(connectionParams, quickChaos.host));
      }
    },
    [applyQuickChaos, connectionParams, quickChaos, quickHostInput, quickModes, quickPercent, runAction],
  );

  // Slider: update local state live; when enabled, commit the change to the server on release.
  const handleQuickPercentChange = useCallback((_e: Event, value: number | number[]) => {
    setQuickPercent(Array.isArray(value) ? value[0] ?? QUICK_CHAOS_DEFAULT_PERCENT : value);
  }, []);
  const handleQuickPercentCommit = useCallback(
    (_e: Event | SyntheticEvent, value: number | number[]) => {
      if (!quickChaos) return;
      const percent = Array.isArray(value) ? value[0] ?? quickChaos.percent : value;
      void applyQuickChaos(quickChaos.host, quickChaos.modes, percent);
    },
    [applyQuickChaos, quickChaos],
  );

  // Toggle one canned fault mode. When enabled, re-register (or, if the last mode is
  // removed, delete the rule — i.e. turn Quick Chaos off).
  const handleQuickModeToggle = useCallback(
    (mode: QuickChaosMode) => {
      if (quickChaos) {
        const next = quickChaos.modes.includes(mode)
          ? quickChaos.modes.filter((m) => m !== mode)
          : [...quickChaos.modes, mode];
        if (next.length === 0) {
          void runAction(() => removeServiceChaos(connectionParams, quickChaos.host));
        } else {
          void applyQuickChaos(quickChaos.host, next, quickChaos.percent);
        }
      } else {
        setQuickModes((prev) =>
          prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
        );
      }
    },
    [applyQuickChaos, connectionParams, quickChaos, runAction],
  );

  const setField = (field: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const setFormToggle = (field: keyof FormState) => (_e: ChangeEvent<HTMLInputElement>, checked: boolean) =>
    setForm((prev) => ({ ...prev, [field]: checked }));

  const handleStartEdit = useCallback((host: string) => {
    const profile = data.services[host] ?? {};
    setEditForm({
      errorStatus: profile.errorStatus != null ? String(profile.errorStatus) : '',
      errorProbability: profile.errorProbability != null ? String(profile.errorProbability) : '',
      dropProbability: profile.dropConnectionProbability != null ? String(profile.dropConnectionProbability) : '',
      latencyMs: delayMillis(profile.latency) != null ? String(delayMillis(profile.latency)) : '',
      seed: profile.seed != null ? String(profile.seed) : '',
      succeedFirst: profile.succeedFirst != null ? String(profile.succeedFirst) : '',
      failRequestCount: profile.failRequestCount != null ? String(profile.failRequestCount) : '',
      retryAfter: profile.retryAfter ?? '',
      truncateBodyAtFraction: profile.truncateBodyAtFraction != null ? String(profile.truncateBodyAtFraction) : '',
      malformedBody: profile.malformedBody ?? false,
      slowResponseChunkSize: profile.slowResponseChunkSize != null ? String(profile.slowResponseChunkSize) : '',
      slowResponseChunkDelayMs: delayMillis(profile.slowResponseChunkDelay) != null ? String(delayMillis(profile.slowResponseChunkDelay)) : '',
      quotaName: profile.quotaName ?? '',
      quotaLimit: profile.quotaLimit != null ? String(profile.quotaLimit) : '',
      quotaWindowMillis: profile.quotaWindowMillis != null ? String(profile.quotaWindowMillis) : '',
      quotaErrorStatus: profile.quotaErrorStatus != null ? String(profile.quotaErrorStatus) : '',
      degradationRampMillis: profile.degradationRampMillis != null ? String(profile.degradationRampMillis) : '',
      outageAfterMillis: profile.outageAfterMillis != null ? String(profile.outageAfterMillis) : '',
      outageDurationMillis: profile.outageDurationMillis != null ? String(profile.outageDurationMillis) : '',
      graphqlErrors: profile.graphqlErrors ?? false,
      graphqlErrorMessage: profile.graphqlErrorMessage ?? '',
      graphqlErrorCode: profile.graphqlErrorCode ?? '',
      graphqlNullifyData: profile.graphqlNullifyData ?? true,
    });
    setEditingHost(host);
  }, [data.services]);

  const handleCancelEdit = useCallback(() => {
    setEditingHost(null);
  }, []);

  // Apply replaces the whole profile (PUT) rather than PATCHing it: the server's
  // PATCH merges only non-null fields, so a field the user blanked would survive.
  // A TTL-bearing registration is re-registered with its remaining TTL.
  const handleApplyEdit = useCallback(() => {
    if (!editingHost) return;
    const host = editingHost;
    const asForm: FormState = { ...editForm, host, ttlMs: '' };
    const profile = buildChaosProfile(asForm);
    if (summarizeChaosProfile(profile).length === 0) {
      setActionError({ message: uiText('Set at least one fault, or use Remove to delete the chaos for this host', '请至少配置一种故障，或移除此主机的故障配置') });
      return;
    }
    const validationError = validateForm(asForm);
    if (validationError !== null) {
      setActionError({ message: validationError });
      return;
    }
    const ttlAtPoll = data.ttlRemainingMillis?.[host];
    const ttl = ttlAtPoll != null ? Math.max(1, Math.round(ttlAtPoll - (Date.now() - polledAt))) : undefined;
    void runAction(async () => {
      await registerServiceChaos(connectionParams, host, profile, ttl);
      setEditingHost(null);
    });
  }, [connectionParams, data.ttlRemainingMillis, editingHost, editForm, polledAt, runAction]);

  const setEditField = (field: keyof EditFormState) => (e: ChangeEvent<HTMLInputElement>) =>
    setEditForm((prev) => ({ ...prev, [field]: e.target.value }));

  const setEditToggle = (field: keyof EditFormState) => (_e: ChangeEvent<HTMLInputElement>, checked: boolean) =>
    setEditForm((prev) => ({ ...prev, [field]: checked }));

  const handleSetGrpcHealth = useCallback(() => {
    if (!grpcNewService.trim()) return;
    void runAction(async () => {
      await setGrpcHealth(connectionParams, grpcNewService.trim(), grpcNewStatus);
      setGrpcNewService('');
    });
  }, [connectionParams, grpcNewService, grpcNewStatus, runAction]);

  const handleResetGrpcHealth = useCallback((service: string) => {
    void runAction(async () => {
      await resetGrpcHealth(connectionParams, service);
    });
  }, [connectionParams, runAction]);

  // Null-safe: a control-plane response with an unexpected/missing shape must never
  // crash the panel (Object.keys(undefined) throws). Default to an empty set.
  const grpcServices = useMemo(() => Object.keys(grpcHealth ?? {}).sort(), [grpcHealth]);

  // TCP chaos helpers
  const tcpHosts = useMemo(() => Object.keys(tcpData?.hosts ?? {}).sort(), [tcpData]);

  const tcpRemainingTtl = (host: string): number | undefined => {
    const atPoll = tcpData.ttlRemainingMillis?.[host];
    if (atPoll == null) return undefined;
    return Math.max(0, atPoll - (now - tcpPolledAt));
  };

  const setTcpField = (field: keyof TcpFormState) => (e: ChangeEvent<HTMLInputElement>) =>
    setTcpForm((prev) => ({ ...prev, [field]: e.target.value }));

  const setTcpToggle = (field: keyof TcpFormState) => (_e: ChangeEvent<HTMLInputElement>, checked: boolean) =>
    setTcpForm((prev) => ({ ...prev, [field]: checked }));

  // The network-condition preset selection is DERIVED from the form, not stored
  // alongside it, so hand-editing latency/bandwidth/slicer after picking a preset
  // drops the picker back to "Custom" rather than leaving a stale name claiming
  // numbers the form no longer holds.
  const tcpPresetId = matchNetworkPresetId(tcpForm);
  const selectedTcpPreset = findNetworkPreset(tcpPresetId);

  const applyNetworkPreset = (id: string) => {
    const preset = findNetworkPreset(id);
    // "Custom" clears the preset-controlled fields; every other field (host, TTL,
    // the lifecycle toggles) is deliberately left alone. A preset populates exactly
    // one of latency/bandwidth/slicer, because TcpChaosHandler applies only the
    // highest-priority fault configured and discards the rest.
    const fields = preset ? networkPresetFields(preset) : emptyNetworkPresetFields();
    setTcpForm((prev) => ({ ...prev, ...fields }));
  };

  const handleRegisterTcp = useCallback(() => {
    const validationError = validateTcpForm(tcpForm);
    if (validationError !== null) {
      setActionError({ message: validationError });
      return;
    }
    const host = tcpForm.host.trim();
    const profile = buildTcpChaosProfile(tcpForm);
    const ttl = num(tcpForm.ttlMs);
    void runAction(async () => {
      await registerTcpChaos(connectionParams, host, profile, ttl);
      setTcpForm(EMPTY_TCP_FORM);
    });
  }, [connectionParams, tcpForm, runAction]);

  // gRPC fault injection chaos helpers
  const grpcChaosServices = useMemo(() => Object.keys(grpcChaosData?.services ?? {}).sort(), [grpcChaosData]);

  const grpcChaosRemainingTtl = (service: string): number | undefined => {
    const atPoll = grpcChaosData.ttlRemainingMillis?.[service];
    if (atPoll == null) return undefined;
    return Math.max(0, atPoll - (now - grpcChaosPolledAt));
  };

  const setGrpcChaosField = (field: keyof GrpcChaosFormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setGrpcChaosForm((prev) => ({ ...prev, [field]: e.target.value }));

  const setGrpcChaosToggle = (field: keyof GrpcChaosFormState) => (_e: ChangeEvent<HTMLInputElement>, checked: boolean) =>
    setGrpcChaosForm((prev) => ({ ...prev, [field]: checked }));

  const handleRegisterGrpcChaos = useCallback(() => {
    const validationError = validateGrpcChaosForm(grpcChaosForm);
    if (validationError !== null) {
      setActionError({ message: validationError });
      return;
    }
    const service = grpcChaosForm.service.trim();
    const profile = buildGrpcChaosProfile(grpcChaosForm);
    const ttl = num(grpcChaosForm.ttlMs);
    void runAction(async () => {
      await registerGrpcChaos(connectionParams, service, profile, ttl);
      setGrpcChaosForm(EMPTY_GRPC_CHAOS_FORM);
    });
  }, [connectionParams, grpcChaosForm, runAction]);

  // --- Preemption-simulation handlers ---

  const preemptionActive = preemptionData.state !== 'inactive';

  const setPreemptionField = (field: 'drainMs' | 'ttlMs') => (e: ChangeEvent<HTMLInputElement>) =>
    setPreemptionForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleStartPreemption = useCallback(() => {
    const drainMs = num(preemptionForm.drainMs);
    if (drainMs != null && (!Number.isInteger(drainMs) || drainMs < 1)) {
      setActionError({ message: uiText('Drain must be a whole number of milliseconds >= 1', '排空等待时间必须为大于或等于 1 的整数毫秒') });
      return;
    }
    const ttlMs = num(preemptionForm.ttlMs);
    if (ttlMs != null && (!Number.isInteger(ttlMs) || ttlMs < 1)) {
      setActionError({ message: uiText('TTL must be a whole number of milliseconds >= 1', '有效期必须为大于或等于 1 的整数毫秒') });
      return;
    }
    const request: { mode: PreemptionMode; drainMillis?: number; ttlMillis?: number } = {
      mode: preemptionForm.mode,
    };
    if (drainMs != null) request.drainMillis = drainMs;
    if (ttlMs != null) request.ttlMillis = ttlMs;
    void runAction(async () => {
      await startPreemption(connectionParams, request);
    });
  }, [connectionParams, preemptionForm, runAction]);

  const handleClearPreemption = useCallback(() => {
    void runAction(async () => {
      await clearPreemption(connectionParams);
    });
  }, [connectionParams, runAction]);

  // --- Chaos Experiment handlers ---

  const addExpStage = useCallback(() => {
    const id = stageIdCounter.current++;
    setExpStages((prev) => [...prev, {
      id, durationMs: '10000', host: '', errorStatus: '', errorProbability: '',
      latencyMs: '', dropProbability: '',
    }]);
  }, []);

  const removeExpStage = useCallback((index: number) => {
    setExpStages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const setExpStageField = (index: number, field: string) =>
    (e: ChangeEvent<HTMLInputElement>) =>
      setExpStages((prev) =>
        prev.map((s, i) => i === index ? { ...s, [field]: e.target.value } : s),
      );

  // Validate the editor rows and build an ExperimentDefinitionDTO, or set an
  // action error and return null. Shared by Start Experiment and Save Profile.
  const buildDefinitionFromEditor = useCallback((): ExperimentDefinitionDTO | null => {
    if (!expName.trim()) {
      setActionError({ message: uiText('Experiment name is required', '请输入实验名称') });
      return null;
    }
    if (expStages.length === 0) {
      setActionError({ message: uiText('At least one stage is required', '至少需要一个阶段') });
      return null;
    }
    const stages: ExperimentStageDTO[] = [];
    for (let i = 0; i < expStages.length; i++) {
      const s = expStages[i]!;
      const durationMillis = num(s.durationMs);
      if (durationMillis == null || durationMillis <= 0) {
        setActionError({ message: uiText(`Stage ${i + 1}: duration must be > 0`, `第 ${i + 1} 阶段的持续时间必须大于 0`) });
        return null;
      }
      if (!s.host.trim()) {
        setActionError({ message: uiText(`Stage ${i + 1}: host is required`, `请输入第 ${i + 1} 阶段的主机`) });
        return null;
      }
      // A stage host becomes a registry key verbatim (ChaosExperimentOrchestrator
      // applies each stage via ServiceChaosRegistry.put), so it needs the same
      // exact-host guard as the register forms. An unmatched key here is worse than
      // a dead registration: the experiment still reports running/completed and the
      // auto-halt monitor still sees chaos registered, so the user reads an
      // affirmative resilience verdict from a run that faulted nothing.
      const stageHostError = hostTargetError(s.host);
      if (stageHostError) {
        setActionError({ message: uiText(`Stage ${i + 1}: ${stageHostError}`, `第 ${i + 1} 阶段：${stageHostError}`) });
        return null;
      }
      const profile: HttpChaosProfileDTO = {};
      const errorStatus = num(s.errorStatus);
      if (errorStatus != null) {
        profile.errorStatus = errorStatus;
        const ep = num(s.errorProbability);
        if (ep != null) profile.errorProbability = ep;
      }
      const latMs = num(s.latencyMs);
      if (latMs != null) profile.latency = { timeUnit: 'MILLISECONDS', value: latMs };
      const dp = num(s.dropProbability);
      if (dp != null) profile.dropConnectionProbability = dp;
      if (summarizeChaosProfile(profile).length === 0) {
        setActionError({ message: uiText(`Stage ${i + 1}: set at least one fault (error, latency, or drop)`, `第 ${i + 1} 阶段至少配置一种故障：错误、延迟或断开连接`) });
        return null;
      }
      stages.push({ durationMillis, profiles: { [s.host.trim()]: profile } });
    }
    return { name: expName.trim(), loop: expLoop, stages };
  }, [expName, expLoop, expStages]);

  const handleStartExperiment = useCallback(() => {
    const definition = buildDefinitionFromEditor();
    if (!definition) return;
    void runAction(async () => {
      await startChaosExperiment(connectionParams, definition);
      trackFeature('chaos_started');
    });
  }, [connectionParams, buildDefinitionFromEditor, runAction]);

  const handleStopExperiment = useCallback(() => {
    void runAction(async () => {
      await stopChaosExperiment(connectionParams);
    });
  }, [connectionParams, runAction]);

  // ADV3: save the current editor definition as a named profile.
  const handleSaveProfile = useCallback(() => {
    const definition = buildDefinitionFromEditor();
    if (!definition) return;
    void runAction(async () => {
      await saveChaosProfile(connectionParams, definition.name, definition);
      refreshProfiles();
    });
  }, [connectionParams, buildDefinitionFromEditor, runAction, refreshProfiles]);

  const handleApplyProfile = useCallback((name: string) => {
    void runAction(async () => {
      await applyChaosProfile(connectionParams, name);
    });
  }, [connectionParams, runAction]);

  const handleDeleteProfile = useCallback((name: string) => {
    void runAction(async () => {
      await deleteChaosProfile(connectionParams, name);
      refreshProfiles();
    });
  }, [connectionParams, runAction, refreshProfiles]);

  // Load the running (or last-known) experiment definition into the editor so the
  // user can tweak it and re-start. Reverses the editor -> DTO mapping in
  // handleStartExperiment: one editor row per (stage, host) pair, each with a
  // fresh id from the same counter addExpStage uses.
  const loadExperimentIntoEditor = useCallback((definition: ExperimentDefinitionDTO) => {
    setExpName(definition.name);
    setExpLoop(!!definition.loop);
    const rows = definition.stages.flatMap((stage) =>
      Object.entries(stage.profiles).map(([host, profile]) => ({
        id: stageIdCounter.current++,
        durationMs: String(stage.durationMillis),
        host,
        errorStatus: profile.errorStatus != null ? String(profile.errorStatus) : '',
        errorProbability: profile.errorProbability != null ? String(profile.errorProbability) : '',
        latencyMs: profile.latency?.value != null ? String(profile.latency.value) : '',
        dropProbability: profile.dropConnectionProbability != null ? String(profile.dropConnectionProbability) : '',
      })),
    );
    // Keep at least one (empty) stage row so the editor never collapses to nothing.
    setExpStages(rows.length > 0 ? rows : [{
      id: stageIdCounter.current++, durationMs: '10000', host: '', errorStatus: '',
      errorProbability: '', latencyMs: '', dropProbability: '',
    }]);
    setActionError(null);
  }, []);

  const isExperimentActive = experimentStatus?.status === 'running' || experimentStatus?.status === 'starting';

  // Confirmation dialog for destructive clear-all actions
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  // Real gRPC health overrides: a named service, or the default if it is no longer SERVING.
  // The GET always returns a "_default" SERVING entry, which is not an override on its own.
  const grpcHealthOverrides = useMemo(
    () => grpcServices.filter((svc) => svc !== '_default' || grpcHealth[svc] !== 'SERVING'),
    [grpcServices, grpcHealth],
  );
  // Combined gRPC active count (health overrides + fault injection services)
  const grpcCombinedActiveCount = grpcHealthOverrides.length + grpcChaosServices.length;

  return (
    <Box
      sx={{
        flex: 1,
        overflow: 'auto',
        p: 1.5,
        // MUI's FormControlLabel defaults to a negative outer margin (-11px) which
        // pulls switch/checkbox toggles past the container's left edge so they look
        // cramped (e.g. "GraphQL errors", "Omit grpc-status", "Down", "Loop").
        // Neutralise that overhang so the toggle has proper left spacing, and keep a
        // clear gap between the indicator and its label.
        '& .MuiFormControlLabel-labelPlacementEnd': { ml: 0 },
        '& .MuiFormControlLabel-labelPlacementStart': { mr: 0 },
        '& .MuiFormControlLabel-labelPlacementEnd .MuiFormControlLabel-label': { ml: 1 },
        '& .MuiFormControlLabel-labelPlacementStart .MuiFormControlLabel-label': { mr: 1 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {uiText('Service Chaos', '服务故障注入')}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={uiText('Refresh now', '立即刷新')}>
          <IconButton size="small" onClick={refresh} aria-label={uiText('Refresh service chaos', '刷新服务故障配置')}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {loadError && (
        <Alert
          severity={loadError.includes('404') || loadError.includes('Not Found') ? 'info' : 'error'}
          sx={{ mb: 1.5 }}
          action={
            <IconButton color="inherit" size="small" onClick={refresh} aria-label={uiText('Retry', '重试')}><RefreshIcon fontSize="small" /></IconButton>
          }
        >
          <AlertTitle>
            {loadError.includes('404') || loadError.includes('Not Found')
              ? uiText('Service chaos not available', '服务故障注入不可用')
              : uiText('Could not load service chaos', '无法加载服务故障配置')}
          </AlertTitle>
          {loadError.includes('404') || loadError.includes('Not Found')
            ? uiText('The connected server does not support service chaos. This feature requires a newer version of MockServer.', '当前连接的服务器不支持服务故障注入。此功能需要更新版本的 MockServer。')
            : loadError}
        </Alert>
      )}

      {actionError && (
        <HumanErrorAlert
          error={actionError}
          sx={{ mb: 1.5 }}
          onClose={() => setActionError(null)}
        />
      )}

      {/* Quick Chaos — one-toggle approachability layer over per-host service chaos */}
      <Paper
        variant="outlined"
        sx={{ p: 1.25, mb: 1.5, borderColor: quickEnabled ? 'warning.main' : undefined }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            {uiText('Quick Chaos', '快速故障注入')}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={quickEnabled}
                onChange={handleQuickToggle}
                disabled={busy}
              />
            }
            label={<Typography variant="caption">{uiText('Enable Chaos', '启用故障注入')}</Typography>}
          />
          <TextField
            size="small"
            label={uiText('Target Host', '目标主机')}
            placeholder={uiText('e.g. api.example.com', '例如 api.example.com')}
            value={quickHost}
            disabled={quickEnabled || busy}
            onChange={(e) => setQuickHostInput(e.target.value)}
            sx={responsiveWidth(200)}
          />
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {QUICK_CHAOS_MODE_OPTIONS.map(({ mode, label }) => {
              const selected = quickModesValue.includes(mode);
              return (
                <Chip
                  key={mode}
                  size="small"
                  label={label}
                  clickable
                  color={selected ? 'warning' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                  aria-pressed={selected}
                  disabled={busy}
                  onClick={() => handleQuickModeToggle(mode)}
                />
              );
            })}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
          <Box sx={{ width: 200, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Slider
              size="small"
              min={1}
              max={100}
              value={quickPercentValue}
              onChange={handleQuickPercentChange}
              onChangeCommitted={handleQuickPercentCommit}
              disabled={busy || !quickPercentAppliesToModes}
              aria-label={uiText('Percentage of requests affected', '受影响的请求比例')}
              valueLabelDisplay="auto"
            />
            <Typography variant="caption" sx={{ minWidth: 34, textAlign: 'right' }}>
              {quickPercentValue}%
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {quickPercentAppliesToModes
              ? uiText(`Affects ~${quickPercentValue}% of requests forwarded to ${quickHost || 'the target host'}.`, `约影响转发到 ${quickHost || '目标主机'} 的 ${quickPercentValue}% 请求。`)
              : uiText(`Latency applies to all requests forwarded to ${quickHost || 'the target host'}.`, `延迟适用于所有转发到 ${quickHost || '目标主机'} 的请求。`)}
            {quickModesValue.includes('latency') && uiText(` Latency mode adds +${QUICK_CHAOS_LATENCY_MS}ms to every request.`, ` 延迟模式为每条请求增加 ${QUICK_CHAOS_LATENCY_MS} 毫秒。`)}
          </Typography>
        </Box>
      </Paper>

      {/* Auto-halt controls (inline) */}
      {autoHaltEnabled !== null && (
        <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {uiText('Auto-halt', '自动停止')}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={autoHaltEnabled}
                  onChange={(e) => {
                    setAutoHaltEnabled(e.target.checked);
                    void applyAutoHaltConfig({ chaosAutoHaltEnabled: e.target.checked });
                  }}
                />
              }
              label={<Typography variant="caption">{autoHaltEnabled ? uiText('Armed', '已启用') : uiText('Off', '已关闭')}</Typography>}
            />
            <TextField
              size="small"
              label={uiText('Error threshold', '错误阈值')}
              type="number"
              value={autoHaltThreshold}
              disabled={!autoHaltEnabled}
              error={autoHaltThreshold.trim() !== '' && (isNaN(parseInt(autoHaltThreshold, 10)) || parseInt(autoHaltThreshold, 10) <= 0)}
              helperText={autoHaltThreshold.trim() !== '' && (isNaN(parseInt(autoHaltThreshold, 10)) || parseInt(autoHaltThreshold, 10) <= 0) ? '> 0' : undefined}
              onChange={(e) => setAutoHaltThreshold(e.target.value)}
              onBlur={() => {
                const v = parseInt(autoHaltThreshold, 10);
                if (!isNaN(v) && v > 0) void applyAutoHaltConfig({ chaosAutoHaltErrorThreshold: v });
              }}
              sx={responsiveWidth(130)}
            />
            <TextField
              size="small"
              label={uiText('Window (ms)', '统计窗口（毫秒）')}
              type="number"
              value={autoHaltWindow}
              disabled={!autoHaltEnabled}
              error={autoHaltWindow.trim() !== '' && (isNaN(parseInt(autoHaltWindow, 10)) || parseInt(autoHaltWindow, 10) <= 0)}
              helperText={autoHaltWindow.trim() !== '' && (isNaN(parseInt(autoHaltWindow, 10)) || parseInt(autoHaltWindow, 10) <= 0) ? '> 0' : undefined}
              onChange={(e) => setAutoHaltWindow(e.target.value)}
              onBlur={() => {
                const v = parseInt(autoHaltWindow, 10);
                if (!isNaN(v) && v > 0) void applyAutoHaltConfig({ chaosAutoHaltWindowMillis: v });
              }}
              sx={responsiveWidth(130)}
            />
            <Typography variant="caption" color="text.secondary">
              {uiText('Automatically halt chaos when errors exceed the threshold within the window.', '当统计窗口内的错误超过阈值时，自动停止故障注入。')}
            </Typography>
          </Box>
        </Paper>
      )}

      {/* HTTP Service Chaos */}
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
          onClick={() => setHttpExpanded((v) => !v)}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {uiText('HTTP Service Chaos', 'HTTP 服务故障注入')}
          </Typography>
          <Chip size="small" label={uiText(`${hosts.length} active`, `${hosts.length} 项生效中`)} color={hosts.length > 0 ? 'warning' : 'default'} variant="outlined" />
          <Box sx={{ flex: 1 }} />
          <Tooltip title={uiText('Clear all HTTP service-scoped chaos', '清空所有 HTTP 服务故障配置')}>
            <span>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteSweepIcon fontSize="small" />}
                disabled={busy || hosts.length === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirm({
                    title: uiText('Clear all HTTP chaos?', '清空所有 HTTP 故障配置？'),
                    message: uiText(`This removes chaos profiles for all ${hosts.length} registered host${hosts.length === 1 ? '' : 's'}. Live traffic will no longer be faulted. This cannot be undone.`, `此操作会移除全部 ${hosts.length} 个主机的故障配置，实时流量将恢复正常，且操作无法撤销。`),
                    confirmLabel: uiText('Clear HTTP chaos', '清空 HTTP 故障配置'),
                    onConfirm: () => void runAction(() => clearServiceChaos(connectionParams)),
                  });
                }}
              >
                {uiText('Clear HTTP', '清空 HTTP 故障配置')}
              </Button>
            </span>
          </Tooltip>
          <IconButton size="small" aria-label={httpExpanded ? uiText('Collapse HTTP chaos', '收起 HTTP 故障配置') : uiText('Expand HTTP chaos', '展开 HTTP 故障配置')}>
            {httpExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
        <Collapse in={httpExpanded}>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {uiText('Register one HTTP chaos profile per upstream host; it is applied to every matched forward to that host. Add a TTL to auto-revert the fault after a bounded window (a dead-man\'s switch).', '每个上游主机可配置一条 HTTP 故障规则，适用于所有转发到该主机的匹配请求。设置有效期可在到期后自动撤销故障。')}
            </Typography>

            {/* Register form */}
            <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Register chaos for a host', '为主机配置故障')}</Typography>
              {/* Row 1: host + core fault fields */}
              <Box sx={{ ...CHAOS_GRID, mt: 0.75 }}>
                <TextField size="small" label={uiText('Host', '主机')} placeholder="upstream.svc" value={form.host} onChange={setField('host')} onKeyDown={(e) => { if (e.key === 'Enter') handleRegister(); }} fullWidth />
                <TextField size="small" label={uiText('Error status', '错误状态码')} placeholder="503" value={form.errorStatus} onChange={setField('errorStatus')} fullWidth />
                <TextField size="small" label={uiText('Error prob (0–1)', '错误概率（0–1）')} placeholder="0.5" value={form.errorProbability} onChange={setField('errorProbability')} fullWidth />
                <TextField size="small" label="Retry-After" placeholder="120" value={form.retryAfter} onChange={setField('retryAfter')} fullWidth />
                <TextField size="small" label={uiText('Drop prob (0–1)', '断开连接概率（0–1）')} placeholder="0.2" value={form.dropProbability} onChange={setField('dropProbability')} fullWidth />
                <TextField size="small" label={uiText('Latency ms', '延迟（毫秒）')} placeholder="250" value={form.latencyMs} onChange={setField('latencyMs')} fullWidth />
                <TextField size="small" label={uiText('TTL ms', '有效期（毫秒）')} placeholder="60000" value={form.ttlMs} onChange={setField('ttlMs')} fullWidth />
              </Box>
              {/* Row 2: body corruption + slow response */}
              <Box sx={{ ...CHAOS_GRID_WIDE, mt: 0.5 }}>
                <TextField size="small" label={uiText('Truncate body (0–1)', '响应体截断比例（0–1）')} placeholder="0.5" value={form.truncateBodyAtFraction} onChange={setField('truncateBodyAtFraction')} fullWidth />
                <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', pl: 1 }}>
                  <FormControlLabel
                    control={<Switch size="small" checked={form.malformedBody} onChange={setFormToggle('malformedBody')} />}
                    label={uiText('Malformed body', '损坏响应体')}
                  />
                </Box>
                <TextField size="small" label={uiText('Slow chunk bytes', '分块大小（字节）')} placeholder="64" value={form.slowResponseChunkSize} onChange={setField('slowResponseChunkSize')} fullWidth />
                <TextField size="small" label={uiText('Slow chunk delay ms', '块间延迟（毫秒）')} placeholder="500" value={form.slowResponseChunkDelayMs} onChange={setField('slowResponseChunkDelayMs')} fullWidth />
              </Box>
              {/* Row 3: quota (rate limit) */}
              <Box sx={{ ...CHAOS_GRID_WIDE, mt: 0.5 }}>
                <TextField size="small" label={uiText('Quota name', '配额名称')} placeholder="api-quota" value={form.quotaName} onChange={setField('quotaName')} fullWidth />
                <TextField size="small" label={uiText('Quota limit', '配额上限')} placeholder="100" value={form.quotaLimit} onChange={setField('quotaLimit')} fullWidth />
                <TextField size="small" label={uiText('Quota window ms', '配额统计窗口（毫秒）')} placeholder="60000" value={form.quotaWindowMillis} onChange={setField('quotaWindowMillis')} fullWidth />
                <TextField size="small" label={uiText('Quota error status', '超出配额时的状态码')} placeholder="429" value={form.quotaErrorStatus} onChange={setField('quotaErrorStatus')} fullWidth />
              </Box>
              {/* Row 4: count/time windows + degradation + seed */}
              <Box sx={{ ...CHAOS_GRID_WIDE, mt: 0.5 }}>
                <TextField size="small" label={uiText('Seed', '随机种子')} placeholder="42" value={form.seed} onChange={setField('seed')} fullWidth />
                <TextField size="small" label={uiText('Succeed first', '先成功的请求数')} placeholder="5" value={form.succeedFirst} onChange={setField('succeedFirst')} fullWidth />
                <TextField size="small" label={uiText('Fail count', '失败次数')} placeholder="10" value={form.failRequestCount} onChange={setField('failRequestCount')} fullWidth />
                <TextField size="small" label={uiText('Outage after ms', '多久后开始中断（毫秒）')} placeholder="5000" value={form.outageAfterMillis} onChange={setField('outageAfterMillis')} fullWidth />
                <TextField size="small" label={uiText('Outage duration ms', '中断时长（毫秒）')} placeholder="30000" value={form.outageDurationMillis} onChange={setField('outageDurationMillis')} fullWidth />
                <TextField size="small" label={uiText('Degradation ramp ms', '逐步降级时长（毫秒）')} placeholder="60000" value={form.degradationRampMillis} onChange={setField('degradationRampMillis')} fullWidth />
              </Box>
              {/* Row 5: GraphQL */}
              <Box sx={{ ...CHAOS_GRID, mt: 0.5 }}>
                <FormControlLabel
                  control={<Switch size="small" checked={form.graphqlErrors} onChange={setFormToggle('graphqlErrors')} />}
                  label={uiText('GraphQL errors', 'GraphQL 错误')}
                />
                {form.graphqlErrors && (
                  <>
                    <TextField size="small" label={uiText('Error message', '错误消息')} placeholder="Internal error" value={form.graphqlErrorMessage} onChange={setField('graphqlErrorMessage')} fullWidth />
                    <TextField size="small" label={uiText('Error code', '错误码')} placeholder="INTERNAL_ERROR" value={form.graphqlErrorCode} onChange={setField('graphqlErrorCode')} fullWidth />
                    <FormControlLabel
                      control={<Switch size="small" checked={form.graphqlNullifyData} onChange={setFormToggle('graphqlNullifyData')} />}
                      label={uiText('Nullify data', '将 data 设为 null')}
                    />
                  </>
                )}
              </Box>
              <Box sx={{ display: 'flex', mt: 0.5 }}>
                <Button variant="contained" size="small" disabled={busy} onClick={handleRegister} sx={{ ml: 'auto' }}>
                  {uiText('Register', '添加')}
                </Button>
              </Box>
            </Paper>

            {/* Active registrations */}
            {hosts.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {uiText('No service-scoped chaos registered.', '尚未配置服务故障。')}
              </Typography>
            ) : (
              <Box>
                {hosts.map((host) => {
                  const ttl = remainingTtl(host);
                  const isEditing = editingHost === host;
                  return (
                    <Box key={host}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
                        <Tooltip title={host}>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 160, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{host}</Typography>
                        </Tooltip>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                          {summarizeChaosProfile(data.services[host] ?? {}).map((part) => (
                            <Chip key={part} size="small" label={part} variant="outlined" />
                          ))}
                        </Box>
                        {ttl != null && (
                          <Chip size="small" color="warning" label={uiText(`auto-revert in ${formatTtl(ttl)}`, `${formatTtl(ttl)}后自动撤销`)} />
                        )}
                        <Tooltip title={uiText('Edit chaos profile for this host', '编辑此主机的故障配置')}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={uiText(`Edit chaos for ${host}`, `编辑 ${host} 的故障配置`)}
                              disabled={busy}
                              onClick={() => isEditing ? handleCancelEdit() : handleStartEdit(host)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={uiText('Remove chaos for this host', '移除此主机的故障配置')}>
                          <span>
                            <IconButton
                              size="small"
                              aria-label={uiText(`Remove chaos for ${host}`, `移除 ${host} 的故障配置`)}
                              disabled={busy}
                              onClick={() => void runAction(() => removeServiceChaos(connectionParams, host))}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                      {isEditing && (
                        <Box role="group" aria-label={uiText(`Edit chaos profile for ${host}`, `编辑 ${host} 的故障配置`)} sx={{ py: 0.75, pl: 2, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                          {/* Edit row 1: core fault fields */}
                          <Box sx={CHAOS_GRID}>
                            <TextField size="small" label={uiText('Error status', '错误状态码')} value={editForm.errorStatus} onChange={setEditField('errorStatus')} fullWidth />
                            <TextField size="small" label={uiText('Error prob (0–1)', '错误概率（0–1）')} value={editForm.errorProbability} onChange={setEditField('errorProbability')} fullWidth />
                            <TextField size="small" label="Retry-After" value={editForm.retryAfter} onChange={setEditField('retryAfter')} fullWidth />
                            <TextField size="small" label={uiText('Drop prob (0–1)', '断开连接概率（0–1）')} value={editForm.dropProbability} onChange={setEditField('dropProbability')} fullWidth />
                            <TextField size="small" label={uiText('Latency ms', '延迟（毫秒）')} value={editForm.latencyMs} onChange={setEditField('latencyMs')} fullWidth />
                          </Box>
                          {/* Edit row 2: body corruption + slow response */}
                          <Box sx={{ ...CHAOS_GRID_WIDE, mt: 0.5 }}>
                            <TextField size="small" label={uiText('Truncate body (0–1)', '响应体截断比例（0–1）')} value={editForm.truncateBodyAtFraction} onChange={setEditField('truncateBodyAtFraction')} fullWidth />
                            <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', pl: 1 }}>
                              <FormControlLabel
                                control={<Switch size="small" checked={editForm.malformedBody} onChange={setEditToggle('malformedBody')} />}
                                label={uiText('Malformed body', '损坏响应体')}
                              />
                            </Box>
                            <TextField size="small" label={uiText('Slow chunk bytes', '分块大小（字节）')} value={editForm.slowResponseChunkSize} onChange={setEditField('slowResponseChunkSize')} fullWidth />
                            <TextField size="small" label={uiText('Slow chunk delay ms', '块间延迟（毫秒）')} value={editForm.slowResponseChunkDelayMs} onChange={setEditField('slowResponseChunkDelayMs')} fullWidth />
                          </Box>
                          {/* Edit row 3: quota */}
                          <Box sx={{ ...CHAOS_GRID_WIDE, mt: 0.5 }}>
                            <TextField size="small" label={uiText('Quota name', '配额名称')} value={editForm.quotaName} onChange={setEditField('quotaName')} fullWidth />
                            <TextField size="small" label={uiText('Quota limit', '配额上限')} value={editForm.quotaLimit} onChange={setEditField('quotaLimit')} fullWidth />
                            <TextField size="small" label={uiText('Quota window ms', '配额统计窗口（毫秒）')} value={editForm.quotaWindowMillis} onChange={setEditField('quotaWindowMillis')} fullWidth />
                            <TextField size="small" label={uiText('Quota error status', '超出配额时的状态码')} value={editForm.quotaErrorStatus} onChange={setEditField('quotaErrorStatus')} fullWidth />
                          </Box>
                          {/* Edit row 4: count/time windows + degradation + seed */}
                          <Box sx={{ ...CHAOS_GRID_WIDE, mt: 0.5 }}>
                            <TextField size="small" label={uiText('Seed', '随机种子')} value={editForm.seed} onChange={setEditField('seed')} fullWidth />
                            <TextField size="small" label={uiText('Succeed first', '先成功的请求数')} value={editForm.succeedFirst} onChange={setEditField('succeedFirst')} fullWidth />
                            <TextField size="small" label={uiText('Fail count', '失败次数')} value={editForm.failRequestCount} onChange={setEditField('failRequestCount')} fullWidth />
                            <TextField size="small" label={uiText('Outage after ms', '多久后开始中断（毫秒）')} value={editForm.outageAfterMillis} onChange={setEditField('outageAfterMillis')} fullWidth />
                            <TextField size="small" label={uiText('Outage duration ms', '中断时长（毫秒）')} value={editForm.outageDurationMillis} onChange={setEditField('outageDurationMillis')} fullWidth />
                            <TextField size="small" label={uiText('Degradation ramp ms', '逐步降级时长（毫秒）')} value={editForm.degradationRampMillis} onChange={setEditField('degradationRampMillis')} fullWidth />
                          </Box>
                          {/* Edit row 5: GraphQL */}
                          <Box sx={{ ...CHAOS_GRID, mt: 0.5 }}>
                            <FormControlLabel
                              control={<Switch size="small" checked={editForm.graphqlErrors} onChange={setEditToggle('graphqlErrors')} />}
                              label={uiText('GraphQL errors', 'GraphQL 错误')}
                            />
                            {editForm.graphqlErrors && (
                              <>
                                <TextField size="small" label={uiText('Error message', '错误消息')} value={editForm.graphqlErrorMessage} onChange={setEditField('graphqlErrorMessage')} fullWidth />
                                <TextField size="small" label={uiText('Error code', '错误码')} value={editForm.graphqlErrorCode} onChange={setEditField('graphqlErrorCode')} fullWidth />
                                <FormControlLabel
                                  control={<Switch size="small" checked={editForm.graphqlNullifyData} onChange={setEditToggle('graphqlNullifyData')} />}
                                  label={uiText('Nullify data', '将 data 设为 null')}
                                />
                              </>
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                            <Button size="small" variant="contained" disabled={busy} onClick={handleApplyEdit}>{uiText('Apply', '应用')}</Button>
                            <Button size="small" onClick={handleCancelEdit}>{uiText('Cancel', '取消')}</Button>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* gRPC Chaos (combined panel: Health Status + Fault Injection) */}
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
          onClick={() => setGrpcPanelExpanded((v) => !v)}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {uiText('gRPC Chaos', 'gRPC 故障注入')}
          </Typography>
          <Chip size="small" label={uiText(`${grpcCombinedActiveCount} active`, `${grpcCombinedActiveCount} 项生效中`)} color={grpcCombinedActiveCount > 0 ? 'warning' : 'default'} variant="outlined" />
          <Box sx={{ flex: 1 }} />
          <Tooltip title={uiText('Clear all gRPC chaos: fault injection and health-status overrides', '清空所有 gRPC 故障配置和健康状态覆盖')}>
            <span>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteSweepIcon fontSize="small" />}
                disabled={busy || grpcCombinedActiveCount === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirm({
                    title: uiText('Clear all gRPC chaos?', '清空所有 gRPC 故障配置？'),
                    message: uiText(`This removes all gRPC fault injection profiles and health-status overrides (${grpcCombinedActiveCount} active). This cannot be undone.`, `此操作会移除全部 gRPC 故障配置和健康状态覆盖（${grpcCombinedActiveCount} 项生效中），且无法撤销。`),
                    confirmLabel: uiText('Clear gRPC chaos', '清空 gRPC 故障配置'),
                    onConfirm: () => {
                      // Clear both fault injection and health overrides so the section fully empties
                      // (parity with the HTTP/TCP panels); otherwise the "active" badge stays non-zero.
                      void runAction(async () => {
                        await clearGrpcChaos(connectionParams);
                        for (const svc of grpcHealthOverrides) {
                          await resetGrpcHealth(connectionParams, svc === '_default' ? '' : svc);
                        }
                      });
                    },
                  });
                }}
              >
                {uiText('Clear gRPC', '清空 gRPC 故障配置')}
              </Button>
            </span>
          </Tooltip>
          <IconButton size="small" aria-label={grpcPanelExpanded ? uiText('Collapse gRPC chaos', '收起 gRPC 故障配置') : uiText('Expand gRPC chaos', '展开 gRPC 故障配置')}>
            {grpcPanelExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
        <Collapse in={grpcPanelExpanded}>
          <Box sx={{ mt: 1 }}>

            {/* --- gRPC Health Status sub-section --- */}
            <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
                onClick={() => setGrpcHealthExpanded((v) => !v)}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {uiText('Health Status', '健康状态')}
                </Typography>
                <Chip size="small" label={uiText(`${grpcServices.length} services`, `${grpcServices.length} 个服务`)} variant="outlined" />
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" aria-label={grpcHealthExpanded ? uiText('Collapse gRPC health', '收起 gRPC 健康状态') : uiText('Expand gRPC health', '展开 gRPC 健康状态')}>
                  {grpcHealthExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={grpcHealthExpanded}>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {uiText('Force a service\'s gRPC health-check response (e.g. NOT_SERVING) to simulate an unhealthy or degraded service — exercising how clients and orchestrators (Kubernetes readiness/liveness probes) react to a failing dependency.', '强制服务的 gRPC 健康检查返回指定状态（如 NOT_SERVING），模拟服务异常或降级，观察客户端和 Kubernetes 就绪或存活探针如何响应。')}
                  </Typography>
                  {/* Set status form */}
                  <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <TextField
                      size="small"
                      label={uiText('Service name', '服务名称')}
                      placeholder="my.grpc.Service"
                      value={grpcNewService}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setGrpcNewService(e.target.value)}
                      sx={{ minWidth: 200 }}
                    />
                    <Select
                      size="small"
                      value={grpcNewStatus}
                      onChange={(e) => setGrpcNewStatus(e.target.value as ServingStatus)}
                      sx={{ minWidth: 160 }}
                    >
                      {SERVING_STATUSES.map((s) => (
                        <MenuItem key={s} value={s}>{s}</MenuItem>
                      ))}
                    </Select>
                    <Button size="small" variant="contained" disabled={busy || !grpcNewService.trim()} onClick={handleSetGrpcHealth}>
                      {uiText('Set Status', '设置状态')}
                    </Button>
                  </Box>
                  {/* Service list */}
                  {grpcServices.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {uiText('No gRPC health overrides set.', '尚未覆盖任何 gRPC 健康状态。')}
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>{uiText('Service', '服务')}</TableCell>
                            <TableCell>{uiText('Status', '状态')}</TableCell>
                            <TableCell align="right">{uiText('Actions', '操作')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {grpcServices.map((svc) => (
                            <TableRow key={svc}>
                              <TableCell>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{svc}</Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={grpcHealth[svc]}
                                  color={servingStatusColor(grpcHealth[svc]!)}
                                  sx={{ height: 20 }}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Tooltip title={uiText('Reset health override', '恢复健康检查状态')}>
                                  <span>
                                    <IconButton
                                      size="small"
                                      aria-label={uiText(`Reset health for ${svc}`, `恢复 ${svc} 的健康检查状态`)}
                                      disabled={busy}
                                      onClick={() => handleResetGrpcHealth(svc)}
                                    >
                                      <RestoreIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </Collapse>
            </Paper>

            {/* --- gRPC Fault Injection sub-section --- */}
            <Paper variant="outlined" sx={{ p: 1 }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
                onClick={() => setGrpcFaultExpanded((v) => !v)}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {uiText('Fault Injection', '故障注入')}
                </Typography>
                <Chip size="small" label={uiText(`${grpcChaosServices.length} services`, `${grpcChaosServices.length} 个服务`)} color={grpcChaosServices.length > 0 ? 'warning' : 'default'} variant="outlined" />
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" aria-label={grpcFaultExpanded ? uiText('Collapse gRPC fault injection', '收起 gRPC 故障注入') : uiText('Expand gRPC fault injection', '展开 gRPC 故障注入')}>
                  {grpcFaultExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={grpcFaultExpanded} unmountOnExit>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {uiText('Inject gRPC status errors (UNAVAILABLE, DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, …) and latency on matched RPC calls — distinct from the health-check status above.', '对匹配的 RPC 调用注入延迟或 gRPC 状态错误，例如 UNAVAILABLE、DEADLINE_EXCEEDED 和 RESOURCE_EXHAUSTED。此配置单独作用于 RPC 调用。')}
                  </Typography>

                  {/* gRPC Chaos Register form */}
                  <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">{uiText('Register gRPC chaos for a service', '为服务配置 gRPC 故障')}</Typography>
                    {/* Row 1: core fields */}
                    <Box sx={{ ...CHAOS_GRID, mt: 0.75 }}>
                      <TextField size="small" label={uiText('Service', '服务')} placeholder="my.grpc.Service" value={grpcChaosForm.service} onChange={setGrpcChaosField('service')} onKeyDown={(e) => { if (e.key === 'Enter') handleRegisterGrpcChaos(); }} fullWidth />
                      <Select
                        size="small"
                        value={grpcChaosForm.errorStatusCode}
                        onChange={(e) => setGrpcChaosForm((prev) => ({ ...prev, errorStatusCode: e.target.value }))}
                        fullWidth
                      >
                        {GRPC_STATUS_CODES.map((code) => (
                          <MenuItem key={code} value={code}>{code}</MenuItem>
                        ))}
                      </Select>
                      <TextField size="small" label={uiText('Error prob (0–1)', '错误概率（0–1）')} placeholder="0.5" value={grpcChaosForm.errorProbability} onChange={setGrpcChaosField('errorProbability')} fullWidth />
                      <TextField size="small" label={uiText('Error message', '错误消息')} placeholder="service unavailable" value={grpcChaosForm.errorMessage} onChange={setGrpcChaosField('errorMessage')} fullWidth />
                      <TextField size="small" label={uiText('Latency ms', '延迟（毫秒）')} placeholder="200" value={grpcChaosForm.latencyMs} onChange={setGrpcChaosField('latencyMs')} fullWidth />
                      <TextField size="small" label={uiText('TTL ms', '有效期（毫秒）')} placeholder="60000" value={grpcChaosForm.ttlMs} onChange={setGrpcChaosField('ttlMs')} fullWidth />
                    </Box>
                    {/* Row 2: quota + count-window + seed */}
                    <Box sx={{ ...CHAOS_GRID_WIDE, mt: 0.5 }}>
                      <TextField size="small" label={uiText('Quota name', '配额名称')} placeholder="rpc-quota" value={grpcChaosForm.quotaName} onChange={setGrpcChaosField('quotaName')} fullWidth />
                      <TextField size="small" label={uiText('Quota limit', '配额上限')} placeholder="100" value={grpcChaosForm.quotaLimit} onChange={setGrpcChaosField('quotaLimit')} fullWidth />
                      <TextField size="small" label={uiText('Quota window ms', '配额统计窗口（毫秒）')} placeholder="60000" value={grpcChaosForm.quotaWindowMillis} onChange={setGrpcChaosField('quotaWindowMillis')} fullWidth />
                      <TextField size="small" label={uiText('Seed', '随机种子')} placeholder="42" value={grpcChaosForm.seed} onChange={setGrpcChaosField('seed')} fullWidth />
                      <TextField size="small" label={uiText('Succeed first', '先成功的请求数')} placeholder="5" value={grpcChaosForm.succeedFirst} onChange={setGrpcChaosField('succeedFirst')} fullWidth />
                      <TextField size="small" label={uiText('Fail count', '失败次数')} placeholder="10" value={grpcChaosForm.failRequestCount} onChange={setGrpcChaosField('failRequestCount')} fullWidth />
                    </Box>
                    {/* Row 3: streaming/trailer faults */}
                    <Box sx={{ ...CHAOS_GRID_WIDE, mt: 0.5 }}>
                      <FormControlLabel control={<Switch size="small" checked={grpcChaosForm.omitGrpcStatus} onChange={setGrpcChaosToggle('omitGrpcStatus')} />} label={uiText('Omit grpc-status', '省略 grpc-status')} />
                      <FormControlLabel control={<Switch size="small" checked={grpcChaosForm.corruptGrpcStatus} onChange={setGrpcChaosToggle('corruptGrpcStatus')} />} label={uiText('Corrupt grpc-status', '破坏 grpc-status')} />
                      <TextField size="small" label={uiText('Abort after N msgs', '在指定消息数后中止')} placeholder="3" value={grpcChaosForm.abortAfterMessages} onChange={setGrpcChaosField('abortAfterMessages')} fullWidth />
                    </Box>
                    {/* Row 4: custom trailers textarea */}
                    <Box sx={{ mt: 0.5 }}>
                      <TextField
                        size="small"
                        label={uiText('Custom trailers (key=value per line)', '自定义尾部元数据（每行一个 key=value）')}
                        placeholder={'x-debug-id=abc123\nx-retry=true'}
                        value={grpcChaosForm.customTrailers}
                        onChange={setGrpcChaosField('customTrailers')}
                        multiline
                        minRows={2}
                        maxRows={4}
                        fullWidth
                      />
                    </Box>
                    <Box sx={{ display: 'flex', mt: 0.5 }}>
                      <Button variant="contained" size="small" disabled={busy} onClick={handleRegisterGrpcChaos} sx={{ ml: 'auto' }}>
                        {uiText('Register', '添加')}
                      </Button>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {uiText('Note: gRPC latency is applied on the fault path — pair it with an injected fault (error status, omit/corrupt grpc-status, or abort) rather than on its own.', 'gRPC 延迟只会随故障生效。请同时配置错误状态、缺失或损坏的 grpc-status，或中止操作。')}
                    </Typography>
                  </Paper>

                  {/* gRPC Chaos Active registrations */}
                  {grpcChaosServices.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {uiText('No gRPC fault injection chaos registered.', '尚未配置 gRPC 故障注入。')}
                    </Typography>
                  ) : (
                    <Box>
                      {grpcChaosServices.map((service) => {
                        const ttl = grpcChaosRemainingTtl(service);
                        return (
                          <Box key={service} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 200 }}>{service}</Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
                              {summarizeGrpcChaosProfile(grpcChaosData.services[service] ?? {}).map((part) => (
                                <Chip key={part} size="small" label={part} variant="outlined" />
                              ))}
                            </Box>
                            {ttl != null && (
                              <Chip size="small" color="warning" label={uiText(`auto-revert in ${formatTtl(ttl)}`, `${formatTtl(ttl)}后自动撤销`)} />
                            )}
                            <Tooltip title={uiText('Remove gRPC chaos for this service', '移除此服务的 gRPC 故障配置')}>
                              <span>
                                <IconButton
                                  size="small"
                                  aria-label={uiText(`Remove gRPC chaos for ${service}`, `移除 ${service} 的 gRPC 故障配置`)}
                                  disabled={busy}
                                  onClick={() => void runAction(() => removeGrpcChaos(connectionParams, service))}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Collapse>
            </Paper>

          </Box>
        </Collapse>
      </Paper>

      {/* TCP-Layer Chaos */}
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
          onClick={() => setTcpExpanded((v) => !v)}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {uiText('TCP-Layer Chaos', 'TCP 层故障注入')}
          </Typography>
          <Chip size="small" label={uiText(`${tcpHosts.length} hosts`, `${tcpHosts.length} 个主机`)} color={tcpHosts.length > 0 ? 'warning' : 'default'} variant="outlined" />
          <Box sx={{ flex: 1 }} />
          <Tooltip title={uiText('Clear all TCP chaos', '清空所有 TCP 故障配置')}>
            <span>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteSweepIcon fontSize="small" />}
                disabled={busy || tcpHosts.length === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirm({
                    title: uiText('Clear all TCP chaos?', '清空所有 TCP 故障配置？'),
                    message: uiText(`This removes TCP chaos profiles for all ${tcpHosts.length} registered host${tcpHosts.length === 1 ? '' : 's'}. This cannot be undone.`, `此操作会移除全部 ${tcpHosts.length} 个主机的 TCP 故障配置，且无法撤销。`),
                    confirmLabel: uiText('Clear TCP chaos', '清空 TCP 故障配置'),
                    onConfirm: () => void runAction(() => clearTcpChaos(connectionParams)),
                  });
                }}
              >
                {uiText('Clear TCP', '清空 TCP 故障配置')}
              </Button>
            </span>
          </Tooltip>
          <IconButton size="small" aria-label={tcpExpanded ? uiText('Collapse TCP chaos', '收起 TCP 故障配置') : uiText('Expand TCP chaos', '展开 TCP 故障配置')}>
            {tcpExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
        <Collapse in={tcpExpanded} unmountOnExit>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {uiText('Register one TCP chaos profile per upstream host; faults are applied at the raw byte level before HTTP decoding (latency, bandwidth, reset, timeout, etc.).', '每个上游主机可配置一条 TCP 故障规则，在 HTTP 解码前对原始字节流施加延迟、带宽限制、连接重置或超时。')}
            </Typography>

            {/* TCP Register form */}
            <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Register TCP chaos for a host', '为主机配置 TCP 故障')}</Typography>
              {/* Network-condition presets. Each sets exactly ONE fault: TcpChaosHandler
                  evaluates faults first-match-wins (down > reset_peer > limit_data >
                  slicer > bandwidth > latency) and silently discards the rest, so a
                  preset showing two numbers would advertise one the engine never applies.
                  Names like "3G" mean different things in different eras, so every option
                  carries its concrete value. */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
                <Select
                  size="small"
                  displayEmpty
                  value={tcpPresetId}
                  onChange={(e) => applyNetworkPreset(e.target.value)}
                  inputProps={{ 'aria-label': 'Network condition preset' }}
                  sx={{ minWidth: 300 }}
                >
                  <MenuItem value="">{uiText('Custom (no preset)', '自定义（无预设）')}</MenuItem>
                  {NETWORK_PRESETS.map((preset) => (
                    <MenuItem key={preset.id} value={preset.id}>
                      {`${preset.label} — ${summarizeNetworkPreset(preset)}`}
                    </MenuItem>
                  ))}
                </Select>
                {selectedTcpPreset && (
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
                    {`${selectedTcpPreset.label}: ${summarizeNetworkPreset(selectedTcpPreset)} — ${selectedTcpPreset.description}`}
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {uiText('Each preset sets one fault: only the highest-priority fault configured is applied (down > reset peer > limit > slicer > bandwidth > latency) and the rest are discarded. TCP faults shape inbound request bytes only — not the response — and latency is charged per read, not per round trip. There is no packet-loss or jitter fault; for loss use drop-connection probability in HTTP Service Chaos.', '每个预设只配置一种故障。配置多种故障时，仅应用优先级最高的一项：停用、重置对端、限制字节数、切分字节流、限制带宽、延迟。TCP 故障只作用于入站请求，延迟按每次读取计算。要模拟连接丢失，请设置 HTTP 故障注入中的断开连接概率。')}
              </Typography>
              <Box sx={{ ...CHAOS_GRID, mt: 0.75 }}>
                <TextField size="small" label={uiText('Host', '主机')} placeholder="upstream.svc" value={tcpForm.host} onChange={setTcpField('host')} onKeyDown={(e) => { if (e.key === 'Enter') handleRegisterTcp(); }} fullWidth />
                <TextField size="small" label={uiText('Latency ms', '延迟（毫秒）')} placeholder="200" value={tcpForm.latencyMs} onChange={setTcpField('latencyMs')} fullWidth />
                <TextField size="small" label={uiText('Bandwidth B/s', '带宽（字节/秒）')} placeholder="1024" value={tcpForm.bandwidthBytesPerSec} onChange={setTcpField('bandwidthBytesPerSec')} fullWidth />
                <TextField size="small" label={uiText('Slicer bytes', '每片字节数')} placeholder="64" value={tcpForm.slicerChunkSize} onChange={setTcpField('slicerChunkSize')} fullWidth />
                <TextField size="small" label={uiText('Limit bytes', '字节数上限')} placeholder="4096" value={tcpForm.limitDataBytes} onChange={setTcpField('limitDataBytes')} fullWidth />
                <TextField size="small" label={uiText('TTL ms', '有效期（毫秒）')} placeholder="60000" value={tcpForm.ttlMs} onChange={setTcpField('ttlMs')} fullWidth />
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <FormControlLabel control={<Switch size="small" checked={tcpForm.down} onChange={setTcpToggle('down')} />} label={uiText('Down', '停用连接')} />
                <FormControlLabel control={<Switch size="small" checked={tcpForm.resetPeer} onChange={setTcpToggle('resetPeer')} />} label={uiText('Reset peer', '重置对端连接')} />
                <FormControlLabel control={<Switch size="small" checked={tcpForm.slowClose} onChange={setTcpToggle('slowClose')} />} label={uiText('Slow close', '延迟关闭')} />
                <FormControlLabel control={<Switch size="small" checked={tcpForm.timeout} onChange={setTcpToggle('timeout')} />} label={uiText('Timeout', '超时')} />
              </Box>
              <Box sx={{ display: 'flex', mt: 0.5 }}>
                <Button variant="contained" size="small" disabled={busy} onClick={handleRegisterTcp} sx={{ ml: 'auto' }}>
                  {uiText('Register', '添加')}
                </Button>
              </Box>
            </Paper>

            {/* TCP Active registrations */}
            {tcpHosts.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {uiText('No TCP-layer chaos registered.', '尚未配置 TCP 层故障。')}
              </Typography>
            ) : (
              <Box>
                {tcpHosts.map((host) => {
                  const ttl = tcpRemainingTtl(host);
                  return (
                    <Box key={host} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
                      <Tooltip title={host}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 160, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{host}</Typography>
                      </Tooltip>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                        {summarizeTcpChaosProfile(tcpData.hosts[host] ?? {}).map((part) => (
                          <Chip key={part} size="small" label={part} variant="outlined" />
                        ))}
                      </Box>
                      {ttl != null && (
                        <Chip size="small" color="warning" label={uiText(`auto-revert in ${formatTtl(ttl)}`, `${formatTtl(ttl)}后自动撤销`)} />
                      )}
                      <Tooltip title={uiText('Remove TCP chaos for this host', '移除此主机的 TCP 故障配置')}>
                        <span>
                          <IconButton
                            size="small"
                            aria-label={uiText(`Remove TCP chaos for ${host}`, `移除 ${host} 的 TCP 故障配置`)}
                            disabled={busy}
                            onClick={() => void runAction(() => removeTcpChaos(connectionParams, host))}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Preemption Simulation */}
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
          onClick={() => setPreemptionExpanded((v) => !v)}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {uiText('Preemption Simulation', '节点抢占模拟')}
          </Typography>
          <Chip
            size="small"
            label={preemptionData.state}
            color={preemptionActive ? 'warning' : 'default'}
            variant="outlined"
          />
          <Box sx={{ flex: 1 }} />
          <Tooltip title={uiText('Uncordon: clear the preemption simulation', '解除封锁并清除抢占模拟')}>
            <span>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteSweepIcon fontSize="small" />}
                disabled={busy || !preemptionActive}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearPreemption();
                }}
              >
                {uiText('Clear Preemption', '清除抢占模拟')}
              </Button>
            </span>
          </Tooltip>
          <IconButton size="small" aria-label={preemptionExpanded ? uiText('Collapse preemption', '收起抢占模拟') : uiText('Expand preemption', '展开抢占模拟')}>
            {preemptionExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
        <Collapse in={preemptionExpanded} unmountOnExit>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {uiText('Simulate a Kubernetes node drain or Spot reclamation: the server cordons itself, turning away new exchanges with a 503 and/or signalling HTTP/2 clients to drain via GOAWAY, while in-flight requests finish. Add a TTL to auto-uncordon after a bounded window (a dead-man\'s switch). This is a simulation only — it never stops the server.', '模拟 Kubernetes 节点排空或 Spot 实例回收。服务器会继续处理在途请求，并以 503 拒绝新交互，或通过 GOAWAY 通知 HTTP/2 客户端排空连接。设置有效期可自动解除封锁。模拟期间服务器会继续运行。')}
            </Typography>

            {/* Current preemption state */}
            <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {uiText('Current State', '当前状态')}
                </Typography>
                <Chip size="small" label={preemptionData.state} color={preemptionActive ? 'warning' : 'default'} />
                {preemptionData.mode && (
                  <Typography variant="body2" color="text.secondary">
                    {uiText('mode', '模式')} {preemptionData.mode}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  {preemptionData.inFlight} {uiText('in-flight', '在途请求')}
                </Typography>
                {preemptionData.state === 'draining' && (
                  <Typography variant="body2" color="text.secondary">
                    {uiText('drain remaining', '剩余排空时间')} {formatDuration(preemptionData.drainRemainingMillis)}
                  </Typography>
                )}
              </Box>
            </Paper>

            {/* Start form */}
            <Paper variant="outlined" sx={{ p: 1 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Start a preemption simulation', '启动抢占模拟')}</Typography>
              <Box sx={{ ...CHAOS_GRID, mt: 0.75 }}>
                <Select
                  size="small"
                  value={preemptionForm.mode}
                  onChange={(e) => setPreemptionForm((prev) => ({ ...prev, mode: e.target.value as PreemptionMode }))}
                  inputProps={{ 'aria-label': 'Preemption mode' }}
                  fullWidth
                >
                  {PREEMPTION_MODES.map((m) => (
                    <MenuItem key={m} value={m}>{m}</MenuItem>
                  ))}
                </Select>
                <TextField size="small" label={uiText('Drain ms', '排空等待时间（毫秒）')} placeholder="30000" value={preemptionForm.drainMs} onChange={setPreemptionField('drainMs')} fullWidth />
                <TextField size="small" label={uiText('TTL ms', '有效期（毫秒）')} placeholder="60000" value={preemptionForm.ttlMs} onChange={setPreemptionField('ttlMs')} fullWidth />
              </Box>
              <Box sx={{ display: 'flex', mt: 0.5 }}>
                <Button variant="contained" size="small" disabled={busy} onClick={handleStartPreemption} sx={{ ml: 'auto' }}>
                  {uiText('Start Preemption', '启动抢占模拟')}
                </Button>
              </Box>
            </Paper>
          </Box>
        </Collapse>
      </Paper>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel ?? uiText('Confirm', '确认')}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />

      {/* Chaos Experiments */}
      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
          onClick={() => setExperimentsExpanded((v) => !v)}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {uiText('Experiments', '实验')}
          </Typography>
          <Chip
            size="small"
            label={
              isExperimentActive
                ? uiText('running', '运行中')
                : experimentStatus?.status === 'halted_by_auto_halt' || experimentStatus?.status === 'halted_by_slo_breach'
                  ? uiText('halted', '已停止')
                  : uiText('idle', '空闲')
            }
            color={
              isExperimentActive
                ? 'warning'
                : experimentStatus?.status === 'halted_by_auto_halt' || experimentStatus?.status === 'halted_by_slo_breach'
                  ? 'error'
                  : 'default'
            }
            variant="outlined"
          />
          <Box sx={{ flex: 1 }} />
          {isExperimentActive && (
            <Button
              size="small"
              color="error"
              startIcon={<StopIcon fontSize="small" />}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                handleStopExperiment();
              }}
            >
              {uiText('Stop', '停止')}
            </Button>
          )}
          <IconButton size="small" aria-label={experimentsExpanded ? uiText('Collapse experiments', '收起实验') : uiText('Expand experiments', '展开实验')}>
            {experimentsExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
        <Collapse in={experimentsExpanded} unmountOnExit>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {uiText('Define a multi-stage chaos experiment: ordered stages that progress automatically, each applying chaos profiles to upstream hosts for a specified duration.', '配置多阶段混沌实验。阶段按顺序自动运行，每个阶段在指定时间内对上游主机应用故障配置。')}
            </Typography>

            {/* Live status when an experiment is active or recently terminated */}
            {experimentStatus && experimentStatus.status !== 'none' && (
              <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {uiText('Experiment Status', '实验状态')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  {experimentStatus.name && (
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{experimentStatus.name}</Typography>
                  )}
                  <Chip
                    size="small"
                    label={experimentStatus.status.replace(/_/g, ' ')}
                    color={
                      experimentStatus.status === 'running' ? 'warning'
                        : experimentStatus.status === 'completed' ? 'success'
                          : experimentStatus.status === 'halted_by_auto_halt' || experimentStatus.status === 'halted_by_slo_breach' ? 'error'
                            : 'default'
                    }
                  />
                  {experimentStatus.totalStages > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {uiText('Stage', '阶段')} {experimentStatus.currentStageIndex + 1}/{experimentStatus.totalStages}
                    </Typography>
                  )}
                  {experimentStatus.loopIteration > 0 && (
                    <Chip size="small" label={uiText(`loop ${experimentStatus.loopIteration}`, `第 ${experimentStatus.loopIteration} 轮`)} variant="outlined" />
                  )}
                  <Box sx={{ flex: 1 }} />
                  {experimentStatus.experiment && (
                    <Button
                      size="small"
                      startIcon={<EditIcon fontSize="small" />}
                      onClick={() => loadExperimentIntoEditor(experimentStatus.experiment!)}
                    >
                      {uiText('Edit & restart', '编辑并重启')}
                    </Button>
                  )}
                </Box>
                {isExperimentActive && experimentStatus.totalStages > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {uiText('Stage elapsed:', '阶段已用时间')} {formatDuration(experimentStatus.stageElapsedMillis)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {uiText('Remaining:', '剩余时间')} {formatDuration(experimentStatus.stageRemainingMillis)}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={
                        experimentStatus.stageElapsedMillis + experimentStatus.stageRemainingMillis > 0
                          ? (experimentStatus.stageElapsedMillis / (experimentStatus.stageElapsedMillis + experimentStatus.stageRemainingMillis)) * 100
                          : 0
                      }
                      sx={{ height: 6, borderRadius: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {uiText('Total elapsed:', '总用时')} {formatDuration(experimentStatus.totalElapsedMillis)}
                    </Typography>
                  </Box>
                )}
                {/* Read-only view of the running experiment's stages */}
                {experimentStatus.experiment && experimentStatus.experiment.stages.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    {experimentStatus.experiment.stages.map((stage, idx) => {
                      const active = isExperimentActive && idx === experimentStatus.currentStageIndex;
                      return (
                        <Box
                          key={idx}
                          sx={{
                            px: 0.75,
                            py: 0.5,
                            mt: idx === 0 ? 0 : 0.5,
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: active ? 'warning.main' : 'divider',
                            bgcolor: active ? 'action.selected' : 'action.hover',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              {uiText('Stage', '阶段')} {idx + 1}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDuration(stage.durationMillis)}
                            </Typography>
                            {active && <Chip size="small" color="warning" label={uiText('active', '当前')} variant="outlined" />}
                          </Box>
                          {Object.entries(stage.profiles).map(([host, profile]) => (
                            <Box key={host} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                              <Tooltip title={host}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {host}
                                </Typography>
                              </Tooltip>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                {summarizeChaosProfile(profile).map((part) => (
                                  <Chip key={part} size="small" label={part} variant="outlined" />
                                ))}
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      );
                    })}
                  </Box>
                )}
                {/* Terminal SLO verdict (A1/A2): shown only when a verdict exists. */}
                {experimentStatus.experimentVerdict && (
                  <ExperimentVerdict verdict={experimentStatus.experimentVerdict} />
                )}
              </Paper>
            )}

            {/* Stage editor */}
            <Paper variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Define experiment', '配置实验')}</Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField
                  size="small"
                  label={uiText('Experiment name', '实验名称')}
                  placeholder="latency-then-errors"
                  value={expName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setExpName(e.target.value)}
                  sx={{ minWidth: 200 }}
                />
                <FormControlLabel
                  control={<Switch size="small" checked={expLoop} onChange={(_e, checked) => setExpLoop(checked)} />}
                  label={uiText('Loop', '循环')}
                />
              </Box>

              {expStages.map((stage, idx) => (
                <Paper key={stage.id} variant="outlined" sx={{ px: 0.75, pt: 1, pb: 0.75, mt: 0.75, bgcolor: 'action.hover' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.25 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      {uiText('Stage', '阶段')} {idx + 1}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    {expStages.length > 1 && (
                      <IconButton
                        size="small"
                        aria-label={uiText(`Remove stage ${idx + 1}`, `移除第 ${idx + 1} 阶段`)}
                        onClick={() => removeExpStage(idx)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <TextField size="small" label={uiText('Duration ms', '持续时间（毫秒）')} placeholder="10000" value={stage.durationMs} onChange={setExpStageField(idx, 'durationMs')} sx={responsiveWidth(120)} />
                    <TextField size="small" label={uiText('Host', '主机')} placeholder="upstream.svc" value={stage.host} onChange={setExpStageField(idx, 'host')} sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 160 } }} />
                    <TextField size="small" label={uiText('Error status', '错误状态码')} placeholder="503" value={stage.errorStatus} onChange={setExpStageField(idx, 'errorStatus')} sx={responsiveWidth(120)} />
                    <TextField size="small" label={uiText('Error prob (0-1)', '错误概率（0–1）')} placeholder="1.0" value={stage.errorProbability} onChange={setExpStageField(idx, 'errorProbability')} sx={responsiveWidth(140)} />
                    <TextField size="small" label={uiText('Latency ms', '延迟（毫秒）')} placeholder="500" value={stage.latencyMs} onChange={setExpStageField(idx, 'latencyMs')} sx={responsiveWidth(120)} />
                    <TextField size="small" label={uiText('Drop prob (0-1)', '断开连接概率（0–1）')} placeholder="0.2" value={stage.dropProbability} onChange={setExpStageField(idx, 'dropProbability')} sx={responsiveWidth(140)} />
                  </Box>
                </Paper>
              ))}

              <Box sx={{ display: 'flex', gap: 1, mt: 0.75, justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  startIcon={<AddIcon fontSize="small" />}
                  onClick={addExpStage}
                >
                  {uiText('Add Stage', '添加阶段')}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy}
                  onClick={handleSaveProfile}
                >
                  {uiText('Save as Profile', '保存为配置')}
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PlayArrowIcon fontSize="small" />}
                  disabled={busy}
                  onClick={handleStartExperiment}
                >
                  {uiText('Start Experiment', '启动实验')}
                </Button>
              </Box>

              {/* ADV3: saved chaos profile library */}
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {uiText('Saved Profiles', '已保存的配置')}
                </Typography>
                {savedProfiles.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {uiText('No saved profiles. Use "Save as Profile" to store the current experiment definition under its name for one-click re-use.', '暂无已保存的配置。点击「保存为配置」，按当前实验名称保存，之后可直接复用。')}
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {savedProfiles.map((name) => (
                      <Chip
                        key={name}
                        label={name}
                        size="small"
                        onClick={() => handleApplyProfile(name)}
                        onDelete={() => handleDeleteProfile(name)}
                        deleteIcon={<DeleteIcon fontSize="small" />}
                        title={uiText(`Apply saved profile "${name}" (click) or delete (x)`, `点击应用已保存的配置「${name}」，点击 × 删除`)}
                        disabled={busy}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            </Paper>

            {/* Experiment history (fetched on expand, not continuously polled) */}
            <Paper variant="outlined" sx={{ p: 1, mt: 1 }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
                onClick={() => setHistoryExpanded((v) => !v)}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {uiText('History', '历史记录')}
                </Typography>
                {historyData.length > 0 && (
                  <Chip size="small" label={uiText(`${historyData.length} run${historyData.length === 1 ? '' : 's'}`, `${historyData.length} 次运行`)} variant="outlined" />
                )}
                <Box sx={{ flex: 1 }} />
                <Tooltip title={uiText('Refresh history', '刷新历史记录')}>
                  <span>
                    <IconButton
                      size="small"
                      aria-label={uiText('Refresh history', '刷新历史记录')}
                      disabled={historyLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Ensure the section is open, then force a re-fetch. Opening the
                        // section already fetches; the tick covers the already-open case.
                        if (!historyExpanded) setHistoryExpanded(true);
                        else refreshHistory();
                      }}
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <IconButton size="small" aria-label={historyExpanded ? uiText('Collapse history', '收起历史记录') : uiText('Expand history', '展开历史记录')}>
                  {historyExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={historyExpanded} unmountOnExit>
                <Box sx={{ mt: 1 }}>
                  {historyData.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {historyLoading ? uiText('Loading history…', '正在加载历史记录…') : uiText('No past experiment runs.', '暂无实验运行记录。')}
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>{uiText('Name', '名称')}</TableCell>
                            <TableCell>{uiText('Status', '状态')}</TableCell>
                            <TableCell>{uiText('Verdict', '判定')}</TableCell>
                            <TableCell align="right">{uiText('Terminated', '结束时间')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {historyData.map((entry, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.name}</Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={entry.status.replace(/_/g, ' ')}
                                  color={historyStatusColor(entry.status)}
                                />
                              </TableCell>
                              <TableCell>
                                {entry.verdict
                                  ? <Chip size="small" color={sloResultColor(entry.verdict.result)} label={entry.verdict.result} />
                                  : <Typography variant="caption" color="text.secondary">—</Typography>}
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(entry.terminatedAtMillis).toLocaleString()}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </Collapse>
            </Paper>
          </Box>
        </Collapse>
      </Paper>
    </Box>
  );
}

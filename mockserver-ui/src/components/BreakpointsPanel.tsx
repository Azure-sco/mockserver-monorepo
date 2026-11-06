import { uiText } from '../lib/dashboardLocale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import MenuItem from '@mui/material/MenuItem';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import StopIcon from '@mui/icons-material/Stop';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import {
  listBreakpointMatchers,
  registerBreakpointMatcher,
  removeBreakpointMatcher,
  clearBreakpointMatchers,
  formatStatusRange,
  type BreakpointMatcherEntry,
  type MatcherPhase,
} from '../lib/breakpoints';
import {
  getBreakpointCallbackClient,
  correlationIdOf,
  utf8ToBase64,
  base64ToUtf8,
  type PausedItem,
  type StoredPausedItem,
  type CallbackClientState,
  type PausedStreamFrame,
  type StreamFrameDecision,
  type BreakpointReleaseNotice,
} from '../lib/breakpointCallbackClient';
import { MultiValueField, SingleValueField } from './FilterPanel';
import OperatorSearchField from './OperatorSearchField';
import {
  parseRequestScope,
  isApplicableScope,
  withHostHeaderRow,
  BREAKPOINT_SCOPE_FIELDS,
} from '../lib/filterScope';
import type { KeyToMultiValue, KeyToValue } from '../types';
import ConfirmDialog from './ConfirmDialog';
import TruncatedText from './TruncatedText';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { humanizeError } from '../lib/errorMessage';
import { useDashboardStore } from '../store';
import { trackFeature } from '../lib/analytics';

const MATCHERS_POLL_INTERVAL_MS = 5000;

interface BreakpointsPanelProps {
  connectionParams: ConnectionParams;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HTTP_METHODS = ['', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

const ALL_PHASES: { value: MatcherPhase; label: string }[] = [
  { value: 'REQUEST', label: uiText('Request', '请求') },
  { value: 'RESPONSE', label: uiText('Response', '响应') },
  { value: 'RESPONSE_STREAM', label: uiText('Response stream frames', '响应流帧') },
  { value: 'INBOUND_STREAM', label: uiText('Inbound stream frames', '入站流帧') },
];

/** A short description of a paused item for messages, e.g. "Request GET /api". */
function describePausedItem(item: PausedItem): string {
  if (item.phase === 'REQUEST' || item.phase === 'RESPONSE') {
    const target = `${item.request.method ?? ''} ${item.request.path ?? ''}`.trim();
    return item.phase === 'REQUEST' ? `Request ${target}` : `Response to ${target}`;
  }
  const target = `${item.frame.requestMethod ?? ''} ${item.frame.requestPath ?? ''}`.trim();
  return uiText(`Frame #${item.frame.sequenceNumber}${target ? ` of ${target}` : ''}`, `${target ? `${target} 的` : ''}第 ${item.frame.sequenceNumber} 帧`);
}

/** What to tell the user about a paused item MockServer resolved itself. */
function releaseNoticeText(notice: BreakpointReleaseNotice): string {
  return notice.item
    ? uiText(`${describePausedItem(notice.item)} is no longer paused. ${notice.message}`, `${describePausedItem(notice.item)}已不再暂停。${notice.message}`)
    : uiText(`Your decision was not applied: ${notice.message}`, `操作未生效：${notice.message}`);
}

/** A status-range bound typed in the form: blank is open, otherwise three digits. */
function parseStatusBound(text: string): number | undefined | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : 'invalid';
}

const GONE_FROM_DIALOG = uiText('This item is no longer paused, so the change cannot be applied.', '此项已不再暂停，无法应用修改。');

function phaseChipColor(phase: string): 'default' | 'primary' | 'secondary' | 'info' | 'warning' {
  switch (phase) {
    case 'REQUEST': return 'default';
    case 'RESPONSE': return 'secondary';
    case 'RESPONSE_STREAM': return 'info';
    case 'INBOUND_STREAM': return 'warning';
    default: return 'default';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BreakpointsPanel({ connectionParams }: BreakpointsPanelProps) {
  const [tab, setTab] = useState(0);

  // -- Matchers state --
  const [matchers, setMatchers] = useState<BreakpointMatcherEntry[]>([]);
  const [matchersError, setMatchersError] = useState<string | null>(null);

  // Registration form
  const [formMethod, setFormMethod] = useState('');
  const [formPath, setFormPath] = useState('');
  const [formHeaders, setFormHeaders] = useState<KeyToMultiValue[]>([{ name: '', values: [''] }]);
  const [formQueryParams, setFormQueryParams] = useState<KeyToMultiValue[]>([{ name: '', values: [''] }]);
  const [formCookies, setFormCookies] = useState<KeyToValue[]>([{ name: '', value: '' }]);
  const [formPhases, setFormPhases] = useState<Set<MatcherPhase>>(new Set(['REQUEST', 'RESPONSE']));
  const [formSkipCount, setFormSkipCount] = useState('');
  // Inclusive response status range (responseStatusCodeMin/Max). The server checks it
  // at the RESPONSE phase only; every other phase pauses regardless of status.
  const [formStatusMin, setFormStatusMin] = useState('');
  const [formStatusMax, setFormStatusMax] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter-DSL "quick scope" shorthand for the intercept condition. It FILLS the
  // fields below rather than replacing them: the form stays the single source of
  // truth (and keeps the full-regex Path field, the headers/query/cookie matchers
  // and the phase checkboxes, none of which the DSL can express).
  const [scopeTerm, setScopeTerm] = useState('');

  // -- Callback WS state --
  const [wsState, setWsState] = useState<CallbackClientState>('disconnected');
  const [clientId, setClientId] = useState<string | null>(null);
  // The panel remounts when the workspace target changes, so this is always the live target's client.
  const clientRef = useRef(getBreakpointCallbackClient(connectionParams));

  // -- Live paused items (from the client-owned store) --
  // The mount effect subscribes to the singleton client's store, which seeds
  // this immediately with anything buffered while the panel was unmounted
  // (navigated away) — so those items are shown on (re)mount, not lost.
  const [pausedItems, setPausedItems] = useState<StoredPausedItem[]>([]);

  // -- Action state --
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Confirmation dialog for destructive actions
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Confirmation for a matcher with no request fields, which pauses every request
  const [catchAllConfirmOpen, setCatchAllConfirmOpen] = useState(false);

  // The latest paused item MockServer resolved itself (e.g. the breakpoint timeout)
  const [releaseNotice, setReleaseNotice] = useState<BreakpointReleaseNotice | null>(null);

  // -- Modify dialogs --
  const [modifyTarget, setModifyTarget] = useState<(PausedItem & { key: number }) | null>(null);
  const [modifyJson, setModifyJson] = useState('');
  const [modifyError, setModifyError] = useState<string | null>(null);

  // Frame modify/inject
  const [frameModifyTarget, setFrameModifyTarget] = useState<(PausedItem & { key: number }) | null>(null);
  const [frameModifyBody, setFrameModifyBody] = useState('');
  const [frameModifyError, setFrameModifyError] = useState<string | null>(null);

  const [frameInjectTarget, setFrameInjectTarget] = useState<(PausedItem & { key: number }) | null>(null);
  const [frameInjectBody, setFrameInjectBody] = useState('');
  const [frameInjectError, setFrameInjectError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Callback WS lifecycle
  // -------------------------------------------------------------------------

  useEffect(() => {
    const client = clientRef.current;

    client.onStateChange((state) => {
      setWsState(state);
      setClientId(client.clientId);
      // NB: the paused-item store is cleared by the client itself on disconnect
      // (held items reference the previous clientId and can no longer be
      // resolved once a fresh clientId is issued on reconnect).
    });

    // Subscribe to the client-owned paused-item store. This seeds immediately
    // with anything buffered while the panel was unmounted (H1) and updates on
    // every push/removal. Unsubscribe on unmount so the stale setState is not
    // invoked, but leave the store (and its accumulation) intact.
    const unsubscribePausedItems = client.subscribePausedItems(setPausedItems);
    const unsubscribeReleaseNotices = client.subscribeReleaseNotices(setReleaseNotice);

    // Seed from the singleton so a re-mount after a tab change immediately
    // reflects the live connection + clientId (connect() below is idempotent and
    // will not fire a fresh state-change event when already connected).
    setWsState(client.state);
    setClientId(client.clientId);

    client.connect(connectionParams);

    // Intentionally NO disconnect on unmount: the callback WebSocket lives as long
    // as a workspace targets its server. Keeping it open across tab changes preserves the
    // server clientId and the breakpoint matchers registered under it, so
    // breakpoints stay active and registered when navigating away from and back
    // to this tab. Only the store subscriptions are torn down.
    return () => {
      unsubscribePausedItems();
      unsubscribeReleaseNotices();
    };
  }, [connectionParams]);

  // An open Modify / Inject dialog whose item MockServer has just resolved says so at once.
  // Syncing dialog state from the external WS notice is the case the effect rule exempts.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!releaseNotice?.item) return;
    const gone = releaseNotice.correlationId;
    if (modifyTarget && correlationIdOf(modifyTarget) === gone) setModifyError(GONE_FROM_DIALOG);
    if (frameModifyTarget && correlationIdOf(frameModifyTarget) === gone) setFrameModifyError(GONE_FROM_DIALOG);
    if (frameInjectTarget && correlationIdOf(frameInjectTarget) === gone) setFrameInjectError(GONE_FROM_DIALOG);
  }, [releaseNotice, modifyTarget, frameModifyTarget, frameInjectTarget]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // -------------------------------------------------------------------------
  // Matchers polling (auto-refresh the read-only registered-matcher list)
  // -------------------------------------------------------------------------

  const loadMatchers = useCallback(async (signal?: AbortSignal) => {
    try {
      const resp = await listBreakpointMatchers(connectionParams, signal);
      setMatchers(resp.matchers ?? []);
      setMatchersError(null);
    } catch (e) {
      if (signal?.aborted) return;
      setMatchersError(e instanceof Error ? e.message : String(e));
    }
  }, [connectionParams]);

  useAutoRefresh(loadMatchers, { intervalMs: MATCHERS_POLL_INTERVAL_MS });

  // Manual force-refresh (the existing Refresh button) — same fetch, off-cycle.
  const refreshMatchers = useCallback(() => {
    void loadMatchers();
  }, [loadMatchers]);

  // -------------------------------------------------------------------------
  // "Set breakpoint" handoff from a log row
  // -------------------------------------------------------------------------
  // When the user clicks "Set breakpoint" on a log entry, the store carries the
  // request's method + path here. Seed the registration form with it, jump to the
  // Matchers tab so the form is visible, and clear the handoff so it applies once.
  const breakpointPrefill = useDashboardStore((s) => s.pendingBreakpointPrefill);
  const clearBreakpointPrefill = useDashboardStore((s) => s.clearPendingBreakpointPrefill);

  useEffect(() => {
    // Always clear the one-shot hand-off when this effect tears down (unmount or
    // a new prefill), so a prefill can never survive the panel being unmounted
    // mid-apply and get re-applied on a later re-mount.
    if (!breakpointPrefill) return clearBreakpointPrefill;
    const { method, path } = breakpointPrefill;
    // Consuming a one-shot hand-off from the Zustand store IS the legitimate
    // "sync React state from an external system" case the rule exempts; the
    // effect clears the signal at the end so it runs exactly once per hand-off.
    // (Same pattern the Composer uses to consume its pending-edit hand-off.)
    // setTab/setFormMethod/setFormPath are all this same deliberate sync.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTab(0);
    // Only adopt a method the form's dropdown actually offers; otherwise leave it
    // as "(any)" rather than setting an unselectable value.
    if (method && (HTTP_METHODS as readonly string[]).includes(method.toUpperCase())) {
      setFormMethod(method.toUpperCase());
    }
    if (path) setFormPath(path);
    /* eslint-enable react-hooks/set-state-in-effect */
    clearBreakpointPrefill();
    return clearBreakpointPrefill;
  }, [breakpointPrefill, clearBreakpointPrefill]);

  // -------------------------------------------------------------------------
  // Matcher registration
  // -------------------------------------------------------------------------

  // Quick scope: the filter-DSL shorthand, translated into the fields below.
  const parsedScope = useMemo(() => parseRequestScope(scopeTerm, BREAKPOINT_SCOPE_FIELDS), [scopeTerm]);
  // The Method control is a fixed dropdown, so a method outside it could not be
  // shown (MUI would render a blank Select). Say so rather than dropping it.
  const scopeMethodUnknown =
    parsedScope.scope.method != null &&
    !(HTTP_METHODS as readonly string[]).includes(parsedScope.scope.method);
  const scopeApplicable = isApplicableScope(parsedScope) && !scopeMethodUnknown;
  // `unsupportedFields` is already explained in the input's own helper text, so
  // only the other refusals get a message here — never two for one mistake.
  const scopeMessage = scopeMethodUnknown
    ? `method:${parsedScope.scope.method} is not one of ${HTTP_METHODS.filter(Boolean).join(', ')}.`
    : parsedScope.error;

  const applyScope = useCallback(() => {
    const { method, path, host, statusMin, statusMax } = parsedScope.scope;
    if (method) setFormMethod(method);
    if (path) setFormPath(path);
    if (host) setFormHeaders((prev) => withHostHeaderRow(prev, host));
    if (statusMin != null || statusMax != null) {
      setFormStatusMin(statusMin != null ? String(statusMin) : '');
      setFormStatusMax(statusMax != null ? String(statusMax) : '');
      // A status is only known once there is a response, so the scope means
      // "break on these responses"; a ticked Request phase would pause every request.
      setFormPhases(new Set(['RESPONSE']));
    }
    setScopeTerm('');
  }, [parsedScope]);

  const handleRegister = useCallback(async (confirmedCatchAll = false) => {
    if (!clientId) {
      setFormError(uiText('Callback WebSocket not connected. Wait for the connection to establish.', '回调 WebSocket 尚未连接，请等待连接建立。'));
      return;
    }
    if (formPhases.size === 0) {
      setFormError(uiText('At least one phase must be selected.', '至少选择一个阶段。'));
      return;
    }
    const statusMin = parseStatusBound(formStatusMin);
    const statusMax = parseStatusBound(formStatusMax);
    if (statusMin === 'invalid' || statusMax === 'invalid') {
      setFormError(uiText('A response status must be a whole number from 0 to 999.', '响应状态码必须为 0 至 999 之间的整数。'));
      return;
    }
    const hasStatusRange = statusMin != null || statusMax != null;
    if (statusMin != null && statusMax != null && statusMin > statusMax) {
      setFormError(uiText('The minimum response status must not be greater than the maximum.', '最小响应状态码不能大于最大响应状态码。'));
      return;
    }
    if (hasStatusRange && !formPhases.has('RESPONSE')) {
      setFormError(uiText('A response status range is checked only at the Response phase, so tick Response.', '状态码范围仅在响应阶段检查，请勾选「响应」。'));
      return;
    }
    const httpRequest: Record<string, unknown> = {};
    if (formMethod) httpRequest.method = formMethod;
    if (formPath) httpRequest.path = formPath;
    const validHeaders = formHeaders
      .map((h) => ({ name: h.name, values: h.values.filter((v) => v !== '') }))
      .filter((h) => h.name && h.values.length > 0);
    if (validHeaders.length > 0) httpRequest.headers = validHeaders;
    const validParams = formQueryParams
      .map((q) => ({ name: q.name, values: q.values.filter((v) => v !== '') }))
      .filter((q) => q.name && q.values.length > 0);
    if (validParams.length > 0) httpRequest.queryStringParameters = validParams;
    const validCookies = formCookies.filter((c) => c.name && c.value);
    if (validCookies.length > 0) httpRequest.cookies = validCookies;
    // No fields matches everything, which pauses all traffic, so it must be confirmed.
    // A status range on a Response-only matcher narrows it, so that needs no confirming.
    const narrowedByStatus = hasStatusRange && formPhases.size === 1;
    if (Object.keys(httpRequest).length === 0) {
      if (!confirmedCatchAll && !narrowedByStatus) {
        setFormError(null);
        setCatchAllConfirmOpen(true);
        return;
      }
      httpRequest.path = '.*';
    }

    // Optional Nth-hit / skip-count: pause only after this many matching hits.
    let skipCount: number | undefined;
    if (formSkipCount.trim() !== '') {
      const parsed = Number(formSkipCount);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setFormError(uiText('Skip count must be a non-negative integer.', '跳过次数必须为非负整数。'));
        return;
      }
      skipCount = parsed;
    }

    setFormBusy(true);
    setFormError(null);
    try {
      await registerBreakpointMatcher(
        connectionParams,
        httpRequest,
        [...formPhases],
        clientId,
        skipCount,
        { min: statusMin, max: statusMax },
      );
      trackFeature('breakpoint_set');
      refreshMatchers();
      // Reset form
      setFormMethod('');
      setFormPath('');
      setFormHeaders([{ name: '', values: [''] }]);
      setFormQueryParams([{ name: '', values: [''] }]);
      setFormCookies([{ name: '', value: '' }]);
      setFormSkipCount('');
      setFormStatusMin('');
      setFormStatusMax('');
    } catch (e) {
      setFormError(humanizeError(e).message);
    } finally {
      setFormBusy(false);
    }
  }, [connectionParams, clientId, formMethod, formPath, formHeaders, formQueryParams, formCookies, formPhases, formSkipCount, formStatusMin, formStatusMax, refreshMatchers]);

  const handleRemoveMatcher = useCallback(async (id: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await removeBreakpointMatcher(connectionParams, id);
      refreshMatchers();
    } catch (e) {
      setActionError(humanizeError(e).message);
    } finally {
      setBusy(false);
    }
  }, [connectionParams, refreshMatchers]);

  const handleClearMatchers = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      await clearBreakpointMatchers(connectionParams);
      refreshMatchers();
    } catch (e) {
      setActionError(humanizeError(e).message);
    } finally {
      setBusy(false);
    }
  }, [connectionParams, refreshMatchers]);

  const togglePhase = useCallback((phase: MatcherPhase) => {
    setFormPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // WS-based resolution (exchanges)
  // -------------------------------------------------------------------------

  const removeItem = useCallback((key: number) => {
    // Remove from the client-owned store; the store subscription updates local state.
    clientRef.current.removePausedItem(key);
  }, []);

  const handleContinueExchange = useCallback((item: PausedItem & { key: number }) => {
    const client = clientRef.current;
    if (item.phase === 'REQUEST') {
      client.resolveRequest(item.correlationId, item.request);
    } else if (item.phase === 'RESPONSE') {
      client.resolveResponse(item.correlationId, item.response ?? {});
    }
    removeItem(item.key);
  }, [removeItem]);

  const handleAbortExchange = useCallback((item: PausedItem & { key: number }) => {
    // Abort only genuinely applies to the REQUEST phase, where it sends an
    // HttpResponse instead of forwarding. There is no way to abort a RESPONSE
    // (the upstream response has already been received), so the Abort control is
    // not rendered for RESPONSE-phase items — this is a defensive no-op for them.
    if (item.phase === 'REQUEST') {
      clientRef.current.resolveRequest(item.correlationId, {
        statusCode: 503,
        body: 'Aborted by breakpoint',
      });
      removeItem(item.key);
    }
  }, [removeItem]);

  const openModifyExchangeDialog = useCallback((item: PausedItem & { key: number }) => {
    setModifyTarget(item);
    if (item.phase === 'RESPONSE') {
      setModifyJson(JSON.stringify(item.response ?? {}, null, 2));
    } else if (item.phase === 'REQUEST') {
      setModifyJson(JSON.stringify(item.request ?? {}, null, 2));
    }
    setModifyError(null);
  }, []);

  const handleModifySubmit = useCallback(() => {
    if (!modifyTarget) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(modifyJson) as Record<string, unknown>;
    } catch {
      setModifyError(uiText('Invalid JSON', 'JSON 格式无效'));
      return;
    }
    const client = clientRef.current;
    if (!client.isPaused(correlationIdOf(modifyTarget))) {
      setModifyError(GONE_FROM_DIALOG);
      return;
    }
    if (modifyTarget.phase === 'REQUEST') {
      client.resolveRequest(modifyTarget.correlationId, parsed);
    } else if (modifyTarget.phase === 'RESPONSE') {
      client.resolveResponse(modifyTarget.correlationId, parsed);
    }
    removeItem(modifyTarget.key);
    setModifyTarget(null);
  }, [modifyTarget, modifyJson, removeItem]);

  // -------------------------------------------------------------------------
  // WS-based resolution (frames)
  // -------------------------------------------------------------------------

  const resolveFrame = useCallback((item: PausedItem & { key: number }, decision: StreamFrameDecision) => {
    clientRef.current.resolveFrame(decision);
    removeItem(item.key);
  }, [removeItem]);

  const handleFrameContinue = useCallback((item: PausedItem & { key: number }) => {
    if (item.phase !== 'RESPONSE_STREAM' && item.phase !== 'INBOUND_STREAM') return;
    resolveFrame(item, { correlationId: item.frame.correlationId, action: 'CONTINUE' });
  }, [resolveFrame]);

  const handleFrameDrop = useCallback((item: PausedItem & { key: number }) => {
    if (item.phase !== 'RESPONSE_STREAM' && item.phase !== 'INBOUND_STREAM') return;
    resolveFrame(item, { correlationId: item.frame.correlationId, action: 'DROP' });
  }, [resolveFrame]);

  const handleFrameClose = useCallback((item: PausedItem & { key: number }) => {
    if (item.phase !== 'RESPONSE_STREAM' && item.phase !== 'INBOUND_STREAM') return;
    resolveFrame(item, { correlationId: item.frame.correlationId, action: 'CLOSE' });
  }, [resolveFrame]);

  const openFrameModifyDialog = useCallback((item: PausedItem & { key: number }) => {
    setFrameModifyTarget(item);
    if (item.phase === 'RESPONSE_STREAM' || item.phase === 'INBOUND_STREAM') {
      // Decode base64 body for display (UTF-8-safe: atob alone mojibakes
      // multi-byte UTF-8, e.g. emoji / typographic quotes in LLM streams).
      try {
        setFrameModifyBody(base64ToUtf8(item.frame.body));
      } catch {
        setFrameModifyBody(item.frame.body);
      }
    }
    setFrameModifyError(null);
  }, []);

  const handleFrameModifySubmit = useCallback(() => {
    if (!frameModifyTarget) return;
    if (!frameModifyBody) {
      setFrameModifyError(uiText('Body is required', '请输入内容'));
      return;
    }
    if (frameModifyTarget.phase !== 'RESPONSE_STREAM' && frameModifyTarget.phase !== 'INBOUND_STREAM') return;
    if (!clientRef.current.isPaused(frameModifyTarget.frame.correlationId)) {
      setFrameModifyError(GONE_FROM_DIALOG);
      return;
    }
    // UTF-8-safe encode inside try/catch: surface any encoding failure in the
    // dialog rather than throwing out of the onClick and leaving it silently open.
    let encoded: string;
    try {
      encoded = utf8ToBase64(frameModifyBody);
    } catch (e) {
      setFrameModifyError(e instanceof Error ? e.message : uiText('Could not encode frame body', '无法编码帧内容'));
      return;
    }
    resolveFrame(frameModifyTarget, {
      correlationId: frameModifyTarget.frame.correlationId,
      action: 'MODIFY',
      body: encoded,
    });
    setFrameModifyTarget(null);
  }, [frameModifyTarget, frameModifyBody, resolveFrame]);

  const openFrameInjectDialog = useCallback((item: PausedItem & { key: number }) => {
    setFrameInjectTarget(item);
    setFrameInjectBody('');
    setFrameInjectError(null);
  }, []);

  const handleFrameInjectSubmit = useCallback(() => {
    if (!frameInjectTarget) return;
    if (!frameInjectBody) {
      setFrameInjectError(uiText('Body is required', '请输入内容'));
      return;
    }
    if (frameInjectTarget.phase !== 'RESPONSE_STREAM' && frameInjectTarget.phase !== 'INBOUND_STREAM') return;
    if (!clientRef.current.isPaused(frameInjectTarget.frame.correlationId)) {
      setFrameInjectError(GONE_FROM_DIALOG);
      return;
    }
    // UTF-8-safe encode inside try/catch: surface any encoding failure in the
    // dialog rather than throwing out of the onClick and leaving it silently open.
    let encoded: string;
    try {
      encoded = utf8ToBase64(frameInjectBody);
    } catch (e) {
      setFrameInjectError(e instanceof Error ? e.message : uiText('Could not encode frame body', '无法编码帧内容'));
      return;
    }
    resolveFrame(frameInjectTarget, {
      correlationId: frameInjectTarget.frame.correlationId,
      action: 'INJECT',
      body: encoded,
    });
    setFrameInjectTarget(null);
  }, [frameInjectTarget, frameInjectBody, resolveFrame]);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  // Sort by the server-side request timestamp (when MockServer first received the
  // request) so all phases of the same exchange stay grouped together.  Fall back
  // to the client-captured `receivedAt` for servers that do not yet send the header.
  // The monotonic `key` is the final tiebreaker.
  const sortKey = (item: PausedItem & { key: number; receivedAt: number }): number => {
    if (item.phase === 'REQUEST' || item.phase === 'RESPONSE') {
      return item.requestTimestamp ?? item.receivedAt;
    }
    // RESPONSE_STREAM / INBOUND_STREAM
    return (item as unknown as { frame: PausedStreamFrame }).frame.requestTimestamp ?? item.receivedAt;
  };
  const byRequestTime = (
    a: PausedItem & { key: number; receivedAt: number },
    b: PausedItem & { key: number; receivedAt: number },
  ): number => sortKey(a) - sortKey(b) || a.key - b.key;
  const exchangeItems = pausedItems
    .filter((i) => i.phase === 'REQUEST' || i.phase === 'RESPONSE')
    .sort(byRequestTime);
  const frameItems = (
    pausedItems.filter((i) => i.phase === 'RESPONSE_STREAM' || i.phase === 'INBOUND_STREAM') as (PausedItem & { key: number; receivedAt: number; phase: 'RESPONSE_STREAM' | 'INBOUND_STREAM'; frame: PausedStreamFrame })[]
  ).sort(byRequestTime);

  const wsIndicatorColor = wsState === 'connected' ? 'success' : wsState === 'connecting' ? 'warning' : 'error';

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {uiText('Breakpoints', '断点')}
        </Typography>
        <Tooltip title={uiText(`Callback WS: ${wsState}${clientId ? ` (${clientId.substring(0, 8)}...)` : ''}`, `回调 WebSocket：${wsState}${clientId ? ` (${clientId.substring(0, 8)}...)` : ''}`)}>
          <FiberManualRecordIcon
            fontSize="small"
            color={wsIndicatorColor as 'success' | 'warning' | 'error'}
            data-testid="ws-indicator"
          />
        </Tooltip>
        {pausedItems.length > 0 && (
          <Chip
            size="small"
            label={uiText(`${pausedItems.length} paused`, `${pausedItems.length} 项已暂停`)}
            color="warning"
            variant="outlined"
          />
        )}
        <Box sx={{ flex: 1 }} />
      </Box>

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 1.5 }}>
        <Tab label={uiText('Matchers', '匹配条件')} />
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {uiText('Live Exchanges', '实时交互')}
              {exchangeItems.length > 0 && (
                <Chip size="small" label={exchangeItems.length} color="warning" sx={{ height: 18, fontSize: '0.65rem' }} />
              )}
            </Box>
          }
        />
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {uiText('Live Streams', '实时流')}
              {frameItems.length > 0 && (
                <Chip size="small" label={frameItems.length} color="warning" sx={{ height: 18, fontSize: '0.65rem' }} />
              )}
            </Box>
          }
        />
      </Tabs>

      {actionError && (
        <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {releaseNotice && (
        <Alert
          severity={releaseNotice.actionIgnored ? 'warning' : 'info'}
          sx={{ mb: 1.5 }}
          onClose={() => setReleaseNotice(null)}
          data-testid="breakpoint-release-notice"
        >
          {releaseNoticeText(releaseNotice)}
        </Alert>
      )}

      {/* ============ TAB 0: Matchers ============ */}
      {tab === 0 && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {uiText('Register breakpoint matchers to pause proxied/forwarded exchanges that match. The dashboard resolves them interactively over the callback WebSocket.', '添加断点匹配条件，可暂停符合条件的代理或转发交互，并通过回调 WebSocket 在控制台中继续处理。')}
          </Typography>
          <Alert severity="info" variant="outlined" sx={{ mb: 1.5, py: 0.25 }}>
            {uiText('How it works: 1) add a matcher here → 2) send a matching request through MockServer → 3) it pauses in the', '使用方法：先添加匹配条件，再通过 MockServer 发送符合条件的请求，暂停后在')} <strong>{uiText('Live Exchanges', '实时交互')}</strong> {uiText('tab (or', '（或')} <strong>{uiText('Live Streams', '实时流')}</strong> {uiText('for stream frames), where you continue, modify, or abort it. Registering a matcher needs the callback WebSocket connected', '，用于处理流帧）中继续、修改或中止交互。添加匹配条件前需要连接回调 WebSocket')}{wsState === 'connected' ? '' : uiText(` (currently ${wsState})`, `（当前状态：${wsState}）`)}.
          </Alert>

          {/* Registration form */}
          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {uiText('Register a New Breakpoint Matcher', '添加断点匹配条件')}
            </Typography>
            {/* Quick scope — the same filter-DSL operator syntax as the Traffic and
                dashboard search boxes, narrowed to the operators a breakpoint matcher
                can genuinely intercept on. Applying FILLS the fields below (a glob
                becomes the equivalent regex) so what will be registered stays visible
                and editable; the richer matchers keep their own controls. */}
            <Box sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <OperatorSearchField
                id="breakpoint-scope"
                ariaLabel={uiText('Breakpoint scope', '断点范围')}
                value={scopeTerm}
                onChange={setScopeTerm}
                fields={BREAKPOINT_SCOPE_FIELDS}
                maxWidth={520}
                sx={{ ml: 0, flex: 1, minWidth: 240 }}
              />
              <Button
                size="small"
                variant="outlined"
                disabled={!scopeApplicable || formBusy}
                onClick={applyScope}
              >
                {uiText('Apply scope', '应用范围')}
              </Button>
            </Box>
            {scopeMessage && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                {scopeMessage}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <TextField
                select
                label={uiText('Method', '请求方法')}
                value={formMethod}
                onChange={(e) => setFormMethod(e.target.value)}
                size="small"
                sx={{ width: 140, flexShrink: 0 }}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                {HTTP_METHODS.map((m) => (
                  <MenuItem key={m || '__any'} value={m}>
                    {m || uiText('(any)', '（不限）')}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={uiText('Path (regex)', '路径（正则表达式）')}
                value={formPath}
                onChange={(e) => setFormPath(e.target.value)}
                size="small"
                placeholder="/api/.*"
                sx={{ flex: 1, minWidth: 200 }}
              />
              <TextField
                label={uiText('Skip count', '跳过次数')}
                value={formSkipCount}
                onChange={(e) => setFormSkipCount(e.target.value)}
                size="small"
                type="number"
                placeholder="0"
                title={uiText('Pause only after this many matching hits (0 / blank = pause every time)', '跳过指定次数的匹配后才暂停（填 0 或留空表示每次都暂停）')}
                slotProps={{ htmlInput: { min: 0, step: 1 }, inputLabel: { shrink: true } }}
                sx={{ width: 120, flexShrink: 0 }}
              />
              <TextField
                label={uiText('Min status', '最小状态码')}
                value={formStatusMin}
                onChange={(e) => setFormStatusMin(e.target.value)}
                size="small"
                type="number"
                placeholder={uiText('any', '不限')}
                title={uiText('Pause a response only when its status code is at least this (checked at the Response phase only)', '仅暂停状态码大于或等于此值的响应（仅在响应阶段检查）')}
                slotProps={{ htmlInput: { min: 0, max: 999, step: 1 }, inputLabel: { shrink: true } }}
                sx={{ width: 110, flexShrink: 0 }}
              />
              <TextField
                label={uiText('Max status', '最大状态码')}
                value={formStatusMax}
                onChange={(e) => setFormStatusMax(e.target.value)}
                size="small"
                type="number"
                placeholder={uiText('any', '不限')}
                title={uiText('Pause a response only when its status code is at most this (checked at the Response phase only)', '仅暂停状态码小于或等于此值的响应（仅在响应阶段检查）')}
                slotProps={{ htmlInput: { min: 0, max: 999, step: 1 }, inputLabel: { shrink: true } }}
                sx={{ width: 110, flexShrink: 0 }}
              />
            </Box>
            <MultiValueField label={uiText('Headers', '请求头')} items={formHeaders} onChange={setFormHeaders} disabled={formBusy} />
            <MultiValueField label={uiText('Query parameters', '查询参数')} items={formQueryParams} onChange={setFormQueryParams} disabled={formBusy} />
            <SingleValueField label="Cookies" items={formCookies} onChange={setFormCookies} disabled={formBusy} />
            <FormGroup row sx={{ mb: 1 }}>
              {ALL_PHASES.map((p) => (
                <FormControlLabel
                  key={p.value}
                  control={
                    <Checkbox
                      size="small"
                      checked={formPhases.has(p.value)}
                      onChange={() => togglePhase(p.value)}
                    />
                  }
                  label={<Typography variant="body2">{p.label}</Typography>}
                />
              ))}
            </FormGroup>
            {(formStatusMin.trim() !== '' || formStatusMax.trim() !== '') &&
              [...formPhases].some((p) => p !== 'RESPONSE') && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {uiText('The status range is checked at the Response phase only; the other ticked phases pause regardless of status.', '状态码范围仅在响应阶段检查，其他勾选的阶段不受此范围限制。')}
              </Typography>
            )}
            {formError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {formError}
              </Alert>
            )}
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              disabled={formBusy || wsState !== 'connected'}
              onClick={() => void handleRegister()}
            >
              {uiText('Register Matcher', '添加匹配条件')}
            </Button>
          </Paper>

          {/* Matcher list */}
          {matchersError && (
            <Alert
              severity={matchersError.includes('404') || matchersError.includes('Not Found') ? 'info' : 'error'}
              sx={{ mb: 1.5 }}
            >
              <AlertTitle>
                {matchersError.includes('404') || matchersError.includes('Not Found')
                  ? uiText('Breakpoint matchers not available', '断点匹配条件不可用')
                  : uiText('Could not load matchers', '无法加载匹配条件')}
              </AlertTitle>
              {matchersError.includes('404') || matchersError.includes('Not Found')
                ? uiText('The connected server does not support breakpoint matchers. This feature requires a newer version of MockServer.', '当前连接的服务器不支持断点匹配条件。此功能需要更新版本的 MockServer。')
                : matchersError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {uiText('Registered Matchers (', '已添加的匹配条件（')}{matchers.length})
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Tooltip title={uiText('Refresh matchers', '刷新匹配条件')}>
              <IconButton size="small" onClick={refreshMatchers} aria-label={uiText('Refresh matchers', '刷新匹配条件')}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {matchers.length > 0 && (
              <Tooltip title={uiText('Clear all matchers', '清空匹配条件')}>
                <span>
                  <IconButton size="small" onClick={() => setConfirmOpen(true)} disabled={busy} aria-label={uiText('Clear all matchers', '清空匹配条件')}>
                    <ClearAllIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>

          <Paper variant="outlined" sx={{ p: 1.25 }}>
            {matchers.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                {uiText('No matchers registered yet. Add one above, then send a matching request — it will pause in the Live Exchanges tab for you to inspect and resolve.', '还没有断点匹配条件。请在上方添加条件，再发送符合条件的请求。请求暂停后，可在「实时交互」中查看和处理。')}
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>{uiText('Matcher', '匹配条件')}</TableCell>
                      <TableCell>{uiText('Phases', '阶段')}</TableCell>
                      <TableCell align="right">{uiText('Skip', '跳过次数')}</TableCell>
                      <TableCell>{uiText('Owner', '所有者')}</TableCell>
                      <TableCell align="right">{uiText('Actions', '操作')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {matchers.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <TruncatedText text={m.id} maxWidth={120} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {m.httpRequest ? `${(m.httpRequest.method as string) ?? '*'} ${(m.httpRequest.path as string) ?? '/'}` : '*'}
                          </Typography>
                          {formatStatusRange(m.responseStatusCodeMin, m.responseStatusCodeMax) && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={formatStatusRange(m.responseStatusCodeMin, m.responseStatusCodeMax)}
                              sx={{ ml: 0.5, height: 20, fontSize: '0.6rem' }}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {(m.phases ?? []).map((p) => (
                              <Chip
                                key={p}
                                size="small"
                                label={p}
                                color={phaseChipColor(p)}
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.6rem' }}
                              />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {m.skipCount && m.skipCount > 0 ? m.skipCount : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <TruncatedText text={m.clientId ?? '-'} maxWidth={100} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title={uiText('Remove matcher', '移除匹配条件')}>
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={busy}
                                onClick={() => void handleRemoveMatcher(m.id)}
                                aria-label={uiText(`Remove ${m.id}`, `移除 ${m.id}`)}
                              >
                                <DeleteIcon fontSize="small" />
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
          </Paper>
        </>
      )}

      {/* ============ TAB 1: Live Exchanges ============ */}
      {tab === 1 && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {uiText('Paused request/response exchanges dispatched over the callback WebSocket. Resolve each interactively.', '通过回调 WebSocket 收到的已暂停请求与响应。可以逐项处理。')}
          </Typography>

          {wsState !== 'connected' && (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              {uiText('Callback WebSocket is', '回调 WebSocket 状态：')} {wsState}{uiText('. Paused exchanges will appear here once connected and matchers are registered.', '。连接建立且已添加匹配条件后，暂停的交互会显示在这里。')}
            </Alert>
          )}

          <Paper variant="outlined" sx={{ p: 1.25 }}>
            {exchangeItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                {uiText('No paused exchanges. Register a breakpoint matcher (Matchers tab) to pause matching forwarded requests or responses.', '没有暂停的交互。请在「匹配条件」页添加断点条件，暂停匹配的转发请求或响应。')}
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{uiText('Phase', '阶段')}</TableCell>
                      <TableCell>{uiText('Method / Status', '请求方法 / 状态')}</TableCell>
                      <TableCell>{uiText('Path / Reason', '路径 / 原因')}</TableCell>
                      <TableCell>{uiText('Breakpoint', '断点')}</TableCell>
                      <TableCell align="right">{uiText('Actions', '操作')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {exchangeItems.map((item) => {
                      const isResponse = item.phase === 'RESPONSE';
                      return (
                        <TableRow key={item.key}>
                          <TableCell>
                            <Chip
                              size="small"
                              label={item.phase}
                              color={isResponse ? 'secondary' : 'default'}
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={isResponse && item.response
                                ? String(item.response.statusCode ?? '?')
                                : ((item.phase === 'REQUEST' ? item.request?.method : '?') ?? '?')}
                              color={isResponse ? 'secondary' : 'primary'}
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                              {isResponse && item.response
                                ? (item.response.reasonPhrase ?? '-')
                                : ((item.phase === 'REQUEST' ? item.request?.path : '-') ?? '/')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <TruncatedText text={item.breakpointId ?? '-'} maxWidth={100} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <Tooltip title={uiText('Continue (forward unchanged)', '继续（原样转发）')}>
                                <span>
                                  <IconButton
                                    size="small"
                                    color="success"
                                    disabled={busy}
                                    onClick={() => handleContinueExchange(item)}
                                    aria-label={uiText(`Continue ${item.key}`, `继续 ${item.key}`)}
                                  >
                                    <PlayArrowIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title={isResponse ? uiText('Modify response', '修改响应') : uiText('Modify request', '修改请求')}>
                                <span>
                                  <IconButton
                                    size="small"
                                    color="info"
                                    disabled={busy}
                                    onClick={() => openModifyExchangeDialog(item)}
                                    aria-label={uiText(`Modify ${item.key}`, `修改 ${item.key}`)}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              {/* Abort only genuinely applies to the REQUEST phase (send an
                                  error response instead of forwarding). A RESPONSE has already
                                  been received upstream and cannot be aborted, so we render a
                                  clearly-labelled disabled control there instead of a red button
                                  that silently behaves like Continue. */}
                              {isResponse ? (
                                <Tooltip title={uiText('Abort not applicable — the response has already been received and can only be continued or modified', '响应已收到，只能继续或修改')}>
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      disabled
                                      aria-label={uiText(`Abort ${item.key} (not applicable for responses)`, `中止 ${item.key}（不适用于响应）`)}
                                    >
                                      <BlockIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              ) : (
                                <Tooltip title={uiText('Abort (do not forward)', '中止（停止转发）')}>
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      disabled={busy}
                                      onClick={() => handleAbortExchange(item)}
                                      aria-label={uiText(`Abort ${item.key}`, `中止 ${item.key}`)}
                                    >
                                      <BlockIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </>
      )}

      {/* ============ TAB 2: Live Streams ============ */}
      {tab === 2 && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {uiText('Paused stream frames dispatched over the callback WebSocket. Continue, modify, drop, inject, or close each frame.', '通过回调 WebSocket 收到的已暂停流帧。可以继续、修改或丢弃流帧，也可以插入新帧或关闭流。')}
          </Typography>

          {wsState !== 'connected' && (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              {uiText('Callback WebSocket is', '回调 WebSocket 状态：')} {wsState}{uiText('. Paused stream frames will appear here once connected.', '。连接建立后，暂停的流帧会显示在这里。')}
            </Alert>
          )}

          <Paper variant="outlined" sx={{ p: 1.25 }}>
            {frameItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                {uiText('No paused stream frames. Register a breakpoint matcher with stream phases (Matchers tab) to pause matching streaming frames.', '没有暂停的流帧。请在「匹配条件」页添加包含流阶段的断点条件。')}
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{uiText('Phase', '阶段')}</TableCell>
                      <TableCell>{uiText('Direction', '方向')}</TableCell>
                      <TableCell>{uiText('Stream', '流')}</TableCell>
                      <TableCell>{uiText('Seq', '序号')}</TableCell>
                      <TableCell>{uiText('Method', '请求方法')}</TableCell>
                      <TableCell>{uiText('Path', '路径')}</TableCell>
                      <TableCell>{uiText('Body (Base64)', '内容（Base64）')}</TableCell>
                      <TableCell align="right">{uiText('Actions', '操作')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {frameItems.map((item) => (
                      <TableRow key={item.key}>
                        <TableCell>
                          <Chip
                            size="small"
                            label={item.phase}
                            color={phaseChipColor(item.phase)}
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.6rem' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            icon={item.frame.direction === 'INBOUND' ? <CallReceivedIcon /> : <CallMadeIcon />}
                            label={item.frame.direction === 'INBOUND' ? uiText('Inbound', '入站') : uiText('Outbound', '出站')}
                            color={item.frame.direction === 'INBOUND' ? 'info' : 'default'}
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.6rem' }}
                          />
                        </TableCell>
                        <TableCell>
                          <TruncatedText text={item.frame.streamId} maxWidth={120} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={`#${item.frame.sequenceNumber}`} variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {item.frame.requestMethod ?? '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {item.frame.requestPath ?? '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <TruncatedText text={item.frame.body || '-'} maxWidth={150} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} />
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title={uiText('Continue (write frame unchanged)', '继续（原样发送帧）')}>
                              <span>
                                <IconButton size="small" color="success" disabled={busy} onClick={() => handleFrameContinue(item)} aria-label={uiText(`Continue ${item.key}`, `继续 ${item.key}`)}>
                                  <PlayArrowIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={uiText('Modify frame body', '修改帧内容')}>
                              <span>
                                <IconButton size="small" color="info" disabled={busy} onClick={() => openFrameModifyDialog(item)} aria-label={uiText(`Modify ${item.key}`, `修改 ${item.key}`)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={uiText('Drop (discard frame)', '丢弃帧')}>
                              <span>
                                <IconButton size="small" color="error" disabled={busy} onClick={() => handleFrameDrop(item)} aria-label={uiText(`Drop ${item.key}`, `丢弃 ${item.key}`)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={uiText('Inject extra frame', '插入额外帧')}>
                              <span>
                                <IconButton size="small" color="primary" disabled={busy} onClick={() => openFrameInjectDialog(item)} aria-label={uiText(`Inject ${item.key}`, `插入帧 ${item.key}`)}>
                                  <AddIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={uiText('Close stream', '关闭流')}>
                              <span>
                                <IconButton size="small" color="warning" disabled={busy} onClick={() => handleFrameClose(item)} aria-label={uiText(`Close ${item.key}`, `关闭 ${item.key}`)}>
                                  <StopIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </>
      )}

      {/* Modify dialog (request/response exchanges) */}
      <Dialog open={modifyTarget !== null} onClose={() => setModifyTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {modifyTarget?.phase === 'RESPONSE' ? uiText('Modify Response', '修改响应') : uiText('Modify Request', '修改请求')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {modifyTarget?.phase === 'RESPONSE'
              ? uiText('Edit the response JSON, then send the modified response.', '编辑响应 JSON，然后发送修改后的响应。')
              : uiText('Edit the request JSON, then send the modified request.', '编辑请求 JSON，然后发送修改后的请求。')}
          </Typography>
          {modifyError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {modifyError}
            </Alert>
          )}
          <TextField
            multiline
            minRows={6}
            maxRows={20}
            fullWidth
            value={modifyJson}
            onChange={(e) => setModifyJson(e.target.value)}
            slotProps={{
              input: {
                sx: { fontFamily: 'monospace', fontSize: '0.8rem' },
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModifyTarget(null)}>{uiText('Cancel', '取消')}</Button>
          <Button variant="contained" disabled={busy} onClick={handleModifySubmit}>
            {uiText('Send Modified', '发送修改后的内容')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Frame modify dialog */}
      <Dialog open={frameModifyTarget !== null} onClose={() => setFrameModifyTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{uiText('Modify Stream Frame', '修改流帧')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {uiText('Edit the frame body, then send the modified frame.', '编辑帧内容，然后发送修改后的帧。')}
          </Typography>
          {frameModifyError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {frameModifyError}
            </Alert>
          )}
          <TextField
            multiline
            minRows={4}
            maxRows={16}
            fullWidth
            value={frameModifyBody}
            onChange={(e) => setFrameModifyBody(e.target.value)}
            slotProps={{
              input: {
                sx: { fontFamily: 'monospace', fontSize: '0.8rem' },
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFrameModifyTarget(null)}>{uiText('Cancel', '取消')}</Button>
          <Button variant="contained" disabled={busy} onClick={handleFrameModifySubmit}>
            {uiText('Send Modified Frame', '发送修改后的帧')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Frame inject dialog */}
      <Dialog open={frameInjectTarget !== null} onClose={() => setFrameInjectTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{uiText('Inject Extra Frame', '插入额外帧')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {uiText('Enter the body for the extra frame to inject after the held frame.', '输入要插入到当前暂停帧之后的帧内容。')}
          </Typography>
          {frameInjectError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {frameInjectError}
            </Alert>
          )}
          <TextField
            multiline
            minRows={4}
            maxRows={16}
            fullWidth
            value={frameInjectBody}
            onChange={(e) => setFrameInjectBody(e.target.value)}
            slotProps={{
              input: {
                sx: { fontFamily: 'monospace', fontSize: '0.8rem' },
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFrameInjectTarget(null)}>{uiText('Cancel', '取消')}</Button>
          <Button variant="contained" disabled={busy} onClick={handleFrameInjectSubmit}>
            {uiText('Inject Frame', '插入帧')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={catchAllConfirmOpen}
        title={uiText('Pause every request?', '暂停所有请求？')}
        message={uiText('No method, path, header, query parameter or cookie is set, so this matcher matches every request MockServer receives and pauses all of them until each is resolved or times out.', '未设置请求方法、路径、请求头、查询参数或 Cookie。该条件会匹配 MockServer 收到的所有请求，并暂停每条请求，直到处理完成或超时。')}
        confirmLabel={uiText('Pause every request', '暂停所有请求')}
        onConfirm={() => void handleRegister(true)}
        onClose={() => setCatchAllConfirmOpen(false)}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={uiText('Clear all breakpoint matchers?', '清空所有断点匹配条件？')}
        message={uiText('This removes every registered breakpoint matcher. Any paused exchanges will remain held server-side until the breakpoint timeout expires. This cannot be undone.', '此操作会移除所有断点匹配条件，且无法撤销。已暂停的交互仍会在服务器上等待，直到断点超时。')}
        confirmLabel={uiText('Clear all matchers', '清空匹配条件')}
        onConfirm={() => void handleClearMatchers()}
        onClose={() => setConfirmOpen(false)}
      />
    </Box>
  );
}

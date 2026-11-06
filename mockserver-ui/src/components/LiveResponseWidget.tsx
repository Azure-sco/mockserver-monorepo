import { uiText } from '../lib/dashboardLocale';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/SendOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { buildBaseUrl } from '../lib/mcpClient';
import { getServerStatus } from '../lib/configuration';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { monospaceFontFamily } from '../theme';
import CopyButton from './CopyButton';

/**
 * "Try It" — fires a real HTTP request derived from the expectation draft's
 * request matcher and shows the live status, headers, body and round-trip time.
 *
 * Port model: MockServer serves mock responses AND the `/mockserver/*` control
 * plane on the *same* listener, and the dashboard is served from that same
 * listener (`/mockserver/dashboard`). So the dashboard's own origin — the
 * `connectionParams` every other client module already uses — IS a valid mock
 * target, and is the default here precisely because it is same-origin (no CORS).
 * A server may bind additional ports
 * (`-serverPort 1080,1090`); those are read from `PUT /mockserver/status` and
 * offered as one-click targets, but they are cross-origin from the dashboard, so
 * choosing one raises the CORS warning. When the status call fails the widget
 * degrades to the dashboard's own origin and says so rather than guessing a port.
 */

const MAX_BODY_CHARS = 100_000;
/** Refuse to materialise a response body larger than this (declared) size. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

interface Note {
  field: string;
  reason: string;
}

/** Editable request the user actually fires (never the raw matcher). */
interface EditableRequest {
  method: string;
  path: string;
  query: string;
  headers: string;
  body: string;
}

interface Derivation {
  request: EditableRequest;
  /** Matcher fields that could not be turned into a literal wire value. */
  notes: Note[];
  /** Set when the matcher is not an HTTP request at all (e.g. a DNS matcher). */
  unsupported: string | null;
}

const EMPTY_REQUEST: EditableRequest = {
  method: 'GET', path: '', query: '', headers: '', body: '',
};

/**
 * Request headers a page is forbidden to set (WHATWG Fetch "forbidden request
 * header name"). A standalone `new Headers({...})` has guard "none" and accepts
 * them; `fetch` re-applies guard "request" and strips them **silently**. They
 * must therefore never be pre-filled as if they would be sent — the matcher
 * field simply cannot be exercised from a browser tab.
 */
const FORBIDDEN_HEADERS = new Set([
  'accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'connection', 'content-length', 'cookie', 'cookie2',
  'date', 'dnt', 'expect', 'host', 'keep-alive', 'origin', 'referer', 'set-cookie',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'via',
]);

function isForbiddenHeader(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return FORBIDDEN_HEADERS.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-');
}

/**
 * A matcher value is only usable as a literal wire value when it is a plain
 * string that carries no matcher syntax. Anything holding regex/glob syntax
 * (`.*`, `[0-9]+`, `a|b`, anchors, escapes, quantifier braces) is a PATTERN, and
 * sending it verbatim would fire a nonsense request — so it is refused and
 * surfaced for the user to fill in instead. A bare `.` is allowed because
 * literal paths routinely contain one (`/v1/report.json`); `.+` is not.
 *
 * Being over-eager here is harmless in both directions: a false positive only
 * asks the user to type the value, and a regex that slips through still matches,
 * because RegexStringMatcher tries string equality BEFORE compiling the regex,
 * so a pattern echoed back verbatim matches itself.
 */
const PATTERN_SYNTAX = /[*?[\]()|^$\\{}]/;

/**
 * The two matcher syntaxes that do NOT fall back to string equality — the
 * numeric-comparison and Accept-negotiation branches of RegexStringMatcher
 * return before the equality check, so echoing them back verbatim genuinely
 * fails to match. They contain no PATTERN_SYNTAX character, so they need their
 * own test. Only meaningful for header/query/cookie values.
 *
 * NUMERIC_COMPARISON mirrors NumericComparisonMatcher's pattern exactly,
 * including the zero-or-more whitespace (`>60` and `> 60` are equivalent there)
 * and the trailing numeric operand — so `> abc`, which Java matches by string
 * equality, is correctly left as a literal. Java has no `!=` operator (negation
 * is `!== 5` via NottableString), so it is not listed.
 */
const NUMERIC_COMPARISON = /^\s*(>=|<=|==|>|<)\s*-?\d+(\.\d+)?\s*$/;
const ACCEPT_NEGOTIATION = /^accept:/i;

function looksLikePattern(value: string, mapValue: boolean): boolean {
  if (PATTERN_SYNTAX.test(value) || /\.\+/.test(value)) return true;
  return mapValue && (NUMERIC_COMPARISON.test(value) || ACCEPT_NEGOTIATION.test(value));
}

/**
 * Resolve one matcher scalar to a literal string, or null when it is negated,
 * schema-based, or pattern-shaped. Handles the NottableString forms MockServer
 * accepts: a plain string, a `!`-prefixed string (negation), and the object
 * forms `{ value }` / `{ not: true, value }` / `{ schema }`.
 *
 * `mapValue` marks header/query/cookie values, which additionally support the
 * numeric-comparison and Accept-negotiation syntaxes.
 */
function literalValue(raw: unknown, mapValue = false): string | null {
  if (typeof raw === 'string') {
    if (raw.startsWith('!')) return null; // NottableString negation
    return looksLikePattern(raw, mapValue) ? null : raw;
  }
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (obj['not'] === true) return null;
    if ('schema' in obj) return null;
    if (typeof obj['value'] === 'string') return literalValue(obj['value'], mapValue);
  }
  return null;
}

/**
 * Header/query/cookie keys carry the same NottableString forms as values.
 * `NottableString.serialise()` emits optional BEFORE not (`?!name`), so the `?`
 * must be stripped first — testing `!` first would let `?!name` through as a
 * literal key named `!name`.
 */
function literalKey(raw: string): string | null {
  const name = raw.startsWith('?') ? raw.slice(1) : raw;
  if (name.startsWith('!')) return null;
  return name.length > 0 && !looksLikePattern(name, false) ? name : null;
}

/** A normalised multi-valued map entry; `key: null` marks a non-string key. */
interface MapEntry {
  key: string | null;
  values: unknown[];
}

/**
 * MockServer serialises multi-valued maps either as `{ name: [values] }` or as
 * `[{ name, values }]`. Normalise both, dropping the `keyMatchStyle` control key
 * which is not a header/parameter. A non-string key is surfaced as `key: null`
 * rather than discarded, so the caller can report it instead of losing it.
 */
function entriesOf(raw: unknown): MapEntry[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((e): MapEntry[] => {
      if (e === null || typeof e !== 'object') return [];
      const obj = e as Record<string, unknown>;
      const name = obj['name'];
      const values = Array.isArray(obj['values']) ? (obj['values'] as unknown[]) : [];
      return [{ key: typeof name === 'string' ? name : null, values }];
    });
  }
  if (raw !== null && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([k]) => k !== 'keyMatchStyle')
      .map(([k, v]) => ({ key: k, values: Array.isArray(v) ? (v as unknown[]) : [v] }));
  }
  return [];
}

/**
 * Derive `Name: value` / `name=value` lines, one per literal value (a repeated
 * header or query parameter keeps every value), reporting every entry it had to
 * drop so nothing disappears silently.
 */
function deriveLines(raw: unknown, separator: string, field: string, notes: Note[]): string {
  const lines: string[] = [];
  const dropped: string[] = [];
  for (const { key, values } of entriesOf(raw)) {
    const name = key === null ? null : literalKey(key);
    if (name === null) {
      dropped.push(key === null ? uiText('(non-string key)', "（键不是字符串）") : key);
      continue;
    }
    const literals = values.map((v) => literalValue(v, true));
    const usable = literals.filter((v): v is string => v !== null);
    if (usable.length === 0) {
      dropped.push(key ?? name);
      continue;
    }
    if (usable.length < literals.length) dropped.push(uiText(`${name} (some values)`, `${name}（部分值）`));
    for (const value of usable) lines.push(`${name}${separator}${value}`);
  }
  if (dropped.length > 0) {
    notes.push({
      field,
      reason: uiText(`not literal — ${dropped.join(', ')} (add real values before sending)`, `非字面值匹配条件。${dropped.join(', ')}。请在发送前填写实际值。`),
    });
  }
  return lines.join('\n');
}

/** Derive a body string; only exact-value body matchers can be sent verbatim. */
function deriveBody(raw: unknown, notes: Note[]): string {
  if (raw == null) return '';
  if (typeof raw === 'string') {
    // A plain string body is parsed by NottableString.string(), so a leading `!`
    // makes it a NEGATED matcher — there is no literal body to send.
    if (raw.startsWith('!')) {
      notes.push({ field: 'body', reason: uiText('negated body matcher — no literal body to send', "请求体匹配条件取反，无法从中提取可发送的请求体。") });
      return '';
    }
    // Otherwise it is an exact-value match: the literal body. The pattern
    // heuristic deliberately does NOT apply — a literal JSON or XML body
    // legitimately contains braces and brackets.
    return raw;
  }
  if (typeof raw !== 'object') return '';
  const obj = raw as Record<string, unknown>;
  if (obj['not'] === true) {
    notes.push({ field: 'body', reason: uiText('negated body matcher — no literal body to send', "请求体匹配条件取反，无法从中提取可发送的请求体。") });
    return '';
  }
  const type = typeof obj['type'] === 'string' ? (obj['type'] as string) : '';
  switch (type) {
    case 'STRING':
      return typeof obj['string'] === 'string' ? (obj['string'] as string) : '';
    case 'JSON':
      try {
        return typeof obj['json'] === 'string'
          ? (obj['json'] as string)
          : JSON.stringify(obj['json'], null, 2);
      } catch {
        return '';
      }
    case 'XML':
      return typeof obj['xml'] === 'string' ? (obj['xml'] as string) : '';
    default:
      notes.push({
        field: 'body',
        reason: uiText(`${type || 'this'} body matcher describes a shape, not a value — type the body to send`, `${type || 'this'} 请求体匹配条件只描述数据结构，无法提取实际值。请填写要发送的请求体。`),
      });
      return '';
  }
}

/** Split derived header lines into ones a page may send and ones it may not. */
function partitionForbiddenHeaders(headerLines: string, notes: Note[]): string {
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const line of headerLines.split('\n')) {
    if (line.trim().length === 0) continue;
    const name = line.slice(0, line.indexOf(':'));
    if (isForbiddenHeader(name)) blocked.push(name.trim());
    else allowed.push(line);
  }
  if (blocked.length > 0) {
    notes.push({
      field: 'headers (browser-blocked)',
      reason: uiText(`the browser will not let a page set ${blocked.join(', ')} — fetch strips them silently, so this matcher field cannot be exercised from the dashboard`, `浏览器会自动移除 ${blocked.join(', ')}，因此无法从控制台测试这些匹配字段。`),
    });
  }
  return allowed.join('\n');
}

/**
 * Turn an expectation draft into an editable literal request.
 *
 * THE RULE: only exact, non-negated values are pre-filled. Regex/glob patterns,
 * numeric-comparison and Accept-negotiation values, `!`-negated NottableStrings,
 * JSON-schema matchers and shape matchers (JSON_SCHEMA, JSON_PATH, XPATH,
 * REGEX, …) are NEVER sent verbatim — the field is left blank and listed in a
 * visible "could not be derived" note so the user fills it in before firing.
 * Headers the browser forbids a page from setting are also stripped and named,
 * because pre-filling them would promise a request the browser will not send.
 */
function derive(expectationJson: string): Derivation {
  const notes: Note[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(expectationJson);
  } catch {
    return { request: EMPTY_REQUEST, notes, unsupported: uiText('The expectation draft is not valid JSON yet.', "当前规则草稿不是有效的 JSON。") };
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { request: EMPTY_REQUEST, notes, unsupported: uiText('The expectation draft is not valid JSON yet.', "当前规则草稿不是有效的 JSON。") };
  }
  const root = parsed as Record<string, unknown>;
  const reqRaw = 'httpRequest' in root ? root['httpRequest'] : root;
  if (reqRaw === null || typeof reqRaw !== 'object') {
    return { request: EMPTY_REQUEST, notes, unsupported: uiText('This draft has no request matcher to derive from.', "草稿中没有可用于填充字段的请求匹配条件。") };
  }
  const req = reqRaw as Record<string, unknown>;

  if ('dnsName' in req) {
    return {
      request: EMPTY_REQUEST,
      notes,
      unsupported: uiText('This is a DNS expectation — Try It sends HTTP requests only.', "这是 DNS 规则。试发面板仅支持 HTTP 请求。"),
    };
  }

  // method — a matcher with no method matches every method, so assume GET.
  let method = 'GET';
  if (req['method'] != null && req['method'] !== '') {
    const literal = literalValue(req['method']);
    if (literal === null) {
      notes.push({ field: 'method', reason: uiText('not a literal method — defaulted to GET', "不是字面请求方法，已使用默认值 GET。") });
    } else {
      method = literal.toUpperCase();
    }
  }

  // path — substitute literal pathParameters into `{name}` placeholders first,
  // so a templated path can still resolve to something literal.
  let path = '';
  const rawPath = typeof req['path'] === 'string' ? (req['path'] as string) : null;
  if (rawPath !== null) {
    let candidate = rawPath;
    for (const { key, values } of entriesOf(req['pathParameters'])) {
      const name = key === null ? null : literalKey(key);
      const value = values.length > 0 ? literalValue(values[0], true) : null;
      if (name !== null && value !== null) {
        candidate = candidate.split(`{${name}}`).join(value);
      }
    }
    const literal = literalValue(candidate);
    if (literal === null || literal.trim() === '') {
      notes.push({
        field: 'path',
        reason: uiText(`matcher path ${JSON.stringify(rawPath)} is a pattern, not a literal path — enter the path to send`, `${JSON.stringify(rawPath)} 是路径匹配模式，请填写实际要发送的路径。`),
      });
    } else {
      path = literal;
    }
  } else if (req['path'] != null) {
    notes.push({ field: 'path', reason: uiText('path matcher is not a plain string — enter the path to send', "路径匹配条件不是普通字符串，请填写要发送的路径。") });
  }

  const query = deriveLines(req['queryStringParameters'], '=', 'queryStringParameters', notes);
  const headers = partitionForbiddenHeaders(
    deriveLines(req['headers'], ': ', 'headers', notes),
    notes,
  );
  // Cookies are reported, never sent: `Cookie` is a forbidden request header, so
  // fetch strips it, and the only browser route to setting one — document.cookie
  // — cannot be done safely (a value carrying `domain=`/`max-age=` attributes
  // creates a differently-keyed cookie that outlives any cleanup). Naming the
  // matcher fields that cannot be exercised is honest; planting them is not.
  const cookieNames = entriesOf(req['cookies']).map(({ key }) =>
    key === null ? uiText('(non-string key)', "（键不是字符串）") : key,
  );
  if (cookieNames.length > 0) {
    notes.push({
      field: 'cookies (browser-blocked)',
      reason:
        uiText(`a page cannot set the Cookie header — fetch strips it silently — so ${cookieNames.join(', ')} `, `浏览器会自动移除 Cookie 请求头，因此无法从控制台测试 `) +
        uiText('cannot be exercised from the dashboard; send this request from curl or a client library to test a cookie matcher', "。可通过 curl 或客户端库发送请求来测试 Cookie 匹配。"),
    });
  }
  const body = deriveBody(req['body'], notes);

  if (req['jwt'] != null) {
    notes.push({ field: 'jwt', reason: uiText('JWT matchers need a real signed token — add an Authorization header', "匹配 JWT 需要实际签发的令牌，请添加 Authorization 请求头。") });
  }
  if (req['secure'] === true) {
    notes.push({ field: 'secure', reason: uiText('matcher requires TLS — the request uses the target URL scheme below', "匹配条件要求 TLS，实际请求将使用下方目标 URL 的协议。") });
  }

  return { request: { method, path, query, headers, body }, notes, unsupported: null };
}

/**
 * The matcher half of a draft, used to decide whether a re-derive is worth
 * offering — edits to the *response* action must not nag the user.
 */
function matcherSignature(expectationJson: string): string {
  try {
    const parsed = JSON.parse(expectationJson) as unknown;
    if (parsed === null || typeof parsed !== 'object') return expectationJson;
    const root = parsed as Record<string, unknown>;
    return JSON.stringify('httpRequest' in root ? root['httpRequest'] : root);
  } catch {
    return expectationJson;
  }
}

/** Parse `Name: value` lines into a header map. */
function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const name = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (name.length > 0) out[name] = value;
  }
  return out;
}

/** Parse `name=value` lines into ordered pairs (repeats preserved). */
function parsePairLines(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const idx = trimmed.indexOf('=');
    const name = idx < 0 ? trimmed : trimmed.slice(0, idx).trim();
    const value = idx < 0 ? '' : trimmed.slice(idx + 1).trim();
    if (name.length > 0) out.push([name, value]);
  }
  return out;
}

function buildQueryString(text: string): string {
  const params = new URLSearchParams();
  for (const [name, value] of parsePairLines(text)) params.append(name, value);
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

interface LiveResult {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  truncated: boolean;
  /** Declared size when the body was too large to materialise at all. */
  oversizeBytes: number | null;
  elapsedMs: number;
  url: string;
}

export default function LiveResponseWidget({
  expectationJson,
  connectionParams,
  onClose,
}: {
  /** The expectation draft JSON (or a bare httpRequest object) to derive from. */
  expectationJson: string;
  connectionParams: ConnectionParams;
  onClose: () => void;
}) {
  const dashboardBaseUrl = useMemo(() => buildBaseUrl(connectionParams), [connectionParams]);

  // The derivation is SNAPSHOT into state, never recomputed behind the user's
  // back: the composer keeps editing the draft while this panel is open, and
  // silently rewriting fields would discard edits — while showing live notes
  // over frozen fields would contradict itself. Later matcher edits surface as
  // an explicit "re-derive" offer instead.
  const [derivation, setDerivation] = useState<Derivation>(() => derive(expectationJson));
  const [request, setRequest] = useState<EditableRequest>(() => derivation.request);
  const [seedSignature, setSeedSignature] = useState(() => matcherSignature(expectationJson));

  const [targetBaseUrl, setTargetBaseUrl] = useState(dashboardBaseUrl);
  const [otherPorts, setOtherPorts] = useState<number[]>([]);
  const [portsUnknown, setPortsUnknown] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const currentSignature = useMemo(() => matcherSignature(expectationJson), [expectationJson]);
  const matcherChanged = currentSignature !== seedSignature;

  const reDerive = useCallback(() => {
    const next = derive(expectationJson);
    setDerivation(next);
    setRequest(next.request);
    setSeedSignature(currentSignature);
    setResult(null);
    setFailure(null);
  }, [expectationJson, currentSignature]);

  // Additional bound ports are a convenience only — the dashboard's own origin
  // is always a valid target, so a failure here degrades to a caption.
  useEffect(() => {
    const controller = new AbortController();
    getServerStatus(connectionParams, controller.signal)
      .then((status) => {
        setOtherPorts(status.ports.filter((p) => String(p) !== connectionParams.port));
        setPortsUnknown(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPortsUnknown(true);
      });
    return () => controller.abort();
  }, [connectionParams]);

  // Abandon any in-flight send on unmount, and clear the ref so the send's own
  // continuation recognises itself as stale and stops touching state.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const targetOrigin = originOf(targetBaseUrl);
  const crossOrigin =
    targetOrigin !== null &&
    typeof window !== 'undefined' &&
    targetOrigin !== window.location.origin;

  const setField = useCallback(
    (key: keyof EditableRequest) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setRequest((r) => ({ ...r, [key]: e.target.value })),
    [],
  );

  const send = useCallback(async () => {
    const path = request.path.startsWith('/') ? request.path : `/${request.path}`;
    const url = `${targetBaseUrl.replace(/\/+$/, '')}${path}${buildQueryString(request.query)}`;
    const method = request.method.trim().toUpperCase() || 'GET';

    // Refuse forbidden header names rather than letting fetch strip them in
    // silence — a dropped Host/Cookie header would look like a broken matcher.
    const headerMap = parseHeaderLines(request.headers);
    const blocked = Object.keys(headerMap).filter(isForbiddenHeader);
    if (blocked.length > 0) {
      setResult(null);
      setFailure(
        uiText(`The browser will not let a page set ${blocked.join(', ')} — fetch removes those headers `, `浏览器会自动移除 ${blocked.join(', ')}， `) +
          uiText('silently, so the request would not be what you see here. Remove them, and use curl or a ', "因此实际发送的请求会与这里显示的不同。请移除这些请求头。 ") +
          uiText('client library if you need to exercise a matcher on one of them.', "若要测试其中的匹配条件，可使用 curl 或客户端库。"),
      );
      return;
    }

    // Build headers first: an invalid header name throws a TypeError that would
    // otherwise be misreported as a connection/CORS failure.
    let headerInit: Headers;
    try {
      headerInit = new Headers(headerMap);
    } catch (err) {
      setResult(null);
      setFailure(uiText(`Invalid request header: ${err instanceof Error ? err.message : String(err)}`, `无效的请求头：${err instanceof Error ? err.message : String(err)}`));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    setSending(true);
    setFailure(null);
    setResult(null);

    const bodyAllowed = method !== 'GET' && method !== 'HEAD' && request.body.length > 0;
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method,
        headers: headerInit,
        body: bodyAllowed ? request.body : undefined,
        signal: controller.signal,
      });
      // Skip reading the body when the server DECLARES an oversize one. Note this
      // is a courtesy, not a hard bound: a chunked or length-less response has no
      // content-length, so it is still read in full before being truncated for
      // display. Adequate for a dev tool pointed at the user's own mock server.
      const declared = Number(res.headers.get('content-length') ?? '');
      const oversize = Number.isFinite(declared) && declared > MAX_BODY_BYTES ? declared : null;
      const text = oversize === null ? await res.text() : '';
      if (abortRef.current !== controller) return;
      const headers: [string, string][] = [];
      res.headers.forEach((value, name) => headers.push([name, value]));
      setResult({
        status: res.status,
        statusText: res.statusText,
        headers,
        body: text.slice(0, MAX_BODY_CHARS),
        truncated: text.length > MAX_BODY_CHARS,
        oversizeBytes: oversize,
        elapsedMs: Math.round(performance.now() - started),
        url,
      });
    } catch (err) {
      // A newer send (or unmount) replaced this controller — drop the stale outcome.
      if (abortRef.current !== controller) return;
      const aborted = err instanceof Error && err.name === 'AbortError';
      const detail = err instanceof Error ? err.message : String(err);
      if (aborted) {
        setFailure(uiText(`No response within ${REQUEST_TIMEOUT_MS / 1000}s — the request was aborted (${url}).`, `${REQUEST_TIMEOUT_MS / 1000} 秒内未收到响应，请求已中止（${url}）。`));
      } else if (crossOrigin) {
        // fetch reports a CORS block and a connection failure identically (an
        // opaque TypeError), so name the far more likely cause explicitly rather
        // than surfacing a bare "Failed to fetch".
        setFailure(
          uiText(`The browser blocked the response from ${targetOrigin}. The dashboard is served from `, `浏览器阻止了来自 ${targetOrigin} 的响应。控制台来自 `) +
            uiText(`${window.location.origin}, so this is a cross-origin request: MockServer must have CORS `, `${window.location.origin}，这是跨域请求。请为目标 MockServer 端口 `) +
            uiText(`enabled on that port (start it with -Dmockserver.enableCORSForAllResponses=true, or set `, "启用 CORS。可在启动时设置 -Dmockserver.enableCORSForAllResponses=true， ") +
            uiText(`"enableCORSForAllResponses": true via the Configuration dialog). If CORS is already on, `, "或在配置对话框中设置 \"enableCORSForAllResponses\": true。如果已启用 CORS， ") +
            uiText(`check that ${targetOrigin} is reachable and listening. Raw error: ${detail}`, `请检查 ${targetOrigin} 是否可访问且正在监听。原始错误：${detail}`),
        );
      } else {
        setFailure(
          uiText(`Could not reach ${url} — MockServer may not be listening, or the request was refused. `, `无法访问 ${url}。MockServer 可能未监听此地址，或连接被拒绝。 `) +
            uiText(`Raw error: ${detail}`, `原始错误：${detail}`),
        );
      }
    } finally {
      clearTimeout(timer);
      if (abortRef.current === controller) setSending(false);
    }
  }, [request, targetBaseUrl, crossOrigin, targetOrigin]);

  const statusColour = (status: number) =>
    status >= 500 ? 'error' : status >= 400 ? 'warning' : status >= 200 && status < 300 ? 'success' : 'default';

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 1 }} data-testid="live-response-widget">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
          {uiText("Try It — send a live request", "试发 HTTP 请求 · 发送实际请求")}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label={uiText("Close Try It", "关闭试发面板")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {matcherChanged && (
        <Alert
          severity="info"
          variant="outlined"
          sx={{ mb: 1 }}
          data-testid="try-it-stale"
          action={
            <Button size="small" startIcon={<RefreshIcon fontSize="small" />} onClick={reDerive}>
              {uiText("Re-derive", "根据条件重新填充")}
            </Button>
          }
        >
          {uiText("The matcher above changed since this request was derived. Re-derive to pick up the change — it replaces the fields below, including your edits.", "请求匹配条件已更改。重新填充会根据最新条件替换下方字段，包括手动修改的内容。")}
        </Alert>
      )}

      {derivation.unsupported !== null ? (
        <Alert severity="info" variant="outlined">{derivation.unsupported}</Alert>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {uiText("Pre-filled from the matcher above using literal values only — pattern, negated and schema matchers are never sent verbatim. Edit anything below before sending.", "下方仅从上面的匹配条件提取字面值。模式、取反和 Schema 匹配条件不会原样发送。发送前可自行编辑。")}
          </Typography>

          {derivation.notes.length > 0 && (
            <Alert severity="warning" variant="outlined" sx={{ mb: 1 }} data-testid="try-it-derivation-notes">
              <AlertTitle sx={{ mb: 0.5 }}>{uiText("Could not be derived as literal values", "无法提取字面值的字段")}</AlertTitle>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {derivation.notes.map((n) => (
                  <li key={n.field}>
                    <Typography variant="caption">
                      <Box component="span" sx={{ fontFamily: monospaceFontFamily, fontWeight: 600 }}>{n.field}</Box>
                      {` — ${n.reason}`}
                    </Typography>
                  </li>
                ))}
              </Box>
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <TextField
              size="small"
              label={uiText("Target base URL", "目标基础 URL")}
              value={targetBaseUrl}
              onChange={(e) => setTargetBaseUrl(e.target.value)}
              sx={{ flex: '1 1 280px' }}
              helperText={
                portsUnknown
                  ? uiText('Could not read the server’s bound ports — using the port serving this dashboard.', "无法读取服务器监听端口，将使用当前控制台端口。")
                  : uiText('MockServer serves mocks and the control plane on the same port as this dashboard.', "Mock 接口和控制 API 使用与此控制台相同的端口。")
              }
              slotProps={{ htmlInput: { 'aria-label': uiText('Target base URL', "目标基础 URL"), sx: { fontFamily: monospaceFontFamily } } }}
            />
            {otherPorts.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap', pt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{uiText("Also bound:", "其他监听端口：")}</Typography>
                {otherPorts.map((p) => (
                  <Chip
                    key={p}
                    size="small"
                    label={String(p)}
                    onClick={() =>
                      setTargetBaseUrl(
                        buildBaseUrl({ ...connectionParams, port: String(p) }),
                      )
                    }
                  />
                ))}
              </Box>
            )}
          </Box>

          {crossOrigin && (
            <Alert severity="warning" variant="outlined" sx={{ mb: 1 }} data-testid="try-it-cors-warning">
              {uiText(`${targetOrigin} is a different origin from this dashboard (${typeof window !== 'undefined' ? window.location.origin : ''}). `, `${targetOrigin} 与此控制台（${typeof window !== 'undefined' ? window.location.origin : ''}）不同源。 `) +
                uiText('The browser will block the response unless MockServer has CORS enabled on that port ', "请在目标 MockServer 端口启用 CORS，浏览器才能读取响应 ") +
                uiText('(mockserver.enableCORSForAllResponses=true).', "（mockserver.enableCORSForAllResponses=true）。")}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label={uiText("Method", "请求方法")}
              value={request.method}
              onChange={setField('method')}
              sx={{ width: 120 }}
              slotProps={{ htmlInput: { 'aria-label': uiText('Live request method', "试发请求方法") } }}
            />
            <TextField
              size="small"
              label={uiText("Path", "路径")}
              value={request.path}
              onChange={setField('path')}
              sx={{ flex: '1 1 240px' }}
              error={request.path.trim().length === 0}
              helperText={request.path.trim().length === 0 ? uiText('Enter the path to send', "请输入请求路径") : ' '}
              slotProps={{ htmlInput: { 'aria-label': uiText('Live request path', "试发请求路径"), sx: { fontFamily: monospaceFontFamily } } }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexDirection: { xs: 'column', md: 'row' } }}>
            <TextField
              size="small"
              label={uiText("Query (name=value per line)", "查询参数（每行一项 name=value）")}
              value={request.query}
              onChange={setField('query')}
              multiline
              minRows={2}
              sx={{ flex: 1 }}
              slotProps={{ htmlInput: { 'aria-label': uiText('Live request query', "试发查询参数"), sx: { typography: 'body2', fontFamily: monospaceFontFamily } } }}
            />
            <TextField
              size="small"
              label={uiText("Headers (Name: value per line)", "请求头（每行一项 Name: value）")}
              value={request.headers}
              onChange={setField('headers')}
              multiline
              minRows={2}
              sx={{ flex: 1 }}
              slotProps={{ htmlInput: { 'aria-label': uiText('Live request headers', "试发请求头"), sx: { typography: 'body2', fontFamily: monospaceFontFamily } } }}
            />
          </Box>
          <TextField
            size="small"
            label={uiText("Body", "请求体")}
            value={request.body}
            onChange={setField('body')}
            multiline
            minRows={2}
            fullWidth
            sx={{ mb: 1 }}
            helperText={
              request.body.length > 0 && ['GET', 'HEAD'].includes(request.method.trim().toUpperCase())
                ? uiText('A GET/HEAD request cannot carry a body — it will not be sent.', "GET 和 HEAD 不发送请求体。")
                : ' '
            }
            slotProps={{ htmlInput: { 'aria-label': uiText('Live request body', "试发请求体"), sx: { typography: 'body2', fontFamily: monospaceFontFamily } } }}
          />

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<SendIcon fontSize="small" />}
              onClick={() => void send()}
              disabled={sending || request.path.trim().length === 0}
            >
              {sending ? uiText('Sending…', "正在发送…") : uiText('Send request', "发送请求")}
            </Button>
            <Typography variant="caption" color="text.secondary">
              {uiText("Sent live from the browser — it hits real expectations and is recorded in the log.", "请求由浏览器直接发送，会匹配已生效的规则并记录在日志中。")}
            </Typography>
          </Box>

          {failure !== null && (
            <Alert severity="error" variant="outlined" sx={{ mt: 1 }} data-testid="try-it-failure">
              <AlertTitle sx={{ mb: 0.5 }}>{uiText("Request failed", "请求失败")}</AlertTitle>
              <Typography variant="caption">{failure}</Typography>
            </Alert>
          )}

          {result !== null && (
            <Box sx={{ mt: 1 }} data-testid="try-it-result">
              <Divider sx={{ mb: 1 }} />
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
                <Chip
                  size="small"
                  color={statusColour(result.status)}
                  label={`${result.status}${result.statusText ? ` ${result.statusText}` : ''}`}
                />
                <Typography variant="caption" color="text.secondary">{uiText(`${result.elapsedMs} ms`, `${result.elapsedMs} 毫秒`)}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: monospaceFontFamily, wordBreak: 'break-all' }}>
                  {result.url}
                </Typography>
                <CopyButton text={result.body} />
              </Box>
              {result.headers.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {uiText("No response headers were readable (a cross-origin response only exposes headers the server allow-lists via Access-Control-Expose-Headers).", "无法读取响应头。跨域响应只会公开 Access-Control-Expose-Headers 中允许的响应头。")}
                </Typography>
              ) : (
                <Box sx={{ mb: 1 }}>
                  {result.headers.map(([name, value]) => (
                    <Typography
                      key={name}
                      variant="caption"
                      sx={{ display: 'block', fontFamily: monospaceFontFamily, wordBreak: 'break-all' }}
                    >
                      {`${name}: ${value}`}
                    </Typography>
                  ))}
                </Box>
              )}
              {result.oversizeBytes !== null ? (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                  {uiText(`Response body is ${result.oversizeBytes} bytes — too large to display, so it was not read into the page.`, `响应体有 ${result.oversizeBytes} 字节，超出展示大小限制，未加载到页面中。`)}
                </Typography>
              ) : (
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1,
                    maxHeight: 260,
                    overflow: 'auto',
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    fontFamily: monospaceFontFamily,
                    fontSize: '0.75rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {result.body.length > 0 ? result.body : uiText('(empty response body)', "（响应体为空）")}
                </Box>
              )}
              {result.truncated && (
                <Typography variant="caption" color="text.secondary">
                  {uiText("Body truncated for display.", "仅显示响应体的前一部分。")}
                </Typography>
              )}
            </Box>
          )}
        </>
      )}
    </Paper>
  );
}

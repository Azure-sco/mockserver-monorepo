import { uiText } from '../lib/dashboardLocale';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Snackbar from '@mui/material/Snackbar';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { notifyWholeExpectationLoadFailed } from '../hooks/useWithWholeExpectation';
import { isShortenedExpectation, loadWholeExpectation } from '../lib/fullExpectation';
import { fetchActiveExpectations } from '../lib/expectations';
import { lintWarningCount } from '../lib/lint';
import { useDashboardStore } from '../store';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import { monospaceFontFamily } from '../theme';
import type { JsonListItem } from '../types';
import { listConversationScenarios } from '../lib/conversationCodegen';
import { buildBaseUrl } from '../lib/mcpClient';
import LlmConversationForm from './LlmConversationForm';
import HumanErrorAlert from './HumanErrorAlert';
import LintWarningsBadge from './LintWarningsBadge';
import StandardReview from './StandardReview';
import MatcherPlaygroundDialog from './MatcherPlaygroundDialog';
import DateTimeMatcherDialog from './DateTimeMatcherDialog';
import { appendLine, bodyDateTimeError, matcherValueToText } from '../lib/matcherValue';
import TemplateTestDialog from './TemplateTestDialog';
import LiveResponseWidget from './LiveResponseWidget';
import {
  buildExpectationJson,
  unmodeledFieldNames,
  keptActionFields,
  keptFieldLabel,
  clearKeptActionField,
  type KeptActionField,
  ACTION_FAMILY_KEYS,
  chaosFromExpectation,
  captureFromExpectation,
  allOfEntryFromWire,
  jwtFromRequest,
  jwtFaithfullyModeled,
  sideEffectsFromExpectation,
  stepsFromExpectation,
  CAPTURE_SOURCES,
  CAPTURE_SOURCE_LABELS,
  STEP_ACTION_TYPES,
  STEP_ACTION_LABELS,
  RESPONDER_CAPABLE_ACTIONS,
  standardChaosErrorStatusError,
  responseStatusCodeError,
  standardChaosErrorProbabilityError,
  hasStandardChaosRangeErrors,
  type StandardActionPayload,
  type StandardChaosDraft,
  type ChaosDelayUnit,
  type BodyMatcherType,
  type SelectionSetMatchType,
  type GraphQLMatcherOptions,
  type JsonMatchType,
  type StandardForwardFallbackState,
  type WebSocketFrameType,
  type StandardSseState,
  type StandardSseEventDraft,
  type StandardBinaryResponseState,
  type BinaryUpstreamName,
  BINARY_UPSTREAM_NAMES,
  type StandardDnsState,
  type DnsResponseCodeName,
  type StandardForwardTemplateState,
  type StandardForwardClassCallbackState,
  type StandardGrpcStreamState,
  type StandardListItemDraft,
  type StandardDnsMatcher,
  type DnsRecordType,
  type DnsRecordClass,
  type StandardSideEffectAction,
  type SideEffectPosition,
  type SideEffectDelayUnit,
  type SideEffectFailurePolicy,
  type SideEffectTemplateType,
  type StandardConnectionOptions,
  type StandardExpectationStep,
  type StepActionType,
  type StandardCaptureRule,
  type CaptureSource,
  type StandardBodyAllOfEntry,
  type AllOfSubBodyType,
  type StandardJwtMatcher,
  ignoredKeyValueLines,
  templateParametersError,
  templateParametersText,
} from '../lib/standardCodegen';
import McpToolsPanel from './McpToolsPanel';
import ScenarioPanel from './ScenarioPanel';
import ImportForm from './ImportForm';
import JsonEditor from './JsonEditorLazy';
import SnippetPalette from './SnippetPalette';
import type { TemplateEngine as SnippetEngine } from '../lib/templateSnippets';
import type { TemplateTestActionType, TemplateTestEngine } from '../lib/templateTest';
import { trackFeature } from '../lib/analytics';

// ---------------------------------------------------------------------------
// Response action types
// ---------------------------------------------------------------------------

type ExpectationKind = 'standard' | 'llm_conversation' | 'grpc' | 'mcp' | 'dns' | 'import';

type ActionType =
  | 'static'
  | 'forward'
  | 'forward_override'
  | 'forward_fallback'
  | 'callback'
  | 'template'
  | 'error'
  | 'websocket'
  | 'sse'
  | 'binary_response'
  | 'dns_response'
  | 'forward_template'
  | 'forward_class_callback'
  | 'grpc_stream';

interface ActionTypeMeta {
  value: ActionType;
  label: string;
  description: string;
}

const ACTION_TYPES: ActionTypeMeta[] = [
  { value: 'static', label: uiText('Static HTTP response', "固定 HTTP 响应"), description: uiText('Return a fixed status / headers / body for matching requests.', "为匹配的请求返回固定的状态码、响应头和响应体。") },
  { value: 'forward', label: uiText('Forward to upstream', "转发至上游"), description: uiText('Proxy the request to a configured scheme://host:port.', "将请求代理到配置的 scheme://host:port。") },
  { value: 'forward_override', label: uiText('Forward with override', "改写后转发"), description: uiText('Forward upstream while rewriting host / scheme / path on the outgoing request.', "转发至上游前，改写出站请求的主机、协议或路径。") },
  { value: 'forward_fallback', label: uiText('Forward with fallback', "转发失败时回退"), description: uiText('Forward upstream; if it returns a configured error status or times out, return a fallback mock response.', "将请求转发至上游。如果上游返回指定的错误状态码或超时，则返回备用 Mock 响应。") },
  { value: 'callback', label: uiText('Class callback', "类回调"), description: uiText('Invoke a server-side class FQCN to build the response dynamically.', "调用服务器端 Java 类（使用全限定类名），动态构建响应。") },
  { value: 'template', label: uiText('Response template', "响应模板"), description: uiText('Velocity / JavaScript / Mustache templates for dynamic responses.', "使用 Velocity、JavaScript 或 Mustache 模板动态生成响应。") },
  { value: 'error', label: uiText('Error / fault injection', "故障注入"), description: uiText('Drop the connection mid-request or send arbitrary bytes as the response.', "在处理请求时断开连接，或返回任意字节。") },
  { value: 'websocket', label: uiText('WebSocket response', "WebSocket 响应"), description: uiText('Upgrade to a WebSocket connection and send messages, with optional bidirectional frame matchers.', "将连接升级为 WebSocket 并发送消息，也可以配置双向帧匹配条件。") },
  { value: 'sse', label: uiText('SSE response', "SSE 响应"), description: uiText('Server-Sent Events stream with typed events, data, and optional retry/close.', "向客户端发送事件流，可设置事件类型、数据、重连间隔以及是否关闭连接。") },
  { value: 'binary_response', label: uiText('Binary response', "二进制响应"), description: uiText('Return raw binary data (base64-encoded) as the response body.', "将 Base64 编码的原始二进制数据作为响应体返回。") },
  { value: 'dns_response', label: uiText('DNS response', "DNS 响应"), description: uiText('Return a DNS response with a response code and answer records.', "返回带有响应码和应答记录的 DNS 响应。") },
  { value: 'forward_template', label: uiText('Forward template', "转发模板"), description: uiText('Forward the request upstream using a Velocity / JavaScript / Mustache template to build the forwarded request.', "使用 Velocity、JavaScript 或 Mustache 模板构建要转发至上游的请求。") },
  { value: 'forward_class_callback', label: uiText('Forward class callback', "转发类回调"), description: uiText('Forward the request upstream via a server-side Java class implementing ExpectationForwardCallback.', "通过实现了 ExpectationForwardCallback 的服务器端 Java 类将请求转发至上游。") },
  { value: 'grpc_stream', label: uiText('gRPC stream response', "gRPC 流式响应"), description: uiText('Return a gRPC streaming response with status, messages, and optional close.', "返回带有状态、消息以及可选关闭操作的 gRPC 流式响应。") },
];

/**
 * Which action types are valid for each expectation kind.
 * HTTP ('standard') gets all HTTP action types but NOT dns_response or grpc_stream.
 * gRPC gets grpc_stream (primary) + static (for unary RPCs).
 * DNS gets only dns_response.
 * MCP gets only static.
 * LLM has its own form path and does not use the ACTION_TYPES radio at all.
 * Import has its own form path (bulk import from JSON/OpenAPI/WSDL/HAR).
 */
type ActionKind = Exclude<ExpectationKind, 'llm_conversation' | 'import'>;

const ACTION_TYPES_BY_KIND: Record<ActionKind, ActionType[]> = {
  standard: [
    'static', 'forward', 'forward_override', 'forward_fallback',
    'callback', 'template', 'error', 'websocket', 'sse',
    'binary_response', 'forward_template', 'forward_class_callback',
  ],
  grpc: ['grpc_stream', 'static'],
  dns: ['dns_response'],
  mcp: ['static'],
};

/** The matcher path the gRPC kind starts with: gRPC calls are POSTs to /package.Service/Method. */
const GRPC_PATH = '/package.Service/Method';

/** Default action type when switching to a kind, and after New / clear in that kind. */
const DEFAULT_ACTION_BY_KIND: Record<ActionKind, ActionType> = {
  standard: 'static',
  grpc: 'grpc_stream',
  dns: 'dns_response',
  mcp: 'static',
};

/**
 * Return the filtered ACTION_TYPES metadata for a given kind.
 * Preserves the ordering defined in ACTION_TYPES_BY_KIND.
 */
function actionTypesForKind(k: ActionKind): ActionTypeMeta[] {
  const allowed = ACTION_TYPES_BY_KIND[k];
  return allowed.map((v) => ACTION_TYPES.find((a) => a.value === v)!);
}

/**
 * Infer the expectation kind from an action type.
 * Used when loading an existing expectation to auto-select the correct kind.
 */
function kindForActionType(at: ActionType): ActionKind {
  if (at === 'dns_response') return 'dns';
  if (at === 'grpc_stream') return 'grpc';
  return 'standard';
}

// ---------------------------------------------------------------------------
// Per-expectation kind classification — used to scope the existing-mocks list
// ---------------------------------------------------------------------------

/**
 * Classify a raw expectation (from the store) into an ExpectationKind.
 * LLM conversation expectations are detected by `httpLlmResponse`.
 * DNS expectations are detected by `dnsResponse` action or `dnsName` in the request.
 * gRPC expectations by `grpcStreamResponse`.
 * MCP is a virtual kind — MCP tools are derived from HTTP static response
 * expectations, so we classify them as 'standard' for the mocks list; MCP
 * kind shows the same set of HTTP expectations filtered to static responses.
 */
function kindForExpectation(value: Record<string, unknown>): ExpectationKind {
  // LLM conversation scenarios have httpLlmResponse
  if (value['httpLlmResponse']) return 'llm_conversation';
  // DNS — action is dnsResponse OR request has dnsName
  if (value['dnsResponse']) return 'dns';
  const req = value['httpRequest'] as Record<string, unknown> | undefined;
  if (req && typeof req['dnsName'] === 'string' && (req['dnsName'] as string).length > 0) return 'dns';
  // gRPC — action is grpcStreamResponse
  if (value['grpcStreamResponse']) return 'grpc';
  // Everything else is HTTP (standard). MCP is a view over HTTP static mocks.
  return 'standard';
}

/**
 * Build a short one-line summary string for an expectation, scoped by kind.
 */
function summaryForExpectation(value: Record<string, unknown>, expKind: ExpectationKind): string {
  const req = (value['httpRequest'] as Record<string, unknown> | undefined) ?? {};

  if (expKind === 'dns') {
    const dnsName = (typeof req['dnsName'] === 'string' ? req['dnsName'] : uiText('(unknown)', "（未知）")) as string;
    const dnsType = typeof req['dnsType'] === 'string' ? ` (${req['dnsType']})` : '';
    return `${dnsName}${dnsType}`;
  }

  if (expKind === 'grpc') {
    const path = typeof req['path'] === 'string' ? (req['path'] as string) : '';
    // gRPC paths are /package.Service/Method — show the path directly
    return path || '(gRPC)';
  }

  // HTTP / MCP — METHOD /path  → <what it does>
  const method = typeof req['method'] === 'string' ? (req['method'] as string) : 'ANY';
  const path = typeof req['path'] === 'string' ? (req['path'] as string) : uiText('(no path)', "（未指定路径）");
  const action = actionSummaryForExpectation(value);
  return action ? `${method} ${path}  ${action}` : `${method} ${path}`;
}

/**
 * Short, human-readable description of what an expectation *does* (its action /
 * response), appended to the request summary so two mocks that share a request
 * matcher (e.g. two `GET /users` returning 200 vs 500, or a static response vs a
 * forward) are distinguishable in the existing-mocks picker. Returns '' when no
 * recognised action is present.
 */
function actionSummaryForExpectation(value: Record<string, unknown>): string {
  const resp = value['httpResponse'] as Record<string, unknown> | undefined;
  if (resp) {
    // MockServer defaults an omitted statusCode to 200.
    const status = typeof resp['statusCode'] === 'number' ? resp['statusCode'] : 200;
    return `→ ${status}`;
  }
  if (value['httpResponses']) return uiText('→ sequential', "→ 顺序响应");
  if (value['httpResponseTemplate']) return uiText('→ template', "→ 响应模板");
  if (value['httpResponseClassCallback'] || value['httpResponseObjectCallback']) return uiText('→ callback', "→ 回调");
  if (value['binaryResponse']) return uiText('→ binary', "→ 二进制响应");
  if (value['httpSseResponse']) return '→ SSE';
  if (value['httpWebSocketResponse']) return '→ WebSocket';
  if (value['httpError']) return uiText('→ error', "→ 故障注入");
  if (value['httpOverrideForwardedRequest']) return uiText('→ forward + override', "→ 改写后转发");
  if (value['httpForwardWithFallback']) return uiText('→ forward (fallback)', "→ 转发失败时回退");
  if (value['httpForwardTemplate']) return uiText('→ forward (template)', "→ 使用模板转发");
  if (value['httpForwardClassCallback'] || value['httpForwardObjectCallback']) return uiText('→ forward callback', "→ 回调转发");
  const fwd = value['httpForward'] as Record<string, unknown> | undefined;
  if (fwd) {
    const host = typeof fwd['host'] === 'string' ? (fwd['host'] as string) : '';
    const port = typeof fwd['port'] === 'number' ? `:${fwd['port']}` : '';
    return host ? uiText(`→ forward ${host}${port}`, `→ 转发至 ${host}${port}`) : uiText('→ forward', "→ 转发");
  }
  return '';
}

/**
 * Human-readable kind label for display.
 */
function kindLabel(k: ExpectationKind): string {
  switch (k) {
    case 'standard': return 'HTTP';
    case 'llm_conversation': return 'LLM';
    case 'grpc': return 'gRPC';
    case 'dns': return 'DNS';
    case 'mcp': return 'MCP';
    case 'import': return uiText('Import', "导入");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseUrl(p: ConnectionParams): string {
  return buildBaseUrl(p);
}

/**
 * PUT the current matcher + action to MockServer. The payload is built by
 * `buildExpectationJson` (shared with `StandardReview`'s code preview) so the
 * Java/JSON/curl tabs always reflect the exact bytes that go over the wire.
 */
async function registerExpectation(
  connectionParams: ConnectionParams,
  matcher: MatcherState,
  action: StandardActionPayload,
): Promise<number> {
  if (action.editOriginal && isShortenedExpectation(action.editOriginal)) {
    throw new Error(uiText('This expectation was shortened in the live update, so it was not saved: load it again from the list', "实时更新中的规则内容已被截断，未保存。请从列表重新加载完整规则。"));
  }
  const url = `${baseUrl(connectionParams)}/mockserver/expectation`;
  const body = buildExpectationJson(matcher, action);
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MockServer returned ${res.status}: ${text || res.statusText}`);
  }
  return lintWarningCount(res);
}

// ---------------------------------------------------------------------------
// Request matcher panel — shared across all action types
// ---------------------------------------------------------------------------

interface MatcherState {
  id: string;
  method: string;
  path: string;
  headers: string;       // "Name: value" lines, "!" prefix negates
  queryString: string;   // "key=value" lines, "!" prefix negates
  cookies: string;       // "name=value" lines, "!" prefix negates
  pathParams: string;    // "name=value" lines, "!" prefix negates (for /users/{id} style)
  body: string;
  bodyBinary: boolean;   // when true, body is base64-encoded raw bytes
  bodyMatcherType: BodyMatcherType;
  graphqlOptions: GraphQLMatcherOptions;
  /** JSON match type (only when bodyMatcherType is 'json'). */
  jsonMatchType: JsonMatchType;
  /** SubString toggle (only when bodyMatcherType is 'string'). */
  bodySubString: boolean;
  /** Sub-matchers composed by an `allOf` body (only when bodyMatcherType is 'allOf'). */
  bodyAllOf?: StandardBodyAllOfEntry[];
  /** Date-time comparison on the selected value as compact JSON (only when bodyMatcherType is 'json-path' or 'xpath'). */
  bodyDateTime?: string;
  /** JWT request-matcher criteria (Advanced form's optional JWT section). */
  jwt?: StandardJwtMatcher;
  /**
   * Tri-state TLS matcher: `true` = HTTPS only, `false` = HTTP only, `undefined` = either.
   * `false` is a real server-side constraint, so it must survive an edit round-trip — see
   * composerSecureTriState.test.ts.
   */
  secure: boolean | undefined;
  /** Client IP address or CIDR range (httpRequest.clientIp), optionally `!`-negated; blank = any client. */
  clientIp: string;
  priority: number;
  times: number;         // 0 = unlimited
  ttlSeconds: number;    // 0 = unlimited (auto-expire after N seconds)
  /** DNS matcher — set when the expectation kind is 'dns'. */
  dns?: StandardDnsMatcher;
}

function emptyMatcher(): MatcherState {
  return {
    id: '',
    method: 'GET',
    path: '',
    headers: '',
    queryString: '',
    cookies: '',
    pathParams: '',
    body: '',
    bodyBinary: false,
    bodyMatcherType: 'string',
    graphqlOptions: { selectionSetMatchType: 'NORMALISED_STRING', fields: '' },
    jsonMatchType: 'ONLY_MATCHING_FIELDS',
    bodySubString: false,
    bodyAllOf: [],
    bodyDateTime: '',
    jwt: undefined,
    secure: undefined,
    clientIp: '',
    priority: 0,
    times: 0,
    ttlSeconds: 0,
  };
}

/**
 * MockServer's NottableString accepts a leading `!` to mean "must not match
 * this value". When MockServer SERIALIZES an active expectation it sends the
 * object form `{ value: "...", not: true }`. This helper unifies both shapes
 * back into the `!`-prefix string convention used by the matcher textareas.
 */
function denottable(field: unknown): string {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object' && 'value' in (field as Record<string, unknown>)) {
    const f = field as Record<string, unknown>;
    const prefix = f['not'] === true ? '!' : '';
    return prefix + String(f['value'] ?? '');
  }
  return '';
}

// Validates that a string is well-formed base64. The server (and the generated
// Java `Base64.getDecoder().decode(...)`) rejects malformed input at runtime, so
// we gate registration on it rather than surfacing an opaque server error. Inner
// whitespace/newlines are tolerated (they are stripped before decoding).
function isValidBase64(raw: string): boolean {
  const s = raw.replace(/\s+/g, '');
  if (s.length === 0) return false;
  return s.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(s);
}

/**
 * A small "i" info adornment that reveals a plain-language explanation on hover.
 * Used to demystify the worst jargon in the form (Times, TTL, Priority, JSON
 * match type, `!` negation) without cluttering every label with prose.
 */
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip title={text} arrow>
      <InfoOutlinedIcon
        fontSize="inherit"
        sx={{ fontSize: '0.95rem', color: 'text.secondary', cursor: 'help', verticalAlign: 'middle' }}
      />
    </Tooltip>
  );
}

/** End-adornment variant of {@link InfoTip} for use inside a TextField. */
function infoAdornment(text: string) {
  return {
    endAdornment: (
      <InputAdornment position="end">
        <InfoTip text={text} />
      </InputAdornment>
    ),
  };
}

// Minimal JSON-Schema (draft-07 subset) used to live-validate the body when the
// body type is "JSON Schema": the value the user types must itself be a valid
// JSON Schema document. This is a meta-schema, not the full expectation schema —
// the body field holds only the body matcher value, not a whole expectation.
const JSON_SCHEMA_META = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    type: {},
    properties: { type: 'object' },
    required: { type: 'array', items: { type: 'string' } },
    items: {},
    enum: { type: 'array' },
    $ref: { type: 'string' },
    additionalProperties: {},
  },
} as const;

// Map a response Content-Type to the Monaco language used by the response-body
// editor. JSON content types get `json` (syntax highlighting + live
// well-formedness validation, mirroring the request-body editor); XML content
// types get `xml`; everything else falls back to plaintext.
function responseBodyLanguage(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('json')) return 'json';
  if (ct.includes('xml')) return 'xml';
  return 'plaintext';
}

// Map a body matcher type to the Monaco language and (optionally) a JSON Schema
// to validate against. Types that are not document bodies (json-path, xpath,
// regex, parameters, wasm, binary) fall back to plaintext with no validation.
function bodyEditorConfig(type: BodyMatcherType): { language: string; schema?: object } {
  switch (type) {
    case 'json':
      return { language: 'json' };
    case 'json-schema':
      return { language: 'json', schema: JSON_SCHEMA_META };
    case 'xml':
    case 'xml-schema':
      return { language: 'xml' };
    case 'graphql':
      return { language: 'graphql' };
    default:
      // string, binary, json-path, xpath, regex, parameters, wasm
      return { language: 'plaintext' };
  }
}

/**
 * Non-blocking helper text for a matcher line-list field: undefined when every
 * line parses, otherwise "N line(s) ignored — expected <format>".
 */
function ignoredLinesWarning(text: string, separator: ':' | '=', formatHint: string): string | undefined {
  const n = ignoredKeyValueLines(text, separator).length;
  if (n === 0) return undefined;
  return uiText(`${n} line${n === 1 ? '' : 's'} ignored — expected ${formatHint}`, `已忽略 ${n} 行，需要采用 ${formatHint} 格式`);
}

const ALLOF_SUB_TYPES: { value: AllOfSubBodyType; label: string }[] = [
  { value: 'string', label: uiText('String (exact)', "字符串（精确匹配）") },
  { value: 'json', label: 'JSON' },
  { value: 'json-schema', label: 'JSON Schema' },
  { value: 'json-path', label: 'JSON Path' },
  { value: 'xml', label: 'XML' },
  { value: 'xml-schema', label: 'XML Schema' },
  { value: 'xpath', label: 'XPath' },
  { value: 'regex', label: uiText('Regex', "正则表达式") },
];

/** Repeatable sub-matcher rows for an `allOf` composite body (logical AND of body matchers). */
function AllOfMatcherRows({ matcher, setMatcher }: { matcher: MatcherState; setMatcher: (m: MatcherState) => void }) {
  const rows = matcher.bodyAllOf ?? [];
  const update = (next: StandardBodyAllOfEntry[]) => setMatcher({ ...matcher, bodyAllOf: next });
  const addRow = () => update([...rows, { type: 'json', value: '' }]);
  const removeRow = (idx: number) => update(rows.filter((_, i) => i !== idx));
  const patchRow = (idx: number, patch: Partial<StandardBodyAllOfEntry>) =>
    update(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="allof-section">
      <Typography variant="caption" color="text.secondary">
        {uiText("The request body must satisfy every sub-matcher below (logical AND). Add two or more.", "请求体必须满足下方的每个子条件（逻辑与）。请添加至少两项。")}
      </Typography>
      {rows.map((row, idx) => (
        <Paper key={idx} variant="outlined" sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'flex-start' }} data-testid="allof-row">
          <TextField
            label={uiText("Type", "类型")}
            size="small"
            select
            value={row.type}
            onChange={(e) => patchRow(idx, { type: e.target.value as AllOfSubBodyType })}
            sx={{ minWidth: 150 }}
            slotProps={{ htmlInput: { 'data-testid': `allof-type-${idx}` } }}
          >
            {ALLOF_SUB_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label={uiText("Matcher value", "匹配值")}
            size="small"
            fullWidth
            multiline
            maxRows={4}
            value={row.value}
            onChange={(e) => patchRow(idx, { value: e.target.value })}
            sx={{ flex: 1 }}
            slotProps={{
              input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } },
              htmlInput: { 'data-testid': `allof-value-${idx}` },
            }}
          />
          <IconButton size="small" aria-label={uiText("Remove sub-matcher", "移除子条件")} onClick={() => removeRow(idx)} data-testid={`allof-remove-${idx}`}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Paper>
      ))}
      <Box>
        <Button size="small" variant="outlined" onClick={addRow} data-testid="add-allof-row">
          {uiText("Add sub-matcher", "添加子条件")}
        </Button>
      </Box>
    </Box>
  );
}

/** Optional JWT request-matcher section (httpRequest.jwt). Off by default so an
 *  untouched matcher emits byte-identical JSON to before this section existed. */
function JwtMatcherSection({ matcher, setMatcher }: { matcher: MatcherState; setMatcher: (m: MatcherState) => void }) {
  const enabled = matcher.jwt != null;
  const jwt = matcher.jwt ?? {};
  const patch = (p: Partial<StandardJwtMatcher>) => setMatcher({ ...matcher, jwt: { ...jwt, ...p } });
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="jwt-section">
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={enabled}
            onChange={(e) => setMatcher({ ...matcher, jwt: e.target.checked ? (matcher.jwt ?? {}) : undefined })}
            slotProps={{ input: { 'aria-label': uiText('Match a JWT', "匹配 JWT"), 'data-testid': 'jwt-enable' } as Record<string, unknown> }}
          />
        }
        label={<Typography variant="body2">{uiText("Match a JWT (JSON Web Token)", "匹配 JWT（JSON Web Token）")}</Typography>}
      />
      <Collapse in={enabled} unmountOnExit>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {uiText("Matches claims in a JWT carried in a request header. No signature is verified — this is request routing, not authentication.", "匹配请求头中 JWT 的声明。此设置仅用于请求路由，不会验证签名或进行身份认证。")}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              label={uiText("Header (default authorization)", "请求头（默认为 authorization）")}
              size="small"
              value={jwt.header ?? ''}
              onChange={(e) => patch({ header: e.target.value })}
              sx={{ flex: 1, minWidth: 180 }}
              slotProps={{ htmlInput: { 'data-testid': 'jwt-header' } }}
            />
            <TextField
              label={uiText("Scheme (default Bearer)", "认证方案（默认为 Bearer）")}
              size="small"
              value={jwt.scheme ?? ''}
              onChange={(e) => patch({ scheme: e.target.value })}
              sx={{ flex: 1, minWidth: 180 }}
              slotProps={{ htmlInput: { 'data-testid': 'jwt-scheme' } }}
            />
          </Box>
          <TextField
            label={uiText("Claims (name=value per line, ! negates)", "声明（每行一项 name=value，前缀 ! 表示取反）")}
            size="small"
            multiline
            minRows={2}
            maxRows={6}
            value={jwt.claims ?? ''}
            onChange={(e) => patch({ claims: e.target.value })}
            placeholder={'sub=user-1\nscope=.*admin.*'}
            slotProps={{
              input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } },
              htmlInput: { 'data-testid': 'jwt-claims' },
            }}
          />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              label={uiText("Issuer (iss)", "签发方（iss）")}
              size="small"
              value={jwt.issuer ?? ''}
              onChange={(e) => patch({ issuer: e.target.value })}
              sx={{ flex: 1, minWidth: 150 }}
              slotProps={{ htmlInput: { 'data-testid': 'jwt-issuer' } }}
            />
            <TextField
              label={uiText("Audience (aud)", "受众（aud）")}
              size="small"
              value={jwt.audience ?? ''}
              onChange={(e) => patch({ audience: e.target.value })}
              sx={{ flex: 1, minWidth: 150 }}
              slotProps={{ htmlInput: { 'data-testid': 'jwt-audience' } }}
            />
            <TextField
              label={uiText("Algorithm (alg)", "算法（alg）")}
              size="small"
              value={jwt.algorithm ?? ''}
              onChange={(e) => patch({ algorithm: e.target.value })}
              sx={{ flex: 1, minWidth: 150 }}
              slotProps={{ htmlInput: { 'data-testid': 'jwt-algorithm' } }}
            />
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}

function MatcherPanel({ matcher, setMatcher }: { matcher: MatcherState; setMatcher: (m: MatcherState) => void }) {
  // Non-blocking warnings for lines that MockServer's codegen will drop. They do
  // NOT change what is registered — malformed lines are still dropped — they just
  // surface the silent loss so a typo'd matcher isn't shipped unnoticed.
  const headersWarning = ignoredLinesWarning(matcher.headers, ':', 'Name: value');
  const queryWarning = ignoredLinesWarning(matcher.queryString, '=', 'key=value');
  const cookiesWarning = ignoredLinesWarning(matcher.cookies, '=', 'name=value');
  const pathParamsWarning = ignoredLinesWarning(matcher.pathParams, '=', 'name=value');
  const [dateTimeOpen, setDateTimeOpen] = useState(false);
  const [bodyDateTimeOpen, setBodyDateTimeOpen] = useState(false);
  const bodyDateTimeProblem = bodyDateTimeError(matcher.bodyDateTime);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={uiText("Expectation ID (optional)", "规则 ID（可选）")}
          size="small"
          sx={{ flex: 1 }}
          value={matcher.id}
          onChange={(e) => setMatcher({ ...matcher, id: e.target.value })}
          placeholder={uiText("leave blank to auto-generate; reuse an ID to update an existing expectation", "留空时自动生成。填写已有规则 ID 可更新该规则。")}
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label={uiText("Method", "请求方法")}
          size="small"
          select
          value={matcher.method}
          onChange={(e) => setMatcher({ ...matcher, method: e.target.value })}
          sx={{ minWidth: 110 }}
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'].map((m) => (
            <MenuItem key={m} value={m === 'ANY' ? '' : m}>{m === 'ANY' ? uiText('ANY', '不限') : m}</MenuItem>
          ))}
        </TextField>
        <TextField
          label={uiText("Path", "路径")}
          size="small"
          fullWidth
          sx={{ flex: 1, minWidth: 200 }}
          value={matcher.path}
          onChange={(e) => setMatcher({ ...matcher, path: e.target.value })}
          placeholder={uiText("/foo/bar  ·  prefix with ! to negate", "/foo/bar · 在前面加 ! 表示取反")}
        />
      </Box>
      <Box sx={{ mt: -1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
          {uiText("Prefix any string field or any line below with ", "可在字符串字段或下方任意一行前加上 ")}<code>!</code>{uiText(" to negate the match.", " 来匹配不符合该值的请求。")}
          <InfoTip text={uiText("A leading ! means \"must NOT match this value\". e.g. path !/admin matches every path except /admin; header !Authorization: … matches requests that do not carry that header. A value written as a JSON object is a matcher object, e.g. X-Issued-At: {\"after\":\"now -1 hours\"} compares the header as a date-time.", "前缀 ! 表示“不得匹配该值”。例如，路径 !/admin 匹配 /admin 以外的所有路径。请求头 !Authorization: … 匹配不含该头的请求。也可将值写成 JSON 匹配对象，例如 X-Issued-At: {\"after\":\"now -1 hours\"} 表示按日期时间比较该请求头。")} />
        </Typography>
        <Button size="small" onClick={() => setDateTimeOpen(true)}>{uiText("Add Date-Time Matcher", "添加日期时间条件")}</Button>
      </Box>
      <DateTimeMatcherDialog
        open={dateTimeOpen}
        onClose={() => setDateTimeOpen(false)}
        onAdd={(field, line) => setMatcher({ ...matcher, [field]: appendLine(matcher[field], line) })}
      />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={uiText("Headers (Name: value per line)", "请求头（每行一项 Name: value）")}
          multiline
          minRows={2}
          maxRows={6}
          sx={{ flex: 1 }}
          value={matcher.headers}
          onChange={(e) => setMatcher({ ...matcher, headers: e.target.value })}
          placeholder={'Accept: application/json\n!Authorization: Bearer …'}
          helperText={headersWarning}
          slotProps={{
            input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } },
            formHelperText: headersWarning ? { sx: { color: 'warning.main' } } : undefined,
          }}
        />
        <TextField
          label={uiText("Query params (key=value per line)", "查询参数（每行一项 key=value）")}
          multiline
          minRows={2}
          maxRows={6}
          sx={{ flex: 1 }}
          value={matcher.queryString}
          onChange={(e) => setMatcher({ ...matcher, queryString: e.target.value })}
          placeholder={'limit=50\noffset=0'}
          helperText={queryWarning}
          slotProps={{
            input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } },
            formHelperText: queryWarning ? { sx: { color: 'warning.main' } } : undefined,
          }}
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={uiText("Cookies (name=value per line)", "Cookie（每行一项 name=value）")}
          multiline
          minRows={2}
          maxRows={4}
          sx={{ flex: 1 }}
          value={matcher.cookies}
          onChange={(e) => setMatcher({ ...matcher, cookies: e.target.value })}
          placeholder={'session=abc123\ntheme=dark'}
          helperText={cookiesWarning}
          slotProps={{
            input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } },
            formHelperText: cookiesWarning ? { sx: { color: 'warning.main' } } : undefined,
          }}
        />
        <TextField
          label={uiText("Path parameters (name=value per line)", "路径参数（每行一项 name=value）")}
          multiline
          minRows={2}
          maxRows={4}
          sx={{ flex: 1 }}
          value={matcher.pathParams}
          onChange={(e) => setMatcher({ ...matcher, pathParams: e.target.value })}
          placeholder={uiText('id=42  (for paths like /users/{id})', "id=42（适用于 /users/{id} 等路径）")}
          helperText={pathParamsWarning}
          slotProps={{
            input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } },
            formHelperText: pathParamsWarning ? { sx: { color: 'warning.main' } } : undefined,
          }}
        />
      </Box>
      <Box>
        <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            label={uiText("Body type", "请求体类型")}
            size="small"
            select
            value={matcher.bodyMatcherType}
            onChange={(e) => {
              const newType = e.target.value as BodyMatcherType;
              setMatcher({
                ...matcher,
                bodyMatcherType: newType,
                bodyBinary: newType === 'binary',
              });
            }}
            sx={{ minWidth: 250 }}
          >
            <MenuItem value="string">{uiText("String (exact / subString)", "字符串（精确匹配或子串匹配）")}</MenuItem>
            <MenuItem value="json">JSON</MenuItem>
            <MenuItem value="graphql">GraphQL</MenuItem>
            <MenuItem value="binary">{uiText("Binary (base64)", "二进制（Base64）")}</MenuItem>
            <MenuItem value="json-schema">JSON Schema</MenuItem>
            <MenuItem value="json-path">JSON Path</MenuItem>
            <MenuItem value="xml">XML</MenuItem>
            <MenuItem value="xml-schema">XML Schema</MenuItem>
            <MenuItem value="xpath">XPath</MenuItem>
            <MenuItem value="regex">{uiText("Regex", "正则表达式")}</MenuItem>
            <MenuItem value="parameters">{uiText("Parameters", "参数")}</MenuItem>
            <MenuItem value="wasm">{uiText("WASM module", "WASM 模块")}</MenuItem>
            <MenuItem value="allOf">{uiText("All of (compose matchers)", "全部满足（组合多个匹配条件）")}</MenuItem>
          </TextField>
        </Box>
        {matcher.bodyMatcherType === 'allOf' && (
          <AllOfMatcherRows matcher={matcher} setMatcher={setMatcher} />
        )}
        {matcher.bodyMatcherType !== 'allOf' && (() => {
          const bodyLabel =
            matcher.bodyMatcherType === 'binary'
              ? uiText('Body matcher (base64 bytes)', "请求体匹配条件（Base64 字节）")
              : matcher.bodyMatcherType === 'graphql'
                ? uiText('GraphQL query', "GraphQL 查询")
                : matcher.bodyMatcherType === 'json'
                  ? uiText('JSON body matcher', "JSON 请求体匹配条件")
                  : matcher.bodyMatcherType === 'json-schema'
                    ? 'JSON Schema'
                    : matcher.bodyMatcherType === 'json-path'
                      ? uiText('JSON Path expression', "JSON Path 表达式")
                      : matcher.bodyMatcherType === 'xml'
                        ? uiText('XML body', "XML 请求体")
                        : matcher.bodyMatcherType === 'xml-schema'
                          ? uiText('XML Schema (XSD)', "XML Schema（XSD）")
                          : matcher.bodyMatcherType === 'xpath'
                            ? uiText('XPath expression', "XPath 表达式")
                            : matcher.bodyMatcherType === 'regex'
                              ? uiText('Regex pattern', "正则表达式")
                              : matcher.bodyMatcherType === 'parameters'
                                ? uiText('Parameters (key=value per line)', "参数（每行一项 key=value）")
                                : matcher.bodyMatcherType === 'wasm'
                                  ? uiText('WASM module name', "WASM 模块名称")
                                  : uiText('Body matcher (string)', "请求体匹配条件（字符串）");
          const bodyPlaceholder =
            matcher.bodyMatcherType === 'binary'
              ? 'SGVsbG8sIFdvcmxkIQ=='
              : matcher.bodyMatcherType === 'graphql'
                ? '{ hero { name } }'
                : matcher.bodyMatcherType === 'json'
                  ? '{"foo":"bar"}'
                  : matcher.bodyMatcherType === 'json-schema'
                    ? '{"type":"object","properties":{"name":{"type":"string"}}}'
                    : matcher.bodyMatcherType === 'json-path'
                      ? '$.store.book[0].title'
                      : matcher.bodyMatcherType === 'xml'
                        ? '<root><element>value</element></root>'
                        : matcher.bodyMatcherType === 'xml-schema'
                          ? '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">...</xs:schema>'
                          : matcher.bodyMatcherType === 'xpath'
                            ? '/root/element[@attr="value"]'
                            : matcher.bodyMatcherType === 'regex'
                              ? '^Hello.*World$'
                              : matcher.bodyMatcherType === 'parameters'
                                ? 'username=admin\npassword=secret'
                                : matcher.bodyMatcherType === 'wasm'
                                  ? 'myMatcher'
                                  : uiText('e.g. hello world', "例如 hello world");
          const editorConfig = bodyEditorConfig(matcher.bodyMatcherType);
          const compact =
            matcher.bodyMatcherType === 'json-path' ||
            matcher.bodyMatcherType === 'xpath' ||
            matcher.bodyMatcherType === 'regex';
          return (
            <JsonEditor
              label={bodyLabel}
              ariaLabel={bodyLabel}
              language={editorConfig.language}
              schema={editorConfig.schema}
              value={matcher.body}
              onChange={(next) => setMatcher({ ...matcher, body: next })}
              placeholder={bodyPlaceholder}
              height={compact ? 64 : 160}
            />
          );
        })()}
        {(matcher.bodyMatcherType === 'json-path' || matcher.bodyMatcherType === 'xpath') && (
          <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField
              label={uiText("Date-Time Comparison (optional)", "日期时间比较（可选）")}
              size="small"
              sx={{ flex: 1, minWidth: 260 }}
              value={matcher.bodyDateTime ?? ''}
              onChange={(e) => setMatcher({ ...matcher, bodyDateTime: e.target.value })}
              placeholder='{"after":"now -1 days"}'
              error={!!bodyDateTimeProblem}
              helperText={bodyDateTimeProblem ?? uiText(`Matches when a value the ${matcher.bodyMatcherType === 'xpath' ? 'XPath' : 'JSON Path'} selects is a date-time that satisfies this comparison.`, `${matcher.bodyMatcherType === 'xpath' ? 'XPath' : 'JSON Path'} 选出的值是日期时间且符合此比较条件时匹配。`)}
              slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
            />
            <Button size="small" sx={{ mt: 0.5 }} onClick={() => setBodyDateTimeOpen(true)}>{uiText("Build Date-Time Comparison", "设置日期时间比较")}</Button>
            <DateTimeMatcherDialog
              open={bodyDateTimeOpen}
              onClose={() => setBodyDateTimeOpen(false)}
              onAddBody={(json) => setMatcher({ ...matcher, bodyDateTime: json })}
            />
          </Box>
        )}
        {matcher.bodyMatcherType === 'graphql' && (
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              label={uiText("Selection set match type", "字段选择集匹配方式")}
              size="small"
              select
              value={matcher.graphqlOptions.selectionSetMatchType}
              onChange={(e) =>
                setMatcher({
                  ...matcher,
                  graphqlOptions: {
                    ...matcher.graphqlOptions,
                    selectionSetMatchType: e.target.value as SelectionSetMatchType,
                  },
                })
              }
              sx={{ width: { xs: '100%', sm: 260 } }}
            >
              <MenuItem value="NORMALISED_STRING">{uiText("Normalised string (default)", "规范化字符串（默认）")}</MenuItem>
              <MenuItem value="AST_EXACT">{uiText("AST exact", "AST 精确匹配")}</MenuItem>
              <MenuItem value="AST_SUBSET">{uiText("AST subset", "AST 子集匹配")}</MenuItem>
            </TextField>
            {(matcher.graphqlOptions.selectionSetMatchType === 'AST_EXACT' ||
              matcher.graphqlOptions.selectionSetMatchType === 'AST_SUBSET') && (
              <TextField
                label={uiText("Fields (comma-separated, optional)", "字段（用逗号分隔，可选）")}
                size="small"
                value={matcher.graphqlOptions.fields}
                onChange={(e) =>
                  setMatcher({
                    ...matcher,
                    graphqlOptions: { ...matcher.graphqlOptions, fields: e.target.value },
                  })
                }
                placeholder="hero, name, friends"
                slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
              />
            )}
          </Box>
        )}
        {matcher.bodyMatcherType === 'json' && (
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <TextField
              label={uiText("JSON match type", "JSON 匹配方式")}
              size="small"
              select
              value={matcher.jsonMatchType}
              onChange={(e) =>
                setMatcher({ ...matcher, jsonMatchType: e.target.value as JsonMatchType })
              }
              sx={{ width: { xs: '100%', sm: 260 } }}
            >
              <MenuItem value="ONLY_MATCHING_FIELDS">{uiText("Only matching fields (default)", "只匹配指定字段（默认）")}</MenuItem>
              <MenuItem value="STRICT">{uiText("Strict (all fields must match)", "严格匹配（所有字段都必须匹配）")}</MenuItem>
            </TextField>
            <InfoTip text={uiText("Only matching fields: the request must contain the fields you list (extra fields are ignored) — best for partial matches. Strict: the request body must match exactly, with no extra or missing fields.", "只匹配指定字段：请求体须包含列出的字段，其他字段会被忽略，适合部分匹配。严格匹配：请求体必须完全一致，不能多出或缺少字段。")} />
          </Box>
        )}
        {matcher.bodyMatcherType === 'string' && (
          <Box sx={{ mt: 0.5 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={matcher.bodySubString}
                  onChange={(e) => setMatcher({ ...matcher, bodySubString: e.target.checked })}
                />
              }
              label={<Typography variant="body2">{uiText("SubString match", "子串匹配")}</Typography>}
            />
          </Box>
        )}
      </Box>
      <JwtMatcherSection matcher={matcher} setMatcher={setMatcher} />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Tri-state: the previous two-state switch had no way to express "HTTP only", so OFF
            meant "match either" and an expectation carrying secure:false was silently widened
            when re-saved. Mirrors the triValue/triParse control used for keep-alive. */}
        <TextField
          select
          size="small"
          label="TLS"
          sx={{ width: { xs: '100%', sm: 150 } }}
          value={triValue(matcher.secure)}
          onChange={(e) => setMatcher({ ...matcher, secure: triParse(e.target.value) })}
        >
          <MenuItem value="">{uiText("Any", "任意")}</MenuItem>
          <MenuItem value="true">{uiText("HTTPS only", "仅 HTTPS")}</MenuItem>
          <MenuItem value="false">{uiText("HTTP only", "仅 HTTP")}</MenuItem>
        </TextField>
        <TextField
          label={uiText("Client IP", "客户端 IP")}
          size="small"
          placeholder="10.0.0.0/8"
          helperText={uiText("IP or CIDR, ! to negate; TCP peer, not X-Forwarded-For", "支持 IP 或 CIDR，前缀 ! 表示取反。使用 TCP 对端地址，不读取 X-Forwarded-For。")}
          sx={{ width: { xs: '100%', sm: 220 } }}
          value={matcher.clientIp}
          onChange={(e) => setMatcher({ ...matcher, clientIp: e.target.value })}
        />
        <TextField
          label={uiText("Priority (higher = wins)", "优先级（数值越大越优先）")}
          size="small"
          type="number"
          sx={{ width: { xs: '100%', sm: 230 } }}
          value={matcher.priority}
          onChange={(e) => setMatcher({ ...matcher, priority: Number(e.target.value) || 0 })}
          slotProps={{ input: infoAdornment(uiText('When several mocks match the same request, the one with the highest priority wins. Leave at 0 unless you need to override a more general mock.', "若多条规则匹配同一请求，将使用优先级最高的规则。通常保留为 0，如需覆盖更通用的规则再调整。")) }}
        />
        <TextField
          label={uiText("Times (0 = unlimited)", "可命中次数（0 表示不限）")}
          size="small"
          type="number"
          sx={{ width: { xs: '100%', sm: 200 } }}
          value={matcher.times}
          onChange={(e) => setMatcher({ ...matcher, times: Math.max(0, Number(e.target.value) || 0) })}
          slotProps={{ input: infoAdornment(uiText('How many times this mock will respond before it stops matching. 0 means unlimited — it responds to every matching request.', "此规则最多响应多少次。0 表示不限次数，会响应每个匹配的请求。")) }}
        />
        <TextField
          label={uiText("Time to live (s, 0 = forever)", "有效期（秒，0 表示永久有效）")}
          size="small"
          type="number"
          sx={{ width: { xs: '100%', sm: 230 } }}
          value={matcher.ttlSeconds}
          onChange={(e) => setMatcher({ ...matcher, ttlSeconds: Math.max(0, Number(e.target.value) || 0) })}
          slotProps={{ input: infoAdornment(uiText('The mock auto-expires this many seconds after it is registered. 0 means it never expires.', "规则会在注册后经过指定秒数失效。0 表示永久有效。")) }}
        />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// DNS request matcher panel — shown instead of the HTTP MatcherPanel when
// the expectation kind is 'dns'. DNS matching is based on dnsName / dnsType /
// dnsClass, NOT method / path / headers / body.
// ---------------------------------------------------------------------------

function DnsMatcherPanel({
  matcher,
  setMatcher,
  dnsMatcher,
  setDnsMatcher,
}: {
  matcher: MatcherState;
  setMatcher: (m: MatcherState) => void;
  dnsMatcher: StandardDnsMatcher;
  setDnsMatcher: (d: StandardDnsMatcher) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={uiText("Expectation ID (optional)", "规则 ID（可选）")}
          size="small"
          sx={{ flex: 1 }}
          value={matcher.id}
          onChange={(e) => setMatcher({ ...matcher, id: e.target.value })}
          placeholder={uiText("leave blank to auto-generate; reuse an ID to update an existing expectation", "留空时自动生成。填写已有规则 ID 可更新该规则。")}
        />
      </Box>
      <TextField
        label={uiText("DNS name", "DNS 名称")}
        size="small"
        fullWidth
        value={dnsMatcher.dnsName}
        onChange={(e) => setDnsMatcher({ ...dnsMatcher, dnsName: e.target.value })}
        placeholder="example.com"
        helperText={uiText("required — the server routes to a DNS matcher when dnsName is present", "必填。请求含 dnsName 字段时，服务器会使用 DNS 匹配条件。")}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={uiText("Record type", "记录类型")}
          size="small"
          select
          value={dnsMatcher.dnsType}
          onChange={(e) => setDnsMatcher({ ...dnsMatcher, dnsType: e.target.value as DnsRecordType | '' })}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">{uiText("(any)", "（任意）")}</MenuItem>
          {(['A', 'AAAA', 'CNAME', 'MX', 'SRV', 'TXT', 'PTR'] as const).map((t) => (
            <MenuItem key={t} value={t}>{t}</MenuItem>
          ))}
        </TextField>
        <TextField
          label={uiText("Record class", "记录类别")}
          size="small"
          select
          value={dnsMatcher.dnsClass}
          onChange={(e) => setDnsMatcher({ ...dnsMatcher, dnsClass: e.target.value as DnsRecordClass | '' })}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">{uiText("(any)", "（任意）")}</MenuItem>
          {(['IN', 'CH', 'HS', 'ANY'] as const).map((c) => (
            <MenuItem key={c} value={c}>{c}</MenuItem>
          ))}
        </TextField>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label={uiText("Priority (higher = wins)", "优先级（数值越大越优先）")}
          size="small"
          type="number"
          sx={{ width: { xs: '100%', sm: 230 } }}
          value={matcher.priority}
          onChange={(e) => setMatcher({ ...matcher, priority: Number(e.target.value) || 0 })}
          slotProps={{ input: infoAdornment(uiText('When several mocks match the same request, the one with the highest priority wins. Leave at 0 unless you need to override a more general mock.', "若多条规则匹配同一请求，将使用优先级最高的规则。通常保留为 0，如需覆盖更通用的规则再调整。")) }}
        />
        <TextField
          label={uiText("Times (0 = unlimited)", "可命中次数（0 表示不限）")}
          size="small"
          type="number"
          sx={{ width: { xs: '100%', sm: 200 } }}
          value={matcher.times}
          onChange={(e) => setMatcher({ ...matcher, times: Math.max(0, Number(e.target.value) || 0) })}
          slotProps={{ input: infoAdornment(uiText('How many times this mock will respond before it stops matching. 0 means unlimited — it responds to every matching request.', "此规则最多响应多少次。0 表示不限次数，会响应每个匹配的请求。")) }}
        />
        <TextField
          label={uiText("Time to live (s, 0 = forever)", "有效期（秒，0 表示永久有效）")}
          size="small"
          type="number"
          sx={{ width: { xs: '100%', sm: 230 } }}
          value={matcher.ttlSeconds}
          onChange={(e) => setMatcher({ ...matcher, ttlSeconds: Math.max(0, Number(e.target.value) || 0) })}
          slotProps={{ input: infoAdornment(uiText('The mock auto-expires this many seconds after it is registered. 0 means it never expires.', "规则会在注册后经过指定秒数失效。0 表示永久有效。")) }}
        />
      </Box>
    </Box>
  );
}

/**
 * Best-effort population of MatcherState from an existing active-expectation
 * payload. Round-trip is lossy for advanced matchers (NottableString.not,
 * BodyDTO variants, pathParameters, cookies) — those revert to text. The user
 * can hand-edit the resulting text if needed before re-registering.
 */
/** A JSONPath / XPath body's `dateTime` as the compact JSON the Composer edits; '' when absent. */
function bodyDateTimeText(dateTime: unknown): string {
  return dateTime && typeof dateTime === 'object' && !Array.isArray(dateTime) ? JSON.stringify(dateTime) : '';
}

/**
 * Convert a Headers / Parameters / Cookies record back to "key separator
 * value" lines. A plain string value is written as-is; an object value (the
 * nottable, schema or date-time matcher form) is written as compact JSON, which
 * buildExpectationJson reads back into the same object, so a save never
 * flattens or drops it.
 */
function mapToLines(map: unknown, separator: ':' | '='): string {
  if (!map || typeof map !== 'object') return '';
  const lines: string[] = [];
  for (const [k, val] of Object.entries(map as Record<string, unknown>)) {
    const values = Array.isArray(val) ? (val as unknown[]) : [val];
    for (const vv of values) {
      if (typeof vv === 'string' || (vv && typeof vv === 'object')) {
        lines.push(`${k}${separator} ${matcherValueToText(vv)}`);
      }
    }
  }
  return lines.join('\n');
}

// Exported for round-trip unit tests; it depends on many local types, so it
// lives here rather than in a lib module.
// eslint-disable-next-line react-refresh/only-export-components
export function matcherFromExpectation(item: JsonListItem): MatcherState {
  const v = item.value;
  const req = (v['httpRequest'] as Record<string, unknown> | undefined) ?? {};

  // Body shape detection: { type: "BINARY", base64Bytes } → keep as base64
  // and flip the binary toggle. Other variants unwrap to a text string.
  const rawBody = req['body'];
  let bodyText = '';
  let bodyBinary = false;
  let bodyMatcherType: BodyMatcherType = 'string';
  let jsonMatchType: JsonMatchType = 'ONLY_MATCHING_FIELDS';
  let bodySubString = false;
  let bodyAllOf: StandardBodyAllOfEntry[] = [];
  let bodyDateTime = '';
  const graphqlOptions: GraphQLMatcherOptions = { selectionSetMatchType: 'NORMALISED_STRING', fields: '' };
  if (typeof rawBody === 'string') {
    bodyText = rawBody;
  } else if (rawBody && typeof rawBody === 'object') {
    const b = rawBody as Record<string, unknown>;
    if (b['type'] === 'ALL_OF' && Array.isArray(b['bodyAllOf'])) {
      // Composite conjunction — round-trip the sub-matchers the allOf form can
      // represent; drop the rest so editing preserves what the form models.
      bodyMatcherType = 'allOf';
      bodyAllOf = (b['bodyAllOf'] as unknown[])
        .map((sub) => allOfEntryFromWire(sub))
        .filter((e): e is StandardBodyAllOfEntry => e != null);
    } else if (b['type'] === 'BINARY' && typeof b['base64Bytes'] === 'string') {
      bodyText = b['base64Bytes'] as string;
      bodyBinary = true;
      bodyMatcherType = 'binary';
    } else if (b['type'] === 'GRAPHQL' && typeof b['query'] === 'string') {
      // Wire field is `query` (GraphQLBodyDTOSerializer), matching the writer in
      // standardCodegen's buildExpectationJson — reading `graphql` here lost the
      // query on every edit round-trip.
      bodyText = b['query'] as string;
      bodyMatcherType = 'graphql';
      const ssmt = b['selectionSetMatchType'];
      if (ssmt === 'AST_EXACT' || ssmt === 'AST_SUBSET') {
        graphqlOptions.selectionSetMatchType = ssmt;
      }
      if (Array.isArray(b['fields'])) {
        graphqlOptions.fields = (b['fields'] as string[]).join(', ');
      }
    } else if (b['type'] === 'JSON_SCHEMA' && typeof b['jsonSchema'] === 'string') {
      bodyText = b['jsonSchema'] as string;
      bodyMatcherType = 'json-schema';
    } else if (b['type'] === 'JSON_PATH' && typeof b['jsonPath'] === 'string') {
      bodyText = b['jsonPath'] as string;
      bodyMatcherType = 'json-path';
      bodyDateTime = bodyDateTimeText(b['dateTime']);
    } else if (b['type'] === 'XML' && typeof b['xml'] === 'string') {
      bodyText = b['xml'] as string;
      bodyMatcherType = 'xml';
    } else if (b['type'] === 'XML_SCHEMA' && typeof b['xmlSchema'] === 'string') {
      bodyText = b['xmlSchema'] as string;
      bodyMatcherType = 'xml-schema';
    } else if (b['type'] === 'XPATH' && typeof b['xpath'] === 'string') {
      bodyText = b['xpath'] as string;
      bodyMatcherType = 'xpath';
      bodyDateTime = bodyDateTimeText(b['dateTime']);
    } else if (b['type'] === 'REGEX' && typeof b['regex'] === 'string') {
      bodyText = b['regex'] as string;
      bodyMatcherType = 'regex';
    } else if (b['type'] === 'WASM' && typeof b['moduleName'] === 'string') {
      bodyText = b['moduleName'] as string;
      bodyMatcherType = 'wasm';
    } else if (b['type'] === 'PARAMETERS' && b['parameters'] != null && typeof b['parameters'] === 'object') {
      // Round-trip parameters back to key=value lines
      const params = b['parameters'] as Record<string, unknown>;
      const lines: string[] = [];
      for (const [k, v] of Object.entries(params)) {
        if (Array.isArray(v)) {
          for (const vv of v as unknown[]) lines.push(`${k}=${String(vv)}`);
        } else {
          lines.push(`${k}=${String(v)}`);
        }
      }
      bodyText = lines.join('\n');
      bodyMatcherType = 'parameters';
    } else if (b['type'] === 'JSON' && b['json'] != null) {
      // JSON body matcher — dedicated type with matchType option
      bodyText = typeof b['json'] === 'string' ? b['json'] : JSON.stringify(b['json'], null, 2);
      bodyMatcherType = 'json';
      if (b['matchType'] === 'STRICT') jsonMatchType = 'STRICT';
    } else if (b['type'] === 'STRING' && typeof b['string'] === 'string') {
      // STRING body with potential subString toggle
      bodyText = b['string'];
      bodyMatcherType = 'string';
      if (b['subString'] === true) bodySubString = true;
    } else if (typeof b['string'] === 'string') {
      bodyText = b['string'];
    } else if (b['json'] != null) {
      // Untyped wrapper carrying a `json` field — treat as a JSON body matcher.
      bodyText = typeof b['json'] === 'string' ? b['json'] : JSON.stringify(b['json'], null, 2);
      bodyMatcherType = 'json';
    } else {
      // A bare JSON object body (no `type` wrapper) is how the server serialises a
      // JsonBody with the default ONLY_MATCHING_FIELDS match type. Read it back as a
      // JSON matcher (not an exact string) so editing preserves JSON matching.
      bodyText = JSON.stringify(b, null, 2);
      bodyMatcherType = 'json';
    }
  }

  return {
    id: typeof v['id'] === 'string' ? (v['id'] as string) : '',
    method: denottable(req['method']),
    path: denottable(req['path']),
    headers: mapToLines(req['headers'], ':'),
    queryString: mapToLines(req['queryStringParameters'], '='),
    cookies: mapToLines(req['cookies'], '='),
    pathParams: mapToLines(req['pathParameters'], '='),
    body: bodyText,
    bodyBinary,
    bodyMatcherType,
    graphqlOptions,
    jsonMatchType,
    bodySubString,
    bodyAllOf,
    bodyDateTime,
    jwt: jwtFromRequest(req),
    // typeof check, not `=== true`: an explicit `false` is an HTTP-only matcher and must load
    // as false, not collapse into the same state as an absent (match-either) field.
    secure: typeof req['secure'] === 'boolean' ? (req['secure'] as boolean) : undefined,
    clientIp: typeof req['clientIp'] === 'string' ? (req['clientIp'] as string) : '',
    priority: typeof v['priority'] === 'number' ? (v['priority'] as number) : 0,
    // 0 = unlimited. An explicitly unlimited expectation prefills 0 rather than its
    // (irrelevant) remainingTimes count.
    times: (() => {
      const t = v['times'];
      if (typeof t !== 'object' || t === null) return 0;
      const tr = t as Record<string, unknown>;
      if (tr['unlimited'] === true) return 0;
      return typeof tr['remainingTimes'] === 'number' ? (tr['remainingTimes'] as number) : 0;
    })(),
    // timeToLive prefills as seconds (0 = unlimited), converting from the stored timeUnit.
    ttlSeconds: (() => {
      const t = v['timeToLive'];
      if (typeof t !== 'object' || t === null) return 0;
      const tr = t as Record<string, unknown>;
      if (tr['unlimited'] === true) return 0;
      const val = tr['timeToLive'];
      if (typeof val !== 'number') return 0;
      const factor: Record<string, number> = { DAYS: 86400, HOURS: 3600, MINUTES: 60, SECONDS: 1, MILLISECONDS: 0.001 };
      const unit = typeof tr['timeUnit'] === 'string' ? (tr['timeUnit'] as string) : 'SECONDS';
      return Math.round(val * (factor[unit] ?? 1));
    })(),
  };
}

// ---------------------------------------------------------------------------
// Per-action prefill — detect which response action an expectation uses and
// return the matching ActionType + per-state overrides.
// ---------------------------------------------------------------------------

interface ActionPrefill {
  type: ActionType;
  staticState?: StaticState;
  forwardState?: ForwardState;
  forwardOverrideState?: ForwardOverrideState;
  forwardFallbackState?: ForwardFallbackState;
  callbackState?: CallbackState;
  templateState?: TemplateState;
  errorState?: ErrorState;
  websocketState?: WebSocketState;
  sseState?: StandardSseState;
  binaryResponseState?: StandardBinaryResponseState;
  dnsResponseState?: StandardDnsState;
  forwardTemplateState?: StandardForwardTemplateState;
  forwardClassCallbackState?: StandardForwardClassCallbackState;
  grpcStreamState?: GrpcStreamState;
}

let lastListItemId = 0;

/** A hidden identity for a list row, unique across loads, so an edit can tell which loaded item a row is. */
function nextListItemId(): number {
  return ++lastListItemId;
}

function listItemRow(text: string): StandardListItemDraft {
  return { itemId: nextListItemId(), text };
}

/** One row per loaded item whose `key` is text (a binary message has none); one empty row when there are none. */
function listRowsFrom(raw: unknown, key: 'text' | 'json'): StandardListItemDraft[] {
  const rows = (Array.isArray(raw) ? (raw as unknown[]) : [])
    .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>)[key] : undefined))
    .filter((t): t is string => typeof t === 'string')
    .map(listItemRow);
  return rows.length > 0 ? rows : [listItemRow('')];
}

function emptySseEvent(): StandardSseEventDraft {
  return { itemId: nextListItemId(), event: '', data: '', id: '', retry: '' };
}

/** `items` with the item at `idx` moved one place up (-1) or down (+1). */
function moveItem<T>(items: T[], idx: number, delta: -1 | 1): T[] {
  const to = idx + delta;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[idx], next[to]] = [next[to]!, next[idx]!];
  return next;
}

function unwrapBody(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (typeof body !== 'object') return String(body);
  const b = body as Record<string, unknown>;
  if (typeof b['string'] === 'string') return b['string'];
  if (b['json'] != null) {
    return typeof b['json'] === 'string' ? b['json'] : JSON.stringify(b['json'], null, 2);
  }
  if (typeof b['base64Bytes'] === 'string') return b['base64Bytes'] as string;
  return JSON.stringify(b, null, 2);
}

function headersToText(headers: unknown, exclude?: string): string {
  if (!headers || typeof headers !== 'object') return '';
  const lines: string[] = [];
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (exclude && k.toLowerCase() === exclude.toLowerCase()) continue;
    if (Array.isArray(v)) {
      for (const vv of v as unknown[]) lines.push(`${k}: ${String(vv)}`);
    } else {
      lines.push(`${k}: ${String(v)}`);
    }
  }
  return lines.join('\n');
}

/** Parse an httpResponse.connectionOptions object back into the composer's draft shape. */
function connectionOptionsFromValue(raw: unknown): StandardConnectionOptions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const co: StandardConnectionOptions = {};
  if (typeof r['keepAliveOverride'] === 'boolean') co.keepAliveOverride = r['keepAliveOverride'];
  if (typeof r['closeSocket'] === 'boolean') co.closeSocket = r['closeSocket'];
  if (typeof r['contentLengthHeaderOverride'] === 'number') co.contentLengthHeaderOverride = r['contentLengthHeaderOverride'];
  if (r['suppressContentLengthHeader'] === true) co.suppressContentLengthHeader = true;
  if (r['suppressConnectionHeader'] === true) co.suppressConnectionHeader = true;
  return Object.keys(co).length > 0 ? co : undefined;
}

function paramsToText(params: unknown): string {
  if (!params || typeof params !== 'object') return '';
  const lines: string[] = [];
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      for (const vv of v as unknown[]) lines.push(`${k}=${String(vv)}`);
    } else {
      lines.push(`${k}=${String(v)}`);
    }
  }
  return lines.join('\n');
}

/** The payload the form builds from per-action states; shared by the live draft and the edit baseline. */
function actionPayloadFromStates(p: ActionPrefill): StandardActionPayload {
  const a: StandardActionPayload = { type: p.type };
  if (p.type === 'static') a.static = p.staticState;
  if (p.type === 'forward') a.forward = p.forwardState;
  if (p.type === 'forward_override') a.forwardOverride = p.forwardOverrideState;
  if (p.type === 'forward_fallback') a.forwardFallback = p.forwardFallbackState;
  if (p.type === 'callback') a.callback = p.callbackState;
  if (p.type === 'template') a.template = p.templateState;
  if (p.type === 'error') a.error = p.errorState;
  if (p.type === 'websocket' && p.websocketState) a.websocket = {
    subprotocol: p.websocketState.subprotocol,
    messages: p.websocketState.messages,
    closeConnection: p.websocketState.closeConnection,
    matchers: p.websocketState.matchers,
  };
  if (p.type === 'sse') a.sse = p.sseState;
  if (p.type === 'binary_response') a.binaryResponse = p.binaryResponseState;
  if (p.type === 'dns_response') a.dnsResponse = p.dnsResponseState;
  if (p.type === 'forward_template') a.forwardTemplate = p.forwardTemplateState;
  if (p.type === 'forward_class_callback') a.forwardClassCallback = p.forwardClassCallbackState;
  if (p.type === 'grpc_stream') a.grpcStream = p.grpcStreamState;
  return a;
}

/** The action-family JSON the form emits for a freshly loaded action (see editActionBaseline). */
function actionBaselineFor(prefill: ActionPrefill): Record<string, unknown> {
  const json = buildExpectationJson(emptyMatcher(), actionPayloadFromStates(prefill));
  const baseline: Record<string, unknown> = {};
  for (const k of ACTION_FAMILY_KEYS) if (k in json) baseline[k] = json[k];
  return baseline;
}

function actionFromExpectation(item: JsonListItem): ActionPrefill | null {
  const v = item.value;

  // Static HTTP response
  if (v['httpResponse'] && typeof v['httpResponse'] === 'object') {
    const r = v['httpResponse'] as Record<string, unknown>;
    const headers = r['headers'] as Record<string, unknown> | undefined;
    const contentType = headers?.['content-type'] ?? headers?.['Content-Type'];
    const delay = r['delay'] as Record<string, unknown> | undefined;
    // The form supports MILLISECONDS/SECONDS/MINUTES. A stored HOURS/DAYS delay
    // (valid TimeUnit values) is rescaled to MINUTES so the duration is preserved
    // rather than silently coerced to milliseconds.
    const { delayValue: normDelayValue, delayUnit: normDelayUnit } = (() => {
      const rawValue = typeof delay?.['value'] === 'number' ? (delay['value'] as number) : 0;
      switch (delay?.['timeUnit']) {
        case 'SECONDS': return { delayValue: rawValue, delayUnit: 'SECONDS' as StaticDelayUnit };
        case 'MINUTES': return { delayValue: rawValue, delayUnit: 'MINUTES' as StaticDelayUnit };
        case 'HOURS': return { delayValue: rawValue * 60, delayUnit: 'MINUTES' as StaticDelayUnit };
        case 'DAYS': return { delayValue: rawValue * 1440, delayUnit: 'MINUTES' as StaticDelayUnit };
        default: return { delayValue: rawValue, delayUnit: 'MILLISECONDS' as StaticDelayUnit };
      }
    })();
    // Round-trip response cookies: { name: "value", ... } → "name=value" lines
    let cookiesText = '';
    if (r['cookies'] && typeof r['cookies'] === 'object') {
      const cLines: string[] = [];
      for (const [k, cv] of Object.entries(r['cookies'] as Record<string, unknown>)) {
        cLines.push(`${k}=${String(cv)}`);
      }
      cookiesText = cLines.join('\n');
    }
    // A FILE response body is read back into the file-body fields rather than the inline body text.
    const rawBody = r['body'];
    const fileBody = (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
      && (rawBody as Record<string, unknown>)['type'] === 'FILE')
      ? (rawBody as Record<string, unknown>) : null;
    const fileTt = fileBody?.['templateType'];
    const fileContentType = typeof fileBody?.['contentType'] === 'string' ? (fileBody['contentType'] as string) : undefined;
    return {
      type: 'static',
      staticState: {
        statusCode: typeof r['statusCode'] === 'number' ? (r['statusCode'] as number) : 200,
        body: fileBody ? '' : unwrapBody(r['body']),
        bodyFromFile: !!fileBody,
        filePath: fileBody && typeof fileBody['filePath'] === 'string' ? (fileBody['filePath'] as string) : '',
        fileTemplateType: fileTt === 'MUSTACHE' || fileTt === 'VELOCITY' ? fileTt : '',
        templatedFilePath: fileBody?.['templatedFilePath'] === true ? true : undefined,
        // The loaded content type, or none: an application/json default would show a header the
        // save does not send (an untouched form value keeps the original), so the preview would differ.
        contentType: fileBody
          ? (fileContentType ?? '')
          : (Array.isArray(contentType) ? String((contentType as unknown[])[0] ?? '')
            : typeof contentType === 'string' ? contentType : ''),
        // Preserve any non-content-type response headers so editing in place does not drop them.
        headers: headersToText(r['headers'], 'content-type'),
        connectionOptions: connectionOptionsFromValue(r['connectionOptions']),
        reasonPhrase: typeof r['reasonPhrase'] === 'string' ? (r['reasonPhrase'] as string) : '',
        cookies: cookiesText,
        delayValue: normDelayValue,
        delayUnit: normDelayUnit,
      },
    };
  }

  // Forward to upstream
  if (v['httpForward'] && typeof v['httpForward'] === 'object') {
    const f = v['httpForward'] as Record<string, unknown>;
    return {
      type: 'forward',
      forwardState: {
        scheme: f['scheme'] === 'HTTP' ? 'HTTP' : 'HTTPS',
        host: typeof f['host'] === 'string' ? (f['host'] as string) : '',
        port: typeof f['port'] === 'number' ? (f['port'] as number) : 443,
      },
    };
  }

  // Forward with override
  if (v['httpOverrideForwardedRequest'] && typeof v['httpOverrideForwardedRequest'] === 'object') {
    const o = v['httpOverrideForwardedRequest'] as Record<string, unknown>;
    const override = (o['requestOverride'] as Record<string, unknown> | undefined) ?? {};
    const overrideHeaders = override['headers'] as Record<string, unknown> | undefined;
    const hostHeader = overrideHeaders?.['Host'] ?? overrideHeaders?.['host'];
    const hostText = Array.isArray(hostHeader) ? String((hostHeader as unknown[])[0] ?? '')
      : typeof hostHeader === 'string' ? hostHeader : '';
    return {
      type: 'forward_override',
      forwardOverrideState: {
        overrideMethod: typeof override['method'] === 'string' ? (override['method'] as string) : '',
        overrideHost: hostText,
        overrideScheme: override['secure'] === true ? 'HTTPS' : override['secure'] === false ? 'HTTP' : '',
        overridePath: typeof override['path'] === 'string' ? (override['path'] as string) : '',
        overrideQueryString: paramsToText(override['queryStringParameters']),
        overrideHeaders: headersToText(override['headers'], 'host'),
        overrideBody: unwrapBody(override['body']),
      },
    };
  }

  // Class callback
  if (v['httpResponseClassCallback'] && typeof v['httpResponseClassCallback'] === 'object') {
    const c = v['httpResponseClassCallback'] as Record<string, unknown>;
    return {
      type: 'callback',
      callbackState: {
        callbackClass: typeof c['callbackClass'] === 'string' ? (c['callbackClass'] as string) : '',
      },
    };
  }

  // Response template
  if (v['httpResponseTemplate'] && typeof v['httpResponseTemplate'] === 'object') {
    const t = v['httpResponseTemplate'] as Record<string, unknown>;
    const tt = t['templateType'];
    return {
      type: 'template',
      templateState: {
        templateType: tt === 'JAVASCRIPT' || tt === 'MUSTACHE' ? tt : 'VELOCITY',
        template: typeof t['template'] === 'string' ? (t['template'] as string) : '',
        templateFile: typeof t['templateFile'] === 'string' ? (t['templateFile'] as string) : '',
        parameters: templateParametersText(t['parameters']),
      },
    };
  }

  // Error
  if (v['httpError'] && typeof v['httpError'] === 'object') {
    const e = v['httpError'] as Record<string, unknown>;
    const delay = e['delay'] as Record<string, unknown> | undefined;
    const responseBytes = e['responseBytes'];
    return {
      type: 'error',
      errorState: {
        dropConnection: e['dropConnection'] === true,
        resetConnection: e['resetConnection'] === true,
        responseBytesB64: typeof responseBytes === 'string' ? responseBytes : '',
        delayValue: typeof delay?.['value'] === 'number' ? (delay['value'] as number) : 0,
        delayUnit:
          delay?.['timeUnit'] === 'SECONDS' ? 'SECONDS'
          : delay?.['timeUnit'] === 'MINUTES' ? 'MINUTES'
          : 'MILLISECONDS',
      },
    };
  }

  // Forward with fallback
  if (v['httpForwardWithFallback'] && typeof v['httpForwardWithFallback'] === 'object') {
    const fwf = v['httpForwardWithFallback'] as Record<string, unknown>;
    const fwd = (fwf['httpForward'] as Record<string, unknown> | undefined) ?? {};
    const fbResp = (fwf['fallbackResponse'] as Record<string, unknown> | undefined) ?? {};
    const codes = Array.isArray(fwf['fallbackOnStatusCodes'])
      ? (fwf['fallbackOnStatusCodes'] as number[]).join(',')
      : '';
    return {
      type: 'forward_fallback',
      forwardFallbackState: {
        scheme: fwd['scheme'] === 'HTTP' ? 'HTTP' : 'HTTPS',
        host: typeof fwd['host'] === 'string' ? (fwd['host'] as string) : '',
        port: typeof fwd['port'] === 'number' ? (fwd['port'] as number) : 443,
        fallbackStatusCode: typeof fbResp['statusCode'] === 'number' ? (fbResp['statusCode'] as number) : 200,
        fallbackBody: unwrapBody(fbResp['body']),
        fallbackOnStatusCodes: codes,
        // Absent means TRUE on the server (HttpForwardWithFallbackActionHandler reads
        // `== null || value`), so an absent field must load as ON. Loading it as OFF would
        // both misreport the live behaviour and — since the generator now always emits the
        // value — silently turn fallback OFF when the expectation is re-saved.
        fallbackOnTimeout: fwf['fallbackOnTimeout'] !== false,
      },
    };
  }

  // WebSocket response
  if (v['httpWebSocketResponse'] && typeof v['httpWebSocketResponse'] === 'object') {
    const ws = v['httpWebSocketResponse'] as Record<string, unknown>;
    const rawMatchers = Array.isArray(ws['matchers']) ? (ws['matchers'] as Record<string, unknown>[]) : [];
    const matchers: WebSocketMatcherRow[] = rawMatchers.map((m) => ({
      itemId: nextListItemId(),
      frameType: (['TEXT', 'BINARY', 'PING', 'PONG', 'ANY'].includes(m['frameType'] as string)
        ? m['frameType'] as WebSocketFrameType
        : 'ANY'),
      // The WebSocketMessageMatcherDTO serialises textMatcher as a plain string (value only),
      // but denottable also tolerates a NottableString object form defensively.
      textMatcher: denottable(m['textMatcher']),
      responses: listRowsFrom(m['responses'], 'text'),
    }));
    return {
      type: 'websocket',
      websocketState: {
        subprotocol: typeof ws['subprotocol'] === 'string' ? (ws['subprotocol'] as string) : '',
        messages: listRowsFrom(ws['messages'], 'text'),
        // Absent means CLOSE for WebSocket (HttpWebSocketResponseActionHandler reads
        // `== null || value`), so an absent field must load as ON — see the SSE note below.
        closeConnection: ws['closeConnection'] !== false,
        matchers,
      },
    };
  }

  // SSE response
  if (v['httpSseResponse'] && typeof v['httpSseResponse'] === 'object') {
    const sse = v['httpSseResponse'] as Record<string, unknown>;
    const rawEvents = Array.isArray(sse['events']) ? (sse['events'] as Record<string, unknown>[]) : [];
    const events: StandardSseEventDraft[] = rawEvents.map((ev) => ({
      itemId: nextListItemId(),
      event: typeof ev['event'] === 'string' ? (ev['event'] as string) : '',
      data: typeof ev['data'] === 'string' ? (ev['data'] as string) : '',
      id: typeof ev['id'] === 'string' ? (ev['id'] as string) : '',
      retry: typeof ev['retry'] === 'number' ? String(ev['retry']) : '',
    }));
    return {
      type: 'sse',
      sseState: {
        statusCode: typeof sse['statusCode'] === 'number' ? (sse['statusCode'] as number) : 200,
        headers: headersToText(sse['headers']),
        events: events.length > 0 ? events : [emptySseEvent()],
        // Absent means CLOSE for SSE (HttpSseResponseActionHandler reads `== null || value`).
        // Loading absent as OFF would misreport the live behaviour, and because the generator
        // now always emits the value, re-saving an untouched expectation would write
        // `closeConnection: false` and silently stop it closing the stream.
        closeConnection: sse['closeConnection'] !== false,
      },
    };
  }

  // Binary response
  if (v['binaryResponse'] && typeof v['binaryResponse'] === 'object') {
    const bin = v['binaryResponse'] as Record<string, unknown>;
    // binaryData is a byte[] serialised as base64 by Jackson
    const data = typeof bin['binaryData'] === 'string' ? (bin['binaryData'] as string) : '';
    const binaryResponseState: StandardBinaryResponseState = { binaryData: data };
    const upstream = BINARY_UPSTREAM_NAMES.find((u) => u === bin['upstream']);
    if (upstream) binaryResponseState.upstream = upstream;
    const delay = bin['delay'];
    if (delay && typeof delay === 'object' && !Array.isArray(delay)) {
      binaryResponseState.delay = delay as Record<string, unknown>;
    }
    if (typeof bin['primary'] === 'boolean') binaryResponseState.primary = bin['primary'];
    return {
      type: 'binary_response',
      binaryResponseState,
    };
  }

  // DNS response
  if (v['dnsResponse'] && typeof v['dnsResponse'] === 'object') {
    const dns = v['dnsResponse'] as Record<string, unknown>;
    const validCodes: DnsResponseCodeName[] = ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED'];
    const rc = validCodes.includes(dns['responseCode'] as DnsResponseCodeName) ? (dns['responseCode'] as DnsResponseCodeName) : 'NOERROR';
    const answerRecords = Array.isArray(dns['answerRecords']) ? JSON.stringify(dns['answerRecords'], null, 2) : '';
    return {
      type: 'dns_response',
      dnsResponseState: { responseCode: rc, answerRecords },
    };
  }

  // Forward template
  if (v['httpForwardTemplate'] && typeof v['httpForwardTemplate'] === 'object') {
    const ft = v['httpForwardTemplate'] as Record<string, unknown>;
    const tt = ft['templateType'];
    return {
      type: 'forward_template',
      forwardTemplateState: {
        templateType: tt === 'JAVASCRIPT' || tt === 'MUSTACHE' ? tt : 'VELOCITY',
        template: typeof ft['template'] === 'string' ? (ft['template'] as string) : '',
        templateFile: typeof ft['templateFile'] === 'string' ? (ft['templateFile'] as string) : '',
        parameters: templateParametersText(ft['parameters']),
      },
    };
  }

  // Forward class callback
  if (v['httpForwardClassCallback'] && typeof v['httpForwardClassCallback'] === 'object') {
    const fc = v['httpForwardClassCallback'] as Record<string, unknown>;
    return {
      type: 'forward_class_callback',
      forwardClassCallbackState: {
        callbackClass: typeof fc['callbackClass'] === 'string' ? (fc['callbackClass'] as string) : '',
      },
    };
  }

  // gRPC stream response
  if (v['grpcStreamResponse'] && typeof v['grpcStreamResponse'] === 'object') {
    const grpc = v['grpcStreamResponse'] as Record<string, unknown>;
    const msgs = listRowsFrom(grpc['messages'], 'json');
    return {
      type: 'grpc_stream',
      grpcStreamState: {
        statusName: typeof grpc['statusName'] === 'string' ? (grpc['statusName'] as string) : '',
        statusMessage: typeof grpc['statusMessage'] === 'string' ? (grpc['statusMessage'] as string) : '',
        headers: headersToText(grpc['headers']),
        messages: msgs,
        // Deliberately `=== true`, unlike SSE/WebSocket above: GrpcStreamResponseActionHandler
        // reads `!= null && value`, so for gRPC an ABSENT closeConnection means DON'T close.
        closeConnection: grpc['closeConnection'] === true,
      },
    };
  }

  // LLM Conversation expectations are filtered out of the standard picker
  // entirely — they have their own top-level kind + wizard path.

  return null;
}

// ---------------------------------------------------------------------------
// Static HTTP action panel
// ---------------------------------------------------------------------------

type StaticDelayUnit = 'MILLISECONDS' | 'SECONDS' | 'MINUTES';

interface StaticState {
  statusCode: number;
  body: string;
  contentType: string;
  /** When true the body is served from a file (FILE body) rather than the inline `body` text. */
  bodyFromFile: boolean;
  /** Path to the response body file (classpath or filesystem), used when `bodyFromFile` is true. */
  filePath: string;
  /** Optional template engine applied to the body file against the request ('' = serve verbatim). */
  fileTemplateType: '' | 'MUSTACHE' | 'VELOCITY';
  /** When true (with a fileTemplateType) the file path is also rendered against the request. */
  templatedFilePath?: boolean;
  /** Additional response headers as "Name: value" lines, beyond Content-Type. */
  headers: string;
  /** Connection-level response controls; undefined fields use the server default. */
  connectionOptions?: StandardConnectionOptions;
  /** Custom HTTP reason phrase. */
  reasonPhrase: string;
  /** Response cookies as "name=value" lines. */
  cookies: string;
  /** Pre-response delay value. 0 = no delay. */
  delayValue: number;
  /** Pre-response delay time unit. */
  delayUnit: StaticDelayUnit;
}

/** '' (default) | 'true' | 'false' tri-state mapping for an optional boolean connection option. */
function triValue(v: boolean | undefined): '' | 'true' | 'false' {
  return v == null ? '' : v ? 'true' : 'false';
}
function triParse(v: string): boolean | undefined {
  return v === '' ? undefined : v === 'true';
}

/**
 * A response status code input. A blank field is held as NaN rather than snapping
 * to 0 or 200, so the form can refuse it (see {@link responseStatusCodeError}).
 */
function statusCodeHint(value: number): string | undefined {
  const error = responseStatusCodeError(value);
  return error ? uiText(error, '状态码必须为 100 至 999 之间的整数') : undefined;
}

function StatusCodeField({
  value,
  onChange,
  width = 130,
  testId,
}: {
  value: number;
  onChange: (statusCode: number) => void;
  width?: number;
  testId?: string;
}) {
  const error = statusCodeHint(value);
  return (
    <TextField
      label={uiText("Status code", "状态码")}
      size="small"
      type="number"
      value={Number.isNaN(value) ? '' : value}
      onChange={(e) => onChange(e.target.value.trim() === '' ? NaN : Number(e.target.value))}
      error={!!error}
      helperText={error}
      slotProps={{ htmlInput: { min: 100, max: 999, step: 1, 'data-testid': testId } }}
      sx={{ width: { xs: '100%', sm: width } }}
    />
  );
}

/**
 * Why a fixed delay field is disabled: the loaded delay has a distribution (which the server uses
 * instead of the fixed value) or a template (which falls back to the fixed value). A delay is saved
 * whole, so typing a fixed value would replace, and lose, either one.
 */
const LOCKED_DELAY_HELP = uiText('This delay uses a distribution, or a template with the fixed value only as its fallback, kept under Other fields. Remove it there to set a fixed delay.', "此延迟使用概率分布，或使用以固定值作为备用值的模板。相关设置保留在“其他字段”中。可在那里移除后再设置固定延迟。");

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function StaticHttpPanel({
  state,
  setState,
  delayLocked = false,
}: {
  state: StaticState;
  setState: (s: StaticState) => void;
  /** See {@link LOCKED_DELAY_HELP}. */
  delayLocked?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <StatusCodeField value={state.statusCode} onChange={(statusCode) => setState({ ...state, statusCode })} />
        <TextField
          label={uiText("Reason phrase (optional)", "原因短语（可选）")}
          size="small"
          value={state.reasonPhrase}
          onChange={(e) => setState({ ...state, reasonPhrase: e.target.value })}
          sx={{ width: { xs: '100%', sm: 200 } }}
          placeholder={uiText("e.g. Not Found", "例如 Not Found")}
        />
        <TextField
          label="Content-Type"
          size="small"
          value={state.contentType}
          onChange={(e) => setState({ ...state, contentType: e.target.value })}
          sx={{ flex: 1 }}
        />
      </Box>
      <TextField
        label={uiText("Response headers (one per line, Name: value)", "响应头（每行一项 Name: value）")}
        multiline
        minRows={2}
        maxRows={8}
        value={state.headers}
        onChange={(e) => setState({ ...state, headers: e.target.value })}
        placeholder={'Cache-Control: no-cache\nLocation: /elsewhere'}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <TextField
        label={uiText("Response cookies (name=value per line)", "响应 Cookie（每行一项 name=value）")}
        multiline
        minRows={2}
        maxRows={4}
        value={state.cookies}
        onChange={(e) => setState({ ...state, cookies: e.target.value })}
        placeholder={'session=abc123\ntheme=dark'}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <TextField
        select
        label={uiText("Body source", "响应体来源")}
        size="small"
        value={state.bodyFromFile ? 'file' : 'inline'}
        onChange={(e) => setState({ ...state, bodyFromFile: e.target.value === 'file' })}
        sx={{ width: { xs: '100%', sm: 220 } }}
      >
        <MenuItem value="inline">{uiText("Inline body", "直接填写")}</MenuItem>
        <MenuItem value="file">{uiText("From file", "读取文件")}</MenuItem>
      </TextField>
      {state.bodyFromFile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            label={uiText("Body file path", "响应体文件路径")}
            size="small"
            value={state.filePath}
            onChange={(e) => setState({ ...state, filePath: e.target.value })}
            placeholder="responses/order.json"
            slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
          />
          <TextField
            select
            label={uiText("Template engine (optional)", "模板引擎（可选）")}
            size="small"
            value={state.fileTemplateType}
            onChange={(e) => setState({ ...state, fileTemplateType: e.target.value as StaticState['fileTemplateType'] })}
            sx={{ width: { xs: '100%', sm: 320 } }}
            helperText={uiText("Render the file as a template against the request. JavaScript is not supported for body files — use a Response template for that.", "根据请求渲染文件模板。响应体文件不支持 JavaScript，如需使用，请选择响应模板。")}
          >
            <MenuItem value="">{uiText("None (serve file verbatim)", "无（原样返回文件）")}</MenuItem>
            <MenuItem value="MUSTACHE">Mustache</MenuItem>
            <MenuItem value="VELOCITY">Velocity</MenuItem>
          </TextField>
          {state.fileTemplateType && (
            <FormControlLabel
              sx={{ ml: 1 }}
              control={
                <Checkbox
                  size="small"
                  checked={state.templatedFilePath === true}
                  onChange={(e) => setState({ ...state, templatedFilePath: e.target.checked || undefined })}
                  slotProps={{ input: { 'data-testid': 'file-templated-path' } as Record<string, unknown> }}
                />
              }
              label={
                <Typography variant="body2">
                  {uiText("Choose the file from the request (template the path, e.g. ", "按请求选择文件（使用模板生成路径，例如 ")}{'responses/{{ request.pathParameters.name.0 }}.json'})
                </Typography>
              }
            />
          )}
        </Box>
      ) : (
        <JsonEditor
          label={uiText("Response body", "响应体")}
          ariaLabel={uiText("Response body", "响应体")}
          language={responseBodyLanguage(state.contentType)}
          value={state.body}
          onChange={(next) => setState({ ...state, body: next })}
          placeholder='{"ok":true}'
          height={200}
        />
      )}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label={uiText("Response delay", "响应延迟")}
          size="small"
          type="number"
          value={state.delayValue}
          onChange={(e) => setState({ ...state, delayValue: Number(e.target.value) || 0 })}
          sx={{ width: { xs: '100%', sm: delayLocked ? 360 : 180 } }}
          disabled={delayLocked}
          helperText={delayLocked ? LOCKED_DELAY_HELP : uiText('0 = no delay', "0 表示无延迟")}
        />
        <TextField
          label={uiText("Unit", "单位")}
          size="small"
          select
          disabled={delayLocked}
          value={state.delayUnit}
          onChange={(e) => setState({ ...state, delayUnit: e.target.value as StaticDelayUnit })}
          sx={{ width: { xs: '100%', sm: 160 } }}
        >
          <MenuItem value="MILLISECONDS">{uiText("milliseconds", "毫秒")}</MenuItem>
          <MenuItem value="SECONDS">{uiText("seconds", "秒")}</MenuItem>
          <MenuItem value="MINUTES">{uiText("minutes", "分钟")}</MenuItem>
        </TextField>
      </Box>
      <ConnectionOptionsFields
        value={state.connectionOptions}
        onChange={(co) => setState({ ...state, connectionOptions: co })}
      />
    </Box>
  );
}

/** Connection-level response controls (keep-alive, close socket, Content-Length, header suppression). */
function ConnectionOptionsFields({
  value,
  onChange,
}: {
  value: StandardConnectionOptions | undefined;
  onChange: (co: StandardConnectionOptions | undefined) => void;
}) {
  const co = value ?? {};
  const update = (patch: Partial<StandardConnectionOptions>) => {
    const next = { ...co, ...patch };
    // Drop keys that are undefined so an all-default object becomes undefined (omitted).
    (Object.keys(next) as (keyof StandardConnectionOptions)[]).forEach((k) => { if (next[k] == null) delete next[k]; });
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{uiText("Connection options (advanced)", "连接选项（高级）")}</Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
        <TextField select size="small" label={uiText("Keep-alive", "持久连接")} sx={{ width: { xs: '100%', sm: 130 } }} value={triValue(co.keepAliveOverride)}
          onChange={(e) => update({ keepAliveOverride: triParse(e.target.value) })}>
          <MenuItem value="">{uiText("Default", "默认")}</MenuItem>
          <MenuItem value="true">{uiText("Keep alive", "保持连接")}</MenuItem>
          <MenuItem value="false">{uiText("Close", "关闭")}</MenuItem>
        </TextField>
        <TextField select size="small" label={uiText("Close socket", "关闭套接字")} sx={{ width: { xs: '100%', sm: 150 } }} value={triValue(co.closeSocket)}
          onChange={(e) => update({ closeSocket: triParse(e.target.value) })}>
          <MenuItem value="">{uiText("Default", "默认")}</MenuItem>
          <MenuItem value="true">{uiText("Yes", "是")}</MenuItem>
          <MenuItem value="false">{uiText("No", "否")}</MenuItem>
        </TextField>
        <TextField size="small" type="number" label={uiText("Content-Length override", "改写 Content-Length")} sx={{ width: { xs: '100%', sm: 210 } }}
          value={co.contentLengthHeaderOverride ?? ''}
          onChange={(e) => update({ contentLengthHeaderOverride: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
        {/* ml: 1 cancels MUI FormControlLabel's default -11px left margin (which made the
            switch crowd the Content-Length field) and leaves a clear gap before each switch. */}
        <FormControlLabel sx={{ ml: 1 }} control={<Switch size="small" checked={co.suppressContentLengthHeader === true}
          onChange={(e) => update({ suppressContentLengthHeader: e.target.checked || undefined })} />}
          label={<Typography variant="body2">{uiText("Suppress Content-Length", "省略 Content-Length")}</Typography>} />
        <FormControlLabel sx={{ ml: 1 }} control={<Switch size="small" checked={co.suppressConnectionHeader === true}
          onChange={(e) => update({ suppressConnectionHeader: e.target.checked || undefined })} />}
          label={<Typography variant="body2">{uiText("Suppress Connection", "省略 Connection")}</Typography>} />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Forward to upstream
// ---------------------------------------------------------------------------

interface ForwardState {
  scheme: 'HTTP' | 'HTTPS';
  host: string;
  port: number;
}

function ForwardPanel({
  state,
  setState,
}: {
  state: ForwardState;
  setState: (s: ForwardState) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("MockServer will proxy the matched request to ", "MockServer 会将匹配的请求代理到 ")}<code>{state.scheme.toLowerCase()}://{state.host || uiText('host', "主机")}:{state.port}</code>{uiText(", preserving the path / headers / body.", "，保留路径、请求头和请求体。")}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={uiText("Scheme", "协议")}
          size="small"
          select
          value={state.scheme}
          onChange={(e) => setState({ ...state, scheme: e.target.value as 'HTTP' | 'HTTPS' })}
          sx={{ width: { xs: '100%', sm: 130 } }}
        >
          <MenuItem value="HTTP">HTTP</MenuItem>
          <MenuItem value="HTTPS">HTTPS</MenuItem>
        </TextField>
        <TextField
          label={uiText("Host", "主机")}
          size="small"
          sx={{ flex: 1 }}
          value={state.host}
          onChange={(e) => setState({ ...state, host: e.target.value })}
          placeholder="api.example.com"
        />
        <TextField
          label={uiText("Port", "端口")}
          size="small"
          type="number"
          sx={{ width: { xs: '100%', sm: 110 } }}
          value={state.port}
          onChange={(e) => setState({ ...state, port: Number(e.target.value) || 0 })}
        />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Forward with override
// ---------------------------------------------------------------------------

interface ForwardOverrideState {
  overrideMethod: string;
  overrideHost: string;
  overrideScheme: 'HTTP' | 'HTTPS' | '';
  overridePath: string;
  overrideQueryString: string;   // "key=value" lines
  overrideHeaders: string;        // "name: value" lines
  overrideBody: string;
}

function ForwardOverridePanel({
  state,
  setState,
}: {
  state: ForwardOverrideState;
  setState: (s: ForwardOverrideState) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Forward the matched request upstream after rewriting any of the fields below. Leave a field blank to keep the incoming value. At least one override must be set.", "将匹配的请求转发到上游，并改写下方指定的字段。留空可保留原值，至少需设置一个改写项。")}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={uiText("Method", "请求方法")}
          size="small"
          select
          value={state.overrideMethod}
          onChange={(e) => setState({ ...state, overrideMethod: e.target.value })}
          sx={{ width: { xs: '100%', sm: 130 } }}
        >
          {['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
            <MenuItem key={m || 'unchanged'} value={m}>{m || uiText('(unchanged)', "（保持原值）")}</MenuItem>
          ))}
        </TextField>
        <TextField
          label={uiText("Scheme", "协议")}
          size="small"
          select
          value={state.overrideScheme}
          onChange={(e) => setState({ ...state, overrideScheme: e.target.value as ForwardOverrideState['overrideScheme'] })}
          sx={{ width: { xs: '100%', sm: 140 } }}
        >
          <MenuItem value="">{uiText("(unchanged)", "（保持原值）")}</MenuItem>
          <MenuItem value="HTTP">HTTP</MenuItem>
          <MenuItem value="HTTPS">HTTPS</MenuItem>
        </TextField>
        <TextField
          label={uiText("Host header", "Host 请求头")}
          size="small"
          sx={{ flex: 1 }}
          value={state.overrideHost}
          onChange={(e) => setState({ ...state, overrideHost: e.target.value })}
          placeholder="upstream.example.com:8080"
        />
      </Box>
      <TextField
        label={uiText("Path", "路径")}
        size="small"
        value={state.overridePath}
        onChange={(e) => setState({ ...state, overridePath: e.target.value })}
        placeholder="/v2/redirected-endpoint"
      />
      <TextField
        label={uiText("Query string parameters (one per line, key=value)", "查询字符串参数（每行一项 key=value）")}
        multiline
        minRows={2}
        maxRows={6}
        value={state.overrideQueryString}
        onChange={(e) => setState({ ...state, overrideQueryString: e.target.value })}
        placeholder={'limit=50\noffset=0'}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <TextField
        label={uiText("Headers (one per line, Name: value)", "请求头（每行一项 Name: value）")}
        multiline
        minRows={2}
        maxRows={6}
        value={state.overrideHeaders}
        onChange={(e) => setState({ ...state, overrideHeaders: e.target.value })}
        placeholder={'X-Forwarded-For: 1.2.3.4\nAuthorization: Bearer XYZ'}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <TextField
        label={uiText("Body override", "改写请求体")}
        multiline
        minRows={3}
        maxRows={12}
        value={state.overrideBody}
        onChange={(e) => setState({ ...state, overrideBody: e.target.value })}
        placeholder='{"replaced":"body"}'
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Class callback
// ---------------------------------------------------------------------------

interface CallbackState {
  callbackClass: string;
}

function CallbackPanel({
  state,
  setState,
}: {
  state: CallbackState;
  setState: (s: CallbackState) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Invoke a Java class implementing ", "调用实现了 ")}<code>ExpectationResponseCallback</code>{uiText(" on the MockServer instance. The class must already be on MockServer's classpath — the dashboard does not upload code.", " 的 Java 类动态生成响应。该类必须已在 MockServer 的类路径中，控制台无法上传代码。")}
      </Typography>
      <TextField
        label={uiText("Callback class (fully-qualified name)", "回调类（全限定类名）")}
        size="small"
        value={state.callbackClass}
        onChange={(e) => setState({ ...state, callbackClass: e.target.value })}
        placeholder="com.example.MyResponseCallback"
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Response template
// ---------------------------------------------------------------------------

/** Opens the template dry run (PUT /mockserver/template/test) for the inline template. */
function TestTemplateButton({
  connectionParams,
  templateType,
  template,
  actionType,
}: {
  connectionParams: ConnectionParams;
  templateType: TemplateTestEngine;
  template: string;
  actionType: TemplateTestActionType;
}) {
  const [open, setOpen] = useState(false);
  const blank = !template.trim();
  return (
    <>
      <Tooltip title={blank ? uiText('Write an inline template to test it; a template file cannot be tested here', "请填写内联模板后测试。此处无法测试从文件加载的模板。") : uiText('Render this template against a recorded request without registering it', "使用已记录的请求渲染模板，无需注册规则。")}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ScienceOutlinedIcon fontSize="small" />}
            disabled={blank}
            onClick={() => setOpen(true)}
          >
            {uiText("Test Template", "测试模板")}
          </Button>
        </span>
      </Tooltip>
      {open && (
        <TemplateTestDialog
          open
          onClose={() => setOpen(false)}
          connectionParams={connectionParams}
          templateType={templateType}
          template={template}
          actionType={actionType}
        />
      )}
    </>
  );
}

type TemplateType = 'VELOCITY' | 'JAVASCRIPT' | 'MUSTACHE';

interface TemplateState {
  templateType: TemplateType;
  template: string;
  /** Optional path to a file holding the template; used when the inline template is empty. */
  templateFile: string;
  /** Optional JSON object the template reads as `parameters`. */
  parameters?: string;
}

/** The JSON-object field shared by the response and forward template panels. */
function TemplateParametersField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const error = templateParametersHint(value);
  return (
    <TextField
      label={uiText("Parameters (optional JSON object)", "参数（可选 JSON 对象）")}
      size="small"
      multiline
      minRows={2}
      maxRows={10}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder='{ "greeting": "hello", "names": ["ann", "bob"] }'
      error={error != null}
      helperText={error ?? uiText('Values the template reads as parameters, such as parameters.greeting, so one template can be reused with different values.', "模板可通过 parameters.greeting 等名称读取这些参数，便于使用不同的参数值复用同一模板。")}
      slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
    />
  );
}

const TEMPLATE_PLACEHOLDERS: Record<TemplateType, string> = {
  VELOCITY: '{ "statusCode": 200, "body": "$!request.path" }',
  JAVASCRIPT: 'return { statusCode: 200, body: request.path };',
  MUSTACHE: '{ "statusCode": 200, "body": "{{request.path}}" }',
};

function templateParametersHint(value: string | undefined): string | null {
  const error = templateParametersError(value);
  return error ? uiText(error, '模板参数必须为有效的 JSON 对象，例如 {"greeting": "hello"}') : null;
}

function TemplatePanel({
  state,
  setState,
  connectionParams,
}: {
  state: TemplateState;
  setState: (s: TemplateState) => void;
  connectionParams: ConnectionParams;
}) {
  const handleSnippetInsert = useCallback(
    (snippet: string) => {
      setState({
        ...state,
        template: state.template
          ? state.template + (state.template.endsWith('\n') ? '' : '\n') + snippet
          : snippet,
      });
    },
    [state, setState],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Build the response dynamically from the incoming request. The template engine receives a ", "根据传入的请求动态构建响应。模板引擎会接收一个 ")}<code>request</code>{uiText(" object exposing method / path / headers / body.", " 对象，其中包含请求方法、路径、请求头和请求体。")}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label={uiText("Template engine", "模板引擎")}
          size="small"
          select
          value={state.templateType}
          onChange={(e) => setState({ ...state, templateType: e.target.value as TemplateType })}
          sx={{ width: { xs: '100%', sm: 200 } }}
        >
          <MenuItem value="VELOCITY">Velocity</MenuItem>
          <MenuItem value="JAVASCRIPT">JavaScript</MenuItem>
          <MenuItem value="MUSTACHE">Mustache</MenuItem>
        </TextField>
        <SnippetPalette
          engine={state.templateType as SnippetEngine}
          onInsert={handleSnippetInsert}
        />
        <TestTemplateButton
          connectionParams={connectionParams}
          templateType={state.templateType}
          template={state.template}
          actionType="RESPONSE_TEMPLATE"
        />
      </Box>
      <TextField
        label={uiText("Template body", "模板内容")}
        multiline
        minRows={6}
        maxRows={20}
        value={state.template}
        onChange={(e) => setState({ ...state, template: e.target.value })}
        placeholder={TEMPLATE_PLACEHOLDERS[state.templateType]}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <TextField
        label={uiText("Or load template from file (optional)", "或从文件加载模板（可选）")}
        size="small"
        value={state.templateFile}
        onChange={(e) => setState({ ...state, templateFile: e.target.value })}
        placeholder="templates/some_response.mustache"
        helperText={uiText("Classpath or filesystem path. Used when the inline template above is empty; the inline template wins when both are set.", "可填写类路径或文件系统路径。内联模板为空时会读取文件，同时配置时以内联模板为准。")}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <TemplateParametersField value={state.parameters ?? ''} onChange={(parameters) => setState({ ...state, parameters })} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Error / fault injection
// ---------------------------------------------------------------------------

type DelayUnit = 'MILLISECONDS' | 'SECONDS' | 'MINUTES';

interface ErrorState {
  dropConnection: boolean;
  resetConnection: boolean;
  responseBytesB64: string;
  delayValue: number;
  delayUnit: DelayUnit;
}

function ErrorPanel({
  state,
  setState,
  delayLocked = false,
}: {
  state: ErrorState;
  setState: (s: ErrorState) => void;
  /** See {@link LOCKED_DELAY_HELP}. */
  delayLocked?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Inject a fault for matched requests — close or reset the TCP connection, and / or return arbitrary bytes that are NOT a valid HTTP response. Useful for testing client error handling.", "对匹配的请求注入故障，例如关闭或重置 TCP 连接，或返回不符合 HTTP 响应格式的任意字节，用于测试客户端的异常处理。")}
      </Typography>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.dropConnection}
            onChange={(e) => setState({ ...state, dropConnection: e.target.checked })}
          />
        }
        label={
          <Typography variant="body2">
            {uiText("Drop connection (clean close)", "断开连接（正常关闭）")}
          </Typography>
        }
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.resetConnection}
            onChange={(e) => setState({ ...state, resetConnection: e.target.checked })}
          />
        }
        label={
          <Typography variant="body2">
            {uiText("Reset connection (TCP RST, client sees \"connection reset by peer\")", "重置连接（发送 TCP RST，客户端会收到“connection reset by peer”）")}
          </Typography>
        }
      />
      <TextField
        label={uiText("Response bytes (base64, optional)", "响应字节（Base64，可选）")}
        size="small"
        value={state.responseBytesB64}
        onChange={(e) => setState({ ...state, responseBytesB64: e.target.value })}
        placeholder="SFRUUC8xLjEgNTAwIEludGVybmFsIFNlcnZlciBFcnJvcg=="
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
        helperText={uiText("Sent before the connection is dropped (if drop is enabled). Base64-encoded raw bytes.", "Base64 编码的原始字节。如果启用了断开连接，这些字节会在连接关闭前发送。")}
      />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label={uiText("Pre-action delay", "执行动作前的延迟")}
          size="small"
          type="number"
          value={state.delayValue}
          onChange={(e) => setState({ ...state, delayValue: Number(e.target.value) || 0 })}
          sx={{ width: { xs: '100%', sm: delayLocked ? 360 : 180 } }}
          disabled={delayLocked}
          helperText={delayLocked ? LOCKED_DELAY_HELP : uiText('0 = no delay', "0 表示无延迟")}
        />
        <TextField
          label={uiText("Unit", "单位")}
          size="small"
          select
          disabled={delayLocked}
          value={state.delayUnit}
          onChange={(e) => setState({ ...state, delayUnit: e.target.value as DelayUnit })}
          sx={{ width: { xs: '100%', sm: 160 } }}
        >
          <MenuItem value="MILLISECONDS">{uiText("milliseconds", "毫秒")}</MenuItem>
          <MenuItem value="SECONDS">{uiText("seconds", "秒")}</MenuItem>
          <MenuItem value="MINUTES">{uiText("minutes", "分钟")}</MenuItem>
        </TextField>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Forward with fallback
// ---------------------------------------------------------------------------

type ForwardFallbackState = StandardForwardFallbackState;

function ForwardFallbackPanel({
  state,
  setState,
}: {
  state: ForwardFallbackState;
  setState: (s: ForwardFallbackState) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Forward the matched request to an upstream host. If the upstream returns one of the configured status codes or times out, MockServer returns the fallback response instead.", "将匹配的请求转发至上游主机。如果上游返回指定的状态码或超时，MockServer 会返回备用响应。")}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mt: 0.5 }}>
        {uiText("Forward target", "转发目标")}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={uiText("Scheme", "协议")}
          size="small"
          select
          value={state.scheme}
          onChange={(e) => setState({ ...state, scheme: e.target.value as 'HTTP' | 'HTTPS' })}
          sx={{ width: { xs: '100%', sm: 130 } }}
        >
          <MenuItem value="HTTP">HTTP</MenuItem>
          <MenuItem value="HTTPS">HTTPS</MenuItem>
        </TextField>
        <TextField
          label={uiText("Host", "主机")}
          size="small"
          sx={{ flex: 1 }}
          value={state.host}
          onChange={(e) => setState({ ...state, host: e.target.value })}
          placeholder="api.example.com"
        />
        <TextField
          label={uiText("Port", "端口")}
          size="small"
          type="number"
          sx={{ width: { xs: '100%', sm: 110 } }}
          value={state.port}
          onChange={(e) => setState({ ...state, port: Number(e.target.value) || 0 })}
        />
      </Box>
      <Divider sx={{ my: 0.5 }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {uiText("Fallback response", "备用响应")}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <StatusCodeField
          value={state.fallbackStatusCode}
          onChange={(fallbackStatusCode) => setState({ ...state, fallbackStatusCode })}
        />
        <TextField
          label={uiText("Fallback on status codes (comma-separated)", "触发回退的状态码（用逗号分隔）")}
          size="small"
          sx={{ flex: 1 }}
          value={state.fallbackOnStatusCodes}
          onChange={(e) => setState({ ...state, fallbackOnStatusCodes: e.target.value })}
          placeholder="500,502,503"
          slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
        />
      </Box>
      <TextField
        label={uiText("Fallback body", "备用响应体")}
        multiline
        minRows={3}
        maxRows={10}
        value={state.fallbackBody}
        onChange={(e) => setState({ ...state, fallbackBody: e.target.value })}
        placeholder='{"error":"upstream unavailable"}'
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.fallbackOnTimeout}
            onChange={(e) => setState({ ...state, fallbackOnTimeout: e.target.checked })}
          />
        }
        label={
          <Typography variant="body2">
            {uiText("Fallback on timeout / connection error", "超时或连接出错时回退")}
          </Typography>
        }
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// WebSocket response
// ---------------------------------------------------------------------------

interface WebSocketMatcherRow {
  itemId?: number;
  frameType: WebSocketFrameType;
  textMatcher: string;
  responses: StandardListItemDraft[];
}

interface WebSocketState {
  subprotocol: string;
  messages: StandardListItemDraft[];
  closeConnection: boolean;
  matchers: WebSocketMatcherRow[];
}

/** Up / down / remove buttons for row `idx` of a list of `count` rows, named e.g. "Move message 2 up". */
const ROW_NOUN_ZH = { message: '消息', response: '响应', matcher: '匹配条件', event: '事件' } as const;
type RowNoun = keyof typeof ROW_NOUN_ZH;

function RowControls({
  noun,
  idx,
  count,
  onMove,
  onRemove,
}: {
  noun: RowNoun;
  idx: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  // The row is keyed by its id, so this instance follows it; a move re-renders it at its new
  // index, where the clicked button (or, at the end of the list, the other one) gets focus back.
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  const refocus = useRef<-1 | 1 | null>(null);
  useEffect(() => {
    if (refocus.current === null) return;
    const atEnd = refocus.current === -1 ? idx === 0 : idx === count - 1;
    ((refocus.current === -1) !== atEnd ? up : down).current?.focus();
    refocus.current = null;
  }, [idx, count]);
  const move = (delta: -1 | 1) => {
    refocus.current = delta;
    onMove(delta);
  };
  return (
    <Box sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
      <IconButton ref={up} size="small" onClick={() => move(-1)} disabled={idx === 0} aria-label={uiText(`Move ${noun} ${idx + 1} up`, `上移第 ${idx + 1} 项${ROW_NOUN_ZH[noun]}`)}>
        <ArrowUpwardIcon fontSize="small" />
      </IconButton>
      <IconButton ref={down} size="small" onClick={() => move(1)} disabled={idx === count - 1} aria-label={uiText(`Move ${noun} ${idx + 1} down`, `下移第 ${idx + 1} 项${ROW_NOUN_ZH[noun]}`)}>
        <ArrowDownwardIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" color="error" onClick={onRemove} aria-label={uiText(`Remove ${noun} ${idx + 1}`, `移除第 ${idx + 1} 项${ROW_NOUN_ZH[noun]}`)}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

/** Whether `text` as a whole is one JSON value (such as a pretty-printed object), which a paste must not split. */
function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** The non-blank lines of `text`, untrimmed. */
function nonBlankLines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => l.trim());
}

/** `items` with row `idx` replaced by one row per line of `text`; the first keeps the row's id. */
function splitRow(items: StandardListItemDraft[], idx: number, text: string): StandardListItemDraft[] {
  const [first = '', ...rest] = nonBlankLines(text);
  return [...items.slice(0, idx), { ...items[idx]!, text: first }, ...rest.map(listItemRow), ...items.slice(idx + 1)];
}

/**
 * A list of text messages edited one per row, so each keeps its identity when rows move.
 * Several lines pasted into an empty row become one row each, unless the paste is one JSON
 * value; a row holding several lines stays one multi-line message and offers to split it.
 */
function MessageRows({
  noun,
  groupLabel,
  items,
  onChange,
  placeholder,
}: {
  noun: RowNoun;
  groupLabel: string;
  items: StandardListItemDraft[];
  onChange: (items: StandardListItemDraft[]) => void;
  placeholder: string;
}) {
  const label = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <Box role="group" aria-label={groupLabel} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {items.map((item, idx) => {
        const lines = nonBlankLines(item.text).length;
        return (
          <Box key={item.itemId ?? idx} sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <TextField
                label={uiText(`${label} ${idx + 1}`, `${ROW_NOUN_ZH[noun]} ${idx + 1}`)}
                size="small"
                multiline
                maxRows={6}
                fullWidth
                value={item.text}
                onChange={(e) => onChange(items.map((it, i) => (i === idx ? { ...it, text: e.target.value } : it)))}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  const oneLine = /^[^\r\n]*\r?\n$/.test(pasted);
                  if (item.text === '' && !oneLine && nonBlankLines(pasted).length > 1 && !isJson(pasted)) {
                    e.preventDefault();
                    onChange(splitRow(items, idx, pasted));
                  } else if (oneLine) {
                    e.preventDefault();
                    const field = e.target as HTMLTextAreaElement;
                    const text = field.value.slice(0, field.selectionStart) + pasted.replace(/\r?\n$/, '') + field.value.slice(field.selectionEnd);
                    onChange(items.map((it, i) => (i === idx ? { ...it, text } : it)));
                  }
                }}
                placeholder={placeholder}
                slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
              />
              {lines > 1 && (
                <Button size="small" onClick={() => onChange(splitRow(items, idx, item.text))} sx={{ px: 0.5 }}>
                  {uiText(`Split ${noun} ${idx + 1} into ${lines} ${noun}s`, `将第 ${idx + 1} 条${ROW_NOUN_ZH[noun]}拆分为 ${lines} 条`)}
                </Button>
              )}
            </Box>
            <RowControls
              noun={noun}
              idx={idx}
              count={items.length}
              onMove={(delta) => onChange(moveItem(items, idx, delta))}
              onRemove={() => onChange(items.filter((_, i) => i !== idx))}
            />
          </Box>
        );
      })}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" onClick={() => onChange([...items, listItemRow('')])}>
          {uiText(`Add ${noun}`, `添加${ROW_NOUN_ZH[noun]}`)}
        </Button>
        <Typography variant="caption" color="text.secondary">
          {uiText(`One ${noun} per row; use Add ${noun} for another.`, `每行一条${ROW_NOUN_ZH[noun]}。点击“添加${ROW_NOUN_ZH[noun]}”可继续添加。`)}
        </Typography>
      </Box>
    </Box>
  );
}

function WebSocketPanel({
  state,
  setState,
}: {
  state: WebSocketState;
  setState: (s: WebSocketState) => void;
}) {
  const addMatcher = () => {
    setState({
      ...state,
      matchers: [...state.matchers, { itemId: nextListItemId(), frameType: 'ANY', textMatcher: '', responses: [listItemRow('')] }],
    });
  };
  const updateMatcher = (idx: number, patch: Partial<WebSocketMatcherRow>) => {
    setState({
      ...state,
      matchers: state.matchers.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Upgrade the connection to a WebSocket and send initial messages. Optionally add bidirectional frame matchers that respond to incoming frames.", "将连接升级为 WebSocket 并发送初始消息。可添加双向帧匹配条件来响应收到的帧。")}
      </Typography>
      <TextField
        label={uiText("Subprotocol (optional)", "子协议（可选）")}
        size="small"
        value={state.subprotocol}
        onChange={(e) => setState({ ...state, subprotocol: e.target.value })}
        placeholder="graphql-ws"
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {uiText("Initial messages", "初始消息")}
      </Typography>
      <MessageRows
        noun="message"
        groupLabel={uiText("Initial messages", "初始消息")}
        items={state.messages}
        onChange={(messages) => setState({ ...state, messages })}
        placeholder={'{"type":"connection_ack"}'}
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.closeConnection}
            onChange={(e) => setState({ ...state, closeConnection: e.target.checked })}
          />
        }
        label={
          <Typography variant="body2">
            {uiText("Close connection after messages", "发送完消息后关闭连接")}
          </Typography>
        }
      />

      <Divider sx={{ my: 0.5 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {uiText("Bidirectional frame matchers", "双向帧匹配条件")}
        </Typography>
        <Button size="small" variant="outlined" onClick={addMatcher}>
          {uiText("Add matcher", "添加匹配条件")}
        </Button>
      </Box>
      {state.matchers.map((m, idx) => (
        <Paper
          key={m.itemId ?? idx}
          variant="outlined"
          data-testid={`websocket-matcher-${idx + 1}`}
          role="group"
          aria-label={uiText(`Matcher ${idx + 1}`, `匹配条件 ${idx + 1}`)}
          sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}
        >
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              label={uiText("Frame type", "帧类型")}
              size="small"
              select
              value={m.frameType}
              onChange={(e) => updateMatcher(idx, { frameType: e.target.value as WebSocketFrameType })}
              sx={{ width: { xs: '100%', sm: 130 } }}
            >
              {(['TEXT', 'BINARY', 'PING', 'PONG', 'ANY'] as const).map((ft) => (
                <MenuItem key={ft} value={ft}>{ft}</MenuItem>
              ))}
            </TextField>
            <TextField
              label={uiText("Text matcher", "文本匹配条件")}
              size="small"
              sx={{ flex: 1 }}
              value={m.textMatcher}
              onChange={(e) => updateMatcher(idx, { textMatcher: e.target.value })}
              placeholder={uiText("e.g. {\"type\":\"ping\"}", "例如 {\"type\":\"ping\"}")}
              slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
            />
            <RowControls
              noun="matcher"
              idx={idx}
              count={state.matchers.length}
              onMove={(delta) => setState({ ...state, matchers: moveItem(state.matchers, idx, delta) })}
              onRemove={() => setState({ ...state, matchers: state.matchers.filter((_, i) => i !== idx) })}
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            {uiText("Responses", "响应")}
          </Typography>
          <MessageRows
            noun="response"
            groupLabel={uiText(`Matcher ${idx + 1} responses`, `匹配条件 ${idx + 1} 的响应`)}
            items={m.responses}
            onChange={(responses) => updateMatcher(idx, { responses })}
            placeholder={'{"type":"pong"}'}
          />
        </Paper>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Chaos / fault injection panel (optional, cross-cutting across action types)
// ---------------------------------------------------------------------------

function ChaosPanel({
  chaos,
  setChaos,
}: {
  chaos: StandardChaosDraft;
  setChaos: (c: StandardChaosDraft) => void;
}) {
  const CHAOS_PANEL_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1, alignItems: 'start' } as const;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Inject probabilistic faults (error status, latency) into responses for matched requests. This works on mocked, forwarded, and proxied responses.", "按配置的概率为匹配的请求注入故障，例如返回错误状态码或增加延迟。适用于 Mock、转发和代理响应。")}
      </Typography>
      <Box sx={CHAOS_PANEL_GRID}>
        <TextField
          label={uiText("Error status", "错误状态码")}
          size="small"
          type="number"
          value={chaos.errorStatus ?? ''}
          error={!!standardChaosErrorStatusError(chaos.errorStatus)}
          onChange={(e) => { const n = parseInt(e.target.value, 10); setChaos({ ...chaos, errorStatus: e.target.value === '' || Number.isNaN(n) ? undefined : n }); }}
          fullWidth
          helperText={standardChaosErrorStatusError(chaos.errorStatus) ?? uiText('e.g. 500, 503, 429', '例如 500、503、429')}
        />
        <TextField
          label={uiText('Error prob (0-1)', '错误概率（0–1）')}
          size="small"
          type="number"
          value={chaos.errorProbability ?? ''}
          error={!!standardChaosErrorProbabilityError(chaos.errorProbability)}
          onChange={(e) => { const n = parseFloat(e.target.value); setChaos({ ...chaos, errorProbability: e.target.value === '' || Number.isNaN(n) ? undefined : n }); }}
          fullWidth
          helperText={standardChaosErrorProbabilityError(chaos.errorProbability) ?? uiText('1.0 = always', "1.0 表示每次都触发")}
        />
        <TextField
          label="Retry-After"
          size="small"
          value={chaos.retryAfter ?? ''}
          onChange={(e) => setChaos({ ...chaos, retryAfter: e.target.value || undefined })}
          fullWidth
          helperText={uiText("e.g. \"30\"", "例如 \"30\"")}
        />
      </Box>
      <Box sx={CHAOS_PANEL_GRID}>
        <TextField
          label={uiText("Latency value", "延迟时长")}
          size="small"
          type="number"
          value={chaos.latencyValue ?? ''}
          onChange={(e) => setChaos({ ...chaos, latencyValue: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
          fullWidth
          helperText={uiText("0 = no latency", "0 表示无延迟")}
        />
        <TextField
          label={uiText("Latency unit", "延迟单位")}
          size="small"
          select
          value={chaos.latencyUnit ?? 'MILLISECONDS'}
          onChange={(e) => setChaos({ ...chaos, latencyUnit: e.target.value as ChaosDelayUnit })}
          fullWidth
        >
          <MenuItem value="MILLISECONDS">{uiText("milliseconds", "毫秒")}</MenuItem>
          <MenuItem value="SECONDS">{uiText("seconds", "秒")}</MenuItem>
          <MenuItem value="MINUTES">{uiText("minutes", "分钟")}</MenuItem>
        </TextField>
        <TextField
          label={uiText("Seed", "随机种子")}
          size="small"
          type="number"
          value={chaos.seed ?? ''}
          onChange={(e) => setChaos({ ...chaos, seed: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
          fullWidth
          helperText={uiText("reproducible prob", "用于复现随机故障")}
        />
      </Box>
      <Box sx={CHAOS_PANEL_GRID}>
        <TextField
          label={uiText("Succeed first (N)", "先成功的请求数（N）")}
          size="small"
          type="number"
          value={chaos.succeedFirst ?? ''}
          onChange={(e) => setChaos({ ...chaos, succeedFirst: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
          fullWidth
          helperText={uiText("first N requests OK", "前 N 次请求成功")}
        />
        <TextField
          label={uiText("Fail request count", "随后失败的请求数")}
          size="small"
          type="number"
          value={chaos.failRequestCount ?? ''}
          onChange={(e) => setChaos({ ...chaos, failRequestCount: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
          fullWidth
          helperText={uiText("then next M fail", "接下来的 M 次请求失败")}
        />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// SSE response panel
// ---------------------------------------------------------------------------

function SsePanel({
  state,
  setState,
}: {
  state: StandardSseState;
  setState: (s: StandardSseState) => void;
}) {
  const addEvent = () => {
    setState({ ...state, events: [...state.events, emptySseEvent()] });
  };
  const updateEvent = (idx: number, patch: Partial<StandardSseEventDraft>) => {
    setState({
      ...state,
      events: state.events.map((ev, i) => (i === idx ? { ...ev, ...patch } : ev)),
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Stream Server-Sent Events to the client. Each event has an optional type, data payload, ID, and retry interval.", "向客户端流式发送 SSE。每个事件可指定类型、数据、ID 和重连间隔。")}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <StatusCodeField value={state.statusCode} onChange={(statusCode) => setState({ ...state, statusCode })} />
      </Box>
      <TextField
        label={uiText("Headers (Name: value per line)", "请求头（每行一项 Name: value）")}
        multiline
        minRows={2}
        maxRows={4}
        value={state.headers}
        onChange={(e) => setState({ ...state, headers: e.target.value })}
        placeholder={'Cache-Control: no-cache'}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {uiText("Events", "事件")}
        </Typography>
        <Button size="small" variant="outlined" onClick={addEvent}>
          {uiText("Add event", "添加事件")}
        </Button>
      </Box>
      {state.events.map((ev, idx) => (
        <Paper key={ev.itemId ?? idx} variant="outlined" role="group" aria-label={uiText(`Event ${idx + 1}`, `事件 ${idx + 1}`)} sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              label={uiText("Event type", "事件类型")}
              size="small"
              sx={{ flex: 1 }}
              value={ev.event}
              onChange={(e) => updateEvent(idx, { event: e.target.value })}
              placeholder="message"
            />
            <TextField
              label="ID"
              size="small"
              sx={{ width: { xs: '100%', sm: 100 } }}
              value={ev.id}
              onChange={(e) => updateEvent(idx, { id: e.target.value })}
            />
            <TextField
              label={uiText("Retry (ms)", "重连间隔（毫秒）")}
              size="small"
              type="number"
              sx={{ width: { xs: '100%', sm: 100 } }}
              value={ev.retry}
              onChange={(e) => updateEvent(idx, { retry: e.target.value })}
            />
            <RowControls
              noun="event"
              idx={idx}
              count={state.events.length}
              onMove={(delta) => setState({ ...state, events: moveItem(state.events, idx, delta) })}
              onRemove={() => setState({ ...state, events: state.events.filter((_, i) => i !== idx) })}
            />
          </Box>
          <TextField
            label={uiText("Data", "数据")}
            multiline
            minRows={2}
            maxRows={6}
            value={ev.data}
            onChange={(e) => updateEvent(idx, { data: e.target.value })}
            placeholder='{"update":"value"}'
            slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
          />
        </Paper>
      ))}
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.closeConnection}
            onChange={(e) => setState({ ...state, closeConnection: e.target.checked })}
          />
        }
        label={
          <Typography variant="body2">
            {uiText("Close connection after events", "发送完事件后关闭连接")}
          </Typography>
        }
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Binary response panel
// ---------------------------------------------------------------------------

/** Drops the fields carried from a loaded expectation, so they cannot leak into a different one. */
function withoutCarriedBinaryFields(s: StandardBinaryResponseState): StandardBinaryResponseState {
  const rest = { ...s };
  delete rest.delay;
  delete rest.primary;
  return rest;
}

function BinaryResponsePanel({
  state,
  setState,
}: {
  state: StandardBinaryResponseState;
  setState: (s: StandardBinaryResponseState) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Return raw binary data as the response body. Provide the data as a base64-encoded string.", "以 Base64 字符串提供二进制数据，MockServer 将原始字节作为响应体返回。")}
      </Typography>
      <TextField
        label={uiText("Binary data (base64)", "二进制数据（Base64）")}
        helperText={uiText("Leave empty to send no reply: MockServer writes nothing for the matched message and keeps the connection open.", "留空则不回复。收到匹配的消息后，MockServer 不会发送数据，并保持连接开启。")}
        multiline
        minRows={4}
        maxRows={12}
        value={state.binaryData}
        onChange={(e) => setState({ ...state, binaryData: e.target.value })}
        placeholder="SGVsbG8sIFdvcmxkIQ=="
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <TextField
        label={uiText("Upstream", "上游")}
        size="small"
        select
        value={state.upstream ?? 'ANSWER_ONLY'}
        onChange={(e) => {
          const upstream = e.target.value as BinaryUpstreamName;
          const next: StandardBinaryResponseState = { ...state, upstream };
          if (upstream === 'ANSWER_ONLY') delete next.upstream;
          setState(next);
        }}
        helperText={uiText("Only on a binary connection MockServer relays to an upstream (matchBinaryExpectationsWhenProxying). Forwarding needs binaryMessageFraming POSTGRESQL; without it the match answers only.", "仅在二进制连接中可转发到上游（matchBinaryExpectationsWhenProxying）。转发要求将 binaryMessageFraming 设为 POSTGRESQL，否则只返回响应。")}
        sx={{ width: { xs: '100%', sm: 360 } }}
      >
        <MenuItem value="ANSWER_ONLY">{uiText("Answer only (default)", "仅响应（默认）")}</MenuItem>
        <MenuItem value="ANSWER_AND_FORWARD">{uiText("Answer and forward (drop the upstream reply)", "响应并转发（丢弃上游回复）")}</MenuItem>
        <MenuItem value="FORWARD_AND_REPLACE">{uiText("Forward and replace the upstream reply", "转发并替换上游回复")}</MenuItem>
      </TextField>
    </Box>
  );
}

/** The binary response fields the form carries from a loaded expectation without editing them. */
function binaryCarriedFieldItems(
  state: StandardBinaryResponseState,
  setState: (update: (s: StandardBinaryResponseState) => StandardBinaryResponseState) => void,
): KeptFieldItem[] {
  const without = (field: 'delay' | 'primary') => () => setState((s) => {
    const next = { ...s };
    delete next[field];
    return next;
  });
  const items: KeptFieldItem[] = [];
  if (state.delay) items.push({ label: 'delay', value: state.delay, onRemove: without('delay') });
  if (state.primary !== undefined) items.push({ label: 'primary', value: state.primary, onRemove: without('primary') });
  return items;
}

// ---------------------------------------------------------------------------
// Kept action fields panel
// ---------------------------------------------------------------------------

interface KeptFieldItem {
  label: string;
  value: unknown;
  /** What the form shows for this field, when it shows it differently. */
  formValue?: unknown;
  onRemove: () => void;
}

function formatKeptValue(v: unknown): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const d = v as Record<string, unknown>;
    if (Object.keys(d).length === 2 && typeof d['value'] === 'number' && typeof d['timeUnit'] === 'string') {
      return `${d['value']} ${d['timeUnit']}`;
    }
  }
  return JSON.stringify(v);
}

interface KeptRemovals {
  original: Record<string, unknown> | null;
  fields: KeptActionField[];
}

const NO_KEPT_REMOVALS: KeptRemovals = { original: null, fields: [] };

function keptFieldItems(fields: KeptActionField[], onRemove: (f: KeptActionField) => void): KeptFieldItem[] {
  return fields.map((f) => ({
    label: keptFieldLabel(f),
    value: f.value,
    formValue: f.baselineValue,
    onRemove: () => onRemove(f),
  }));
}

/**
 * Action fields a save keeps from the loaded expectation although the form does not
 * show them (or shows them differently), each with a control that stops keeping it.
 */
function KeptFieldsPanel({ items }: { items: KeptFieldItem[] }) {
  if (items.length === 0) return null;
  return (
    <Box data-testid="kept-action-fields" sx={{ mt: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="subtitle2" color="text.secondary">{uiText("Other fields", "其他字段")}</Typography>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
        {uiText("Kept from the loaded expectation and saved as shown; this form cannot edit them.", "这些字段从已加载的规则中保留，将按显示内容保存。此表单无法编辑它们。")}
      </Typography>
      {items.map((item) => {
        const action = item.formValue === undefined ? uiText(`Remove ${item.label}`, `移除 ${item.label}`) : uiText(`Use the form's ${item.label}`, `使用表单中的 ${item.label}`);
        return (
          <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="body2"
              sx={{ fontFamily: monospaceFontFamily, fontSize: '0.78rem', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {item.label} {formatKeptValue(item.value)}
              {item.formValue !== undefined && (
                <Box component="span" sx={{ color: 'text.secondary' }}>{uiText(" (form shows ", " （表单显示 ")}{formatKeptValue(item.formValue)})</Box>
              )}
            </Typography>
            <Tooltip title={action}>
              <IconButton size="small" aria-label={action} onClick={item.onRemove}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        );
      })}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// DNS response panel
// ---------------------------------------------------------------------------

function DnsResponsePanel({
  state,
  setState,
}: {
  state: StandardDnsState;
  setState: (s: StandardDnsState) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Return a DNS response with a response code and answer records. Records are provided as a JSON array of objects with name, type, value, ttl, etc.", "返回带有响应码和应答记录的 DNS 响应。记录使用 JSON 对象数组，可填写 name、type、value、ttl 等字段。")}
      </Typography>
      <TextField
        label={uiText("Response code", "响应码")}
        size="small"
        select
        value={state.responseCode}
        onChange={(e) => setState({ ...state, responseCode: e.target.value as DnsResponseCodeName })}
        sx={{ width: { xs: '100%', sm: 200 } }}
      >
        {(['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED'] as const).map((rc) => (
          <MenuItem key={rc} value={rc}>{rc}</MenuItem>
        ))}
      </TextField>
      {(() => {
        const recs = state.answerRecords.trim();
        let invalid = false;
        if (recs.length > 0) {
          try { invalid = !Array.isArray(JSON.parse(recs)); } catch { invalid = true; }
        }
        return (
          <TextField
            label={uiText("Answer records (JSON array)", "应答记录（JSON 数组）")}
            multiline
            minRows={4}
            maxRows={12}
            error={invalid}
            value={state.answerRecords}
            onChange={(e) => setState({ ...state, answerRecords: e.target.value })}
            placeholder={'[\n  { "name": "example.com", "type": "A", "value": "127.0.0.1", "ttl": 300 }\n]'}
            slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
            helperText={invalid
              ? uiText('Not valid JSON — must be an array of records, e.g. [ { "name": "...", "type": "A", "value": "..." } ]', "JSON 无效。必须是记录数组，例如 [ { \"name\": \"...\", \"type\": \"A\", \"value\": \"...\" } ]。")
              : uiText('Each record supports: name, type (A/AAAA/CNAME/MX/SRV/TXT/PTR), value, ttl, priority, weight, port. Advanced records are best authored via the REST API.', "每条记录支持 name、type（A/AAAA/CNAME/MX/SRV/TXT/PTR）、value、ttl、priority、weight 和 port。高级记录可通过 REST API 配置。")}
          />
        );
      })()}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Forward template panel
// ---------------------------------------------------------------------------

function ForwardTemplatePanel({
  state,
  setState,
  connectionParams,
}: {
  state: StandardForwardTemplateState;
  setState: (s: StandardForwardTemplateState) => void;
  connectionParams: ConnectionParams;
}) {
  const handleSnippetInsert = useCallback(
    (snippet: string) => {
      setState({
        ...state,
        template: state.template
          ? state.template + (state.template.endsWith('\n') ? '' : '\n') + snippet
          : snippet,
      });
    },
    [state, setState],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Build the forwarded request dynamically using a template engine. The template receives a ", "使用模板引擎动态构建转发请求。模板会接收一个 ")}<code>request</code>{uiText(" object. This is the forward-direction counterpart of the response template.", " 对象，构建的是发送至上游的请求。")}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label={uiText("Template engine", "模板引擎")}
          size="small"
          select
          value={state.templateType}
          onChange={(e) => setState({ ...state, templateType: e.target.value as StandardForwardTemplateState['templateType'] })}
          sx={{ width: { xs: '100%', sm: 200 } }}
        >
          <MenuItem value="VELOCITY">Velocity</MenuItem>
          <MenuItem value="JAVASCRIPT">JavaScript</MenuItem>
          <MenuItem value="MUSTACHE">Mustache</MenuItem>
        </TextField>
        <SnippetPalette
          engine={state.templateType as SnippetEngine}
          onInsert={handleSnippetInsert}
        />
        <TestTemplateButton
          connectionParams={connectionParams}
          templateType={state.templateType}
          template={state.template}
          actionType="FORWARD_TEMPLATE"
        />
      </Box>
      <TextField
        label={uiText("Template body", "模板内容")}
        multiline
        minRows={6}
        maxRows={20}
        value={state.template}
        onChange={(e) => setState({ ...state, template: e.target.value })}
        placeholder='return { "method": request.method, "path": "/upstream" + request.path };'
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <TextField
        label={uiText("Or load template from file (optional)", "或从文件加载模板（可选）")}
        size="small"
        value={state.templateFile ?? ''}
        onChange={(e) => setState({ ...state, templateFile: e.target.value })}
        placeholder="templates/forward_request.mustache"
        helperText={uiText("Classpath or filesystem path. Used when the inline template above is empty; the inline template wins when both are set.", "可填写类路径或文件系统路径。内联模板为空时会读取文件，同时配置时以内联模板为准。")}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <TemplateParametersField value={state.parameters ?? ''} onChange={(parameters) => setState({ ...state, parameters })} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Forward class callback panel
// ---------------------------------------------------------------------------

function ForwardClassCallbackPanel({
  state,
  setState,
}: {
  state: StandardForwardClassCallbackState;
  setState: (s: StandardForwardClassCallbackState) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Invoke a Java class implementing ", "调用实现了 ")}<code>ExpectationForwardCallback</code>{uiText(" on the MockServer instance to build the forwarded request dynamically. The class must already be on MockServer's classpath.", " 的 Java 类动态构建转发请求。该类必须已在 MockServer 的类路径中。")}
      </Typography>
      <TextField
        label={uiText("Callback class (fully-qualified name)", "回调类（全限定类名）")}
        size="small"
        value={state.callbackClass}
        onChange={(e) => setState({ ...state, callbackClass: e.target.value })}
        placeholder="com.example.MyForwardCallback"
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// gRPC stream response panel
// ---------------------------------------------------------------------------

/** The gRPC stream form state: its messages are edited one per row. */
type GrpcStreamState = Omit<StandardGrpcStreamState, 'messages'> & { messages: StandardListItemDraft[] };

function GrpcStreamPanel({
  state,
  setState,
}: {
  state: GrpcStreamState;
  setState: (s: GrpcStreamState) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Return a gRPC streaming response. Each message is a JSON-encoded protobuf payload sent as a stream frame.", "返回 gRPC 流式响应。每条消息是一个 JSON 编码的 Protobuf 负载，作为一帧发送。")}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={uiText("Status name", "状态名称")}
          size="small"
          sx={{ flex: 1 }}
          value={state.statusName}
          onChange={(e) => setState({ ...state, statusName: e.target.value })}
          placeholder="OK"
        />
        <TextField
          label={uiText("Status message", "状态详情")}
          size="small"
          sx={{ flex: 1 }}
          value={state.statusMessage}
          onChange={(e) => setState({ ...state, statusMessage: e.target.value })}
          placeholder={uiText("optional status detail", "可填写状态详情")}
        />
      </Box>
      <TextField
        label={uiText("Headers (Name: value per line)", "请求头（每行一项 Name: value）")}
        multiline
        minRows={2}
        maxRows={4}
        value={state.headers}
        onChange={(e) => setState({ ...state, headers: e.target.value })}
        placeholder={'grpc-encoding: identity'}
        slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {uiText("Messages (JSON)", "消息（JSON）")}
      </Typography>
      <MessageRows
        noun="message"
        groupLabel={uiText("Messages", "消息")}
        items={state.messages}
        onChange={(messages) => setState({ ...state, messages })}
        placeholder={'{"name":"Alice"}'}
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.closeConnection}
            onChange={(e) => setState({ ...state, closeConnection: e.target.checked })}
          />
        }
        label={
          <Typography variant="body2">
            {uiText("Close connection after messages", "发送完消息后关闭连接")}
          </Typography>
        }
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Side-effects (before / after actions) panel
// ---------------------------------------------------------------------------

function emptySideEffect(): StandardSideEffectAction {
  return {
    position: 'before',
    method: '',
    path: '',
    host: '',
    body: '',
    delayValue: 0,
    delayUnit: 'MILLISECONDS',
    blocking: true,
    timeoutValue: 0,
    timeoutUnit: 'SECONDS',
    failurePolicy: 'BEST_EFFORT',
  };
}

// Force every input/select in the panel to the same 40px height as the small
// Select, with the text vertically centred regardless of font size (the mono
// fields use a smaller font, which would otherwise shrink their height).
const SIDE_EFFECT_FIELD_SX = {
  '& .MuiOutlinedInput-root': { height: 40 },
  '& .MuiInputBase-input': { py: 0 },
};

// ---------------------------------------------------------------------------
// Capture rules panel — extract request values into scenario state. Each row
// is { source, expression, into }. Mirrors the SideEffectsPanel pattern (add /
// remove rows, grid layout). Empty rows are dropped at codegen time.
// ---------------------------------------------------------------------------

function emptyCaptureRule(): StandardCaptureRule {
  return { source: 'jsonPath', expression: '', into: '' };
}

/** Placeholder hint for the expression field, scoped by the selected source. */
function captureExpressionPlaceholder(source: CaptureSource): string {
  switch (source) {
    case 'jsonPath': return '$.order.id';
    case 'xpath': return '/order/@id';
    case 'header': return 'X-Request-Id';
    case 'queryStringParameter': return 'sessionId';
    case 'cookie': return 'JSESSIONID';
    case 'pathParameter': return 'userId';
  }
}

const CAPTURE_SOURCE_LABELS_ZH: Record<CaptureSource, string> = {
  jsonPath: 'JSON Path（请求体）',
  xpath: 'XPath（请求体）',
  header: '请求头',
  queryStringParameter: '查询参数',
  cookie: 'Cookie',
  pathParameter: '路径参数',
};

function CapturePanel({
  capture,
  setCapture,
}: {
  capture: StandardCaptureRule[];
  setCapture: (c: StandardCaptureRule[]) => void;
}) {
  const addRow = () => setCapture([...capture, emptyCaptureRule()]);
  const removeRow = (idx: number) => setCapture(capture.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<StandardCaptureRule>) => {
    setCapture(capture.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Extract a value from the matched request and store it in scenario state. Response templates can read captured values via the ", "从匹配的请求中提取值并保存到场景状态中。响应模板可通过 ")}<code>scenario</code>{uiText(" helper.", " 辅助对象读取已提取的值。")}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {uiText(`Rules (${capture.length})`, `规则（${capture.length}）`)}
        </Typography>
        <Button size="small" variant="outlined" onClick={addRow} data-testid="add-capture-rule">
          {uiText("Add rule", "添加规则")}
        </Button>
      </Box>
      {capture.map((c, idx) => (
        <Paper key={idx} variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="capture-rule-row">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(160px, 1.4fr) minmax(120px, 1fr) auto', gap: 1, alignItems: 'center' }}>
            <TextField
              label={uiText("Source", "来源")}
              size="small"
              select
              value={c.source}
              onChange={(e) => updateRow(idx, { source: e.target.value as CaptureSource })}
              sx={{ ...SIDE_EFFECT_FIELD_SX }}
              fullWidth
              slotProps={{ htmlInput: { 'data-testid': `capture-source-${idx}` } }}
            >
              {CAPTURE_SOURCES.map((s) => (
                <MenuItem key={s} value={s}>{uiText(CAPTURE_SOURCE_LABELS[s], CAPTURE_SOURCE_LABELS_ZH[s])}</MenuItem>
              ))}
            </TextField>
            <TextField
              label={uiText("Expression", "表达式")}
              size="small"
              value={c.expression}
              onChange={(e) => updateRow(idx, { expression: e.target.value })}
              placeholder={captureExpressionPlaceholder(c.source)}
              sx={{ minWidth: 0, ...SIDE_EFFECT_FIELD_SX }}
              slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
              fullWidth
            />
            <TextField
              label={uiText("Into (state key)", "保存至（状态键）")}
              size="small"
              value={c.into}
              onChange={(e) => updateRow(idx, { into: e.target.value })}
              placeholder="orderId"
              sx={{ minWidth: 0, ...SIDE_EFFECT_FIELD_SX }}
              slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
              fullWidth
            />
            <IconButton
              size="small"
              color="error"
              onClick={() => removeRow(idx)}
              aria-label={uiText("Remove capture rule", "移除提取规则")}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}

function SideEffectsPanel({
  sideEffects,
  setSideEffects,
}: {
  sideEffects: StandardSideEffectAction[];
  setSideEffects: (s: StandardSideEffectAction[]) => void;
}) {
  const addRow = () => setSideEffects([...sideEffects, emptySideEffect()]);
  const removeRow = (idx: number) => setSideEffects(sideEffects.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<StandardSideEffectAction>) => {
    setSideEffects(sideEffects.map((se, i) => (i === idx ? { ...se, ...patch } : se)));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Fire HTTP webhook requests before and/or after the main response action. Before-actions can optionally block the response until the webhook completes.", "可在主响应动作之前或之后发送 HTTP Webhook 请求。前置动作可选择等待 Webhook 完成后再返回响应。")}
        {/* Future increment: class/object callback targets. */}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {uiText(`Actions (${sideEffects.length})`, `动作（${sideEffects.length}）`)}
        </Typography>
        <Button size="small" variant="outlined" onClick={addRow} data-testid="add-side-effect">
          {uiText("Add action", "添加动作")}
        </Button>
      </Box>
      {sideEffects.map((se, idx) => (
        <Paper key={idx} variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="side-effect-row">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr)) auto', gap: 1, alignItems: 'center' }}>
            <TextField
              label={uiText("Position", "执行时机")}
              size="small"
              select
              value={se.position}
              onChange={(e) => updateRow(idx, { position: e.target.value as SideEffectPosition })}
              sx={{ ...SIDE_EFFECT_FIELD_SX }}
              fullWidth
            >
              <MenuItem value="before">{uiText("Before", "之前")}</MenuItem>
              <MenuItem value="after">{uiText("After", "之后")}</MenuItem>
            </TextField>
            <TextField
              label={uiText("Request", "请求")}
              size="small"
              select
              value={se.templateType ?? ''}
              onChange={(e) => updateRow(idx, { templateType: e.target.value as SideEffectTemplateType })}
              sx={{ ...SIDE_EFFECT_FIELD_SX }}
              slotProps={{ htmlInput: { 'data-testid': 'side-effect-request-kind' } }}
              fullWidth
            >
              <MenuItem value="">{uiText("Fields", "填写字段")}</MenuItem>
              <MenuItem value="VELOCITY">{uiText("Velocity Template", "Velocity 模板")}</MenuItem>
              <MenuItem value="MUSTACHE">{uiText("Mustache Template", "Mustache 模板")}</MenuItem>
              <MenuItem value="JAVASCRIPT">{uiText("JavaScript Template", "JavaScript 模板")}</MenuItem>
            </TextField>
            {!se.templateType && <TextField
              label={uiText("Method", "请求方法")}
              size="small"
              value={se.method}
              onChange={(e) => updateRow(idx, { method: e.target.value })}
              placeholder="GET"
              sx={{ ...SIDE_EFFECT_FIELD_SX }}
              fullWidth
            />}
            {!se.templateType && <TextField
              label={uiText("Path", "路径")}
              size="small"
              sx={{ minWidth: 0, ...SIDE_EFFECT_FIELD_SX }}
              value={se.path}
              onChange={(e) => updateRow(idx, { path: e.target.value })}
              placeholder="/webhook/notify"
              slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
              fullWidth
            />}
            <IconButton
              size="small"
              color="error"
              onClick={() => removeRow(idx)}
              aria-label={uiText("Remove side-effect", "移除附加动作")}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
          {se.templateType ? (
            <TextField
              label={uiText("Request template", "请求模板")}
              size="small"
              multiline
              minRows={3}
              value={se.template ?? ''}
              onChange={(e) => updateRow(idx, { template: e.target.value })}
              placeholder={'{ "method": "POST", "path": "/notify", "headers": { "Host": [ "audit.svc:8080" ] } }'}
              helperText={uiText("Renders the whole webhook request from the triggering request. Escape request values, and never build the Host or URL from them.", "根据触发请求渲染完整的 Webhook 请求。请转义来自请求的值，且不要用这些值构造 Host 或 URL。")}
              slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } }, htmlInput: { 'data-testid': 'side-effect-template' } }}
              fullWidth
            />
          ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1, alignItems: 'start' }}>
            <TextField
              label={uiText("Host (optional)", "主机（可选）")}
              size="small"
              value={se.host}
              onChange={(e) => updateRow(idx, { host: e.target.value })}
              placeholder="auth.svc:8080"
              sx={{ ...SIDE_EFFECT_FIELD_SX }}
              slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
              fullWidth
            />
            <TextField
              label={uiText("Body (optional)", "请求体（可选）")}
              size="small"
              sx={{ minWidth: 0, ...SIDE_EFFECT_FIELD_SX }}
              value={se.body}
              onChange={(e) => updateRow(idx, { body: e.target.value })}
              placeholder='{"event":"matched"}'
              slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
              fullWidth
            />
          </Box>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, alignItems: 'start' }}>
            <TextField
              label={uiText("Delay", "延迟")}
              size="small"
              type="number"
              value={se.delayValue}
              onChange={(e) => updateRow(idx, { delayValue: Number(e.target.value) || 0 })}
              sx={{ ...SIDE_EFFECT_FIELD_SX }}
              helperText={uiText("0 = no delay", "0 表示无延迟")}
              fullWidth
            />
            <TextField
              label={uiText("Delay unit", "延迟单位")}
              size="small"
              select
              value={se.delayUnit}
              onChange={(e) => updateRow(idx, { delayUnit: e.target.value as SideEffectDelayUnit })}
              sx={{ ...SIDE_EFFECT_FIELD_SX }}
              fullWidth
            >
              <MenuItem value="MILLISECONDS">{uiText("milliseconds", "毫秒")}</MenuItem>
              <MenuItem value="SECONDS">{uiText("seconds", "秒")}</MenuItem>
              <MenuItem value="MINUTES">{uiText("minutes", "分钟")}</MenuItem>
            </TextField>
          </Box>
          {/* Before-only fields: blocking, timeout, failurePolicy */}
          {se.position === 'before' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, alignItems: 'center' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={se.blocking}
                    onChange={(e) => updateRow(idx, { blocking: e.target.checked })}
                  />
                }
                label={
                  <Typography variant="body2">
                    {uiText("Blocking", "等待完成")}
                  </Typography>
                }
              />
              <TextField
                label={uiText("Timeout (0 = none)", "超时（0 表示不限制）")}
                size="small"
                type="number"
                value={se.timeoutValue}
                onChange={(e) => updateRow(idx, { timeoutValue: Number(e.target.value) || 0 })}
                sx={{ ...SIDE_EFFECT_FIELD_SX }}
                fullWidth
              />
              <TextField
                label={uiText("Timeout unit", "超时单位")}
                size="small"
                select
                value={se.timeoutUnit}
                onChange={(e) => updateRow(idx, { timeoutUnit: e.target.value as SideEffectDelayUnit })}
                sx={{ ...SIDE_EFFECT_FIELD_SX }}
                fullWidth
              >
                <MenuItem value="MILLISECONDS">{uiText("milliseconds", "毫秒")}</MenuItem>
                <MenuItem value="SECONDS">{uiText("seconds", "秒")}</MenuItem>
                <MenuItem value="MINUTES">{uiText("minutes", "分钟")}</MenuItem>
              </TextField>
              <TextField
                label={uiText("Failure policy", "失败处理策略")}
                size="small"
                select
                value={se.failurePolicy}
                onChange={(e) => updateRow(idx, { failurePolicy: e.target.value as SideEffectFailurePolicy })}
                sx={{ ...SIDE_EFFECT_FIELD_SX }}
                fullWidth
              >
                <MenuItem value="BEST_EFFORT">{uiText("BEST_EFFORT", "尽力执行（BEST_EFFORT）")}</MenuItem>
                <MenuItem value="FAIL_FAST">{uiText("FAIL_FAST", "失败即停止（FAIL_FAST）")}</MenuItem>
              </TextField>
            </Box>
          )}
        </Paper>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Steps panel — ordered multi-action pipeline (M1 increment-2)
// ---------------------------------------------------------------------------

function emptyStep(): StandardExpectationStep {
  return {
    actionType: 'httpResponse',
    responder: false,
    actionBody: '',
    blocking: true,
    delayValue: 0,
    delayUnit: 'MILLISECONDS',
    timeoutValue: 0,
    timeoutUnit: 'SECONDS',
    failurePolicy: 'BEST_EFFORT',
  };
}

const STEP_ACTION_LABELS_ZH: Record<StepActionType, string> = {
  httpResponse: '固定 HTTP 响应',
  httpForward: '转发至上游',
  httpOverrideForwardedRequest: '改写后转发',
  httpError: '故障注入',
  httpRequest: 'Webhook（HTTP 请求）',
  httpClassCallback: '类回调',
};

function stepActionLabel(type: StepActionType): string {
  return uiText(STEP_ACTION_LABELS[type], STEP_ACTION_LABELS_ZH[type]);
}

function StepsPanel({
  steps,
  setSteps,
}: {
  steps: StandardExpectationStep[];
  setSteps: (s: StandardExpectationStep[]) => void;
}) {
  const addStep = () => setSteps([...steps, emptyStep()]);
  const removeStep = (idx: number) => {
    const next = steps.filter((_, i) => i !== idx);
    // If the removed step was the responder and no other step is, auto-select
    // the first response-capable step (if any).
    if (steps[idx]?.responder && !next.some((s) => s.responder)) {
      const respIdx = next.findIndex((s) => RESPONDER_CAPABLE_ACTIONS.has(s.actionType));
      if (respIdx >= 0) next[respIdx] = { ...next[respIdx]!, responder: true };
    }
    setSteps(next);
  };
  const updateStep = (idx: number, patch: Partial<StandardExpectationStep>) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const moveStep = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setSteps(next);
  };

  const setResponder = (idx: number) => {
    setSteps(steps.map((s, i) => ({ ...s, responder: i === idx })));
  };

  const responderCount = steps.filter((s) => s.responder).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText("Define an ordered pipeline of actions. Exactly one step must be the ", "按顺序定义动作流程。其中必须有且只有一个步骤作为 ")}<strong>{uiText("responder", "响应步骤")}</strong>{' '}
        {uiText("(produces the HTTP response); all other steps are side-effects that run before or after it in list order. Steps cannot be combined with top-level before/after actions.", "，用于生成 HTTP 响应。其余步骤按列表顺序在响应之前或之后执行。步骤流程不能和规则顶层的前置或后置动作同时使用。")}
      </Typography>

      {responderCount === 0 && steps.length > 0 && (
        <Alert severity="warning" variant="outlined" sx={{ fontSize: '0.78rem' }} data-testid="steps-no-responder-warning">
          {uiText("No responder selected. Exactly one step must be marked as the responder.", "尚未选择响应步骤。必须指定且只能指定一个响应步骤。")}
        </Alert>
      )}
      {responderCount > 1 && (
        <Alert severity="error" variant="outlined" sx={{ fontSize: '0.78rem' }} data-testid="steps-multi-responder-error">
          {uiText("Multiple responders selected (", "已选择多个响应步骤（")}{responderCount}{uiText("). Only one step can be the responder.", "）。只能保留一个。")}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {uiText(`Steps (${steps.length})`, `步骤（${steps.length}）`)}
        </Typography>
        <Button size="small" variant="outlined" onClick={addStep} data-testid="add-step">
          {uiText("Add step", "添加步骤")}
        </Button>
      </Box>

      {steps.map((step, idx) => (
        <Paper
          key={idx}
          variant="outlined"
          sx={{
            p: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            borderColor: step.responder ? 'primary.main' : undefined,
            borderWidth: step.responder ? 2 : 1,
          }}
          data-testid="step-row"
        >
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, minWidth: 24 }}>
              #{idx + 1}
            </Typography>
            <TextField
              label={uiText("Action type", "动作类型")}
              size="small"
              select
              value={step.actionType}
              onChange={(e) => {
                const newType = e.target.value as StepActionType;
                // If the step is currently the responder and the new action type
                // cannot serve as a responder, unset its responder flag AND
                // auto-select the first other response-capable step as responder
                // (mirrors removeStep), so the pipeline keeps exactly one responder.
                if (step.responder && !RESPONDER_CAPABLE_ACTIONS.has(newType)) {
                  const next = steps.map((s, i) =>
                    i === idx ? { ...s, actionType: newType, responder: false } : s
                  );
                  if (!next.some((s) => s.responder)) {
                    const respIdx = next.findIndex(
                      (s, i) => i !== idx && RESPONDER_CAPABLE_ACTIONS.has(s.actionType)
                    );
                    if (respIdx >= 0) next[respIdx] = { ...next[respIdx]!, responder: true };
                  }
                  setSteps(next);
                } else {
                  updateStep(idx, { actionType: newType });
                }
              }}
              sx={{ minWidth: 220 }}
              data-testid="step-action-type"
            >
              {STEP_ACTION_TYPES.map((at) => (
                <MenuItem key={at} value={at}>{stepActionLabel(at)}</MenuItem>
              ))}
            </TextField>

            <Tooltip title={
              !RESPONDER_CAPABLE_ACTIONS.has(step.actionType)
                ? uiText(`${stepActionLabel(step.actionType)} cannot be a responder`, `${stepActionLabel(step.actionType)} 不能用作响应步骤`)
                : step.responder
                  ? uiText('This step produces the HTTP response', "此步骤会生成 HTTP 响应")
                  : uiText('Click to make this the responder', "点击将此步骤设为响应步骤")
            }>
              <span>
                <FormControlLabel
                  control={
                    <Radio
                      size="small"
                      checked={step.responder}
                      onChange={() => setResponder(idx)}
                      disabled={!RESPONDER_CAPABLE_ACTIONS.has(step.actionType)}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: step.responder ? 600 : 400 }}>
                      {uiText("Responder", "响应步骤")}
                    </Typography>
                  }
                  sx={{ mr: 0 }}
                />
              </span>
            </Tooltip>

            <Box sx={{ ml: 'auto', display: 'flex', gap: 0.25 }}>
              <IconButton
                size="small"
                onClick={() => moveStep(idx, -1)}
                disabled={idx === 0}
                aria-label={uiText("Move step up", "上移步骤")}
                data-testid="step-move-up"
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => moveStep(idx, 1)}
                disabled={idx === steps.length - 1}
                aria-label={uiText("Move step down", "下移步骤")}
                data-testid="step-move-down"
              >
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                color="error"
                onClick={() => removeStep(idx)}
                aria-label={uiText("Remove step", "移除步骤")}
                data-testid="step-remove"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          <TextField
            label={uiText(`${stepActionLabel(step.actionType)} payload (JSON)`, `${stepActionLabel(step.actionType)} 数据（JSON）`)}
            multiline
            minRows={3}
            maxRows={12}
            value={step.actionBody}
            onChange={(e) => updateStep(idx, { actionBody: e.target.value })}
            placeholder={stepPlaceholder(step.actionType)}
            slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
          />

          {/* Side-effect controls — only for non-responder steps */}
          {!step.responder && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={step.blocking}
                    onChange={(e) => updateStep(idx, { blocking: e.target.checked })}
                  />
                }
                label={<Typography variant="body2">{uiText("Blocking", "等待完成")}</Typography>}
              />
              <TextField
                label={uiText("Delay", "延迟")}
                size="small"
                type="number"
                value={step.delayValue}
                onChange={(e) => updateStep(idx, { delayValue: Number(e.target.value) || 0 })}
                sx={{ width: { xs: '100%', sm: 100 } }}
              />
              <TextField
                label={uiText("Delay unit", "延迟单位")}
                size="small"
                select
                value={step.delayUnit}
                onChange={(e) => updateStep(idx, { delayUnit: e.target.value as SideEffectDelayUnit })}
                sx={{ width: { xs: '100%', sm: 140 } }}
              >
                <MenuItem value="MILLISECONDS">{uiText("milliseconds", "毫秒")}</MenuItem>
                <MenuItem value="SECONDS">{uiText("seconds", "秒")}</MenuItem>
                <MenuItem value="MINUTES">{uiText("minutes", "分钟")}</MenuItem>
              </TextField>
              <TextField
                label={uiText("Timeout", "超时")}
                size="small"
                type="number"
                value={step.timeoutValue}
                onChange={(e) => updateStep(idx, { timeoutValue: Number(e.target.value) || 0 })}
                sx={{ width: { xs: '100%', sm: 100 } }}
              />
              <TextField
                label={uiText("Timeout unit", "超时单位")}
                size="small"
                select
                value={step.timeoutUnit}
                onChange={(e) => updateStep(idx, { timeoutUnit: e.target.value as SideEffectDelayUnit })}
                sx={{ width: { xs: '100%', sm: 140 } }}
              >
                <MenuItem value="MILLISECONDS">{uiText("milliseconds", "毫秒")}</MenuItem>
                <MenuItem value="SECONDS">{uiText("seconds", "秒")}</MenuItem>
                <MenuItem value="MINUTES">{uiText("minutes", "分钟")}</MenuItem>
              </TextField>
              <TextField
                label={uiText("Failure policy", "失败处理策略")}
                size="small"
                select
                value={step.failurePolicy}
                onChange={(e) => updateStep(idx, { failurePolicy: e.target.value as SideEffectFailurePolicy })}
                sx={{ width: { xs: '100%', sm: 150 } }}
              >
                <MenuItem value="BEST_EFFORT">{uiText("BEST_EFFORT", "尽力执行（BEST_EFFORT）")}</MenuItem>
                <MenuItem value="FAIL_FAST">{uiText("FAIL_FAST", "失败即停止（FAIL_FAST）")}</MenuItem>
              </TextField>
            </Box>
          )}
        </Paper>
      ))}
    </Box>
  );
}

/** Placeholder JSON for each step action type. */
function stepPlaceholder(actionType: StepActionType): string {
  switch (actionType) {
    case 'httpResponse': return '{\n  "statusCode": 200,\n  "body": "{\\"ok\\":true}"\n}';
    case 'httpForward': return '{\n  "scheme": "HTTPS",\n  "host": "api.example.com",\n  "port": 443\n}';
    case 'httpOverrideForwardedRequest': return '{\n  "requestOverride": {\n    "path": "/v2/endpoint"\n  }\n}';
    case 'httpError': return '{\n  "dropConnection": true\n}';
    case 'httpRequest': return '{\n  "method": "POST",\n  "path": "/webhook/notify",\n  "body": "{\\"event\\":\\"matched\\"}"\n}';
    case 'httpClassCallback': return '{\n  "callbackClass": "com.example.MyCallback"\n}';
  }
}

// ---------------------------------------------------------------------------
// Existing mocks list — compact, scrollable list scoped to the selected kind
// ---------------------------------------------------------------------------

interface ExistingMocksListProps {
  kind: ExpectationKind;
  expectations: JsonListItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClear: () => void;
  /** How many expectations the server holds; above `windowSize` the live list is a capped window. */
  total?: number;
  /** How many expectations (of every kind) the live window holds. */
  windowSize?: number;
  /** Every active expectation on the server, for a search that reaches past the window. */
  searchServer?: (signal: AbortSignal) => Promise<JsonListItem[]>;
  /** Load an expectation found by the server search that is not in the live window. */
  onSelectItem?: (item: JsonListItem) => void;
}

function matchesKind(value: Record<string, unknown>, kind: ExpectationKind): boolean {
  const expKind = kindForExpectation(value);
  if (kind === 'mcp') {
    // MCP tools are derived from standard (HTTP) expectations with httpResponse
    return expKind === 'standard' && value['httpResponse'] != null;
  }
  return expKind === kind;
}

function matchesSearch(item: JsonListItem, kind: ExpectationKind, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.key.toLowerCase().includes(q) ||
    summaryForExpectation(item.value, kind === 'mcp' ? 'standard' : kind).toLowerCase().includes(q)
  );
}

interface ServerSearch {
  query: string;
  items?: JsonListItem[];
  error?: string;
}

function ExistingMocksList({
  kind,
  expectations,
  selectedKey,
  onSelect,
  onClear,
  total = 0,
  windowSize = 0,
  searchServer,
  onSelectItem,
}: ExistingMocksListProps) {
  const [search, setSearch] = useState('');
  const query = search.trim();
  const truncated = total > windowSize && !!searchServer;
  const [serverSearch, setServerSearch] = useState<ServerSearch | null>(null);

  // Filter expectations to the current kind.
  const ofKind = useMemo(() => expectations.filter((e) => matchesKind(e.value, kind)), [expectations, kind]);

  // The live list is a capped window, so once the server holds more a search
  // asks the server for every expectation instead of filtering the window.
  useEffect(() => {
    if (!truncated || !query || !searchServer) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchServer(controller.signal).then(
        (items) => setServerSearch({ query, items: items.filter((e) => !e.value['httpLlmResponse']) }),
        (e: unknown) => {
          if (!controller.signal.aborted) setServerSearch({ query, error: humanizeError(e).message });
        },
      );
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [truncated, query, searchServer]);

  const serverResult = truncated && query && serverSearch?.query === query ? serverSearch : undefined;
  const searching = truncated && !!query && !serverResult;
  const source = serverResult?.items ? serverResult.items.filter((e) => matchesKind(e.value, kind)) : ofKind;
  const filtered = source.filter((e) => matchesSearch(e, kind, query));
  const inWindow = useMemo(() => new Set(expectations.map((e) => e.key)), [expectations]);
  const select = (item: JsonListItem) => {
    if (inWindow.has(item.key) || !onSelectItem) onSelect(item.key);
    else onSelectItem(item);
  };

  const label = kind === 'mcp' ? uiText('MCP (HTTP response)', "MCP（HTTP 响应）") : kindLabel(kind);
  const showSearch = ofKind.length > 0 || truncated;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="existing-mocks-list">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography
          variant="subtitle2"
          sx={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: 'text.secondary',
          }}
        >
          {uiText(`Existing ${label} mocks`, `已有 ${label} 规则`)}
        </Typography>
        {selectedKey && (
          <Button
            size="small"
            variant="outlined"
            onClick={onClear}
            sx={{ fontSize: '0.7rem', py: 0, px: 1, minHeight: 24 }}
          >
            {uiText("New / clear", "新建 / 清空")}
          </Button>
        )}
      </Box>

      {selectedKey && (
        <Alert severity="info" variant="outlined" sx={{ fontSize: '0.72rem', py: 0, px: 1, mb: 0.5, alignItems: 'center', '& .MuiAlert-message': { py: 0.3 }, '& .MuiAlert-icon': { py: 0, alignItems: 'center' } }}>
          {uiText("Editing ", "正在编辑 ")}{selectedKey.slice(0, 12)}{uiText("... — changes update this expectation.", "… 修改将保存到此规则。")}
        </Alert>
      )}

      {truncated && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }} data-testid="existing-mocks-window-notice">
          {uiText(
            `This list holds the ${windowSize} expectations the dashboard keeps live, of ${total} on the server. Search by path or id to reach any of them.`,
            `此列表显示控制台实时跟踪的 ${windowSize} 条规则，服务器共有 ${total} 条。可按路径或 ID 搜索任意规则。`,
          )}
        </Typography>
      )}

      {showSearch && (
        <TextField
          size="small"
          fullWidth
          label={uiText("Search by path or id", "按路径或 ID 搜索")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 0.5 }}
        />
      )}

      {serverResult?.error && (
        <Alert severity="error" variant="outlined" sx={{ fontSize: '0.72rem', py: 0, px: 1, mb: 0.5 }}>
          {uiText("Could not search the server: ", "无法在服务器上搜索： ")}{serverResult.error}
        </Alert>
      )}

      {searching ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 1 }}>
          {uiText(`Searching all ${total} expectations…`, `正在搜索全部 ${total} 条规则…`)}
        </Typography>
      ) : filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 1 }}>
          {query
            ? uiText(`No ${kindLabel(kind)} mocks match “${query}”.`, `没有与“${query}”匹配的 ${kindLabel(kind)} Mock 规则。`)
            : uiText(`No ${kindLabel(kind)} mocks yet — fill in the form below to add one.`, `暂无 ${kindLabel(kind)} Mock 规则。填写下方表单即可创建。`)}
        </Typography>
      ) : (
        <Box sx={{ maxHeight: 200, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <List dense disablePadding>
            {filtered.map((e) => {
              const idShort = e.key.slice(0, 8);
              const summary = summaryForExpectation(e.value, kind === 'mcp' ? 'standard' : kind);
              // response sequences (httpResponses) support forcing a specific variant per request
              const isResponseSequence = !!e.value['httpResponses'];
              const summaryLabel = (
                <Typography
                  component="span"
                  sx={{ fontSize: '0.78rem', fontFamily: monospaceFontFamily }}
                >
                  <Box component="span" sx={{ color: 'text.secondary', mr: 0.5 }}>
                    {idShort}...
                  </Box>
                  {summary}
                </Typography>
              );
              return (
                <ListItemButton
                  key={e.key}
                  selected={e.key === selectedKey}
                  onClick={() => select(e)}
                  sx={{
                    py: 0.25,
                    px: 1,
                    minHeight: 28,
                    borderBottom: '1px solid',
                    borderBottomColor: 'divider',
                    '&:last-child': { borderBottom: 'none' },
                  }}
                >
                  <ListItemText
                    primary={
                      isResponseSequence ? (
                        <Tooltip
                          arrow
                          title={uiText("Force a specific variant per request with the x-mockserver-response-index header (0-based); it peeks without advancing the sequence.", "使用 x-mockserver-response-index 请求头可为单次请求指定响应序号（从 0 开始），不会推进原有序列。")}
                        >
                          {summaryLabel}
                        </Tooltip>
                      ) : (
                        summaryLabel
                      )
                    }
                    sx={{ m: 0 }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Box>
      )}

      {!selectedKey && filtered.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {uiText("Select a mock to edit it, or fill in the form below to add a new one.", "选择一条规则进行编辑，或填写下方表单新建规则。")}
        </Typography>
      )}
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Quick mock form — the 90%-case minimal HTTP static mock. Binds to the SAME
// `matcher` and `staticState` the advanced form uses, so switching modes never
// loses work. Shows only: method + path, and response status + content-type +
// body. All advanced machinery (headers, body match types, priority/times/TTL,
// chaos, side-effects, steps, capture, non-static actions) stays in Advanced.
// ---------------------------------------------------------------------------

interface QuickMockFormProps {
  matcher: MatcherState;
  setMatcher: (m: MatcherState) => void;
  staticState: StaticState;
  setStaticState: (s: StaticState) => void;
  registering: boolean;
  editingExisting: boolean;
  /** Fields the retained original carries that this form does not model; kept on
   *  Update rather than dropped. Drives the "Preserving N fields …" indicator. */
  preservedFields: string[];
  /** Response fields a save keeps from the loaded expectation that this form does not show. */
  keptFields: KeptFieldItem[];
  onRegister: () => void;
  onSwitchToAdvanced: () => void;
}

function QuickMockForm({
  matcher,
  setMatcher,
  staticState,
  setStaticState,
  registering,
  editingExisting,
  preservedFields,
  keptFields,
  onRegister,
  onSwitchToAdvanced,
}: QuickMockFormProps) {
  const disabledReason =
    matcher.path.trim().length === 0
      ? uiText('Enter a request path to match', "请填写要匹配的请求路径")
      : statusCodeHint(staticState.statusCode) ?? null;
  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }} data-testid="quick-mock-form">
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
          {uiText("1 · When this request arrives", "1 · 匹配传入请求")}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            label={uiText("Method", "请求方法")}
            size="small"
            select
            value={matcher.method}
            onChange={(e) => setMatcher({ ...matcher, method: e.target.value })}
            sx={{ minWidth: 110 }}
          >
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'].map((m) => (
              <MenuItem key={m} value={m === 'ANY' ? '' : m}>{m === 'ANY' ? uiText('ANY', '不限') : m}</MenuItem>
            ))}
          </TextField>
          <TextField
            label={uiText("Path", "路径")}
            size="small"
            sx={{ flex: 1, minWidth: 200 }}
            value={matcher.path}
            onChange={(e) => setMatcher({ ...matcher, path: e.target.value })}
            placeholder="/foo/bar"
            slotProps={{ htmlInput: { 'data-testid': 'quick-mock-path' } }}
          />
        </Box>
      </Box>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
          {uiText("2 · Respond with", "2 · 配置响应")}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
          <StatusCodeField
            testId="quick-mock-status-code"
            width={140}
            value={staticState.statusCode}
            onChange={(statusCode) => setStaticState({ ...staticState, statusCode })}
          />
          <TextField
            label="Content-Type"
            size="small"
            sx={{ flex: 1, minWidth: 200 }}
            value={staticState.contentType}
            onChange={(e) => setStaticState({ ...staticState, contentType: e.target.value })}
            placeholder="application/json"
          />
        </Box>
        {staticState.bodyFromFile ? (
          <TextField
            label={uiText("Response body", "响应体")}
            fullWidth
            multiline
            minRows={3}
            maxRows={12}
            value={staticState.body}
            disabled
            helperText={uiText("This mock serves its body from a file — switch to Advanced to edit that.", "此规则会从文件读取响应体。切换到高级模式可进行编辑。")}
            slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
          />
        ) : (
          <JsonEditor
            label={uiText("Response body", "响应体")}
            ariaLabel={uiText("Response body", "响应体")}
            language={responseBodyLanguage(staticState.contentType)}
            value={staticState.body}
            onChange={(next) => setStaticState({ ...staticState, body: next })}
            placeholder={'{"hello":"world"}'}
            height={160}
          />
        )}
        <KeptFieldsPanel items={keptFields} />
      </Box>

      {preservedFields.length > 0 && (
        <Alert
          severity="info"
          variant="outlined"
          icon={<InfoOutlinedIcon fontSize="small" />}
          data-testid="quick-preserved-fields-info"
          sx={{ py: 0, '& .MuiAlert-message': { py: 0.75 } }}
        >
          {uiText("Preserving ", "将保留此表单未显示的 ")}{preservedFields.length}{' '}
          {preservedFields.length === 1 ? uiText('field', "个字段") : uiText('fields', "个字段")}{uiText(" not shown in this form:", " ：")}{' '}
          <Box component="span" sx={{ fontFamily: monospaceFontFamily }}>
            {preservedFields.join(', ')}
          </Box>
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tooltip title={!registering && disabledReason ? disabledReason : ''}>
          <span>
            <Button
              variant="contained"
              size="small"
              onClick={onRegister}
              disabled={registering || disabledReason !== null}
              data-testid="quick-mock-submit"
            >
              {registering
                ? uiText('Registering…', "正在注册…")
                : editingExisting
                  ? uiText('Update mock', "更新规则")
                  : uiText('Register mock', "注册规则")}
            </Button>
          </span>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          {uiText("Need headers, matchers, forwarding, fault injection, or other response types?", "需要设置请求头、匹配条件、转发、故障注入或其他响应类型？")}{' '}
          <Link component="button" type="button" variant="caption" underline="hover" onClick={onSwitchToAdvanced}>
            {uiText("Switch to Advanced", "切换到高级模式")}
          </Link>.
        </Typography>
      </Box>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export interface ComposerViewProps {
  connectionParams: ConnectionParams;
}

/**
 * Form complexity mode. 'quick' shows only the 90%-case fields (HTTP static
 * mock: method + path + status + body + content-type); 'advanced' reveals the
 * full machinery. Persisted within the browser session so the choice survives
 * navigating away and back. Defaults to 'quick' for a fresh form.
 */
type ComposerMode = 'quick' | 'advanced';

const MODE_STORAGE_KEY = 'mockserver-composer-mode';

function getInitialMode(): ComposerMode {
  try {
    const stored = globalThis.sessionStorage?.getItem(MODE_STORAGE_KEY);
    if (stored === 'quick' || stored === 'advanced') return stored;
  } catch {
    // sessionStorage may be unavailable in test/SSR environments
  }
  return 'quick';
}

/** Blank per-action form states: the initial values, and what New / clear resets to. */
function initialStaticState(): StaticState {
  return {
    statusCode: 200,
    body: '',
    contentType: 'application/json',
    bodyFromFile: false,
    filePath: '',
    fileTemplateType: '',
    headers: '',
    reasonPhrase: '',
    cookies: '',
    delayValue: 0,
    delayUnit: 'MILLISECONDS',
  };
}

function initialForwardState(): ForwardState {
  return {
    scheme: 'HTTPS',
    host: '',
    port: 443,
  };
}

function initialForwardOverrideState(): ForwardOverrideState {
  return {
    overrideMethod: '',
    overrideHost: '',
    overrideScheme: '',
    overridePath: '',
    overrideQueryString: '',
    overrideHeaders: '',
    overrideBody: '',
  };
}

function initialCallbackState(): CallbackState {
  return { callbackClass: '' };
}

function initialTemplateState(): TemplateState {
  return {
    templateType: 'VELOCITY',
    template: '',
    templateFile: '',
  };
}

function initialErrorState(): ErrorState {
  return {
    dropConnection: true,
    resetConnection: false,
    responseBytesB64: '',
    delayValue: 0,
    delayUnit: 'MILLISECONDS',
  };
}

function initialForwardFallbackState(): ForwardFallbackState {
  return {
    scheme: 'HTTPS',
    host: '',
    port: 443,
    fallbackStatusCode: 200,
    fallbackBody: '',
    fallbackOnStatusCodes: '500,502,503',
    fallbackOnTimeout: true,
  };
}

function initialWebsocketState(): WebSocketState {
  return {
    subprotocol: '',
    messages: [listItemRow('')],
    closeConnection: false,
    matchers: [],
  };
}

function initialSseState(): StandardSseState {
  return {
    statusCode: 200,
    headers: '',
    events: [emptySseEvent()],
    closeConnection: false,
  };
}

function initialBinaryResponseState(): StandardBinaryResponseState {
  return {
    binaryData: '',
  };
}

function initialDnsResponseState(): StandardDnsState {
  return {
    responseCode: 'NOERROR',
    answerRecords: '',
  };
}

function initialForwardTemplateState(): StandardForwardTemplateState {
  return {
    templateType: 'VELOCITY',
    template: '',
    templateFile: '',
  };
}

function initialForwardClassCallbackState(): StandardForwardClassCallbackState {
  return {
    callbackClass: '',
  };
}

function initialGrpcStreamState(): GrpcStreamState {
  return {
    statusName: '',
    statusMessage: '',
    headers: '',
    messages: [listItemRow('')],
    closeConnection: false,
  };
}

export default function ComposerView({ connectionParams }: ComposerViewProps) {
  const activeExpectations = useDashboardStore((s) => s.activeExpectations);
  const activeExpectationsTotal = useDashboardStore((s) => s.activeExpectationsTotal);
  const pendingEditExpectation = useDashboardStore((s) => s.pendingEditExpectation);
  const clearPendingEditExpectation = useDashboardStore((s) => s.clearPendingEditExpectation);
  const setView = useDashboardStore((s) => s.setView);

  const [mode, setMode] = useState<ComposerMode>(getInitialMode);

  // Top-level tab on the Mocks page: 0 = Compose (the expectation builder),
  // 1 = Scenarios (the stateful mock state-machine panel, moved here from the
  // Trace page where it never belonged).
  const [composerTab, setComposerTab] = useState(0);

  const [kind, setKind] = useState<ExpectationKind>('standard');
  const [actionType, setActionType] = useState<ActionType>('static');
  // True once the action was picked by the user or loaded from a mock; while false
  // the action is just its kind's default, so a kind switch moves it to the new default.
  const actionChosenRef = useRef(false);
  const [matcher, setMatcher] = useState<MatcherState>(emptyMatcher);
  const [dnsMatcher, setDnsMatcher] = useState<StandardDnsMatcher>({ dnsName: '', dnsType: '', dnsClass: '' });
  const [loadFromKey, setLoadFromKey] = useState('');
  const [llmScenarioName, setLlmScenarioName] = useState('');

  // Per-action state (kept independent so switching radios doesn't lose work).
  const [staticState, setStaticState] = useState<StaticState>(initialStaticState);
  const [forwardState, setForwardState] = useState<ForwardState>(initialForwardState);
  const [forwardOverrideState, setForwardOverrideState] = useState<ForwardOverrideState>(initialForwardOverrideState);
  const [callbackState, setCallbackState] = useState<CallbackState>(initialCallbackState);
  const [templateState, setTemplateState] = useState<TemplateState>(initialTemplateState);
  const [errorState, setErrorState] = useState<ErrorState>(initialErrorState);
  const [forwardFallbackState, setForwardFallbackState] = useState<ForwardFallbackState>(initialForwardFallbackState);
  const [websocketState, setWebsocketState] = useState<WebSocketState>(initialWebsocketState);
  const [sseState, setSseState] = useState<StandardSseState>(initialSseState);
  const [binaryResponseState, setBinaryResponseState] = useState<StandardBinaryResponseState>(initialBinaryResponseState);
  const [dnsResponseState, setDnsResponseState] = useState<StandardDnsState>(initialDnsResponseState);
  const [forwardTemplateState, setForwardTemplateState] = useState<StandardForwardTemplateState>(initialForwardTemplateState);
  const [forwardClassCallbackState, setForwardClassCallbackState] = useState<StandardForwardClassCallbackState>(initialForwardClassCallbackState);
  const [grpcStreamState, setGrpcStreamState] = useState<GrpcStreamState>(initialGrpcStreamState);

  // Chaos profile — cross-cutting, applies regardless of action type
  // (except httpError which is already a fault action).
  const [chaosEnabled, setChaosEnabled] = useState(false);
  const [chaosState, setChaosState] = useState<StandardChaosDraft>({});

  // Side-effect actions — before / after actions (webhook httpRequest targets)
  const [sideEffectsEnabled, setSideEffectsEnabled] = useState(false);
  const [sideEffects, setSideEffects] = useState<StandardSideEffectAction[]>([]);

  // Steps pipeline — ordered multi-action (M1 increment-2).
  // When steps mode is enabled, the top-level action + before/after side-effects
  // are ignored and the expectation uses the `steps` array instead.
  const [stepsEnabled, setStepsEnabled] = useState(false);
  const [stepsState, setStepsState] = useState<StandardExpectationStep[]>([]);

  // Capture rules — extract request values into scenario state. Cross-cutting,
  // independent of the action type (a top-level `capture` sibling).
  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [captureRules, setCaptureRules] = useState<StandardCaptureRule[]>([]);

  // Edit overlay — when an existing expectation is loaded for editing (or
  // duplicating), its original JSON is retained here so Register/preview can
  // deep-merge the form output onto it, preserving every field the form does
  // not model (scenario bindings, response sequences, cross-protocol scenarios,
  // request-matcher extras, …) instead of silently dropping them. Null on the
  // new-compose flow, which is therefore unaffected. `editActionModeled` records
  // whether the form loaded the original's action (so it may replace it) or not
  // (so the original action is preserved).
  const [editOriginal, setEditOriginal] = useState<Record<string, unknown> | null>(null);
  const [editActionModeled, setEditActionModeled] = useState(true);
  // What the form emitted for the loaded action, so a save keeps the fields left untouched.
  const [editActionBaseline, setEditActionBaseline] = useState<Record<string, unknown> | undefined>(undefined);
  // Kept action fields removed in the Other fields panel, for the loaded original they belong to.
  // Reset on every load and New / clear, so re-picking an expectation never reapplies an old removal.
  const [keptRemovals, setKeptRemovals] = useState<KeptRemovals>(NO_KEPT_REMOVALS);
  const overlayOriginal = useMemo(
    () => (editOriginal && keptRemovals.original === editOriginal
      ? keptRemovals.fields.reduce(clearKeptActionField, editOriginal)
      : editOriginal),
    [editOriginal, keptRemovals],
  );
  const removeKeptField = useCallback((field: KeptActionField) => {
    setKeptRemovals((r) => ({
      original: editOriginal,
      fields: r.original === editOriginal ? [...r.fields, field] : [field],
    }));
  }, [editOriginal]);
  // Whether the Advanced JWT form faithfully owns the original's httpRequest.jwt
  // on edit. False when the original carries a jwt the form cannot round-trip
  // losslessly (e.g. object-form NottableString claims): the jwt is then
  // preserved as passthrough instead of being rewritten by a lossy prefill.
  const [editJwtModeled, setEditJwtModeled] = useState(true);

  // Optional scenario bindings (Advanced form's Scenario section). Blank on a
  // fresh compose; prefilled from the original on edit. These three keys are
  // form-authoritative only on the Advanced path (scenarioModeled) — the Quick
  // path preserves them as unmodeled passthrough. See lib/standardCodegen.ts.
  const [scenarioBindingName, setScenarioBindingName] = useState('');
  const [scenarioBindingState, setScenarioBindingState] = useState('');
  const [scenarioBindingNext, setScenarioBindingNext] = useState('');

  // Prefill the three scenario fields from an expectation value (empty when the
  // key is absent, so loading a non-scenario mock clears any stale binding).
  const prefillScenarioBinding = useCallback((value: Record<string, unknown>) => {
    setScenarioBindingName(typeof value['scenarioName'] === 'string' ? (value['scenarioName'] as string) : '');
    setScenarioBindingState(typeof value['scenarioState'] === 'string' ? (value['scenarioState'] as string) : '');
    setScenarioBindingNext(typeof value['newScenarioState'] === 'string' ? (value['newScenarioState'] as string) : '');
  }, []);

  const [registering, setRegistering] = useState(false);
  // Humanised register error (short message + raw details behind an expander).
  const [error, setError] = useState<HumanError | null>(null);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);
  // After a successful register, an inline next-step banner offers "View on
  // dashboard" / "Add another" so the user does not accidentally re-register the
  // still-populated form. Holds the label of the just-registered mock.
  const [registeredLabel, setRegisteredLabel] = useState<string | null>(null);
  // x-mockserver-lint-warnings from the last register; shown as a badge in the banner.
  const [registeredLintWarnings, setRegisteredLintWarnings] = useState(0);

  const selectedMeta = useMemo(
    () => ACTION_TYPES.find((a) => a.value === actionType)!,
    [actionType],
  );

  // When an existing expectation is selected for editing, expose its id so the MCP
  // Tools panel can highlight the tool derived from it, making the mock -> tool
  // relationship explicit. The list key is the expectation id, but prefer the value's
  // own id when present in case the two ever diverge.
  const selectedExpectationId = useMemo(() => {
    if (!loadFromKey) return undefined;
    const item = activeExpectations.find((e) => e.key === loadFromKey);
    const id = item?.value?.['id'];
    return typeof id === 'string' && id.length > 0 ? id : loadFromKey;
  }, [loadFromKey, activeExpectations]);

  // When editing an existing expectation, the JSON of that expectation exactly
  // as it lives on the server right now. Drives the before→after preview diff in
  // the Review step. We locate it by the key the user loaded from, falling back
  // to the (possibly hand-pasted) Expectation ID so the diff still appears when
  // an ID is typed without selecting from the list. Returns undefined when not
  // editing, which hides the diff.
  const originalExpectationJson = useMemo(() => {
    const id = matcher.id.trim();
    if (!id) return undefined;
    // the loaded original is whole; the listed one may be shortened
    if (editOriginal && editOriginal['id'] === id) return JSON.stringify(editOriginal, null, 2);
    const item =
      activeExpectations.find((e) => e.key === loadFromKey) ??
      activeExpectations.find((e) => e.value?.['id'] === id);
    if (!item) return undefined;
    return JSON.stringify(item.value, null, 2);
  }, [matcher.id, loadFromKey, activeExpectations, editOriginal]);

  // Single register helper — builds a StandardActionPayload from current
  // state and PUTs via registerExpectation, which itself uses
  // buildExpectationJson so the JSON sent matches the Java/JSON/curl preview
  // exactly. Replaces six per-action register helpers that had drifted apart
  // from the codegen path.
  const handleRegister = useCallback(
    async (action: StandardActionPayload, effectiveMatcher?: MatcherState) => {
      const m = effectiveMatcher ?? matcher;
      setRegistering(true);
      setError(null);
      setRegisteredLabel(null);
      try {
        const lintWarnings = await registerExpectation(connectionParams, m, action);
        trackFeature('expectation_created');
        setRegisteredLintWarnings(lintWarnings);
        const label = m.dns ? m.dns.dnsName : `${m.method || 'ANY'} ${m.path}`;
        setSnackMessage(uiText(`Registered ${label}`, `已注册 ${label}`));
        // Surface a persistent next-step banner (the snackbar auto-hides).
        setRegisteredLabel(label);
      } catch (e) {
        // Route the raw `MockServer returned <status>: <body>` throw through the
        // shared humaniser: short message inline, raw text behind "Details".
        setError(humanizeError(e));
      } finally {
        setRegistering(false);
      }
    },
    [connectionParams, matcher],
  );

  const loadExistingItem = useCallback(
    (item: JsonListItem) => {
      setMatcher(matcherFromExpectation(item));

      // Retain the original expectation JSON so Register/preview overlays the
      // form output onto it, preserving unmodeled fields. `editActionModeled`
      // records whether the form recognised the action (may replace it) or not
      // (preserve the original action). Steps are recognised via a separate
      // reader, so they count as "modeled" too.
      const existingStepsForFlag = stepsFromExpectation(item.value);
      setEditOriginal(item.value);
      setKeptRemovals(NO_KEPT_REMOVALS);
      prefillScenarioBinding(item.value);
      setEditJwtModeled(jwtFaithfullyModeled(item.value['httpRequest']));

      // Detect the action shape and prefill the matching panel + switch the radio.
      const prefill = actionFromExpectation(item);
      setEditActionModeled(!!prefill || !!existingStepsForFlag);
      setEditActionBaseline(prefill ? actionBaselineFor(prefill) : undefined);
      if (prefill) {
        // Infer the correct kind from the action type and switch to it. MCP is a
        // view over standard HTTP response expectations, so loading one from the
        // MCP list must NOT switch the user away from the MCP kind.
        const inferredKind = kindForActionType(prefill.type);
        setKind((prevKind) => (prevKind === 'mcp' && inferredKind === 'standard') ? 'mcp' : inferredKind);
        setActionType(prefill.type);
        actionChosenRef.current = true;
        if (prefill.staticState) setStaticState(prefill.staticState);
        if (prefill.forwardState) setForwardState(prefill.forwardState);
        if (prefill.forwardOverrideState) setForwardOverrideState(prefill.forwardOverrideState);
        if (prefill.forwardFallbackState) setForwardFallbackState(prefill.forwardFallbackState);
        if (prefill.callbackState) setCallbackState(prefill.callbackState);
        if (prefill.templateState) setTemplateState(prefill.templateState);
        if (prefill.errorState) setErrorState(prefill.errorState);
        if (prefill.websocketState) setWebsocketState(prefill.websocketState);
        if (prefill.sseState) setSseState(prefill.sseState);
        setBinaryResponseState((s) => prefill.binaryResponseState ?? withoutCarriedBinaryFields(s));
        if (prefill.dnsResponseState) setDnsResponseState(prefill.dnsResponseState);
        if (prefill.forwardTemplateState) setForwardTemplateState(prefill.forwardTemplateState);
        if (prefill.forwardClassCallbackState) setForwardClassCallbackState(prefill.forwardClassCallbackState);
        if (prefill.grpcStreamState) setGrpcStreamState(prefill.grpcStreamState);
      }

      // Populate the DNS matcher fields from the httpRequest if this is a
      // DNS expectation (the server serialises dnsName / dnsType / dnsClass
      // inside the httpRequest object).
      const req = (item.value['httpRequest'] as Record<string, unknown> | undefined) ?? {};
      if (typeof req['dnsName'] === 'string') {
        const validTypes: string[] = ['A', 'AAAA', 'CNAME', 'MX', 'SRV', 'TXT', 'PTR'];
        const validClasses: string[] = ['IN', 'CH', 'HS', 'ANY'];
        setDnsMatcher({
          dnsName: req['dnsName'] as string,
          dnsType: validTypes.includes(req['dnsType'] as string) ? (req['dnsType'] as DnsRecordType) : '',
          dnsClass: validClasses.includes(req['dnsClass'] as string) ? (req['dnsClass'] as DnsRecordClass) : '',
        });
      } else {
        setDnsMatcher({ dnsName: '', dnsType: '', dnsClass: '' });
      }

      // Repopulate chaos panel from an existing expectation
      const existingChaos = chaosFromExpectation(item.value);
      if (existingChaos) {
        setChaosEnabled(true);
        setChaosState(existingChaos);
      } else {
        setChaosEnabled(false);
        setChaosState({});
      }

      // Repopulate side-effects panel from an existing expectation
      const existingSideEffects = sideEffectsFromExpectation(item.value);
      if (existingSideEffects) {
        setSideEffectsEnabled(true);
        setSideEffects(existingSideEffects);
      } else {
        setSideEffectsEnabled(false);
        setSideEffects([]);
      }

      // Repopulate steps pipeline from an existing expectation
      const existingSteps = stepsFromExpectation(item.value);
      if (existingSteps) {
        setStepsEnabled(true);
        setStepsState(existingSteps);
        // Steps mode overrides side-effects — turn them off
        setSideEffectsEnabled(false);
        setSideEffects([]);
      } else {
        setStepsEnabled(false);
        setStepsState([]);
      }

      // Repopulate capture rules from an existing expectation
      const existingCapture = captureFromExpectation(item.value);
      if (existingCapture) {
        setCaptureEnabled(true);
        setCaptureRules(existingCapture);
      } else {
        setCaptureEnabled(false);
        setCaptureRules([]);
      }
    },
    [prefillScenarioBinding],
  );

  // Counts picker selections, so a whole expectation that loads after a later pick is ignored.
  const loadSelectionRef = useRef(0);
  const handleLoadExisting = useCallback(
    (key: string) => {
      const selection = ++loadSelectionRef.current;
      setLoadFromKey(key);
      if (!key) return;
      const item = activeExpectations.find((e) => e.key === key);
      if (!item) return;
      if (!item.truncatedExpectation) {
        loadExistingItem(item);
        return;
      }
      // a shortened value would be saved back shortened, so load the whole expectation first
      loadWholeExpectation(connectionParams, item).then(
        (whole) => {
          if (selection === loadSelectionRef.current) loadExistingItem(whole);
        },
        (e: unknown) => {
          if (selection !== loadSelectionRef.current) return;
          setLoadFromKey('');
          notifyWholeExpectationLoadFailed(e);
        },
      );
    },
    [activeExpectations, connectionParams, loadExistingItem],
  );

  // An expectation the existing-mocks search found beyond the live window: it
  // came whole from the server, so it loads directly.
  const handleLoadFound = useCallback(
    (item: JsonListItem) => {
      loadSelectionRef.current++;
      setLoadFromKey(item.key);
      loadExistingItem(item);
    },
    [loadExistingItem],
  );
  const searchAllExpectations = useCallback(
    async (signal: AbortSignal): Promise<JsonListItem[]> =>
      (await fetchActiveExpectations(connectionParams, signal))
        .filter((value) => typeof value['id'] === 'string')
        .map((value) => ({ key: value['id'] as string, value })),
    [connectionParams],
  );

  // Reset the whole form to a blank HTTP static mock. Shared by the
  // "New / clear" button and the success banner's "Add another" action so a
  // successful register can be followed by a fresh form without the user
  // re-registering the still-populated one.
  const resetForm = useCallback(() => {
    setLoadFromKey('');
    // Blank for the current kind, as switching to it shows: gRPC starts as a POST stream.
    setMatcher(kind === 'grpc' ? { ...emptyMatcher(), method: 'POST', path: GRPC_PATH } : emptyMatcher());
    setDnsMatcher({ dnsName: '', dnsType: '', dnsClass: '' });
    setChaosEnabled(false);
    setChaosState({});
    setSideEffectsEnabled(false);
    setSideEffects([]);
    setStepsEnabled(false);
    setStepsState([]);
    setCaptureEnabled(false);
    setCaptureRules([]);
    setActionType(kind === 'llm_conversation' || kind === 'import' ? 'static' : DEFAULT_ACTION_BY_KIND[kind]);
    actionChosenRef.current = false;
    setStaticState(initialStaticState());
    setForwardState(initialForwardState());
    setForwardOverrideState(initialForwardOverrideState());
    setCallbackState(initialCallbackState());
    setTemplateState(initialTemplateState());
    setErrorState(initialErrorState());
    setForwardFallbackState(initialForwardFallbackState());
    setWebsocketState(initialWebsocketState());
    setSseState(initialSseState());
    setBinaryResponseState(initialBinaryResponseState());
    setDnsResponseState(initialDnsResponseState());
    setForwardTemplateState(initialForwardTemplateState());
    setForwardClassCallbackState(initialForwardClassCallbackState());
    setGrpcStreamState(initialGrpcStreamState());
    // Drop the edit overlay so a fresh compose does not merge onto a stale
    // original (and cannot resurrect an old expectation's unmodeled fields).
    setEditOriginal(null);
    setKeptRemovals(NO_KEPT_REMOVALS);
    setEditActionModeled(true);
    setEditActionBaseline(undefined);
    setEditJwtModeled(true);
    setScenarioBindingName('');
    setScenarioBindingState('');
    setScenarioBindingNext('');
    setError(null);
    setRegisteredLabel(null);
  }, [kind]);

  // Persist the Quick/Advanced choice within the browser session so it survives
  // navigating away and back (cheap, non-destructive).
  useEffect(() => {
    try {
      globalThis.sessionStorage?.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // sessionStorage may be unavailable — the choice simply isn't persisted.
    }
  }, [mode]);

  // Edit hand-off from the dashboard's Active Expectations "Edit" action. When a
  // pendingEditExpectation appears, load it into the form, switch to ADVANCED so
  // nothing is hidden, then consume the hand-off (clear it) so it only fires once.
  useEffect(() => {
    if (!pendingEditExpectation) return;
    const value = pendingEditExpectation;
    const key = typeof value['id'] === 'string' && (value['id'] as string).length > 0
      ? (value['id'] as string)
      : '__pending_edit__';
    // Reuse the same load path the existing-mocks picker uses by wrapping the
    // raw value into a JsonListItem. handleLoadExisting looks the item up in
    // activeExpectations by key, so when the hand-off isn't already in the live
    // list (e.g. a just-captured request) we fall back to loading it directly.
    const inList = activeExpectations.find((e) => e.key === key || e.value['id'] === value['id']);
    // Consuming a one-shot hand-off from the Zustand store IS the legitimate
    // "sync React state from an external system" case the rule exempts; the
    // effect clears the signal at the end so it runs exactly once per hand-off.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode('advanced');
    // A hand-off may arrive while the Scenarios tab is active (the Scenarios
    // view's per-mock Edit). Switch to the Compose tab so the loaded form (and
    // its now-prefilled Scenario section) is actually visible.
    setComposerTab(0);
    if (inList) {
      // the handed-off value is whole; the listed one may be shortened
      loadSelectionRef.current++;
      setLoadFromKey(inList.key);
      loadExistingItem({ key: inList.key, value });
    } else {
      const item: JsonListItem = { key, value };
      setMatcher(matcherFromExpectation(item));
      // Retain the original so Register/preview preserves unmodeled fields.
      const existingStepsForFlag = stepsFromExpectation(value);
      setEditOriginal(value);
      setKeptRemovals(NO_KEPT_REMOVALS);
      prefillScenarioBinding(value);
      setEditJwtModeled(jwtFaithfullyModeled(value['httpRequest']));
      const prefill = actionFromExpectation(item);
      setEditActionModeled(!!prefill || !!existingStepsForFlag);
      setEditActionBaseline(prefill ? actionBaselineFor(prefill) : undefined);
      if (prefill) {
        const inferredKind = kindForActionType(prefill.type);
        setKind(inferredKind);
        setActionType(prefill.type);
        actionChosenRef.current = true;
        if (prefill.staticState) setStaticState(prefill.staticState);
        if (prefill.forwardState) setForwardState(prefill.forwardState);
        if (prefill.forwardOverrideState) setForwardOverrideState(prefill.forwardOverrideState);
        if (prefill.forwardFallbackState) setForwardFallbackState(prefill.forwardFallbackState);
        if (prefill.callbackState) setCallbackState(prefill.callbackState);
        if (prefill.templateState) setTemplateState(prefill.templateState);
        if (prefill.errorState) setErrorState(prefill.errorState);
        if (prefill.websocketState) setWebsocketState(prefill.websocketState);
        if (prefill.sseState) setSseState(prefill.sseState);
        setBinaryResponseState((s) => prefill.binaryResponseState ?? withoutCarriedBinaryFields(s));
        if (prefill.dnsResponseState) setDnsResponseState(prefill.dnsResponseState);
        if (prefill.forwardTemplateState) setForwardTemplateState(prefill.forwardTemplateState);
        if (prefill.forwardClassCallbackState) setForwardClassCallbackState(prefill.forwardClassCallbackState);
        if (prefill.grpcStreamState) setGrpcStreamState(prefill.grpcStreamState);
        const req = (value['httpRequest'] as Record<string, unknown> | undefined) ?? {};
        if (typeof req['dnsName'] === 'string') {
          const validTypes: string[] = ['A', 'AAAA', 'CNAME', 'MX', 'SRV', 'TXT', 'PTR'];
          const validClasses: string[] = ['IN', 'CH', 'HS', 'ANY'];
          setDnsMatcher({
            dnsName: req['dnsName'] as string,
            dnsType: validTypes.includes(req['dnsType'] as string) ? (req['dnsType'] as DnsRecordType) : '',
            dnsClass: validClasses.includes(req['dnsClass'] as string) ? (req['dnsClass'] as DnsRecordClass) : '',
          });
        }
        const existingChaos = chaosFromExpectation(value);
        if (existingChaos) { setChaosEnabled(true); setChaosState(existingChaos); }
        const existingSideEffects = sideEffectsFromExpectation(value);
        if (existingSideEffects) { setSideEffectsEnabled(true); setSideEffects(existingSideEffects); }
        const existingSteps = stepsFromExpectation(value);
        if (existingSteps) { setStepsEnabled(true); setStepsState(existingSteps); setSideEffectsEnabled(false); setSideEffects([]); }
        const existingCapture = captureFromExpectation(value);
        if (existingCapture) { setCaptureEnabled(true); setCaptureRules(existingCapture); }
      }
    }
    // Consume the hand-off so re-renders don't reload it.
    clearPendingEditExpectation();
  }, [pendingEditExpectation, activeExpectations, loadExistingItem, clearPendingEditExpectation, prefillScenarioBinding]);

  // Standard kind picker only lists expectations that AREN'T LLM
  // Conversation scenarios — those have their own picker on the
  // LLM-conversation kind below.
  const standardExpectations = useMemo(
    () => activeExpectations.filter((e) => !e.value['httpLlmResponse']),
    [activeExpectations],
  );

  const llmScenarios = useMemo(
    () => listConversationScenarios(activeExpectations),
    [activeExpectations],
  );

  // The draft action assembled from the current form state. Lifted to the
  // component level (from the Review step's inline builder) so the "Test
  // Matcher" playground and the Review preview share ONE buildExpectationJson
  // call — the matcher you test is byte-for-byte the one that would register.
  const draftAction = useMemo<StandardActionPayload>(() => {
    const a = actionPayloadFromStates({
      type: actionType, staticState, forwardState, forwardOverrideState, forwardFallbackState,
      callbackState, templateState, errorState, websocketState, sseState, binaryResponseState,
      dnsResponseState, forwardTemplateState, forwardClassCallbackState, grpcStreamState,
    });
    if (chaosEnabled && actionType !== 'error') a.chaos = chaosState;
    // Steps override top-level side-effects
    if (stepsEnabled && stepsState.length > 0) {
      a.steps = stepsState;
    } else if (sideEffectsEnabled && sideEffects.length > 0) {
      a.sideEffects = sideEffects;
    }
    if (captureEnabled && captureRules.length > 0) {
      a.capture = captureRules;
    }
    // Scenario bindings — the Advanced form renders the Scenario section, so it
    // OWNS these three keys (scenarioModeled): set when non-empty, removed when
    // cleared on edit. The Quick path never sets scenarioModeled, so it keeps
    // the bindings as unmodeled passthrough. Blank fields emit nothing, so a
    // fresh Advanced compose is byte-identical to before this section existed.
    a.scenario = {
      name: scenarioBindingName,
      requiredState: scenarioBindingState,
      transitionTo: scenarioBindingNext,
    };
    // GUARD: scenarioModeled makes the three scenario keys form-authoritative
    // (delete-when-cleared). It is safe ONLY because this draftAction is consumed
    // exclusively by the Advanced register path, which always renders the Scenario
    // section and prefills it on edit. Any future kind reusing draftAction to
    // register WITHOUT rendering/prefilling that section would silently delete
    // scenario bindings — keep this flag out of such paths.
    a.scenarioModeled = true;
    // Edit overlay — carry the retained original so buildExpectationJson merges
    // the form output onto it (preserving unmodeled fields).
    if (overlayOriginal) {
      a.editOriginal = overlayOriginal;
      a.editActionModeled = editActionModeled;
      a.editActionBaseline = editActionBaseline;
      // The Advanced form always renders + prefills the JWT section, so it owns
      // jwt on edit — but only when it can faithfully round-trip the original
      // (editJwtModeled); otherwise the original jwt is preserved as passthrough.
      a.jwtModeled = editJwtModeled;
    }
    return a;
  }, [
    actionType, staticState, forwardState, forwardOverrideState, forwardFallbackState,
    callbackState, templateState, errorState, websocketState, sseState, binaryResponseState,
    dnsResponseState, forwardTemplateState, forwardClassCallbackState, grpcStreamState,
    chaosEnabled, chaosState, stepsEnabled, stepsState, sideEffectsEnabled, sideEffects,
    captureEnabled, captureRules, overlayOriginal, editActionModeled, editActionBaseline, editJwtModeled,
    scenarioBindingName, scenarioBindingState, scenarioBindingNext,
  ]);

  // For DNS kind, attach the DNS matcher so buildExpectationJson emits the DNS
  // request shape instead of the HTTP request-matcher shape.
  const effectiveMatcher = useMemo<MatcherState>(
    () => (kind === 'dns' ? { ...matcher, dns: dnsMatcher } : matcher),
    [kind, matcher, dnsMatcher],
  );
  const advancedKeptFields = useMemo(() => keptActionFields(effectiveMatcher, draftAction), [effectiveMatcher, draftAction]);
  const lockedDelayActions = useMemo(() => new Set(advancedKeptFields
    .filter((f) => f.path.length === 1 && f.path[0] === 'delay' && isPlainRecord(f.value)
      && ('distribution' in f.value || 'template' in f.value))
    .map((f) => f.actionKey)), [advancedKeptFields]);

  // The exact expectation JSON that would be registered, used to seed the
  // "Test Matcher" playground. Empty string when the draft can't be built yet.
  const draftExpectationJson = useMemo(() => {
    try {
      return JSON.stringify(buildExpectationJson(effectiveMatcher, draftAction), null, 2);
    } catch {
      return '';
    }
  }, [effectiveMatcher, draftAction]);

  const [matcherPlaygroundOpen, setMatcherPlaygroundOpen] = useState(false);
  const [tryItOpen, setTryItOpen] = useState(false);

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <Tabs
        value={composerTab}
        onChange={(_, v: number) => setComposerTab(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, typography: 'body2' } }}
      >
        <Tab label={uiText("Compose", "编辑规则")} />
        <Tab label={uiText("Scenarios", "场景")} />
      </Tabs>

      {composerTab === 1 && (
        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, p: 1 }}>
          <ScenarioPanel connectionParams={connectionParams} />
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          minHeight: 0,
          display: composerTab === 0 ? 'block' : 'none',
        }}
      >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h5">
            {uiText("Mocks", "Mock 规则")}
          </Typography>
          {/* Quick vs Advanced mode. Quick shows only the 90%-case fields for a
              simple HTTP mock; Advanced reveals every option. */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_e, next: ComposerMode | null) => {
              if (!next || next === mode) return;
              if (next === 'quick') {
                // Quick mode only authors a plain HTTP static mock, so force the
                // kind / action back to that shape. The matcher + staticState
                // values are preserved, so nothing the user typed is lost.
                setKind('standard');
                setActionType('static');
                actionChosenRef.current = false;
              }
              setMode(next);
            }}
            aria-label={uiText("Form complexity", "表单模式")}
            color="primary"
            sx={{
              // Make the active mode obvious and on-brand: the selected segment is
              // a solid cyan (primary) pill, the other a cyan outline, so it clearly
              // reads as a two-option switch you can toggle.
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                px: 1.75,
                py: 0.4,
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'primary.main',
                borderColor: 'primary.main',
                transition: (t) => t.transitions.create(['background-color', 'color', 'border-color']),
                '&:not(.Mui-selected):hover': { backgroundColor: 'action.hover' },
                '&.Mui-selected': {
                  color: 'primary.contrastText',
                  backgroundColor: 'primary.main',
                  '&:hover': { backgroundColor: 'primary.dark' },
                },
              },
            }}
          >
            <ToggleButton value="quick" aria-label={uiText("Quick mock", "快速模式")}>{uiText("Quick mock", "快速模式")}</ToggleButton>
            <ToggleButton value="advanced" aria-label={uiText("Advanced", "高级模式")}>{uiText("Advanced", "高级模式")}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {mode === 'quick' && (() => {
          // Quick mode only ever authors a plain static httpResponse, so it may
          // own the action slot ONLY when the original action is itself a plain
          // httpResponse. Reusing the shared `editActionModeled` (true for all 14
          // recognised action types) would let a Quick "Update mock" on e.g. an
          // httpForward original silently overwrite it with a 200 response. When
          // the original is a non-static recognised action (forward, template,
          // error, …) we preserve it and warn — Advanced remains the path for an
          // explicit conversion.
          const quickActionModeled =
            !!editOriginal &&
            'httpResponse' in editOriginal &&
            !ACTION_FAMILY_KEYS.some((k) => k !== 'httpResponse' && k in editOriginal);
          const quickAction: StandardActionPayload = overlayOriginal
            ? { type: 'static', static: staticState, editOriginal: overlayOriginal, editActionModeled: quickActionModeled, editActionBaseline }
            : { type: 'static', static: staticState };
          return (
            <QuickMockForm
              matcher={matcher}
              setMatcher={setMatcher}
              staticState={staticState}
              setStaticState={setStaticState}
              registering={registering}
              editingExisting={matcher.id.trim().length > 0}
              preservedFields={editOriginal ? unmodeledFieldNames(editOriginal, { actionModeled: quickActionModeled }) : []}
              keptFields={keptFieldItems(keptActionFields(matcher, quickAction), removeKeptField)}
              // Thread the edit overlay through the Quick path too, so a Quick
              // "Update mock" preserves every field this form does not model
              // instead of PUTting form-only JSON under the same id. `editOriginal`
              // is set only when editing/duplicating; new-compose stays unaffected.
              onRegister={() => void handleRegister(quickAction, matcher)}
              onSwitchToAdvanced={() => setMode('advanced')}
            />
          );
        })()}

        {/* Top-level kind selector — each kind has a different form path.
            Hidden in Quick mode (Quick is always an HTTP static mock). */}
        {mode === 'advanced' && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
            {uiText("Expectation kind", "规则类型")}
          </Typography>
          <RadioGroup
            row
            value={kind}
            onChange={(e) => {
              const newKind = e.target.value as ExpectationKind;
              setKind(newKind);
              setLoadFromKey('');
              setLlmScenarioName('');
              // gRPC pre-shapes the matcher for gRPC conventions; leaving gRPC for
              // another kind undoes that pre-shaping unless the user customised it,
              // so the matcher no longer shows gRPC content under HTTP / DNS / MCP.
              if (newKind === 'grpc') {
                setMatcher((prev) => ({
                  ...prev,
                  method: 'POST',
                  path: prev.path || GRPC_PATH,
                }));
              } else if (kind === 'grpc') {
                setMatcher((prev) => ({
                  ...prev,
                  method: prev.method === 'POST' ? 'GET' : prev.method,
                  path: prev.path === GRPC_PATH ? '' : prev.path,
                }));
              }
              // Keep an action the user chose if the new kind allows it; otherwise
              // (or if it is still the old kind's default) use the new kind's default.
              if (newKind !== 'llm_conversation' && newKind !== 'import') {
                if (!actionChosenRef.current || !ACTION_TYPES_BY_KIND[newKind].includes(actionType)) {
                  setActionType(DEFAULT_ACTION_BY_KIND[newKind]);
                  actionChosenRef.current = false;
                }
              }
            }}
          >
            <FormControlLabel
              value="standard"
              control={<Radio size="small" />}
              label={<Typography variant="body2">HTTP</Typography>}
            />
            <FormControlLabel
              value="llm_conversation"
              control={<Radio size="small" />}
              label={<Typography variant="body2">{uiText("LLM Conversation", "LLM 对话")}</Typography>}
            />
            <FormControlLabel
              value="grpc"
              control={<Radio size="small" />}
              label={<Typography variant="body2">gRPC</Typography>}
            />
            <FormControlLabel
              value="dns"
              control={<Radio size="small" />}
              label={<Typography variant="body2">DNS</Typography>}
            />
            <FormControlLabel
              value="mcp"
              control={<Radio size="small" />}
              label={<Typography variant="body2">MCP</Typography>}
            />
            <FormControlLabel
              value="import"
              control={<Radio size="small" />}
              label={<Typography variant="body2">{uiText("Import", "导入")}</Typography>}
            />
          </RadioGroup>
        </Paper>
        )}

        {mode === 'advanced' && (kind === 'standard' || kind === 'grpc' || kind === 'mcp' || kind === 'dns') && (
          <ExistingMocksList
            kind={kind}
            expectations={standardExpectations}
            selectedKey={loadFromKey}
            onSelect={handleLoadExisting}
            onClear={resetForm}
            total={activeExpectationsTotal}
            windowSize={activeExpectations.length}
            searchServer={searchAllExpectations}
            onSelectItem={handleLoadFound}
          />
        )}

        {mode === 'advanced' && kind === 'llm_conversation' && (
          <>
            <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="existing-mocks-list">
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    color: 'text.secondary',
                  }}
                >
                  {uiText("Existing LLM scenarios", "已有 LLM 场景")}
                </Typography>
                {llmScenarioName && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setLlmScenarioName('')}
                    sx={{ fontSize: '0.7rem', py: 0, px: 1, minHeight: 24 }}
                  >
                    {uiText("New / clear", "新建 / 清空")}
                  </Button>
                )}
              </Box>

              {llmScenarioName && (
                <Alert severity="info" variant="outlined" sx={{ fontSize: '0.72rem', py: 0, px: 1, mb: 0.5, alignItems: 'center', '& .MuiAlert-message': { py: 0.3 }, '& .MuiAlert-icon': { py: 0, alignItems: 'center' } }}>
                  {uiText("Editing ", "正在编辑 ")}{llmScenarioName.replace(/^__llm_conv_/, '').replace(/__iso=.*$/, '')}{uiText(" — changes update this scenario.", " ，修改将保存到此场景。")}
                </Alert>
              )}

              {llmScenarios.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 1 }}>
                  {uiText("No LLM mocks yet — fill in the form below to add one.", "暂无 LLM 规则。填写下方表单即可创建。")}
                </Typography>
              ) : (
                <Box sx={{ maxHeight: 200, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <List dense disablePadding>
                    {llmScenarios.map((s) => (
                      <ListItemButton
                        key={s.scenarioName}
                        selected={s.scenarioName === llmScenarioName}
                        onClick={() => setLlmScenarioName(s.scenarioName)}
                        sx={{
                          py: 0.25,
                          px: 1,
                          minHeight: 28,
                          borderBottom: '1px solid',
                          borderBottomColor: 'divider',
                          '&:last-child': { borderBottom: 'none' },
                        }}
                      >
                        <ListItemText
                          primary={
                            <Typography
                              component="span"
                              sx={{ fontSize: '0.78rem', fontFamily: monospaceFontFamily }}
                            >
                              {uiText(`${s.shortName} (${s.expectations.length} turn${s.expectations.length === 1 ? '' : 's'})`, `${s.shortName}（${s.expectations.length} 轮）`)}
                            </Typography>
                          }
                          sx={{ m: 0 }}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Box>
              )}

              {!llmScenarioName && llmScenarios.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {uiText("Select a scenario to edit it, or fill in the form below to add a new one.", "选择场景进行编辑，或填写下方表单新建场景。")}
                </Typography>
              )}
            </Paper>

            {/* Inline LLM conversation form — remounts whenever the selected
                scenario changes so the draft state is fresh per-scenario. */}
            <LlmConversationForm
              key={llmScenarioName || 'new'}
              connectionParams={connectionParams}
              initialScenarioName={llmScenarioName || undefined}
            />
          </>
        )}

        {mode === 'advanced' && kind === 'import' && (
          <ImportForm connectionParams={connectionParams} />
        )}

        {mode === 'advanced' && (kind === 'standard' || kind === 'grpc' || kind === 'mcp' || kind === 'dns') && (
          <>
            {kind === 'grpc' && (
              <Alert severity="info" variant="outlined" sx={{ fontSize: '0.78rem' }}>
                {uiText("gRPC requests are transcoded to HTTP and matched by normal expectations. The matcher is pre-shaped with POST and a ", "gRPC 请求会被转换成 HTTP 请求，再由普通规则匹配。已预填 POST 方法和路径格式 ")}<code>/package.Service/Method</code>{uiText(" path pattern. Choose a standard HTTP response or a gRPC stream response action.", " 。可选择标准 HTTP 响应或 gRPC 流式响应。")}
              </Alert>
            )}
            {kind === 'dns' && (
              <Alert severity="info" variant="outlined" sx={{ fontSize: '0.78rem' }}>
                {uiText("DNS expectations are served by the DNS handler on the MockServer DNS port. The request matcher matches by DNS name, record type, and record class; the action returns a DNS response with a response code and answer records.", "DNS 请求由 MockServer DNS 端口的处理程序接收。规则按 DNS 名称、记录类型和类别进行匹配，并返回响应码和应答记录。")}
              </Alert>
            )}
            {kind === 'mcp' && (
              <Alert severity="info" variant="outlined" sx={{ fontSize: '0.78rem' }}>
                {uiText("MCP tools are generated automatically from HTTP response expectations — create a response mock and it appears as a callable tool on the MCP endpoint. The derived tools are shown below after you register.", "MCP 工具会根据 HTTP 响应规则自动生成。注册响应规则后，对应工具会显示在下方，并可通过 MCP 端点调用。")}
              </Alert>
            )}
            {/* MCP kind: show the derived tools at the top so it is clear the MCP
                radio is active, immediately above the request matcher. */}
            {kind === 'mcp' && (
              <Paper variant="outlined" sx={{ p: 0 }}>
                <McpToolsPanel
                  connectionParams={connectionParams}
                  selectedExpectationId={selectedExpectationId}
                />
              </Paper>
            )}
            {/* Step 1: matcher — DNS uses a dedicated panel with dnsName /
                dnsType / dnsClass instead of the HTTP method / path / headers
                / body fields. */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                {uiText("1 · Match a request", "1 · 配置请求匹配")}
              </Typography>
              {kind === 'dns' ? (
                <>
                  <DnsMatcherPanel
                    matcher={matcher}
                    setMatcher={setMatcher}
                    dnsMatcher={dnsMatcher}
                    setDnsMatcher={setDnsMatcher}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {uiText("DNS queries are matched by dnsName (required), record type, and record class. Leave type and class empty to match any. The server routes to a DnsRequestDefinition when the request object contains a dnsName field.", "按 dnsName（必填）、记录类型和记录类别匹配 DNS 查询。类型和类别留空可匹配任意记录。请求对象包含 dnsName 字段时，服务器会使用 DnsRequestDefinition 处理。")}
                  </Typography>
                </>
              ) : (
                <>
                  <MatcherPanel matcher={matcher} setMatcher={setMatcher} />
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<ScienceOutlinedIcon fontSize="small" />}
                      onClick={() => setMatcherPlaygroundOpen(true)}
                    >
                      {uiText("Test Matcher", "预览规则匹配")}
                    </Button>
                    {/* Dry-run's live sibling: Test Matcher predicts a verdict in the
                        browser, Try It actually fires the request at MockServer and
                        shows the real response. */}
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<SendOutlinedIcon fontSize="small" />}
                      onClick={() => setTryItOpen((open) => !open)}
                    >
                      {tryItOpen ? uiText('Hide Try It', "关闭试发面板") : uiText('Try It', "试发 HTTP 请求…")}
                    </Button>
                  </Box>
                  {/* Mounted only while open so it re-derives from the latest draft
                      each time it is opened. */}
                  {tryItOpen && (
                    <LiveResponseWidget
                      expectationJson={draftExpectationJson}
                      connectionParams={connectionParams}
                      onClose={() => setTryItOpen(false)}
                    />
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {kind === 'grpc'
                      ? uiText('gRPC path convention: /package.Service/Method. gRPC clients send Content-Type: application/grpc — add it to the matcher headers to restrict to gRPC traffic only.', "gRPC 路径格式为 /package.Service/Method。gRPC 客户端会发送 Content-Type: application/grpc，请将该请求头加入匹配条件以限定 gRPC 流量。")
                      : uiText('Protocol (HTTP/1.1 vs HTTP/2), keep-alive, respond-before-body, the socket-address override, and client certificate chains are not yet exposed in the form — use the REST API or raw JSON for those.', "表单暂不支持设置协议（HTTP/1.1 或 HTTP/2）、持久连接、在请求体接收完前响应、覆盖套接字地址或客户端证书链。可使用 REST API 或直接编辑 JSON。")}
                    {' '}{uiText("Object callbacks (httpResponseObjectCallback / httpForwardObjectCallback) require live WebSocket registration and are not form-authorable.", "对象回调（httpResponseObjectCallback、httpForwardObjectCallback）必须通过有效的 WebSocket 连接注册，表单暂不支持。")}
                  </Typography>
                </>
              )}
            </Paper>

            {/* Step 2: action type */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                {uiText("2 · Respond with", "2 · 配置响应")}
              </Typography>
              <RadioGroup
                value={actionType}
                onChange={(e) => {
                  setActionType(e.target.value as ActionType);
                  actionChosenRef.current = true;
                }}
              >
                {actionTypesForKind(kind as ActionKind).map((a) => (
                  <FormControlLabel
                    key={a.value}
                    value={a.value}
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {a.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {a.description}
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start', mb: 0.5 }}
                  />
                ))}
              </RadioGroup>
            </Paper>

            {/* Step 3: per-action panel */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                3 · {selectedMeta.label}
              </Typography>
              <Divider sx={{ mb: 1.5 }} />

              {actionType === 'static' && (
                <StaticHttpPanel state={staticState} setState={setStaticState} delayLocked={lockedDelayActions.has('httpResponse')} />
              )}
              {actionType === 'forward' && (
                <ForwardPanel state={forwardState} setState={setForwardState} />
              )}
              {actionType === 'forward_override' && (
                <ForwardOverridePanel state={forwardOverrideState} setState={setForwardOverrideState} />
              )}
              {actionType === 'callback' && (
                <CallbackPanel state={callbackState} setState={setCallbackState} />
              )}
              {actionType === 'template' && (
                <TemplatePanel state={templateState} setState={setTemplateState} connectionParams={connectionParams} />
              )}
              {actionType === 'error' && (
                <ErrorPanel state={errorState} setState={setErrorState} delayLocked={lockedDelayActions.has('httpError')} />
              )}
              {actionType === 'forward_fallback' && (
                <ForwardFallbackPanel state={forwardFallbackState} setState={setForwardFallbackState} />
              )}
              {actionType === 'websocket' && (
                <WebSocketPanel state={websocketState} setState={setWebsocketState} />
              )}
              {actionType === 'sse' && (
                <SsePanel state={sseState} setState={setSseState} />
              )}
              {actionType === 'binary_response' && (
                <BinaryResponsePanel state={binaryResponseState} setState={setBinaryResponseState} />
              )}
              {actionType === 'dns_response' && (
                <DnsResponsePanel state={dnsResponseState} setState={setDnsResponseState} />
              )}
              {actionType === 'forward_template' && (
                <ForwardTemplatePanel state={forwardTemplateState} setState={setForwardTemplateState} connectionParams={connectionParams} />
              )}
              {actionType === 'forward_class_callback' && (
                <ForwardClassCallbackPanel state={forwardClassCallbackState} setState={setForwardClassCallbackState} />
              )}
              {actionType === 'grpc_stream' && (
                <GrpcStreamPanel state={grpcStreamState} setState={setGrpcStreamState} />
              )}
              <KeptFieldsPanel
                items={[
                  ...(actionType === 'binary_response' ? binaryCarriedFieldItems(binaryResponseState, setBinaryResponseState) : []),
                  ...keptFieldItems(advancedKeptFields, removeKeptField),
                ]}
              />
            </Paper>

            {/* Chaos / fault injection — optional, cross-cutting. Not shown
                for the Error action type since it's already a fault action. */}
            {actionType !== 'error' && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={chaosEnabled}
                      onChange={(e) => {
                        setChaosEnabled(e.target.checked);
                        if (!e.target.checked) setChaosState({});
                      }}
                    />
                  }
                  label={
                    <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                      {uiText("Inject fault / chaos (optional)", "故障注入（可选）")}
                    </Typography>
                  }
                  sx={{ m: 0 }}
                />
                <Collapse in={chaosEnabled} unmountOnExit>
                  <Box sx={{ mt: 1.5 }}>
                    <ChaosPanel chaos={chaosState} setChaos={setChaosState} />
                  </Box>
                </Collapse>
              </Paper>
            )}

            {/* Side-effect actions (before / after) — optional, cross-cutting.
                Disabled when Steps mode is active (they conflict). */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Tooltip title={stepsEnabled ? uiText('Side-effects cannot be combined with steps mode', "步骤模式与前置或后置动作不能同时使用") : ''}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={sideEffectsEnabled}
                      disabled={stepsEnabled}
                      onChange={(e) => {
                        setSideEffectsEnabled(e.target.checked);
                        if (!e.target.checked) setSideEffects([]);
                      }}
                    />
                  }
                  label={
                    <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: stepsEnabled ? 'text.disabled' : 'text.secondary' }}>
                      {uiText("Before & after actions (optional)", "前置和后置动作（可选）")}
                    </Typography>
                  }
                  sx={{ m: 0 }}
                />
              </Tooltip>
              <Collapse in={sideEffectsEnabled && !stepsEnabled} unmountOnExit>
                <Box sx={{ mt: 1.5 }}>
                  <SideEffectsPanel sideEffects={sideEffects} setSideEffects={setSideEffects} />
                </Box>
              </Collapse>
            </Paper>

            {/* Steps pipeline — ordered multi-action (M1 increment-2).
                When enabled, overrides both the top-level action and before/after actions. */}
            <Paper variant="outlined" sx={{ p: 2 }} data-testid="steps-section">
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={stepsEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setStepsEnabled(enabled);
                      if (enabled) {
                        // Disable side-effects — steps replace both action + side-effects
                        setSideEffectsEnabled(false);
                        setSideEffects([]);
                      } else {
                        setStepsState([]);
                      }
                    }}
                  />
                }
                label={
                  <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                    {uiText("Steps pipeline (advanced, optional)", "步骤流程（高级，可选）")}
                  </Typography>
                }
                sx={{ m: 0 }}
              />
              {stepsEnabled && (
                <Alert severity="info" variant="outlined" sx={{ fontSize: '0.72rem', mt: 1, mb: 0.5 }}>
                  {uiText("Steps mode replaces the top-level response action and before/after side-effects with an ordered pipeline. The action type above is ignored when steps are active.", "启用步骤模式后，有序流程会取代顶层响应动作以及前置和后置动作。上方选择的动作类型不生效。")}
                </Alert>
              )}
              <Collapse in={stepsEnabled} unmountOnExit>
                <Box sx={{ mt: 1.5 }}>
                  <StepsPanel steps={stepsState} setSteps={setStepsState} />
                </Box>
              </Collapse>
            </Paper>

            {/* Capture rules — optional, cross-cutting. Extract request values into
                scenario state for response templates to read via the scenario helper. */}
            <Paper variant="outlined" sx={{ p: 2 }} data-testid="capture-section">
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={captureEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setCaptureEnabled(enabled);
                      if (enabled) {
                        // Seed an empty row so the panel is immediately usable.
                        if (captureRules.length === 0) setCaptureRules([emptyCaptureRule()]);
                      } else {
                        setCaptureRules([]);
                      }
                    }}
                  />
                }
                label={
                  <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                    {uiText("Capture into scenario state (optional)", "提取到场景状态（可选）")}
                  </Typography>
                }
                sx={{ m: 0 }}
              />
              <Collapse in={captureEnabled} unmountOnExit>
                <Box sx={{ mt: 1.5 }}>
                  <CapturePanel capture={captureRules} setCapture={setCaptureRules} />
                </Box>
              </Collapse>
            </Paper>

            {/* Scenario bindings — optional state-machine wiring. Blank fields
                are omitted (a stateless mock). On edit these are prefilled and
                stay authoritative (clearing a field removes the binding); the
                Quick path preserves them untouched as passthrough. */}
            <Paper variant="outlined" sx={{ p: 2 }} data-testid="scenario-section">
              <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                {uiText("Scenario (optional)", "场景（可选）")}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, mb: 1 }}>
                {uiText("Bind this mock to a scenario state machine: it matches only while the scenario is in the required state, then advances it to the transition state. Leave blank for a stateless mock.", "将此规则绑定到场景状态机。仅在场景处于指定状态时匹配，并在匹配后切换到目标状态。留空则创建无状态规则。")}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label={uiText("Scenario Name", "场景名称")}
                  value={scenarioBindingName}
                  onChange={(e) => setScenarioBindingName(e.target.value)}
                  sx={{ flex: 1, minWidth: 160 }}
                />
                <TextField
                  size="small"
                  label={uiText("Required State", "匹配所需状态")}
                  value={scenarioBindingState}
                  onChange={(e) => setScenarioBindingState(e.target.value)}
                  sx={{ flex: 1, minWidth: 140 }}
                />
                <TextField
                  size="small"
                  label={uiText("Transition To", "切换至状态")}
                  value={scenarioBindingNext}
                  onChange={(e) => setScenarioBindingNext(e.target.value)}
                  sx={{ flex: 1, minWidth: 140 }}
                />
              </Box>
            </Paper>

            {/* Step 4: review & register — shows the generated Java / JSON /
                curl, then the single Register button (mirrors the
                LLM Conversation form's review-and-register section). */}
            {(() => {
              // Assembled at the component level (memoised `draftAction`) so the
              // Review preview and the "Test Matcher" playground share the SAME
              // buildExpectationJson call and cannot drift. The edit-overlay
              // (editOriginal / editActionModeled) is already folded in there.
              const currentAction = draftAction;

              // Fields being preserved through the edit that this form does not
              // model — surfaced as a subtle indicator so the user knows they are
              // kept (not silently dropped) on Update.
              const preservedFields = editOriginal
                ? unmodeledFieldNames(editOriginal, { actionModeled: editActionModeled, scenarioModeled: true, jwtModeled: editJwtModeled })
                : [];

              // `effectiveMatcher` is memoised at the component level (attaches
              // the DNS matcher for DNS kind).
              const dispatchRegister = () => void handleRegister(currentAction, effectiveMatcher);

              // Per-action validation — returns why the Register button is disabled (or null when
              // it's enabled), so the disabled state always has a visible reason (tooltip below).
              // DNS kind validates dnsName instead of matcher.path.
              const disabledReason: string | null = (() => {
                if (kind === 'dns') {
                  if (dnsMatcher.dnsName.trim().length === 0) return uiText('Enter a DNS name to match', "请填写要匹配的 DNS 名称");
                } else {
                  if (matcher.path.trim().length === 0) return uiText('Enter a request path to match', "请填写要匹配的请求路径");
                }

                // Cross-cutting chaos validation — applies regardless of action type.
                // Checked early so a chaos range error is surfaced before the per-action
                // checks (which return directly).
                // Bounds verified against HttpChaosProfile.java: errorStatus 100–599,
                // errorProbability 0.0–1.0
                if (chaosEnabled && hasStandardChaosRangeErrors(chaosState)) {
                  return uiText('Chaos profile has out-of-range values (errorStatus: 100–599, errorProbability: 0.0–1.0)', "故障注入配置超出范围（errorStatus：100–599，errorProbability：0.0–1.0）");
                }

                // A binary body matcher must be valid base64 — otherwise the
                // generated `Base64.getDecoder().decode(...)` throws and the
                // server rejects the registration.
                if (kind !== 'dns' && (matcher.bodyMatcherType === 'binary' || matcher.bodyBinary) && matcher.body.trim().length > 0 && !isValidBase64(matcher.body)) {
                  return uiText('Binary body matcher is not valid base64', "二进制请求体匹配条件必须为有效的 Base64");
                }

                // A JSON or JSON-Schema body matcher must be well-formed JSON —
                // the Monaco editor flags this inline, and we also block the
                // Register button so an invalid body cannot be submitted (it
                // would otherwise be rejected by the server). Mirrors the
                // dns_response answer-records check below.
                if (
                  kind !== 'dns' &&
                  (matcher.bodyMatcherType === 'json' || matcher.bodyMatcherType === 'json-schema') &&
                  matcher.body.trim().length > 0
                ) {
                  try {
                    JSON.parse(matcher.body);
                  } catch {
                    return matcher.bodyMatcherType === 'json-schema'
                      ? uiText('JSON Schema body matcher is not valid JSON', "JSON Schema 匹配条件必须为有效的 JSON")
                      : uiText('JSON body matcher is not valid JSON', "JSON 请求体匹配条件必须为有效的 JSON");
                  }
                }

                // Steps mode validation — exactly one responder required
                if (stepsEnabled) {
                  if (stepsState.length === 0) return uiText('Add at least one step', "请至少添加一个步骤");
                  const responderCount = stepsState.filter((s) => s.responder).length;
                  if (responderCount === 0) return uiText('Exactly one step must be the responder', "请指定一个响应步骤");
                  if (responderCount > 1) return uiText('Only one step can be the responder', "只能指定一个响应步骤");
                  return null;
                }
                switch (actionType) {
                  case 'static':
                    return (staticState.bodyFromFile && staticState.filePath.trim().length === 0)
                      ? uiText('Enter the response body file path', "请填写响应体文件路径") : statusCodeHint(staticState.statusCode) ?? null;
                  case 'forward': return (forwardState.host.trim().length > 0 && forwardState.port > 0) ? null : uiText('Enter a forward host and port', "请填写转发目标的主机和端口");
                  case 'forward_override':
                    return (
                      forwardOverrideState.overrideMethod.trim().length > 0 ||
                      forwardOverrideState.overrideHost.trim().length > 0 ||
                      forwardOverrideState.overrideScheme !== '' ||
                      forwardOverrideState.overridePath.trim().length > 0 ||
                      forwardOverrideState.overrideQueryString.trim().length > 0 ||
                      forwardOverrideState.overrideHeaders.trim().length > 0 ||
                      forwardOverrideState.overrideBody.trim().length > 0
                    ) ? null : uiText('Set at least one override field', "请至少设置一个要改写的字段");
                  case 'forward_fallback':
                    return (forwardFallbackState.host.trim().length > 0 && forwardFallbackState.port > 0)
                      ? statusCodeHint(forwardFallbackState.fallbackStatusCode) ?? null
                      : uiText('Enter a fallback host and port', "请填写带回退的转发目标主机和端口");
                  case 'callback': return callbackState.callbackClass.trim().length > 0 ? null : uiText('Enter the callback class name', "请填写回调类名");
                  case 'template': return (templateState.template.trim().length > 0 || (templateState.templateFile ?? '').trim().length > 0) ? templateParametersHint(templateState.parameters) : uiText('Enter a response template or a template file path', "请填写响应模板或模板文件路径");
                  case 'error':
                    if (errorState.responseBytesB64.trim().length > 0 && !isValidBase64(errorState.responseBytesB64)) return uiText('Response bytes are not valid base64', "响应字节必须为有效的 Base64");
                    return (errorState.dropConnection || errorState.resetConnection || errorState.responseBytesB64.trim().length > 0) ? null : uiText('Enable drop-connection or reset-connection, or enter response bytes', "请启用断开连接或重置连接，或填写响应字节");
                  case 'websocket': return null;
                  case 'sse':
                    if (!sseState.events.some((ev) => ev.data.trim().length > 0 || ev.event.trim().length > 0)) return uiText('Add at least one SSE event', "请至少添加一个 SSE 事件");
                    return statusCodeHint(sseState.statusCode) ?? null;
                  case 'binary_response':
                    // No data is valid: the matched message gets no reply.
                    if (binaryResponseState.binaryData.trim().length === 0) return null;
                    return isValidBase64(binaryResponseState.binaryData) ? null : uiText('Binary data is not valid base64', "二进制数据必须为有效的 Base64");
                  case 'dns_response': {
                    // Surface invalid answer-records JSON instead of silently dropping it (the
                    // codegen omits unparseable records, which would register an empty DNS answer).
                    const recs = dnsResponseState.answerRecords.trim();
                    if (recs.length > 0) {
                      try {
                        if (!Array.isArray(JSON.parse(recs))) return uiText('Answer records must be a JSON array', "应答记录必须为 JSON 数组");
                      } catch {
                        return uiText('Answer records must be valid JSON (an array of records)', "请填写有效的 JSON 应答记录数组");
                      }
                    }
                    return null;
                  }
                  case 'forward_template': return (forwardTemplateState.template.trim().length > 0 || (forwardTemplateState.templateFile ?? '').trim().length > 0) ? templateParametersHint(forwardTemplateState.parameters) : uiText('Enter a forward template or a template file path', "请填写转发模板或模板文件路径");
                  case 'forward_class_callback': return forwardClassCallbackState.callbackClass.trim().length > 0 ? null : uiText('Enter the forward callback class name', "请填写转发回调类名");
                  case 'grpc_stream': return null;
                }
              })();
              const canRegister = disabledReason === null;

              const editingExisting = matcher.id.trim().length > 0;

              return (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                    {uiText("4 · Review & register", "4 · 确认并注册")}
                  </Typography>
                  <Divider sx={{ mb: 1 }} />
                  {preservedFields.length > 0 && (
                    <Alert
                      severity="info"
                      variant="outlined"
                      icon={<InfoOutlinedIcon fontSize="small" />}
                      data-testid="preserved-fields-info"
                      sx={{ mb: 1, py: 0, '& .MuiAlert-message': { py: 0.75 } }}
                    >
                      {uiText("Preserving ", "将保留此表单未显示的 ")}{preservedFields.length}{' '}
                      {preservedFields.length === 1 ? uiText('field', "个字段") : uiText('fields', "个字段")}{uiText(" not shown in this form:", " ：")}{' '}
                      <Box component="span" sx={{ fontFamily: monospaceFontFamily }}>
                        {preservedFields.join(', ')}
                      </Box>
                    </Alert>
                  )}
                  <StandardReview
                    matcher={effectiveMatcher}
                    action={currentAction}
                    baseUrl={baseUrl(connectionParams)}
                    originalJson={editingExisting ? originalExpectationJson : undefined}
                  />
                  <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Tooltip title={!registering && disabledReason ? disabledReason : ''}>
                      {/* span wrapper so the tooltip works while the button is disabled */}
                      <span>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={dispatchRegister}
                          disabled={registering || !canRegister}
                        >
                          {registering
                            ? uiText('Registering…', "正在注册…")
                            : editingExisting
                              ? uiText('Update expectation', "更新规则")
                              : uiText('Register expectation', "注册规则")}
                        </Button>
                      </span>
                    </Tooltip>
                    {editingExisting ? (
                      <Typography variant="caption" color="success.main">
                        {uiText("Editing — the Expectation ID will be reused so this updates in place.", "将沿用现有规则 ID 并更新该规则。")}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        {uiText("Leave the Expectation ID blank to create a new one, or paste an existing ID above to update in place.", "规则 ID 留空可创建新规则，也可填写已有规则 ID 进行更新。")}
                      </Typography>
                    )}
                  </Box>
                </Paper>
              );
            })()}

          </>
        )}

        {/* Success next-step — offer a clear action so the still-populated form
            isn't accidentally re-registered. Persists until dismissed. */}
        {registeredLabel && (
          <Alert
            severity="success"
            variant="outlined"
            data-testid="register-success"
            onClose={() => setRegisteredLabel(null)}
          >
            <AlertTitle sx={{ mb: 0.5 }}>{uiText("Mock Registered", "Mock 规则已注册")}</AlertTitle>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <code>{registeredLabel}</code>{uiText(" is now live. What next?", " 已生效。接下来要做什么？")}
            </Typography>
            {registeredLintWarnings > 0 && (
              <Box sx={{ mb: 1 }}>
                <LintWarningsBadge count={registeredLintWarnings} connectionParams={connectionParams} />
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={() => {
                  setRegisteredLabel(null);
                  setView('dashboard');
                }}
              >
                {uiText("View on dashboard", "在运行面板查看")}
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="success"
                onClick={resetForm}
              >
                {uiText("Add another", "再添加一条")}
              </Button>
            </Box>
          </Alert>
        )}

        {/* Humanised register error: short message inline, raw server text behind
            a "Details" expander. */}
        {error && (
          <HumanErrorAlert error={error} variant="outlined" data-testid="register-error" />
        )}
      </Box>
      </Box>
      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      {/* Locally-rendered matcher playground seeded with the current draft, so a
          user can dry-run the matcher they're building without leaving the form.
          Mounted only while open so it re-seeds from the latest draft each time. */}
      {matcherPlaygroundOpen && (
        <MatcherPlaygroundDialog
          open
          onClose={() => setMatcherPlaygroundOpen(false)}
          initialExpectation={draftExpectationJson}
        />
      )}
    </Box>
  );
}

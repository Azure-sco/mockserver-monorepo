/**
 * Client for MockServer's live configuration control plane (GET/PUT /mockserver/configuration).
 * GET returns the full configuration; PUT applies a partial ConfigurationDTO (only the supplied
 * fields are changed), so the dashboard can tweak a setting like the log level at runtime.
 */
import { buildBaseUrl } from './mcpClient';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { uiText } from './dashboardLocale';

export type Configuration = Record<string, unknown>;

export async function getConfiguration(params: ConnectionParams, signal?: AbortSignal): Promise<Configuration> {
  const res = await fetch(`${buildBaseUrl(params)}/mockserver/configuration`, { signal });
  if (!res.ok) throw new Error(`Failed to load configuration (HTTP ${res.status} ${res.statusText})`);
  return (await res.json()) as Configuration;
}

/** Apply a partial configuration change (only the supplied keys are modified server-side). */
export async function updateConfiguration(params: ConnectionParams, partial: Configuration): Promise<void> {
  const res = await fetch(`${buildBaseUrl(params)}/mockserver/configuration`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Failed to update configuration (HTTP ${res.status} ${res.statusText})`);
  }
}

export const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF'] as const;

// ---------------------------------------------------------------------------
// Effective (read-only) configuration — GET /mockserver/config
// ---------------------------------------------------------------------------

/**
 * The source tier a resolved configuration value came from. Matches the exact
 * strings emitted by the server's `effectiveConfiguration()` (`--print-config`
 * twin). `default` means the built-in default (value is that default's value);
 * sensitive values are redacted server-side to `***REDACTED***`. `unrecognised`
 * is a `mockserver.*` / `MOCKSERVER_*` key that is not a property, so is ignored
 * (value `(ignored)`, never the value that was set).
 */
export type ConfigSource =
  | 'system-property'
  | 'properties-file'
  | 'environment-variable'
  | 'default'
  | 'runtime-set'
  | 'unrecognised';

/** One resolved property from the effective configuration. */
export interface EffectiveConfigProperty {
  /** The `mockserver.*` property name. */
  name: string;
  /** The resolved value (already redacted server-side where sensitive). */
  value: string;
  /** Where the value came from. */
  source: ConfigSource | string;
  /**
   * For a property set away from its built-in default: that default, redacted
   * server-side like the value. Absent at the default and when it is unknown.
   */
  default?: string;
  /** For an `unrecognised` key: the recognised keys it was most likely meant to be. */
  suggestions?: string[];
}

/** Human-readable label + ordering weight for each known source tier. */
export const CONFIG_SOURCE_LABELS: Record<string, string> = {
  unrecognised: uiText('Unrecognised (ignored)', '无法识别（已忽略）'),
  'runtime-set': uiText('Runtime', '运行时设置'),
  'system-property': uiText('System property', '系统属性'),
  'environment-variable': uiText('Environment variable', '环境变量'),
  'properties-file': uiText('Properties file', '属性文件'),
  default: uiText('Default', '默认值'),
};

/**
 * Fetch the effective server configuration (`GET /mockserver/config`) — the
 * `--print-config` twin. Returns one entry per recognised property, each with
 * its resolved value and source tier. Values are redacted server-side.
 */
export async function getEffectiveConfiguration(
  params: ConnectionParams,
  signal?: AbortSignal,
): Promise<EffectiveConfigProperty[]> {
  const res = await fetch(`${buildBaseUrl(params)}/mockserver/config`, { signal });
  if (!res.ok) throw new Error(`Failed to load effective configuration (HTTP ${res.status} ${res.statusText})`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as EffectiveConfigProperty[]) : [];
}

// ---------------------------------------------------------------------------
// Bound ports + build info — PUT /mockserver/status
// ---------------------------------------------------------------------------

/** Server status payload (`PUT /mockserver/status`) — bound ports plus build info. */
export interface ServerStatus {
  /** The ports MockServer is currently listening on. */
  ports: number[];
  version?: string;
  artifactId?: string;
  groupId?: string;
  gitHash?: string;
}

/**
 * Fetch the running server's bound ports and build info (`PUT /mockserver/status`).
 * PUT (not GET) is the control-plane verb this endpoint uses.
 */
export async function getServerStatus(
  params: ConnectionParams,
  signal?: AbortSignal,
): Promise<ServerStatus> {
  const res = await fetch(`${buildBaseUrl(params)}/mockserver/status`, { method: 'PUT', signal });
  if (!res.ok) throw new Error(`Failed to load server status (HTTP ${res.status} ${res.statusText})`);
  const data = (await res.json()) as Partial<ServerStatus> | null;
  return {
    ports: Array.isArray(data?.ports) ? (data!.ports as number[]) : [],
    version: data?.version,
    artifactId: data?.artifactId,
    groupId: data?.groupId,
    gitHash: data?.gitHash,
  };
}

// ---------------------------------------------------------------------------
// Proxy setup — GET /mockserver/proxyConfiguration
// ---------------------------------------------------------------------------

/**
 * Proxy setup information served by `GET /mockserver/proxyConfiguration`:
 * the HTTPS proxy URL, ready-to-paste OS environment-variable blocks, and the
 * CA certificate (path + PEM) a client must trust to intercept TLS traffic.
 */
export interface ProxyConfiguration {
  /** Filesystem path (on the server) of the written CA certificate. */
  caCertificatePath: string;
  /** The CA public certificate in PEM form (private key is never exposed). */
  caCertificatePem: string;
  /** The `https_proxy` URL clients should point at (e.g. `http://host:1080`). */
  httpsProxy: string;
  /** Copy-paste environment-variable blocks for common shells. */
  environmentVariables: {
    unix: string;
    powershell: string;
  };
  /** True when the built-in default CA is in use (vs a custom-provided one). */
  usingDefaultCa: boolean;
  /** Optional server-side warning (e.g. default CA in production), else null. */
  warning: string | null;
}

/**
 * Fetch the proxy setup information (`GET /mockserver/proxyConfiguration`).
 *
 * @throws Error with the server's `{ "error": ... }` body on a non-2xx response.
 */
export async function getProxyConfiguration(
  params: ConnectionParams,
  signal?: AbortSignal,
): Promise<ProxyConfiguration> {
  const res = await fetch(`${buildBaseUrl(params)}/mockserver/proxyConfiguration`, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Failed to load proxy configuration (HTTP ${res.status} ${res.statusText})`);
  }
  const data = (await res.json()) as Partial<ProxyConfiguration> | null;
  const env = (data?.environmentVariables ?? {}) as Partial<ProxyConfiguration['environmentVariables']>;
  return {
    caCertificatePath: data?.caCertificatePath ?? '',
    caCertificatePem: data?.caCertificatePem ?? '',
    httpsProxy: data?.httpsProxy ?? '',
    environmentVariables: {
      unix: env.unix ?? '',
      powershell: env.powershell ?? '',
    },
    usingDefaultCa: data?.usingDefaultCa === true,
    warning: data?.warning ?? null,
  };
}

// ---------------------------------------------------------------------------
// Bind additional port — PUT /mockserver/bind
// ---------------------------------------------------------------------------

/**
 * Ask the server to bind an additional listening port (`PUT /mockserver/bind`).
 * The body is a `PortBinding` (`{ "ports": [<port>] }`); the response echoes the
 * full set of ports the server is now listening on.
 *
 * @returns the complete list of bound ports after the bind.
 * @throws Error with the server's message on a non-2xx response (e.g. 400 when
 *         the port is already in use).
 */
export async function bindAdditionalPort(
  params: ConnectionParams,
  port: number,
): Promise<number[]> {
  const res = await fetch(`${buildBaseUrl(params)}/mockserver/bind`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ports: [port] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Failed to bind port (HTTP ${res.status} ${res.statusText})`);
  }
  const data = (await res.json()) as Partial<{ ports: number[] }> | null;
  return Array.isArray(data?.ports) ? (data!.ports as number[]) : [];
}

// ---------------------------------------------------------------------------
// Editable property descriptors
// ---------------------------------------------------------------------------

/** The control type rendered for an editable property. */
export type EditableType = 'boolean' | 'string' | 'number';

/**
 * Descriptor for a runtime-mutable configuration property that should be
 * editable in the dashboard.  Adding an entry here is all that is needed to
 * expose a new toggle / field — ConfigurationDialog drives its controls from
 * this list.
 */
export interface EditablePropertyDescriptor {
  /** The JSON key in ConfigurationDTO. */
  key: string;
  /** Human-readable label shown next to the control. */
  label: string;
  /** Control type. */
  type: EditableType;
  /** Short tooltip / help text. */
  help: string;
  /** Logical group (controls are rendered grouped). */
  group: string;
}

/**
 * Declarative list of runtime-mutable properties beyond the original three
 * (logLevel, detailedMatchFailures, metricsEnabled — which keep their
 * bespoke controls).
 *
 * Order within each group determines render order.
 */
export const EDITABLE_PROPERTIES: readonly EditablePropertyDescriptor[] = [
  // Developer / data
  // NOTE: devMode is intentionally NOT runtime-editable — its only effect is supplying the
  // startup defaults for maxLogEntries/maxExpectations, which size the log ring buffer and
  // expectation store at construction time and are never resized at runtime. Changing it on a
  // running server would mislead (no effect), so it stays in the read-only table.
  {
    key: 'generateRealisticExampleValues',
    label: uiText('Realistic example values', '生成逼真的示例值'),
    type: 'boolean',
    help: uiText('Generate realistic (Faker-style) example values in stubs instead of fixed placeholders.', '为 Mock 响应生成逼真的示例值（类似 Faker），替代固定占位符。'),
    group: 'Developer / data',
  },
  {
    key: 'attachMismatchDiagnosticToResponse',
    label: uiText('Mismatch diagnostic in response', '在响应中附带匹配失败详情'),
    type: 'boolean',
    help: uiText('Attach detailed mismatch diagnostics to unmatched-request responses.', '在未匹配请求的响应中附上详细诊断信息。'),
    group: 'Developer / data',
  },

  // Validation proxy
  {
    key: 'validateProxyOpenAPISpec',
    label: uiText('OpenAPI spec (URL / path)', 'OpenAPI 规范（网址或路径）'),
    type: 'string',
    help: uiText('OpenAPI specification URL, file path, or inline JSON/YAML used to validate proxied traffic.', '用于校验代理流量的 OpenAPI 规范，可填写网址、文件路径或内联 JSON/YAML。'),
    group: 'Validation proxy',
  },
  {
    key: 'validateProxyEnforce',
    label: uiText('Enforce validation', '强制校验'),
    type: 'boolean',
    help: uiText('When enabled, proxied requests that violate the OpenAPI spec are rejected.', '启用后，不符合 OpenAPI 规范的代理请求会被拒绝。'),
    group: 'Validation proxy',
  },

  // Chaos auto-halt
  {
    key: 'chaosAutoHaltEnabled',
    label: uiText('Auto-halt enabled', '启用自动停止'),
    type: 'boolean',
    help: uiText('Automatically halt chaos injection when the error threshold is exceeded.', '超出错误阈值时自动停止故障注入。'),
    group: 'Chaos auto-halt',
  },
  {
    key: 'chaosAutoHaltErrorThreshold',
    label: uiText('Error threshold', '错误阈值'),
    type: 'number',
    help: uiText('Maximum number of errors within the window before chaos is halted.', '在统计窗口内允许的最大错误数。超出时停止故障注入。'),
    group: 'Chaos auto-halt',
  },
  {
    key: 'chaosAutoHaltWindowMillis',
    label: uiText('Window (ms)', '统计窗口（毫秒）'),
    type: 'number',
    help: uiText('Sliding window in milliseconds over which errors are counted for auto-halt.', '统计错误数的滑动窗口，单位为毫秒。用于判定是否自动停止故障注入。'),
    group: 'Chaos auto-halt',
  },

  // Matching & proxying — read live on every request/match, so safe to change at runtime
  {
    key: 'matchersFailFast',
    label: uiText('Matchers fail fast', '遇到首个不匹配字段即停止'),
    type: 'boolean',
    help: uiText('Stop evaluating a request matcher at the first non-matching field instead of collecting every mismatch. Read live on each match.', '遇到首个不匹配字段时停止检查，不再收集其余差异。每次匹配均使用当前设置。'),
    group: 'Matching & proxying',
  },
  {
    key: 'attemptToProxyIfNoMatchingExpectation',
    label: uiText('Proxy unmatched requests', '代理未匹配的请求'),
    type: 'boolean',
    help: uiText('When no expectation matches, forward the request to its Host instead of returning 404. Read live on each request.', '没有规则匹配时，按请求的 Host 转发，避免直接返回 404。每次请求均使用当前设置。'),
    group: 'Matching & proxying',
  },
  {
    key: 'maximumNumberOfRequestToReturnInVerificationFailure',
    label: uiText('Max requests in verification failure', '验证失败时显示的请求上限'),
    type: 'number',
    help: uiText('Cap on the number of recorded requests included in a verification failure message. Read live when a verification fails.', '限制验证失败消息中包含的请求记录数。验证失败时读取当前设置。'),
    group: 'Matching & proxying',
  },

  // Logging — read live on every log write, so safe to change at runtime
  {
    key: 'disableLogging',
    label: uiText('Disable logging', '禁用日志'),
    type: 'boolean',
    help: uiText('Suppress all MockServer log output. Read live on each log write.', '关闭 MockServer 的所有日志输出。每次写日志时读取当前设置。'),
    group: 'Logging',
  },
  {
    key: 'compactLogFormat',
    label: uiText('Compact log format', '紧凑日志格式'),
    type: 'boolean',
    help: uiText('Render log entries in a single-line compact format. Read live on each log write.', '每条日志以紧凑的单行格式输出。每次写日志时读取当前设置。'),
    group: 'Logging',
  },

  // CORS — read live when building responses / handling preflight, so safe to change at runtime
  {
    key: 'enableCORSForAPI',
    label: uiText('Answer CORS preflights on every path', '为所有路径响应 CORS 预检'),
    type: 'boolean',
    help: uiText('Answer CORS preflights that no expectation matches, for mocked paths, using corsAllowOrigin; the first preflight MockServer answers itself turns this on. MockServer\'s own API answers preflights under controlPlaneCorsAllowOrigin (set at startup) whatever this is. Read live per request.', '对模拟路径上未命中规则的 CORS 预检请求，按 corsAllowOrigin 响应。MockServer 首次自行响应预检时会开启此项。管理 API 的预检始终使用启动时设置的 controlPlaneCorsAllowOrigin。每次请求均使用当前设置。'),
    group: 'CORS',
  },
  {
    key: 'enableCORSForAllResponses',
    label: uiText('CORS for mocked responses', '为模拟响应添加 CORS 头'),
    type: 'boolean',
    help: uiText('Add CORS headers, using corsAllowOrigin, to mocked and proxied responses. Does not change which pages may use MockServer\'s own API. Read live per response.', '按 corsAllowOrigin 为模拟和代理响应添加 CORS 响应头。管理 API 的跨域权限不受此项影响。每次生成响应时读取当前设置。'),
    group: 'CORS',
  },

  // Analytics — anonymous, cookieless dashboard usage stats
  {
    key: 'dashboardAnalyticsEnabled',
    label: uiText('Dashboard usage analytics', '运行面板使用统计'),
    type: 'boolean',
    help: uiText('Send anonymous, cookieless dashboard usage stats (no request or mock data) to improve the UI.', '发送匿名的运行面板使用统计，帮助改进界面。统计无需 Cookie，也不包含请求或 Mock 数据。'),
    group: 'Analytics',
  },
  // NOTE: dashboardAnalyticsEndpoint is intentionally NOT runtime-editable — it decides where
  // every dashboard viewer's browser sends events, so the server fixes it at startup and ignores
  // a PUT of it. It stays in the read-only table.
  {
    key: 'dashboardAnalyticsKey',
    label: uiText('Analytics key', '统计密钥'),
    type: 'string',
    help: uiText('PostHog write-only project key. Blank disables analytics.', 'PostHog 项目的只写密钥。留空可禁用使用统计。'),
    group: 'Analytics',
  },

] as const;

import { uiText } from '../lib/dashboardLocale';
import { useState, useCallback, useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import { useTransientFlag } from '../hooks/useTransientFlag';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import Tooltip from '@mui/material/Tooltip';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopyOutlined';
import RefreshIcon from '@mui/icons-material/RefreshOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFileOutlined';
import { CassetteManagerBody } from './CassetteManager';
import ImportForm from './ImportForm';
import HumanErrorAlert from './HumanErrorAlert';
import { humanizeError } from '../lib/errorMessage';
import { monospaceFontFamily } from '../theme';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import {
  listWasmModules,
  uploadWasmModule,
  deleteWasmModule,
  testWasmModule,
  WasmDisabledError,
  type WasmSampleRequest,
  type WasmTestResult,
} from '../lib/wasm';
import { buildBaseUrl } from '../lib/mcpClient';
import { uploadDescriptorSet, listGrpcServices, clearGrpcDescriptors, type GrpcService } from '../lib/grpcDescriptors';
import ConfirmDialog from './ConfirmDialog';
import {
  verifyToJava,
  verifyToNode,
  verifyToPython,
  verifyToGo,
  verifyToCsharp,
  verifyToRuby,
  verifyToRust,
  type VerificationCodegenInput,
} from '../lib/verificationCodegen';
import type { VerificationTimesSpec } from '../lib/verification';

// ---------------------------------------------------------------------------
// Export sub-tab — download captured content in various formats
// ---------------------------------------------------------------------------

// Two independent axes: what to export (scope) and the file format. They are
// chosen separately — a radio for the scope, a dropdown for the format — rather
// than enumerating every scope×format pair in one long list.

type ExportScope = 'expectations' | 'recorded' | 'requests' | 'logs';
type ExportFormat =
  | 'json' | 'java' | 'javascript' | 'python' | 'go' | 'csharp' | 'ruby' | 'rust' | 'php'
  | 'har' | 'openapi' | 'postman' | 'bruno' | 'logentries' | 'curl'
  | 'verify-java' | 'verify-javascript' | 'verify-python' | 'verify-go'
  | 'verify-csharp' | 'verify-ruby' | 'verify-rust';

// A verification language whose code is generated client-side (by
// verificationCodegen.ts) from the retrieved request/response JSON, rather than
// asked of the server's retrieve endpoint.
type VerifyLang = 'java' | 'node' | 'python' | 'go' | 'csharp' | 'ruby' | 'rust';

const SCOPES: { value: ExportScope; label: string; retrieveType: string }[] = [
  { value: 'requests', label: uiText('Recorded requests', '已录制的请求'), retrieveType: 'REQUEST_RESPONSES' },
  { value: 'expectations', label: uiText('Active expectations', '生效规则'), retrieveType: 'ACTIVE_EXPECTATIONS' },
  { value: 'recorded', label: uiText('Recorded expectations', '已录制的 Mock 规则'), retrieveType: 'RECORDED_EXPECTATIONS' },
  { value: 'logs', label: uiText('Server logs', '服务端日志'), retrieveType: 'LOGS' },
];

// retrieveFormat is the server's Format enum name; scopes restricts which export
// scopes the server accepts that format for (e.g. JAVA is expectations-only,
// LOG_ENTRIES is the only format for the raw log stream — so the dropdown is filtered
// by the chosen scope).
//
// verifyLang marks a client-side-generated verification snippet: such an entry
// has no server format of its own — the dashboard retrieves the recorded
// request/response pairs as JSON and runs verificationCodegen over them, one
// verify(...) call per recorded request.
const FORMATS: { value: ExportFormat; label: string; retrieveFormat: string; scopes: ExportScope[]; verifyLang?: VerifyLang }[] = [
  { value: 'json', label: 'MockServer JSON', retrieveFormat: 'JSON', scopes: ['expectations', 'recorded', 'requests'] },
  { value: 'java', label: 'MockServer Java DSL', retrieveFormat: 'JAVA', scopes: ['expectations', 'recorded'] },
  { value: 'javascript', label: uiText('JavaScript client code', 'JavaScript 客户端代码'), retrieveFormat: 'JAVASCRIPT', scopes: ['expectations', 'recorded'] },
  { value: 'python', label: uiText('Python client code', 'Python 客户端代码'), retrieveFormat: 'PYTHON', scopes: ['expectations', 'recorded'] },
  { value: 'go', label: uiText('Go client code', 'Go 客户端代码'), retrieveFormat: 'GO', scopes: ['expectations', 'recorded'] },
  { value: 'csharp', label: uiText('C# client code', 'C# 客户端代码'), retrieveFormat: 'CSHARP', scopes: ['expectations', 'recorded'] },
  { value: 'ruby', label: uiText('Ruby client code', 'Ruby 客户端代码'), retrieveFormat: 'RUBY', scopes: ['expectations', 'recorded'] },
  { value: 'rust', label: uiText('Rust client code', 'Rust 客户端代码'), retrieveFormat: 'RUST', scopes: ['expectations', 'recorded'] },
  { value: 'php', label: uiText('PHP client code', 'PHP 客户端代码'), retrieveFormat: 'PHP', scopes: ['expectations', 'recorded'] },
  { value: 'har', label: uiText('HAR (HTTP Archive)', 'HAR（HTTP 归档）'), retrieveFormat: 'HAR', scopes: ['expectations', 'recorded', 'requests'] },
  { value: 'openapi', label: uiText('OpenAPI 3 spec', 'OpenAPI 3 规范'), retrieveFormat: 'OPENAPI', scopes: ['expectations', 'recorded', 'requests'] },
  { value: 'postman', label: uiText('Postman collection v2.1', 'Postman 集合 v2.1'), retrieveFormat: 'POSTMAN', scopes: ['expectations', 'recorded', 'requests'] },
  { value: 'bruno', label: uiText('Bruno collection (.zip)', 'Bruno 集合（.zip）'), retrieveFormat: 'BRUNO', scopes: ['expectations', 'recorded', 'requests'] },
  { value: 'logentries', label: uiText('Log entries (JSON)', '日志条目（JSON）'), retrieveFormat: 'LOG_ENTRIES', scopes: ['recorded', 'requests', 'logs'] },
  { value: 'curl', label: uiText('cURL commands', 'cURL 命令'), retrieveFormat: 'CURL', scopes: ['requests'] },
  // Verification code — generated client-side from the recorded requests.
  { value: 'verify-java', label: uiText('Verification code (Java)', '验证代码（Java）'), retrieveFormat: 'JSON', scopes: ['requests'], verifyLang: 'java' },
  { value: 'verify-javascript', label: uiText('Verification code (JavaScript)', '验证代码（JavaScript）'), retrieveFormat: 'JSON', scopes: ['requests'], verifyLang: 'node' },
  { value: 'verify-python', label: uiText('Verification code (Python)', '验证代码（Python）'), retrieveFormat: 'JSON', scopes: ['requests'], verifyLang: 'python' },
  { value: 'verify-go', label: uiText('Verification code (Go)', '验证代码（Go）'), retrieveFormat: 'JSON', scopes: ['requests'], verifyLang: 'go' },
  { value: 'verify-csharp', label: uiText('Verification code (C#)', '验证代码（C#）'), retrieveFormat: 'JSON', scopes: ['requests'], verifyLang: 'csharp' },
  { value: 'verify-ruby', label: uiText('Verification code (Ruby)', '验证代码（Ruby）'), retrieveFormat: 'JSON', scopes: ['requests'], verifyLang: 'ruby' },
  { value: 'verify-rust', label: uiText('Verification code (Rust)', '验证代码（Rust）'), retrieveFormat: 'JSON', scopes: ['requests'], verifyLang: 'rust' },
];

// One verify(...) snippet per recorded request, joined into a single document.
// Each pair from REQUEST_RESPONSES retrieval contributes its httpRequest as a
// single-mode verification asserting the request was received at least once.
const VERIFY_GENERATORS: Record<VerifyLang, (input: VerificationCodegenInput) => string> = {
  java: verifyToJava,
  node: verifyToNode,
  python: verifyToPython,
  go: verifyToGo,
  csharp: verifyToCsharp,
  ruby: verifyToRuby,
  rust: verifyToRust,
};

function generateVerificationCode(pairs: unknown, lang: VerifyLang, baseUrl: string): string {
  const generate = VERIFY_GENERATORS[lang];
  const list = Array.isArray(pairs) ? pairs : [];
  const requests: Record<string, unknown>[] = list
    .map((pair) => {
      const httpRequest = (pair as { httpRequest?: unknown })?.httpRequest;
      return httpRequest && typeof httpRequest === 'object' ? (httpRequest as Record<string, unknown>) : null;
    })
    .filter((r): r is Record<string, unknown> => r !== null);

  const atLeastOnce: VerificationTimesSpec = { mode: 'atLeast', count: 1 };
  if (requests.length === 0) {
    // Still emit a usable, copy-pasteable skeleton (empty request matcher).
    return generate({
      mode: 'single',
      httpRequest: {},
      httpResponse: {},
      times: atLeastOnce,
      httpRequests: [],
      httpResponses: [],
      baseUrl,
    });
  }
  return requests
    .map((httpRequest) =>
      generate({
        mode: 'single',
        httpRequest,
        httpResponse: {},
        times: atLeastOnce,
        httpRequests: [],
        httpResponses: [],
        baseUrl,
      }),
    )
    .join('\n\n');
}

interface ExportDetail {
  description: string;
  filename: string;
}

// Per scope×format description + download filename. Every scope supports every
// format, so the dropdown never needs to change with the selected scope.
const DETAILS: Record<ExportScope, Partial<Record<ExportFormat, ExportDetail>>> = {
  expectations: {
    json: {
      description: uiText('Round-trippable JSON of every registered expectation. Re-import via PUT /mockserver/expectation.', '将所有已注册规则导出为可重新导入的 JSON，可通过 PUT /mockserver/expectation 导入。'),
      filename: 'mockserver-expectations.json',
    },
    java: {
      description: uiText('MockServer Java DSL that recreates each expectation — paste into a JUnit test or client.', '用 MockServer Java DSL 重建每条规则，可复制到 JUnit 测试或客户端代码中。'),
      filename: 'mockserver-expectations.java',
    },
    javascript: {
      description: uiText('Node.js client code — one mockAnyResponse(...) call per expectation. Paste into a script using mockserver-client.', '每条规则对应一次 Node.js 客户端的 mockAnyResponse(...) 调用，可复制到使用 mockserver-client 的脚本。'),
      filename: 'mockserver-expectations.js',
    },
    python: {
      description: uiText('Python client code — one client.upsert(...) call per expectation. Paste into a script using the mockserver package.', '每条规则对应一次 Python 客户端的 client.upsert(...) 调用，可复制到使用 mockserver 包的脚本。'),
      filename: 'mockserver-expectations.py',
    },
    go: {
      description: uiText('Go client code — one client.Upsert(...) call per expectation. Paste into a program using the mockserver-client-go package.', '每条规则对应一次 Go 客户端的 client.Upsert(...) 调用，可复制到使用 mockserver-client-go 包的程序。'),
      filename: 'mockserver-expectations.go',
    },
    csharp: {
      description: uiText('C# client code — one client.Upsert(...) call per expectation. Paste into a project using the MockServer.Client NuGet package.', '每条规则对应一次 C# 客户端的 client.Upsert(...) 调用，可复制到使用 MockServer.Client NuGet 包的项目。'),
      filename: 'mockserver-expectations.cs',
    },
    ruby: {
      description: uiText('Ruby client code — one client.upsert(...) call per expectation. Paste into a script using the mockserver-client gem.', '每条规则对应一次 Ruby 客户端的 client.upsert(...) 调用，可复制到使用 mockserver-client gem 的脚本。'),
      filename: 'mockserver-expectations.rb',
    },
    rust: {
      description: uiText('Rust client code — one client.upsert(...) call per expectation. Paste into a program using the mockserver-client crate.', '每条规则对应一次 Rust 客户端的 client.upsert(...) 调用，可复制到使用 mockserver-client crate 的程序。'),
      filename: 'mockserver-expectations.rs',
    },
    php: {
      description: uiText('PHP client code — one $client->upsertExpectation(...) call per expectation. Paste into a script using the mock-server/mockserver-client package.', '每条规则对应一次 PHP 客户端的 $client->upsertExpectation(...) 调用，可复制到使用 mock-server/mockserver-client 包的脚本。'),
      filename: 'mockserver-expectations.php',
    },
    har: {
      description: uiText('HAR-formatted archive of each expectation as a synthetic request/response pair.', '将每条 Mock 规则转换为一组模拟请求和响应，并归档为 HAR。'),
      filename: 'mockserver-expectations.har',
    },
    openapi: {
      description: uiText('One operation per (method, path) with the registered response body as an example.', '每种 HTTP 方法与路径组合生成一个操作，并以已配置的响应体为示例。'),
      filename: 'mockserver-expectations.openapi.json',
    },
    postman: {
      description: uiText('Postman collection of every expectation as a request item with example response.', '将每条 Mock 规则导出为带响应示例的 Postman 请求。'),
      filename: 'mockserver-expectations.postman.json',
    },
    bruno: {
      description: uiText('Bruno collection — one .bru file per expectation, packaged as a zip archive.', '每条规则对应一个 .bru 文件，打包为 Bruno 集合的 ZIP 归档。'),
      filename: 'mockserver-expectations.bruno.zip',
    },
  },
  requests: {
    json: {
      description: uiText('Every request/response pair MockServer has logged, as a JSON array.', '将 MockServer 记录的所有请求和响应导出为 JSON 数组。'),
      filename: 'mockserver-traffic.json',
    },
    har: {
      description: uiText('Browser-tooling-compatible archive of every captured request/response pair.', '将捕获的所有请求和响应导出为浏览器工具可读取的归档。'),
      filename: 'mockserver-traffic.har',
    },
    openapi: {
      description: uiText('OpenAPI spec derived from observed traffic; useful for capturing a real API shape.', '从捕获的流量生成 OpenAPI 规范，方便了解真实接口结构。'),
      filename: 'mockserver-traffic.openapi.json',
    },
    postman: {
      description: uiText('Postman collection where each item is a captured request with its observed response.', '将每条捕获的请求和对应的响应导出为 Postman 集合中的一项。'),
      filename: 'mockserver-traffic.postman.json',
    },
    bruno: {
      description: uiText('Bruno collection (one .bru per captured request) packaged as a zip archive.', '将每条捕获的请求导出为 .bru 文件，再打包为 Bruno 集合的 ZIP 归档。'),
      filename: 'mockserver-traffic.bruno.zip',
    },
    logentries: {
      description: uiText('Raw MockServer log events for the captured request/response pairs (verbose JSON; mainly for debugging).', '导出与捕获的请求和响应对应的 MockServer 原始事件（详细 JSON，主要用于排查问题）。'),
      filename: 'mockserver-traffic.log-entries.json',
    },
    curl: {
      description: uiText('A cURL command per captured request — paste into a shell to replay the traffic.', '为每条捕获的请求生成一条 cURL 命令，可复制到终端回放请求。'),
      filename: 'mockserver-traffic.curl.sh',
    },
    'verify-java': {
      description: uiText('Java verify(...) call per captured request — paste into a JUnit test using the MockServer Java client.', '为每条捕获的请求生成一次 Java verify(...) 调用，可复制到使用 MockServer Java 客户端的 JUnit 测试。'),
      filename: 'mockserver-verify.java',
    },
    'verify-javascript': {
      description: uiText('JavaScript verify(...) call per captured request — paste into a script using mockserver-client.', '为每条捕获的请求生成一次 JavaScript verify(...) 调用，可复制到使用 mockserver-client 的脚本。'),
      filename: 'mockserver-verify.js',
    },
    'verify-python': {
      description: uiText('Python client.verify(...) call per captured request — paste into a script using the mockserver package.', '为每条捕获的请求生成一次 Python client.verify(...) 调用，可复制到使用 mockserver 包的脚本。'),
      filename: 'mockserver-verify.py',
    },
    'verify-go': {
      description: uiText('Go client.Verify(...) call per captured request — paste into a program using the mockserver-client-go package.', '为每条捕获的请求生成一次 Go client.Verify(...) 调用，可复制到使用 mockserver-client-go 包的程序。'),
      filename: 'mockserver-verify.go',
    },
    'verify-csharp': {
      description: uiText('C# client.Verify(...) call per captured request — paste into a project using the MockServer.Client package.', '为每条捕获的请求生成一次 C# client.Verify(...) 调用，可复制到使用 MockServer.Client 包的项目。'),
      filename: 'mockserver-verify.cs',
    },
    'verify-ruby': {
      description: uiText('Ruby client.verify(...) call per captured request — paste into a script using the mockserver-client gem.', '为每条捕获的请求生成一次 Ruby client.verify(...) 调用，可复制到使用 mockserver-client gem 的脚本。'),
      filename: 'mockserver-verify.rb',
    },
    'verify-rust': {
      description: uiText('Rust client.verify(...) call per captured request — paste into a program using the mockserver-client crate.', '为每条捕获的请求生成一次 Rust client.verify(...) 调用，可复制到使用 mockserver-client crate 的程序。'),
      filename: 'mockserver-verify.rs',
    },
  },
  recorded: {
    json: {
      description: uiText('Expectations auto-recorded while proxying in CAPTURE mode, as round-trippable JSON.', '将 CAPTURE 模式下自动录制的代理规则导出为可重新导入的 JSON。'),
      filename: 'mockserver-recorded-expectations.json',
    },
    java: {
      description: uiText('MockServer Java DSL recreating each recorded expectation.', '用 MockServer Java DSL 重建每条录制的规则。'),
      filename: 'mockserver-recorded-expectations.java',
    },
    javascript: {
      description: uiText('Node.js client code recreating each recorded expectation — one mockAnyResponse(...) call per expectation.', '用 Node.js 客户端代码重建录制的规则，每条规则调用一次 mockAnyResponse(...)。'),
      filename: 'mockserver-recorded-expectations.js',
    },
    python: {
      description: uiText('Python client code recreating each recorded expectation — one client.upsert(...) call per expectation.', '用 Python 客户端代码重建录制的规则，每条规则调用一次 client.upsert(...)。'),
      filename: 'mockserver-recorded-expectations.py',
    },
    go: {
      description: uiText('Go client code recreating each recorded expectation — one client.Upsert(...) call per expectation.', '用 Go 客户端代码重建录制的规则，每条规则调用一次 client.Upsert(...)。'),
      filename: 'mockserver-recorded-expectations.go',
    },
    csharp: {
      description: uiText('C# client code recreating each recorded expectation — one client.Upsert(...) call per expectation.', '用 C# 客户端代码重建录制的规则，每条规则调用一次 client.Upsert(...)。'),
      filename: 'mockserver-recorded-expectations.cs',
    },
    ruby: {
      description: uiText('Ruby client code recreating each recorded expectation — one client.upsert(...) call per expectation.', '用 Ruby 客户端代码重建录制的规则，每条规则调用一次 client.upsert(...)。'),
      filename: 'mockserver-recorded-expectations.rb',
    },
    rust: {
      description: uiText('Rust client code recreating each recorded expectation — one client.upsert(...) call per expectation.', '用 Rust 客户端代码重建录制的规则，每条规则调用一次 client.upsert(...)。'),
      filename: 'mockserver-recorded-expectations.rs',
    },
    php: {
      description: uiText('PHP client code recreating each recorded expectation — one $client->upsertExpectation(...) call per expectation.', '用 PHP 客户端代码重建录制的规则，每条规则调用一次 $client->upsertExpectation(...)。'),
      filename: 'mockserver-recorded-expectations.php',
    },
    har: {
      description: uiText('HAR archive of each recorded expectation as a request/response pair.', '将录制的每条规则作为一组请求和响应导出为 HAR 归档。'),
      filename: 'mockserver-recorded-expectations.har',
    },
    openapi: {
      description: uiText('OpenAPI spec derived from the recorded expectations.', '根据录制的规则生成 OpenAPI 规范。'),
      filename: 'mockserver-recorded-expectations.openapi.json',
    },
    postman: {
      description: uiText('Postman collection of the recorded expectations.', '将录制的规则导出为 Postman 集合。'),
      filename: 'mockserver-recorded-expectations.postman.json',
    },
    bruno: {
      description: uiText('Bruno collection of the recorded expectations, packaged as a zip archive.', '将录制的规则导出为 Bruno 集合并打包成 ZIP。'),
      filename: 'mockserver-recorded-expectations.bruno.zip',
    },
    logentries: {
      description: uiText('Raw log events behind the recorded expectations (verbose JSON; mainly for debugging).', '导出录制规则对应的原始日志事件（详细 JSON，主要用于排查问题）。'),
      filename: 'mockserver-recorded-expectations.log-entries.json',
    },
  },
  logs: {
    logentries: {
      description: uiText("The server's raw event log as JSON — the full request/response/expectation lifecycle, for debugging.", '将服务端的原始事件日志导出为 JSON，便于排查请求、响应和规则的完整生命周期。'),
      filename: 'mockserver-logs.json',
    },
  },
};

function ExportTab({ connectionParams }: { connectionParams: ConnectionParams }) {
  const [scope, setScope] = useState<ExportScope>('requests');
  const [format, setFormat] = useState<ExportFormat>('har');
  const [downloading, setDownloading] = useState(false);
  const [copied, flashCopied] = useTransientFlag(false);
  const [error, setError] = useState<ReturnType<typeof humanizeError> | null>(null);

  const scopeMeta = SCOPES.find((s) => s.value === scope)!;
  const availableFormats = FORMATS.filter((f) => f.scopes.includes(scope));
  const formatMeta = FORMATS.find((f) => f.value === format)!;
  const detail = useMemo(
    () => DETAILS[scope][format] ?? { description: '', filename: `mockserver-${scope}` },
    [scope, format],
  );

  // The export caveat depends on the scope: exporting the expectation graph to a
  // request-collection format is lossy (dynamic behaviour becomes placeholders),
  // whereas exporting observed traffic is just a snapshot of what was handled.
  let notice: string | null = null;
  if ((scope === 'expectations' || scope === 'recorded') && ['openapi', 'postman', 'bruno', 'har'].includes(format)) {
    notice =
      uiText('Best-effort export. Positive-string matchers round-trip cleanly, but NottableString ', '导出会尽量保留原规则。普通字符串匹配可完整导出和重新导入，但 NottableString ') +
      uiText('negation, regex bodies, and dynamic actions (forward / template / callback / error / LLM) ', '的否定条件、请求体正则和动态动作（转发、模板、回调、错误和 LLM）') +
      uiText('become placeholders — these formats describe client requests and example responses, not ', '会以占位内容导出。这些格式用于记录客户端请求和响应示例，') +
      uiText('the full MockServer expectation graph.', '无法表示 MockServer 的全部规则行为。');
  } else if (scope === 'requests' && ['openapi', 'postman', 'bruno'].includes(format)) {
    notice =
      uiText('Derived from the traffic MockServer has observed — only the requests it actually handled ', '文件由 MockServer 捕获的流量生成，仅包含') +
      uiText('are included.', '实际处理过的请求。');
  }

  const handleScopeChange = (next: ExportScope) => {
    setScope(next);
    // The chosen format may not be valid for the new scope (e.g. JAVA only applies to
    // expectations; the Server logs scope only supports LOG_ENTRIES) — fall back to the first
    // format the new scope supports.
    if (!FORMATS.some((f) => f.value === format && f.scopes.includes(next))) {
      const firstValid = FORMATS.find((f) => f.scopes.includes(next));
      if (firstValid) setFormat(firstValid.value);
    }
  };

  // Fetch the text payload for the current scope×format. For a server-rendered
  // format this is just the retrieve response body; for a client-side
  // verification language the server returns the recorded request/response JSON
  // which verificationCodegen turns into verify(...) snippets in the browser.
  const fetchText = useCallback(async (): Promise<string> => {
    const base = buildBaseUrl(connectionParams);
    const path = `/mockserver/retrieve?type=${scopeMeta.retrieveType}&format=${formatMeta.retrieveFormat}`;
    const res = await fetch(`${base}${path}`, { method: 'PUT' });
    if (!res.ok) throw new Error(`MockServer returned ${res.status}: ${res.statusText}`);
    if (formatMeta.verifyLang) {
      const pairs = await res.json();
      return generateVerificationCode(pairs, formatMeta.verifyLang, base);
    }
    return res.text();
  }, [scopeMeta, formatMeta, connectionParams]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
      const base = buildBaseUrl(connectionParams);
      let blob: Blob;
      if (formatMeta.verifyLang) {
        // client-side generated verification code
        blob = new Blob([await fetchText()], { type: 'text/plain' });
      } else {
        const path = `/mockserver/retrieve?type=${scopeMeta.retrieveType}&format=${formatMeta.retrieveFormat}`;
        const res = await fetch(`${base}${path}`, { method: 'PUT' });
        if (!res.ok) throw new Error(`MockServer returned ${res.status}: ${res.statusText}`);
        blob = await res.blob();
      }
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = detail.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setDownloading(false);
    }
  }, [scopeMeta, formatMeta, detail, connectionParams, fetchText]);

  // bruno is a binary zip; every other format is text and can be copied to the
  // clipboard. The "copy as code" affordance is most useful for the code formats
  // (java / javascript / python / go / csharp / ruby / rust / php and the
  // verification snippets) but works for any text format.
  const copyable = format !== 'bruno';

  const handleCopy = useCallback(async () => {
    setError(null);
    try {
      const text = await fetchText();
      await navigator.clipboard.writeText(text);
      flashCopied(true, false, 2000);
    } catch (e) {
      setError(humanizeError(e));
    }
  }, [fetchText, flashCopied]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 720 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText('Download captured traffic or registered expectations as a file. The file is produced by the running MockServer instance — what you see in the dashboard is what you get.', '可下载捕获的请求流量或已注册的 Mock 规则。文件由当前 MockServer 实例生成，内容与控制台中的记录一致。')}
      </Typography>
      <FormControl>
        <FormLabel sx={{ typography: 'body2' }}>{uiText('What to export', '导出内容')}</FormLabel>
        <RadioGroup
          row
          value={scope}
          onChange={(e) => handleScopeChange(e.target.value as ExportScope)}
        >
          {SCOPES.map((s) => (
            <FormControlLabel
              key={s.value}
              value={s.value}
              control={<Radio size="small" />}
              label={s.label}
            />
          ))}
        </RadioGroup>
      </FormControl>
      <TextField
        label={uiText('Format', '文件格式')}
        size="small"
        select
        value={format}
        onChange={(e) => setFormat(e.target.value as ExportFormat)}
        helperText={detail.description}
        sx={{ maxWidth: 360 }}
      >
        {availableFormats.map((f) => (
          <MenuItem key={f.value} value={f.value}>
            {f.label}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<DownloadIcon sx={{ fontSize: '0.875rem' }} />}
          onClick={() => void handleDownload()}
          disabled={downloading}
        >
          {downloading ? uiText('Downloading…', '正在下载…') : uiText(`Download ${detail.filename}`, `下载 ${detail.filename}`)}
        </Button>
        {copyable && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentCopyIcon sx={{ fontSize: '0.875rem' }} />}
            onClick={() => void handleCopy()}
          >
            {copied ? uiText('Copied!', '已复制') : uiText('Copy as code', '复制代码')}
          </Button>
        )}
      </Box>
      {error && <HumanErrorAlert error={error} variant="outlined" />}
      {notice && (
        <Alert severity="info" variant="outlined" sx={{ typography: 'body2' }}>
          {notice}
        </Alert>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// WASM Modules tab
// ---------------------------------------------------------------------------

const WASM_POLL_INTERVAL_MS = 8000;

const DEFAULT_WASM_SAMPLE_REQUEST = '{\n  "method": "GET",\n  "path": "/"\n}';

/**
 * Dialog to dry-run a loaded WASM module against a sample request via POST /mockserver/wasm/test,
 * showing the module's match decision (and any shaped response) without a live expectation.
 */
function WasmTestDialog({
  connectionParams,
  moduleName,
  onClose,
}: {
  connectionParams: ConnectionParams;
  moduleName: string | null;
  onClose: () => void;
}) {
  // Fresh editor + outcome per module: the render site remounts this via `key={moduleName}`.
  const [requestText, setRequestText] = useState(DEFAULT_WASM_SAMPLE_REQUEST);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof humanizeError> | null>(null);
  const [result, setResult] = useState<WasmTestResult | null>(null);

  const handleRun = useCallback(async () => {
    if (moduleName === null) return;
    let parsed: WasmSampleRequest;
    try {
      parsed = JSON.parse(requestText) as WasmSampleRequest;
    } catch {
      setError({ message: uiText('Sample request must be valid JSON.', '示例请求必须是有效的 JSON。') });
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await testWasmModule(connectionParams, moduleName, parsed));
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [connectionParams, moduleName, requestText]);

  return (
    <Dialog open={moduleName !== null} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="wasm-test-dialog-title">
      <DialogTitle id="wasm-test-dialog-title">{uiText('Test WASM Module “', '测试 WASM 模块「')}{moduleName}{uiText('”', '」')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {uiText('Dry-run the module against a sample request. The module\'s match decision (and any shaped response) is shown below — nothing is registered.', '用示例请求试跑模块。下方会显示是否匹配及模块生成的响应，此操作不会注册 Mock 规则。')}
        </Typography>
        <TextField
          label={uiText('Sample request (JSON)', '示例请求（JSON）')}
          multiline
          minRows={6}
          maxRows={16}
          fullWidth
          value={requestText}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setRequestText(e.target.value)}
          slotProps={{ input: { sx: { typography: 'body2', fontFamily: monospaceFontFamily } } }}
        />
        {error && <HumanErrorAlert error={error} sx={{ mt: 1 }} />}
        {result && (
          <Alert severity={result.matched ? 'success' : 'info'} sx={{ mt: 1 }}>
            {result.matched
              ? uiText('Matched — the module accepted this request.', '已匹配，模块接受了此请求。')
              : uiText('Not matched — the module rejected this request.', '未匹配，模块拒绝了此请求。')}
            {result.shaped !== undefined && result.shaped !== null && (
              <Box component="pre" sx={{ whiteSpace: 'pre-wrap', typography: 'caption', fontFamily: monospaceFontFamily, m: 0, mt: 0.5, maxHeight: 220, overflow: 'auto' }}>
                {JSON.stringify(result.shaped, null, 2)}
              </Box>
            )}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{uiText('Close', '关闭')}</Button>
        <Button variant="contained" onClick={() => void handleRun()} disabled={busy || !requestText.trim()}>
          {busy ? uiText('Testing…', '正在测试…') : uiText('Run test', '运行测试')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function WasmModulesTab({ connectionParams }: { connectionParams: ConnectionParams }) {
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof humanizeError> | null>(null);
  const [actionError, setActionError] = useState<ReturnType<typeof humanizeError> | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [testTarget, setTestTarget] = useState<string | null>(null);
  const [wasmDisabled, setWasmDisabled] = useState(false);

  // Poll modules list; a server with WASM turned off is not polled again until Refresh.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      let keepPolling = true;
      try {
        const result = await listWasmModules(connectionParams, controller.signal);
        if (cancelled) return;
        setModules(result);
        setWasmDisabled(false);
        setError(null);
        setLoading(false);
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        if (e instanceof WasmDisabledError) {
          keepPolling = false;
          setWasmDisabled(true);
          setModules([]);
          setError(null);
        } else {
          setError(humanizeError(e));
        }
        setLoading(false);
      } finally {
        if (!cancelled && keepPolling) timer = setTimeout(() => void poll(), WASM_POLL_INTERVAL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [connectionParams, refreshTick]);

  const handleUpload = useCallback(async () => {
    if (!uploadName.trim()) {
      setActionError({ message: uiText('Module name is required', '请填写模块名称') });
      return;
    }
    const input = fileInputRef.current;
    if (!input?.files?.length) {
      setActionError({ message: uiText('Select a .wasm file to upload', '请选择要上传的 .wasm 文件') });
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const file = input.files[0]!;
      const bytes = await file.arrayBuffer();
      await uploadWasmModule(connectionParams, uploadName.trim(), bytes);
      setUploadName('');
      if (input) input.value = '';
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setActionError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [connectionParams, uploadName]);

  const handleDelete = useCallback(async (name: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await deleteWasmModule(connectionParams, name);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setActionError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [connectionParams]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 720 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText('Upload and manage WASM custom rule modules. Each module can be referenced by name in expectation actions.', '上传和管理 WASM 自定义规则模块。Mock 规则的动作可以按名称引用这些模块。')}
      </Typography>

      {/* Upload form */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label={uiText('Module name', '模块名称')}
          placeholder="my-rule"
          value={uploadName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setUploadName(e.target.value)}
          sx={{ minWidth: 180 }}
        />
        <Button
          size="small"
          variant="outlined"
          component="label"
          startIcon={<UploadFileIcon sx={{ fontSize: '0.875rem' }} />}
          sx={{ height: 40 }}
        >
          {uiText('Select .wasm', '选择 .wasm 文件')}
          <input
            ref={fileInputRef}
            type="file"
            accept=".wasm"
            hidden
          />
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={busy || wasmDisabled}
          onClick={() => void handleUpload()}
          sx={{ height: 40 }}
        >
          {uiText('Upload', '上传')}
        </Button>
        <Tooltip title={uiText('Refresh module list', '刷新模块列表')}>
          <IconButton size="small" onClick={() => setRefreshTick((t) => t + 1)} aria-label={uiText('Refresh WASM modules', '刷新 WASM 模块')}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {actionError && (
        <HumanErrorAlert error={actionError} onClose={() => setActionError(null)} />
      )}

      {error && (
        <HumanErrorAlert error={error} variant="outlined" />
      )}

      {wasmDisabled && (
        <Alert severity="info">
          {uiText('WASM rules are turned off on this server. Turn them on by starting MockServer with', '此服务尚未启用 WASM 规则。启动 MockServer 时可添加 ')}{' '}
          <code>-Dmockserver.wasmEnabled=true</code>{uiText(' (or the ', '（也可设置 ')}<code>MOCKSERVER_WASM_ENABLED=true</code>{' '}
          {uiText('environment variable), or at runtime with ', '环境变量）。也可以在运行期间向 ')}<code>PUT /mockserver/configuration</code>{uiText(' and the body', '发送以下请求体')}{' '}
          <code>{'{"wasmEnabled": true}'}</code>{uiText(', then press Refresh.', '，再点击刷新。')}
        </Alert>
      )}

      {/* Modules table */}
      {wasmDisabled ? null : loading ? (
        <Typography variant="body2" color="text.secondary">{uiText('Loading…', '正在加载…')}</Typography>
      ) : modules.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{uiText('No WASM modules loaded.', '尚未加载 WASM 模块。')}</Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{uiText('Module Name', '模块名称')}</TableCell>
                <TableCell align="right">{uiText('Actions', '操作')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {modules.map((name) => (
                <TableRow key={name}>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>{name}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={uiText('Test module against a sample request', '用示例请求测试模块')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={uiText(`Test WASM module ${name}`, `测试 WASM 模块 ${name}`)}
                          disabled={busy}
                          onClick={() => setTestTarget(name)}
                        >
                          <ScienceOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={uiText('Delete module', '删除模块')}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={uiText(`Delete WASM module ${name}`, `删除 WASM 模块 ${name}`)}
                          disabled={busy}
                          onClick={() => setDeleteTarget(name)}
                        >
                          <DeleteOutlineIcon fontSize="small" />
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title={uiText(`Delete WASM module "${deleteTarget}"?`, `删除 WASM 模块「${deleteTarget}」？`)}
        message={uiText('This permanently removes the module from the server. Any expectations referencing it will fail. This cannot be undone.', '这会永久移除服务上的此模块，引用它的规则将无法运行。此操作无法撤销。')}
        confirmLabel={uiText('Delete module', '删除模块')}
        onConfirm={() => { if (deleteTarget) void handleDelete(deleteTarget); }}
        onClose={() => setDeleteTarget(null)}
      />

      <WasmTestDialog
        key={testTarget ?? 'closed'}
        connectionParams={connectionParams}
        moduleName={testTarget}
        onClose={() => setTestTarget(null)}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// gRPC descriptors sub-tab — upload a compiled FileDescriptorSet, list services
// ---------------------------------------------------------------------------

function GrpcDescriptorsTab({ connectionParams }: { connectionParams: ConnectionParams }) {
  const [services, setServices] = useState<GrpcService[]>([]);
  const [loadError, setLoadError] = useState<ReturnType<typeof humanizeError> | null>(null);
  const [actionError, setActionError] = useState<ReturnType<typeof humanizeError> | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load(): Promise<void> {
      try {
        const result = await listGrpcServices(connectionParams, controller.signal);
        if (cancelled) return;
        setServices(result);
        setLoadError(null);
      } catch (e) {
        if (cancelled || controller.signal.aborted) return;
        setLoadError(humanizeError(e));
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [connectionParams, refreshTick]);

  const handleUpload = useCallback(async () => {
    const input = fileInputRef.current;
    if (!input?.files?.length) {
      setActionError({ message: uiText('Select a compiled descriptor set (.desc / .pb / .bin) to upload', '请选择要上传的编译后描述符集合（.desc、.pb 或 .bin）') });
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const bytes = await input.files[0]!.arrayBuffer();
      await uploadDescriptorSet(connectionParams, bytes);
      if (input) input.value = '';
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setActionError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [connectionParams]);

  const handleClear = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      await clearGrpcDescriptors(connectionParams);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setActionError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [connectionParams]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 820 }}>
      <Typography variant="body2" color="text.secondary">
        {uiText('Upload a compiled protobuf ', '上传编译后的 Protobuf ')}<code>FileDescriptorSet</code>{uiText(' (e.g. ', '（例如由 ')}<code>protoc --descriptor_set_out</code>{uiText(') so MockServer can transcode and mock the declared gRPC services.', '生成的文件），以便 MockServer 对其中声明的 gRPC 服务进行转码和模拟。')}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" component="label" startIcon={<UploadFileIcon sx={{ fontSize: '0.875rem' }} />} sx={{ height: 40 }}>
          {uiText('Select descriptor set', '选择描述符集合')}
          <input ref={fileInputRef} type="file" accept=".desc,.pb,.bin,.protoset,application/octet-stream" hidden />
        </Button>
        <Button variant="contained" size="small" disabled={busy} onClick={() => void handleUpload()} sx={{ height: 40 }}>
          {uiText('Upload', '上传')}
        </Button>
        <Button size="small" color="error" disabled={busy || services.length === 0} onClick={() => setConfirmClearOpen(true)} sx={{ height: 40 }}>
          {uiText('Clear all', '全部清除')}
        </Button>
        <Tooltip title={uiText('Refresh service list', '刷新服务列表')}>
          <IconButton size="small" onClick={() => setRefreshTick((t) => t + 1)} aria-label={uiText('Refresh gRPC services', '刷新 gRPC 服务')}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {actionError && <HumanErrorAlert error={actionError} onClose={() => setActionError(null)} />}
      {loadError && <HumanErrorAlert error={loadError} variant="outlined" />}

      {services.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{uiText('No gRPC descriptors loaded.', '尚未加载 gRPC 描述符。')}</Typography>
      ) : (
        services.map((svc) => (
          <Box key={svc.name}>
            <Typography variant="subtitle2" sx={{ fontFamily: monospaceFontFamily }}>{svc.name}</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{uiText('Method', '方法')}</TableCell>
                    <TableCell>{uiText('Input → Output', '输入 → 输出')}</TableCell>
                    <TableCell>{uiText('Streaming', '流式类型')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {svc.methods.map((m) => (
                    <TableRow key={m.name}>
                      <TableCell><Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>{m.name}</Typography></TableCell>
                      <TableCell><Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>{m.inputType} → {m.outputType}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {m.clientStreaming && m.serverStreaming ? uiText('bidi', '双向流') : m.clientStreaming ? uiText('client', '客户端流') : m.serverStreaming ? uiText('server', '服务端流') : uiText('unary', '一元调用')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        ))
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title={uiText('Clear all gRPC descriptors?', '清除所有 gRPC 描述符？')}
        message={uiText(`This removes all ${services.length} loaded gRPC service descriptor${services.length === 1 ? '' : 's'}. MockServer will no longer be able to transcode or mock those services. This cannot be undone.`, `这会移除已加载的全部 ${services.length} 个 gRPC 服务描述符。此后 MockServer 无法对这些服务进行转码和模拟。此操作无法撤销。`)}
        confirmLabel={uiText('Clear descriptors', '清除描述符')}
        onConfirm={() => void handleClear()}
        onClose={() => setConfirmClearOpen(false)}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main view — tab strip across Export / Cassettes / WASM Modules / gRPC Descriptors
// ---------------------------------------------------------------------------

export interface LibraryViewProps {
  connectionParams: ConnectionParams;
}

const TABS = [
  ['Import', '导入'],
  ['Export', '导出'],
  ['Cassettes', '录制归档'],
  ['WASM Modules', 'WASM 模块'],
  ['gRPC Descriptors', 'gRPC 描述符'],
] as const;

export default function LibraryView({ connectionParams }: LibraryViewProps) {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 1 }}>
      <Paper variant="outlined" sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, v: number) => setTab(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, typography: 'body2' } }}
        >
          {TABS.map(([id, chineseLabel]) => (
            <Tab key={id} label={uiText(id, chineseLabel)} />
          ))}
        </Tabs>
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          {tab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 720 }}>
              <ImportForm connectionParams={connectionParams} />
            </Box>
          )}
          {tab === 1 && <ExportTab connectionParams={connectionParams} />}
          {tab === 2 && <CassetteManagerBody connectionParams={connectionParams} />}
          {tab === 3 && <WasmModulesTab connectionParams={connectionParams} />}
          {tab === 4 && <GrpcDescriptorsTab connectionParams={connectionParams} />}
        </Box>
      </Paper>
    </Box>
  );
}

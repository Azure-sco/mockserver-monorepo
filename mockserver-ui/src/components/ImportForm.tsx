import { uiText } from '../lib/dashboardLocale';
/**
 * ImportForm — bulk-import expectations from Expectation JSON, OpenAPI, WSDL,
 * HAR (HTTP Archive), or a Postman collection. Renders as the entire form body
 * when kind === 'import' in the Composer. Each format maps to a MockServer
 * import endpoint (HAR and Postman share PUT /mockserver/import?format=...).
 */
import { useState, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { importExpectationJson, importCollection, importRecording, type RecordingImportResult } from '../lib/importMocks';
import { importOpenApi, type OpenApiLoadProblem } from '../lib/openapiImport';
import { importWsdl } from '../lib/wsdlImport';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import { monospaceFontFamily } from '../theme';
import HumanErrorAlert from './HumanErrorAlert';
import OpenApiLoadProblemsAlert from './OpenApiLoadProblemsAlert';
import LintWarningsBadge from './LintWarningsBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportFormat = 'json' | 'openapi' | 'wsdl' | 'har' | 'postman' | 'recording';

type ImportSource = 'paste' | 'url' | 'file';

interface FormatMeta {
  value: ImportFormat;
  label: string;
  description: string;
  /** Whether the URL source is supported for this format. */
  urlSupported: boolean;
}

const FORMATS: FormatMeta[] = [
  { value: 'json', label: uiText('Expectation JSON', 'Mock 规则 JSON'), description: uiText('A single expectation object or a JSON array of expectations.', '单条 Mock 规则对象，或由多条规则组成的 JSON 数组。'), urlSupported: false },
  { value: 'openapi', label: 'OpenAPI', description: uiText('An OpenAPI v3 spec (JSON/YAML) or a URL pointing to one.', 'OpenAPI v3 规范（JSON 或 YAML），也可以提供规范的 URL。'), urlSupported: true },
  { value: 'wsdl', label: 'WSDL / SOAP', description: uiText('A WSDL 1.1 document. SOAP operations are converted to expectations.', 'WSDL 1.1 文档，其中的 SOAP 操作将转换为 Mock 规则。'), urlSupported: false },
  { value: 'har', label: uiText('HAR (HTTP Archive)', 'HAR（HTTP 归档）'), description: uiText('A HAR JSON file captured from browser DevTools or a proxy.', '浏览器开发者工具或代理捕获的 HAR JSON 文件。'), urlSupported: false },
  { value: 'postman', label: uiText('Postman collection', 'Postman 集合'), description: uiText('A Postman collection (v2.x) JSON export; requests are converted to expectations.', 'Postman 集合（v2.x）的 JSON 导出文件，其中的请求将转换为 Mock 规则。'), urlSupported: false },
  { value: 'recording', label: uiText('Recording (NDJSON)', '录制记录（NDJSON）'), description: uiText('A persisted NDJSON archive of recorded request/response traffic (disk-offload capture); reloaded into the event log. Leave blank and use "Reload From Server Disk" to read the server\'s configured archive.', '将已存盘的请求和响应归档（NDJSON）重新载入事件日志。留空并选择「从服务端磁盘重新载入」可读取服务端已配置的归档。'), urlSupported: false },
];

/** Build a user-facing message from a recording reload result. */
function recordingMessage(result: RecordingImportResult): string {
  const base =
    result.count > 0
      ? uiText(`Reloaded ${result.count} recorded request${result.count === 1 ? '' : 's'}`, `已重新载入 ${result.count} 条录制请求`)
      : uiText('No recorded requests reloaded', '未重新载入任何录制请求');
  return result.skipped > 0
    ? uiText(`${base} (${result.skipped} malformed line${result.skipped === 1 ? '' : 's'} skipped)`, `${base}（已跳过 ${result.skipped} 行格式无效的记录）`)
    : base;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ImportFormProps {
  connectionParams: ConnectionParams;
}

export default function ImportForm({ connectionParams }: ImportFormProps) {
  const [format, setFormat] = useState<ImportFormat>('json');
  const [source, setSource] = useState<ImportSource>('paste');
  const [payload, setPayload] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HumanError | null>(null);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);
  const [loadProblems, setLoadProblems] = useState<OpenApiLoadProblem[]>([]);
  // x-mockserver-lint-warnings from the last Expectation JSON import.
  const [lintWarnings, setLintWarnings] = useState(0);
  const [noExpectationsCreated, setNoExpectationsCreated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFormatMeta = FORMATS.find((f) => f.value === format)!;

  // When switching format, reset source to 'paste' if URL is not supported.
  const handleFormatChange = useCallback((newFormat: ImportFormat) => {
    setFormat(newFormat);
    setLoadProblems([]);
    setNoExpectationsCreated(false);
    const meta = FORMATS.find((f) => f.value === newFormat)!;
    if (!meta.urlSupported && source === 'url') {
      setSource('paste');
    }
    setError(null);
  }, [source]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPayload(reader.result);
      }
    };
    reader.readAsText(file);
    // Reset the input so the same file can be re-selected.
    e.target.value = '';
  }, []);

  const handleImport = useCallback(async () => {
    setBusy(true);
    setError(null);
    setLoadProblems([]);
    setLintWarnings(0);
    setNoExpectationsCreated(false);
    try {
      const input = source === 'url' ? urlValue.trim() : payload.trim();
      if (!input) {
        throw new Error(source === 'url' ? uiText('Please enter a URL.', '请输入 URL。') : uiText('Please provide content to import.', '请提供要导入的内容。'));
      }

      // Recording archives reload into the event log (not into expectations), so
      // they report a reloaded-pair count + skipped-line count rather than a
      // created-expectation list.
      if (format === 'recording') {
        const result = await importRecording(connectionParams, input, { fromDisk: false });
        setSnackMessage(recordingMessage(result));
        setPayload('');
        setUrlValue('');
        return;
      }

      let created: unknown[];
      switch (format) {
        case 'json': {
          const imported = await importExpectationJson(connectionParams, input);
          created = imported.created;
          setLintWarnings(imported.lintWarnings);
          break;
        }
        case 'openapi': {
          const result = await importOpenApi(connectionParams, input);
          created = result.expectations;
          setLoadProblems(result.loadProblems);
          if (created.length === 0 && result.loadProblems.length > 0) {
            // The load-problems alert reports this as an error; keep the spec so it can be fixed.
            setNoExpectationsCreated(true);
            return;
          }
          break;
        }
        case 'wsdl':
          created = await importWsdl(connectionParams, input);
          break;
        case 'har':
          created = await importCollection(connectionParams, input, 'har');
          break;
        case 'postman':
          created = await importCollection(connectionParams, input, 'postman');
          break;
      }
      const count = created.length;
      // The import helpers normalise an unparseable / non-array 2xx body to [],
      // so a count of 0 is ambiguous (it could be a genuinely empty result or an
      // unexpected success shape). Only report a number when we actually have
      // one; otherwise confirm success without a misleading "Imported 0".
      setSnackMessage(
        count > 0
          ? uiText(`Imported ${count} expectation${count === 1 ? '' : 's'}`, `已导入 ${count} 条 Mock 规则`)
          : uiText('Import succeeded', '导入成功'),
      );
      // Clear the payload after a successful import so the user can import more.
      setPayload('');
      setUrlValue('');
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [format, source, payload, urlValue, connectionParams]);

  // Reload the recording archive the server persisted to disk (source=disk),
  // no request body required.
  const handleReloadFromDisk = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await importRecording(connectionParams, null, { fromDisk: true });
      setSnackMessage(recordingMessage(result));
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [connectionParams]);

  return (
    <>
      {/* Format picker */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
          {uiText('Format', '格式')}
        </Typography>
        <RadioGroup
          value={format}
          onChange={(e) => handleFormatChange(e.target.value as ImportFormat)}
        >
          {FORMATS.map((f) => (
            <FormControlLabel
              key={f.value}
              value={f.value}
              // Zero vertical padding on the radio so its circle top-aligns with the title row
              // rather than centring on the whole title+description block.
              control={<Radio size="small" sx={{ py: 0 }} />}
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {f.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {f.description}
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', mb: 0.5 }}
            />
          ))}
        </RadioGroup>
      </Paper>

      {/* Source picker + content input */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
          {uiText('Source', '来源')}
        </Typography>
        <RadioGroup
          row
          value={source}
          onChange={(e) => {
            setSource(e.target.value as ImportSource);
            setError(null);
          }}
        >
          <FormControlLabel
            value="paste"
            control={<Radio size="small" />}
            label={<Typography variant="body2">{uiText('Paste', '粘贴')}</Typography>}
          />
          {currentFormatMeta.urlSupported && (
            <FormControlLabel
              value="url"
              control={<Radio size="small" />}
              label={<Typography variant="body2">{uiText('URL', 'URL')}</Typography>}
            />
          )}
          <FormControlLabel
            value="file"
            control={<Radio size="small" />}
            label={<Typography variant="body2">{uiText('File', '文件')}</Typography>}
          />
        </RadioGroup>

        <Box sx={{ mt: 1.5 }}>
          {source === 'url' && (
            <TextField
              label={uiText('Spec URL', '规范 URL')}
              size="small"
              fullWidth
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
              slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
            />
          )}
          {(source === 'paste' || source === 'file') && (
            <>
              {source === 'file' && (
                <Box sx={{ mb: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uiText('Choose file', '选择文件')}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.yaml,.yml,.xml,.wsdl,.har,.ndjson"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                    data-testid="import-file-input"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {uiText('The file contents will be loaded into the text area below.', '文件内容会载入下方的文本框。')}
                  </Typography>
                </Box>
              )}
              <TextField
                label={uiText(`${currentFormatMeta.label} content`, `${currentFormatMeta.label} 内容`)}
                multiline
                minRows={8}
                maxRows={24}
                fullWidth
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                placeholder={
                  format === 'json'
                    ? '[\n  {\n    "httpRequest": { "method": "GET", "path": "/api/test" },\n    "httpResponse": { "statusCode": 200, "body": "{}" }\n  }\n]'
                    : format === 'openapi'
                      ? '{ "openapi": "3.0.0", "info": { "title": "Petstore", "version": "1.0" }, ... }'
                      : format === 'wsdl'
                        ? '<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" ...>'
                        : format === 'postman'
                          ? '{ "info": { "name": "My API", ... }, "item": [ ... ] }'
                          : format === 'recording'
                            ? '{"httpRequest":{...},"httpResponse":{...}}\n{"httpRequest":{...},"httpResponse":{...}}'
                            : '{ "log": { "entries": [ ... ] } }'
                }
                slotProps={{ input: { sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
              />
            </>
          )}
        </Box>
      </Paper>

      {/* Import button */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="small"
            onClick={() => void handleImport()}
            disabled={busy || (source === 'url' ? !urlValue.trim() : !payload.trim())}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {busy ? uiText('Importing...', '正在导入…') : format === 'recording' ? uiText('Reload', '重新载入') : uiText('Import', '导入')}
          </Button>
          {format === 'recording' && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => void handleReloadFromDisk()}
              disabled={busy}
            >
              {uiText('Reload From Server Disk', '从服务端磁盘重新载入')}
            </Button>
          )}
          <Typography variant="caption" color="text.secondary">
            {format === 'recording'
              ? uiText('The recorded request/response traffic will be reloaded into the event log.', '已录制的请求和响应会重新载入事件日志。')
              : uiText(`${currentFormatMeta.label} will be sent to MockServer and converted to expectations.`, `${currentFormatMeta.label} 将发送给 MockServer 并转换为 Mock 规则。`)}
          </Typography>
        </Box>
      </Paper>

      {lintWarnings > 0 && (
        <Box>
          <LintWarningsBadge count={lintWarnings} connectionParams={connectionParams} />
        </Box>
      )}

      {error && (
        <HumanErrorAlert error={error} variant="outlined" />
      )}

      <OpenApiLoadProblemsAlert problems={loadProblems} noExpectationsCreated={noExpectationsCreated} />

      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}

import { uiText } from '../lib/dashboardLocale';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { useDashboardStore } from '../store';
import { useLoadFullRow, notifyFullBodyLoadFailed } from '../hooks/useLoadFullRow';
import {
  testTemplate,
  templateExcerpt,
  expandTabs,
  caretOffset,
  recordedRequestOf,
  TemplateTestRefused,
  type TemplateTestActionType,
  type TemplateTestEngine,
  type TemplateTestReport,
} from '../lib/templateTest';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import { isNonHttpRequest } from '../lib/requestKind';
import { monospaceFontFamily } from '../theme';
import HumanErrorAlert from './HumanErrorAlert';
import JsonViewer from './JsonViewer';

const DEFAULT_SAMPLE = '{\n  "method": "GET",\n  "path": "/"\n}';
const DEFAULT_KEY = '__default__';
const MAX_LISTED_REQUESTS = 50;

const ENGINE_LABELS: Record<TemplateTestEngine, string> = {
  VELOCITY: 'Velocity',
  MUSTACHE: 'Mustache',
  JAVASCRIPT: 'JavaScript',
};

function truncatedNote(truncated: boolean | undefined) {
  return truncated ? uiText(' (shortened by the server)', " （内容已被服务器截断）") : '';
}

function position(line?: number, column?: number): string | null {
  if (line === undefined) return null;
  return column !== undefined ? uiText(`line ${line}, column ${column}`, `第 ${line} 行，第 ${column} 列`) : uiText(`line ${line}`, `第 ${line} 行`);
}

function ErrorExcerpt({ template, templateType, line, column }: { template: string; templateType: TemplateTestEngine; line: number; column?: number }) {
  const lines = templateExcerpt(template, line);
  if (lines.length === 0) return null;
  const width = String(lines[lines.length - 1]?.number ?? line).length;
  return (
    <Box
      component="pre"
      data-testid="template-error-excerpt"
      sx={{ m: 0, mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, overflowX: 'auto', fontFamily: monospaceFontFamily, fontSize: '0.75rem' }}
    >
      {lines.map((l) => (
        <Box key={l.number} component="span" sx={{ display: 'block', color: l.failing ? 'error.main' : 'text.secondary', fontWeight: l.failing ? 600 : 400 }}>
          {`${l.failing ? '>' : ' '} ${String(l.number).padStart(width)} | ${expandTabs(l.text)}`}
          {l.failing && column !== undefined && column >= 1 && (
            <Box component="span" role="note" aria-label={uiText(`error at column ${column}`, `第 ${column} 列出错`)} sx={{ display: 'block' }}>
              {`  ${' '.repeat(width)} | ${' '.repeat(caretOffset(l.text, column, templateType))}^`}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}

function Result({ report, template, templateType, actionType }: { report: TemplateTestReport; template: string; templateType: TemplateTestEngine; actionType: TemplateTestActionType }) {
  const rendered = report.renderedResponse ?? report.renderedRequest;
  const error = report.error;
  const errorPosition = error ? position(error.line, error.column) : null;
  return (
    <Box data-testid="template-test-result" sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        {report.timedOut
          ? <Chip color="warning" label={uiText("Timed Out", "已超时")} />
          : report.valid
            ? <Chip color="success" label={actionType === 'FORWARD_TEMPLATE' ? uiText('Valid Request', "请求有效") : uiText('Valid Response', "响应有效")} />
            : <Chip color="error" label={uiText("Failed", "失败")} />}
        {report.durationMillis !== undefined && (
          <Typography variant="caption" color="text.secondary">{report.durationMillis}{uiText(" ms", " 毫秒")}</Typography>
        )}
      </Box>

      {error && (
        <Alert severity={report.timedOut ? 'warning' : 'error'} sx={{ mb: 1, '& .MuiAlert-message': { minWidth: 0, flex: 1 } }}>
          {errorPosition && (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{uiText("At template ", "模板位置 ")}{errorPosition}</Typography>
          )}
          {error.message && (
            <Typography variant="body2" component="div" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: monospaceFontFamily, fontSize: '0.75rem' }}>
              {error.message}{truncatedNote(error.messageTruncated)}
            </Typography>
          )}
          {error.hint && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>{uiText("Hint: ", "提示： ")}{error.hint}{truncatedNote(error.hintTruncated)}</Typography>
          )}
          {error.validationErrors && (
            <Typography variant="body2" component="div" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {uiText("Not a valid ", "无效的 ")}{actionType === 'FORWARD_TEMPLATE' ? uiText('request', "请求") : uiText('response', "响应")}: {error.validationErrors}{truncatedNote(error.validationErrorsTruncated)}
            </Typography>
          )}
          {error.line !== undefined && <ErrorExcerpt template={template} templateType={templateType} line={error.line} column={error.column} />}
        </Alert>
      )}

      {report.warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{uiText("Warnings (", "警告（")}{report.warnings.length})</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {report.warnings.map((w, i) => {
              const at = position(w.line, w.column);
              return (
                <li key={i} data-testid="template-test-warning">
                  <Typography variant="body2" component="span" sx={{ wordBreak: 'break-word' }}>
                    {at ? `${at}: ` : ''}{w.message}{truncatedNote(w.messageTruncated)}
                  </Typography>
                </li>
              );
            })}
          </Box>
        </Alert>
      )}

      {rendered && (
        <Box>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
            {report.renderedRequest ? uiText('Rendered Request', "渲染后的请求") : uiText('Rendered Response', "渲染后的响应")}
          </Typography>
          <JsonViewer data={rendered} collapsed={3} />
        </Box>
      )}
      {!rendered && report.renderedOutput !== undefined && (
        <Box>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
            {uiText("Rendered Output", "渲染结果")}{truncatedNote(report.renderedOutputTruncated)}
          </Typography>
          <Box
            component="pre"
            data-testid="template-rendered-output"
            sx={{ m: 0, p: 1, bgcolor: 'action.hover', borderRadius: 1, overflow: 'auto', maxHeight: 320, fontFamily: monospaceFontFamily, fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {report.renderedOutput}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * "Test Template": renders the editor's response or forward template against a recorded (or
 * hand-written) request with PUT /mockserver/template/test, without registering anything, and shows
 * the output, the failure position and any warnings.
 */
export default function TemplateTestDialog({
  open,
  onClose,
  connectionParams,
  templateType,
  template,
  actionType,
}: {
  open: boolean;
  onClose: () => void;
  connectionParams: ConnectionParams;
  templateType: TemplateTestEngine;
  template: string;
  actionType: TemplateTestActionType;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const recordedRequests = useDashboardStore((s) => s.recordedRequests);
  const loadFullRow = useLoadFullRow();
  const [selectedKey, setSelectedKey] = useState(DEFAULT_KEY);
  const [requestText, setRequestText] = useState(DEFAULT_SAMPLE);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loadingRow, setLoadingRow] = useState(false);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<TemplateTestReport | null>(null);
  const [failure, setFailure] = useState<{ error: HumanError; severity: 'error' | 'warning' } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);
  const close = useCallback(() => {
    cancel();
    onClose();
  }, [cancel, onClose]);

  const options = useMemo(
    () => recordedRequests
      .map((item) => ({ item, request: recordedRequestOf(item.value) }))
      .filter((o): o is { item: typeof o.item; request: Record<string, unknown> } => o.request !== undefined && !isNonHttpRequest(o.request))
      .slice(0, MAX_LISTED_REQUESTS),
    [recordedRequests],
  );

  const chooseRequest = useCallback(async (key: string) => {
    if (key === DEFAULT_KEY) {
      setSelectedKey(key);
      setRequestError(null);
      setRequestText(DEFAULT_SAMPLE);
      return;
    }
    const option = options.find((o) => o.item.key === key);
    if (!option) return;
    setLoadingRow(true);
    try {
      const whole = await loadFullRow(option.item);
      setSelectedKey(key);
      setRequestError(null);
      setRequestText(JSON.stringify(recordedRequestOf(whole.value) ?? option.request, null, 2));
    } catch (e) {
      notifyFullBodyLoadFailed(e);
    } finally {
      setLoadingRow(false);
    }
  }, [options, loadFullRow]);

  const run = useCallback(async () => {
    let request: Record<string, unknown> | undefined;
    if (requestText.trim()) {
      try {
        const parsed = JSON.parse(requestText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setRequestError(uiText('The sample request must be a JSON object', "示例请求必须为 JSON 对象"));
          return;
        }
        request = parsed as Record<string, unknown>;
      } catch (e) {
        setRequestError(e instanceof Error ? e.message : uiText('Invalid JSON', "无效的 JSON"));
        return;
      }
    }
    setRequestError(null);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setReport(null);
    setFailure(null);
    try {
      const next = await testTemplate(connectionParams, { templateType, template, actionType, request }, controller.signal);
      if (!controller.signal.aborted) setReport(next);
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e instanceof TemplateTestRefused) {
        setFailure({ error: { message: e.message }, severity: e.status === 429 ? 'warning' : 'error' });
      } else {
        setFailure({ error: humanizeError(e), severity: 'error' });
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setRunning(false);
      }
    }
  }, [requestText, connectionParams, templateType, template, actionType]);

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth fullScreen={fullScreen} aria-labelledby="template-test-dialog-title">
      <DialogTitle id="template-test-dialog-title">
        {uiText("Test Template", "测试模板")}
        <Chip size="small" variant="outlined" sx={{ ml: 1 }} label={uiText(`${ENGINE_LABELS[templateType]} ${actionType === 'FORWARD_TEMPLATE' ? uiText('forward', "转发") : uiText('response', "响应")} template`, `${ENGINE_LABELS[templateType]} ${actionType === 'FORWARD_TEMPLATE' ? uiText('forward', "转发") : uiText('response', "响应")} 模板`)} />
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {uiText("Renders the template in the editor against a sample request, with the server's template engines and limits. Nothing is registered, logged or changed: a ", "使用服务器的模板引擎和限制，根据示例请求渲染编辑器中的模板。测试不会注册规则、写入请求日志或改变状态。 ")}<code>scenario.set</code>{uiText(" call is reported, not applied.", " 调用仅展示，不会执行。")}
        </Typography>
        <TextField
          select
          size="small"
          fullWidth
          label={uiText("Sample request", "示例请求")}
          value={selectedKey}
          onChange={(e) => { void chooseRequest(e.target.value); }}
          disabled={loadingRow}
          helperText={options.length === 0 ? uiText('No recorded requests yet: send a request to MockServer to pick it here, or edit the sample below.', "暂无已记录的请求。可向 MockServer 发送请求后在这里选择，也可编辑下方的示例。") : undefined}
          sx={{ mb: 1.5 }}
        >
          <MenuItem value={DEFAULT_KEY}>{uiText("Default sample (GET /)", "默认示例（GET /）")}</MenuItem>
          {options.map(({ item, request }) => (
            <MenuItem key={item.key} value={item.key} sx={{ fontFamily: monospaceFontFamily, fontSize: '0.8rem' }}>
              {String(request['method'] ?? 'GET')} {String(request['path'] ?? '/')}
              {item.timestamp ? `  ·  ${item.timestamp}` : ''}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={uiText("Sample request (JSON)", "示例请求（JSON）")}
          multiline
          minRows={4}
          maxRows={14}
          fullWidth
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
          error={requestError !== null}
          helperText={requestError ?? uiText('The request the template sees as request. Edit it to try other values.', "模板会通过 request 读取此请求。可编辑内容来尝试不同的值。")}
          slotProps={{ htmlInput: { 'aria-label': uiText('Sample request JSON', "示例请求 JSON"), sx: { fontFamily: monospaceFontFamily, fontSize: '0.78rem' } } }}
        />

        {running && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">{uiText("Rendering the template…", "正在渲染模板…")}</Typography>
          </Box>
        )}
        {failure && <HumanErrorAlert error={failure.error} severity={failure.severity} sx={{ mt: 2 }} data-testid="template-test-failure" />}
        {report && <Result report={report} template={template} templateType={templateType} actionType={actionType} />}
      </DialogContent>
      <DialogActions>
        {running && <Button onClick={cancel}>{uiText("Cancel", "取消")}</Button>}
        <Button variant="contained" onClick={() => { void run(); }} disabled={running || loadingRow || !template.trim()}>
          {uiText("Run Test", "开始测试")}
        </Button>
        <Button onClick={close}>{uiText("Close", "关闭")}</Button>
      </DialogActions>
    </Dialog>
  );
}

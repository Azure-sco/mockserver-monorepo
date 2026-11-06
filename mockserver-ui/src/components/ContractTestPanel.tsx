import { uiText } from '../lib/dashboardLocale';
import { useCallback, useState, type ChangeEvent, type MouseEvent } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HumanErrorAlert from './HumanErrorAlert';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import {
  runContractTest,
  validateRecordedTraffic,
  type ContractTestReport,
  type ContractTestOperationResult,
  type TrafficValidationReport,
  type TrafficValidationResult,
} from '../lib/contractTest';

interface ContractTestPanelProps {
  connectionParams: ConnectionParams;
}

type Mode = 'live' | 'traffic';

/** Renders a bulleted list of validation errors, or an em dash when there are none. */
function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        —
      </Typography>
    );
  }
  return (
    <Box component="ul" sx={{ m: 0, pl: 2 }}>
      {errors.map((err, j) => (
        <Typography
          key={j}
          component="li"
          variant="caption"
          color="error"
          sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
        >
          {err}
        </Typography>
      ))}
    </Box>
  );
}

/** A PASS / FAIL chip in the shared result-table style. */
function ResultChip({ passed }: { passed: boolean }) {
  return passed ? (
    <Chip
      size="small"
      icon={<CheckCircleIcon fontSize="small" />}
      label={uiText('PASS', '通过')}
      color="success"
      variant="outlined"
      sx={{ height: 22, fontSize: '0.65rem' }}
    />
  ) : (
    <Chip
      size="small"
      icon={<CancelIcon fontSize="small" />}
      label={uiText('FAIL', '失败')}
      color="error"
      variant="outlined"
      sx={{ height: 22, fontSize: '0.65rem' }}
    />
  );
}

export default function ContractTestPanel({ connectionParams }: ContractTestPanelProps) {
  const [mode, setMode] = useState<Mode>('live');
  const [spec, setSpec] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [operationId, setOperationId] = useState('');
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ContractTestReport | null>(null);
  const [trafficReport, setTrafficReport] = useState<TrafficValidationReport | null>(null);
  const [error, setError] = useState<HumanError | null>(null);

  const canRun =
    !running &&
    spec.trim().length > 0 &&
    (mode === 'live' ? baseUrl.trim().length > 0 : true);

  const handleModeChange = useCallback((_e: MouseEvent<HTMLElement>, next: Mode | null) => {
    if (next === null) return;
    setMode(next);
    setReport(null);
    setTrafficReport(null);
    setError(null);
  }, []);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setReport(null);
    setTrafficReport(null);
    try {
      if (mode === 'live') {
        const result = await runContractTest(connectionParams, {
          spec: spec.trim(),
          baseUrl: baseUrl.trim(),
          operationId: operationId.trim() || undefined,
        });
        setReport(result);
      } else {
        const result = await validateRecordedTraffic(connectionParams, { spec: spec.trim() });
        setTrafficReport(result);
      }
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setRunning(false);
    }
  }, [connectionParams, mode, spec, baseUrl, operationId]);

  const headingChip = (() => {
    if (mode === 'live' && report) {
      return (
        <Chip
          size="small"
          label={report.allPassed ? uiText('All passed', '全部通过') : uiText(`${report.failed} failed`, `${report.failed} 项失败`)}
          color={report.allPassed ? 'success' : 'error'}
          variant="outlined"
        />
      );
    }
    if (mode === 'traffic' && trafficReport && trafficReport.totalRequests > 0) {
      return (
        <Chip
          size="small"
          label={trafficReport.allPassed ? uiText('All valid', '全部有效') : uiText(`${trafficReport.failed} invalid`, `${trafficReport.failed} 条无效`)}
          color={trafficReport.allPassed ? 'success' : 'error'}
          variant="outlined"
        />
      );
    }
    return null;
  })();

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {uiText('Contract Test', '契约测试')}
        </Typography>
        {headingChip}
      </Box>

      <ToggleButtonGroup
        value={mode}
        exclusive
        size="small"
        onChange={handleModeChange}
        aria-label={uiText('Contract mode', '契约测试模式')}
        sx={{ mb: 1.5 }}
      >
        <ToggleButton value="live">{uiText('Live Contract Test', '在线契约测试')}</ToggleButton>
        <ToggleButton value="traffic">{uiText('Validate Recorded Traffic', '校验已录制的流量')}</ToggleButton>
      </ToggleButtonGroup>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {mode === 'live'
          ? uiText("Run an OpenAPI spec's operations against a live service and validate every response against the spec. Supply the spec as a URL, file path, or inline document.", '按 OpenAPI 规范向运行中的服务发送请求，并校验每个响应。规范可通过 URL、文件路径或内联文档提供。')
          : uiText('Validate the traffic MockServer has already recorded against an OpenAPI spec — no live service is contacted. Every recorded request and response is checked against the spec. Supply the spec as a URL, file path, or inline document.', '按 OpenAPI 规范校验 MockServer 已录制的每条请求及响应，整个过程无需访问在线服务。规范可通过 URL、文件路径或内联文档提供。')}
      </Typography>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            label={uiText('OpenAPI spec (URL or inline)', 'OpenAPI 规范（URL 或内联文档）')}
            placeholder={uiText('https://example.com/openapi.json  —  or paste the spec here', 'https://example.com/openapi.json 或在此粘贴规范')}
            value={spec}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSpec(e.target.value)}
            multiline
            minRows={2}
            maxRows={10}
            fullWidth
            size="small"
          />
          {mode === 'live' && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              <TextField
                label={uiText('Target base URL', '目标服务的基础 URL')}
                placeholder="http://localhost:8080"
                value={baseUrl}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBaseUrl(e.target.value)}
                size="small"
                sx={{ flex: '1 1 280px' }}
              />
              <TextField
                label={uiText('operationId (optional)', 'operationId（选填）')}
                placeholder={uiText('all operations if blank', '留空表示全部操作')}
                value={operationId}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setOperationId(e.target.value)}
                size="small"
                sx={{ flex: '1 1 220px' }}
              />
            </Box>
          )}
          <Box>
            <Tooltip
              title={
                canRun
                  ? mode === 'live'
                    ? uiText('Run the contract test', '运行契约测试')
                    : uiText('Validate the recorded traffic', '校验已录制的流量')
                  : mode === 'live'
                    ? uiText('A spec and a target base URL are required', '请提供规范和目标服务的基础 URL')
                    : uiText('A spec is required', '请提供规范')
              }
            >
              <span>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!canRun}
                  startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon fontSize="small" />}
                  onClick={() => { void handleRun(); }}
                >
                  {mode === 'live'
                    ? (running ? uiText('Running…', '正在运行…') : uiText('Run contract test', '运行契约测试'))
                    : (running ? uiText('Validating…', '正在校验…') : uiText('Validate Traffic', '校验流量'))}
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {error !== null && <HumanErrorAlert error={error} sx={{ mb: 1.5 }} />}

      {mode === 'live' && report && (
        <Paper variant="outlined" sx={{ p: 1.25 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1.25 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {report.baseUrl}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Chip size="small" variant="outlined" label={uiText(`${report.totalOperations} operation${report.totalOperations === 1 ? '' : 's'}`, `${report.totalOperations} 个操作`)} />
            <Chip size="small" color="success" variant="outlined" label={uiText(`${report.passed} passed`, `${report.passed} 项通过`)} />
            <Chip
              size="small"
              color={report.failed > 0 ? 'error' : 'default'}
              variant="outlined"
              label={uiText(`${report.failed} failed`, `${report.failed} 项失败`)}
            />
          </Box>

          {report.results.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              {uiText('The spec produced no testable operations.', '规范中没有可测试的操作。')}
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{uiText('Result', '结果')}</TableCell>
                    <TableCell>{uiText('Operation', '操作')}</TableCell>
                    <TableCell>{uiText('Method', '方法')}</TableCell>
                    <TableCell>{uiText('Path', '路径')}</TableCell>
                    <TableCell align="right">{uiText('Status', '状态码')}</TableCell>
                    <TableCell>{uiText('Validation errors', '校验错误')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.results.map((result: ContractTestOperationResult, i: number) => (
                    <TableRow key={`${result.operationId}-${result.method}-${result.path}-${i}`}>
                      <TableCell>
                        <ResultChip passed={result.passed} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {result.operationId}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {result.method}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {result.path}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="caption">
                          {result.statusCodeReceived}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <ErrorList errors={result.validationErrors} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {mode === 'traffic' && trafficReport && (
        trafficReport.totalRequests === 0 ? (
          <Alert severity="info">
            {uiText('No recorded traffic to validate. Send some requests through MockServer (record or proxy traffic) and run again.', '没有可校验的录制流量。请通过 MockServer 录制或代理一些请求，然后重试。')}
          </Alert>
        ) : (
          <Paper variant="outlined" sx={{ p: 1.25 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1.25 }}>
              <Box sx={{ flex: 1 }} />
              <Chip size="small" variant="outlined" label={uiText(`${trafficReport.totalRequests} request${trafficReport.totalRequests === 1 ? '' : 's'}`, `${trafficReport.totalRequests} 条请求`)} />
              <Chip size="small" color="success" variant="outlined" label={uiText(`${trafficReport.passed} passed`, `${trafficReport.passed} 条通过`)} />
              <Chip
                size="small"
                color={trafficReport.failed > 0 ? 'error' : 'default'}
                variant="outlined"
                label={uiText(`${trafficReport.failed} failed`, `${trafficReport.failed} 条失败`)}
              />
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{uiText('Result', '结果')}</TableCell>
                    <TableCell>{uiText('Method', '方法')}</TableCell>
                    <TableCell>{uiText('Path', '路径')}</TableCell>
                    <TableCell>{uiText('Operation', '操作')}</TableCell>
                    <TableCell>{uiText('Request errors', '请求错误')}</TableCell>
                    <TableCell>{uiText('Response errors', '响应错误')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {trafficReport.results.map((result: TrafficValidationResult, i: number) => (
                    <TableRow key={`${result.method}-${result.path}-${i}`}>
                      <TableCell>
                        <ResultChip passed={result.passed} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {result.method}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {result.path}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {result.matchedOperation ? result.matchedOperation : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <ErrorList errors={result.requestErrors} />
                      </TableCell>
                      <TableCell>
                        <ErrorList errors={result.responseErrors} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )
      )}
    </Box>
  );
}

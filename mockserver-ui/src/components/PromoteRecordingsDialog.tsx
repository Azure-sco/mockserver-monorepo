import { uiText } from '../lib/dashboardLocale';
import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import CircularProgress from '@mui/material/CircularProgress';
import AutoAwesomeMotionIcon from '@mui/icons-material/AutoAwesomeMotion';
import { promoteRecordings, type PromoteRecordingsFilter } from '../lib/promoteRecordings';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import HumanErrorAlert from './HumanErrorAlert';
import { useDashboardStore } from '../store';
import type { ConnectionParams } from '../hooks/useConnectionParams';

interface PromoteRecordingsDialogProps {
  open: boolean;
  onClose: () => void;
  connectionParams: ConnectionParams;
  /** Number of recorded (proxied) exchanges available to promote. */
  recordedCount: number;
  /** Method / path pre-filled from the current traffic search, where sensible. */
  initialFilter?: PromoteRecordingsFilter;
}

/**
 * Dialog wrapping `PUT /mockserver/recordings/promote`. Lets the operator
 * optionally narrow the recorded traffic by method / path, explains the
 * server-side redaction, runs the promotion, and — on success — reports how many
 * expectations were created with a shortcut to the Dashboard's expectations
 * panel. Errors are surfaced via the shared HumanErrorAlert.
 */
export default function PromoteRecordingsDialog({
  open,
  onClose,
  connectionParams,
  recordedCount,
  initialFilter,
}: PromoteRecordingsDialogProps) {
  const [method, setMethod] = useState(initialFilter?.method ?? '');
  const [path, setPath] = useState(initialFilter?.path ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<HumanError | null>(null);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCreatedCount(null);
    try {
      const filter: PromoteRecordingsFilter = {};
      if (method.trim()) filter.method = method.trim();
      if (path.trim()) filter.path = path.trim();
      const result = await promoteRecordings(connectionParams, filter);
      setCreatedCount(result.count);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setLoading(false);
    }
  }, [connectionParams, method, path]);

  const handleViewExpectations = useCallback(() => {
    useDashboardStore.getState().setView('dashboard');
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '0.95rem' }}>{uiText('Promote Recordings to Mocks', '将录制流量转为 Mock 规则')}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {uiText('Turn recorded (proxied) traffic into active mock expectations. MockServer consolidates duplicate exchanges into reusable mocks, generalises volatile values, and adds them to the active expectation set — so you can record against a real service, then serve the captured responses as mocks.', '将录制的代理请求转换为生效的 Mock 规则。MockServer 会合并重复交互、泛化易变的值，并注册可复用的规则。这样就能录制真实服务的响应，并在之后将它们用作 Mock 响应。')}
        </Typography>

        {createdCount === null && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
              {uiText('Filter (Optional)', '筛选条件（选填）')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <TextField
                label={uiText('Method', '方法')}
                size="small"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder={uiText('Any', '任意')}
                disabled={loading}
                sx={{ width: 120 }}
                slotProps={{ htmlInput: { 'aria-label': uiText('Method filter', '按方法筛选') } }}
              />
              <TextField
                label={uiText('Path', '路径')}
                size="small"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={uiText('Any (e.g. /api/.*)', '任意（例如 /api/.*）')}
                disabled={loading}
                fullWidth
                slotProps={{ htmlInput: { 'aria-label': uiText('Path filter', '按路径筛选') } }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              {uiText('Leave both blank to promote all ', '方法和路径均留空可将全部 ')}{recordedCount}{uiText(' recorded request', '条录制请求转为规则')}{recordedCount === 1 ? '' : uiText('s', '')}.
            </Typography>

            <Alert severity="info" sx={{ mb: 1 }}>
              <AlertTitle sx={{ fontSize: '0.8rem', mb: 0.25 }}>{uiText('Secrets Are Redacted', '敏感信息已脱敏')}</AlertTitle>
              <Typography variant="caption">
                {uiText('Sensitive headers and values (Authorization, API keys, cookies, and similar) are redacted before promotion, so the generated mocks never carry captured credentials.', '转换前会对敏感请求头和值（如 Authorization、API 密钥和 Cookie）进行脱敏，避免生成的 Mock 规则携带录制到的凭据。')}
              </Typography>
            </Alert>
          </>
        )}

        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">{uiText('Promoting recordings…', '正在转换录制流量…')}</Typography>
          </Box>
        )}

        {error && <HumanErrorAlert error={error} sx={{ mb: 1 }} />}

        {createdCount !== null && (
          <Alert severity={createdCount > 0 ? 'success' : 'warning'} sx={{ mb: 1 }}>
            {createdCount > 0 ? (
              <>
                {uiText('Created ', '已从录制流量生成 ')}{createdCount}{uiText(' expectation', '条 Mock 规则')}{createdCount === 1 ? '' : uiText('s', '')}{uiText(' from recorded traffic. They are now active and will match new requests.', '。规则现已生效，可匹配后续请求。')}
              </>
            ) : (
              <>
                {uiText('No expectations were created — no recorded traffic matched the filter. Try widening or clearing the method / path filter.', '未生成 Mock 规则，因为没有录制流量符合筛选条件。请放宽或清除方法和路径筛选。')}
              </>
            )}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">{uiText('Close', '关闭')}</Button>
        {createdCount !== null && createdCount > 0 && (
          <Button onClick={handleViewExpectations} size="small" variant="outlined">
            {uiText('View Expectations', '查看规则')}
          </Button>
        )}
        <Button
          onClick={() => { void handleRun(); }}
          disabled={loading || recordedCount === 0}
          variant="contained"
          size="small"
          startIcon={<AutoAwesomeMotionIcon sx={{ fontSize: '0.875rem' }} />}
        >
          {createdCount !== null ? uiText('Run Again', '重新运行') : uiText('Run', '运行')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import { useState, useEffect, useCallback } from 'react';
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
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { getClock, freezeClock, advanceClock, resetClock, type ClockStatus } from '../lib/clock';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import { monospaceFontFamily } from '../theme';
import HumanErrorAlert from './HumanErrorAlert';
import { uiText } from '../lib/dashboardLocale';

const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60000, h: 3600000 };

export default function ClockDialog({
  open,
  onClose,
  connectionParams,
}: {
  open: boolean;
  onClose: () => void;
  connectionParams: ConnectionParams;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [error, setError] = useState<HumanError | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState<'ms' | 's' | 'm' | 'h'>('m');
  const [refreshTick, setRefreshTick] = useState(0);

  // Bump a tick to re-fetch (event-handler setState is fine); the effect re-runs and reloads.
  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Fetch inline with a cancelled guard, mutating state only after the await — mirrors
  // DriftPanel so the effect never triggers a synchronous setState.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const next = await getClock(connectionParams);
        if (cancelled) return;
        setStatus(next);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(humanizeError(e));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [open, connectionParams, refreshTick]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth fullScreen={fullScreen} aria-labelledby="clock-dialog-title">
      <DialogTitle id="clock-dialog-title">{uiText('Server Clock', '服务器时钟')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {uiText('Freeze or advance the server clock to drive time-to-live expiry and scenario timers deterministically. Affects the whole server.', '冻结或推进服务器时钟，以可预测的方式触发有效期到期和场景计时。此操作会影响整个服务器。')}
        </Typography>
        {error && <HumanErrorAlert error={error} sx={{ mb: 1.5 }} />}
        {status && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ fontFamily: monospaceFontFamily }}>{status.currentInstant || '—'}</Typography>
              <Chip size="small" label={status.frozen ? uiText('frozen', '已冻结') : uiText('live', '实时')} color={status.frozen ? 'warning' : 'success'} variant="outlined" />
            </Box>
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" disabled={busy} onClick={() => void run(() => freezeClock(connectionParams))}>
            {uiText('Freeze now', '立即冻结')}
          </Button>
          <Button size="small" variant="outlined" disabled={busy} onClick={() => void run(() => resetClock(connectionParams))}>
            {uiText('Reset to live', '恢复实时时钟')}
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary">{uiText('Advance by', '推进时长')}</Typography>
          <TextField size="small" type="number" value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} sx={{ width: 90 }} />
          <Select size="small" value={unit} onChange={(e) => setUnit(e.target.value as 'ms' | 's' | 'm' | 'h')} sx={{ width: 80 }}>
            <MenuItem value="ms">{uiText('ms', '毫秒')}</MenuItem>
            <MenuItem value="s">{uiText('sec', '秒')}</MenuItem>
            <MenuItem value="m">{uiText('min', '分钟')}</MenuItem>
            <MenuItem value="h">{uiText('hr', '小时')}</MenuItem>
          </Select>
          <Button size="small" variant="contained" disabled={busy}
            onClick={() => void run(() => advanceClock(connectionParams, amount * UNIT_MS[unit]!))}>
            {uiText('Advance', '推进')}
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {uiText('Advancing only takes effect while the clock is frozen — Freeze first, then Advance.', '只有在时钟冻结时才能推进时间。请先冻结，再推进。')}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{uiText('Close', '关闭')}</Button>
      </DialogActions>
    </Dialog>
  );
}

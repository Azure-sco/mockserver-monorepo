import { useCallback, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { registerExpectation } from '../lib/generateStub';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import HumanErrorAlert from './HumanErrorAlert';
import JsonViewer from './JsonViewer';
import LintWarningsBadge from './LintWarningsBadge';
import { uiText } from '../lib/dashboardLocale';

interface GenerateStubDialogProps {
  open: boolean;
  onClose: () => void;
  suggestions: Record<string, unknown>[];
  confidence: number;
  connectionParams: ConnectionParams;
}

export default function GenerateStubDialog({
  open,
  onClose,
  suggestions,
  confidence,
  connectionParams,
}: GenerateStubDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [registering, setRegistering] = useState(false);
  // Suggestion index -> the lint warning count the server reported when it was registered.
  const [registered, setRegistered] = useState<Map<number, number>>(new Map());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<HumanError | null>(null);

  const handleRegister = useCallback(async () => {
    if (suggestions.length === 0 || selectedIndex >= suggestions.length) return;
    setRegistering(true);
    setError(null);
    try {
      const lintWarnings = await registerExpectation(connectionParams, suggestions[selectedIndex]!);
      setRegistered((prev) => new Map(prev).set(selectedIndex, lintWarnings));
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setRegistering(false);
    }
  }, [connectionParams, suggestions, selectedIndex]);

  const handleClose = useCallback(() => {
    setRegistered(new Map());
    setSelectedIndex(0);
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth fullScreen={fullScreen} aria-labelledby="generate-stub-dialog-title">
      <DialogTitle id="generate-stub-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {uiText('Generated Expectation', '生成的 Mock 规则')}
        <Chip
          size="small"
          label={uiText(`${Math.round(confidence * 100)}% confidence`, `置信度 ${Math.round(confidence * 100)}%`)}
          color={confidence >= 0.8 ? 'success' : confidence >= 0.5 ? 'warning' : 'error'}
          variant="outlined"
        />
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <HumanErrorAlert error={error} sx={{ mb: 1.5 }} onClose={() => setError(null)} />
        )}
        {registered.has(selectedIndex) && (
          <Alert severity="success" sx={{ mb: 1.5 }}>
            {uiText(`Suggestion ${selectedIndex + 1} registered successfully.`, `已成功注册建议 ${selectedIndex + 1}。`)}
            {(registered.get(selectedIndex) ?? 0) > 0 && (
              <Box sx={{ mt: 1 }}>
                <LintWarningsBadge count={registered.get(selectedIndex)!} connectionParams={connectionParams} />
              </Box>
            )}
          </Alert>
        )}
        {suggestions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {uiText('No suggestions returned by the server.', '服务器未返回建议。')}
          </Typography>
        ) : (
          <Box>
            {suggestions.length > 1 && (
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
                {suggestions.map((_, i) => (
                  <Chip
                    key={i}
                    label={uiText(`Suggestion ${i + 1}`, `建议 ${i + 1}`)}
                    size="small"
                    variant={i === selectedIndex ? 'filled' : 'outlined'}
                    color={registered.has(i) ? 'success' : i === selectedIndex ? 'primary' : 'default'}
                    onClick={() => setSelectedIndex(i)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            )}
            <JsonViewer data={suggestions[selectedIndex]!} collapsed={3} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{uiText('Cancel', '取消')}</Button>
        <Button
          variant="contained"
          disabled={registering || registered.has(selectedIndex) || suggestions.length === 0}
          onClick={() => void handleRegister()}
          startIcon={registering ? <CircularProgress size={16} /> : undefined}
        >
          {registered.has(selectedIndex) ? uiText('Registered', '已注册') : uiText('Register Now', '立即注册')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

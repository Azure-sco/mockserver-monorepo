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
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { explainUnmatched, type ExplainUnmatchedResult, type ClosestExpectation, type SuggestedFix } from '../lib/explainUnmatched';
import { monospaceFontFamily } from '../theme';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import HumanErrorAlert from './HumanErrorAlert';
import ExpectationFixDialog from './ExpectationFixDialog';
import { uiText } from '../lib/dashboardLocale';

interface SelectedFix {
  expectationId: string;
  requestLabel: string;
  fix: SuggestedFix;
}

function ClosestRow({ exp, onPreviewFix }: { exp: ClosestExpectation; onPreviewFix: (fix: SuggestedFix) => void }) {
  const fix = exp.suggestedFix;
  return (
    <Box sx={{ pl: 1.5, py: 0.5, borderLeft: 2, borderColor: 'divider', mb: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
          {exp.expectationMethod} {exp.expectationPath || uiText('(any)', '（任意）')}
        </Typography>
        {exp.expectationId && <Chip size="small" variant="outlined" label={exp.expectationId.slice(0, 8)} />}
        <Chip
          size="small"
          color={exp.matches ? 'success' : exp.differingFieldCount <= 2 ? 'warning' : 'error'}
          label={exp.matches ? uiText('matches', '匹配') : uiText(`differs on ${exp.differingFieldCount} field${exp.differingFieldCount === 1 ? '' : 's'}`, `有 ${exp.differingFieldCount} 个字段不一致`)}
        />
        {fix && exp.expectationId && fix.patch.length > 0 && (
          <Button size="small" sx={{ py: 0, minHeight: 0 }} onClick={() => onPreviewFix(fix)}
            aria-label={uiText(`Preview fix for expectation ${exp.expectationId}`, `预览 Mock 规则 ${exp.expectationId} 的修复`)}>
            {uiText('Preview Fix', '预览修复')}
          </Button>
        )}
      </Box>
      {exp.differences && Object.keys(exp.differences).length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          {Object.entries(exp.differences).map(([field, diffs]) => (
            <Typography key={field} variant="caption" component="div" color="text.secondary" sx={{ fontFamily: monospaceFontFamily, fontSize: '0.7rem' }}>
              <b>{field}</b>: {diffs.join('; ')}
              {exp.remediation?.[field] && <em> — {exp.remediation[field]}</em>}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function ExplainUnmatchedDialog({
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
  const [result, setResult] = useState<ExplainUnmatchedResult | null>(null);
  const [error, setError] = useState<HumanError | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedFix, setSelectedFix] = useState<SelectedFix | null>(null);

  // Clearing result/error here (event-handler setState is fine) makes the loading spinner show
  // again; the effect re-runs and reloads.
  const refresh = useCallback(() => { setResult(null); setError(null); setRefreshTick((t) => t + 1); }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const next = await explainUnmatched(connectionParams, 10, undefined, true);
        if (cancelled) return;
        setResult(next);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(humanizeError(e));
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [open, connectionParams, refreshTick]);

  // Loading = open with neither a result nor an error yet (the effect is in flight).
  const loading = open && result === null && error === null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen} aria-labelledby="explain-unmatched-dialog-title">
      {/* The dialog is named by the title text alone, not the Refresh button beside
          it; the explicit id stops DialogTitle taking the labelledby id itself. */}
      <DialogTitle id="explain-unmatched-dialog-title-row">
        <span id="explain-unmatched-dialog-title">{uiText('Explain Unmatched Requests', '分析未匹配的请求')}</span>
        <Button size="small" sx={{ ml: 2 }} disabled={loading} onClick={refresh}>{uiText('Refresh', '刷新')}</Button>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {uiText('For each recent request that matched no expectation, the closest expectations are ranked by how few match fields they differ on, with the differences and remediation hints. Preview Fix shows the smallest change that would make an expectation match; nothing changes until you apply it.', '对近期未匹配的请求，按不一致字段数量从少到多列出最接近的规则，并显示差异和修复建议。“预览修复”会展示让规则匹配所需的最小改动，应用后才会更新规则。')}
        </Typography>
        {error && <HumanErrorAlert error={error} sx={{ mb: 1.5 }} />}
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>}
        {!loading && result && result.unmatchedRequests.length === 0 && (
          <Alert severity="success">{uiText('No unmatched requests — every recent request matched an expectation.', '近期所有请求都命中了 Mock 规则。')}</Alert>
        )}
        {!loading && result?.truncated && (
          <Alert severity="info" sx={{ mb: 1 }}>{uiText('Analysis truncated (evaluation budget reached); showing partial results.', '已达到分析上限，仅显示部分结果。')}</Alert>
        )}
        {!loading && result?.unmatchedRequests.map((req, i) => (
          <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontFamily: monospaceFontFamily }}>{req.method} {req.path}</Typography>
              {req.timestamp && <Typography variant="caption" color="text.secondary">{req.timestamp}</Typography>}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {req.totalExpectationsEvaluated === 0 ? uiText('No expectations to compare against.', '没有可供比较的 Mock 规则。') : uiText(`Closest of ${req.totalExpectationsEvaluated} expectations:`, `已比较 ${req.totalExpectationsEvaluated} 条规则，以下最接近`)}
            </Typography>
            {req.closestExpectations.slice(0, 5).map((exp, j) => (
              <ClosestRow
                key={j}
                exp={exp}
                onPreviewFix={(fix) => setSelectedFix({ expectationId: exp.expectationId ?? '', requestLabel: `${req.method} ${req.path}`, fix })}
              />
            ))}
          </Paper>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{uiText('Close', '关闭')}</Button>
      </DialogActions>
      {selectedFix && (
        <ExpectationFixDialog
          open
          onClose={() => setSelectedFix(null)}
          onApplied={refresh}
          connectionParams={connectionParams}
          expectationId={selectedFix.expectationId}
          requestLabel={selectedFix.requestLabel}
          fix={selectedFix.fix}
        />
      )}
    </Dialog>
  );
}

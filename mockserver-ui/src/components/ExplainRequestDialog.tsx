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
import {
  explainRequest,
  ExplainRequestError,
  type ArrivalOutcome,
  type ExplainedExpectation,
  type ExplainReason,
  type RequestExplanation,
} from '../lib/explainRequest';
import { monospaceFontFamily } from '../theme';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import HumanErrorAlert from './HumanErrorAlert';
import { uiText } from '../lib/dashboardLocale';

const REASON_LABELS: Record<ExplainReason, string> = {
  NAMESPACE: uiText('Other Namespace', '其他命名空间'),
  INACTIVE: uiText('Inactive', '未生效'),
  FIELDS_DIFFER: uiText('Fields Differ', '字段不一致'),
  NOT_OPERATOR: uiText('Excluded by not()', '被 not() 排除'),
  CONVERSATION: uiText('Conversation', '对话'),
  SCENARIO_STATE: uiText('Scenario State', '场景状态'),
  PERCENTAGE: uiText('Percentage', '按比例匹配'),
  LOWER_PRIORITY: uiText('Lower Priority', '优先级较低'),
};

const ARRIVAL_LABELS: Record<ArrivalOutcome, string> = {
  MATCHED: uiText('matched', '已匹配'),
  NO_MATCH: uiText('matched no expectation', '未匹配任何规则'),
  FORWARDED_WITHOUT_EXPECTATION: uiText('was forwarded without an expectation', '未匹配规则，已转发'),
  RESPONDED_WITHOUT_EXPECTATION: uiText('was answered without an expectation', '未匹配规则，已返回响应'),
  UNKNOWN: uiText('has no recorded outcome', '没有结果记录'),
};

function ExpectationRow({ exp }: { exp: ExplainedExpectation }) {
  return (
    <Box
      data-testid="explained-expectation"
      sx={{ pl: 1.5, py: 0.5, borderLeft: 2, borderColor: 'divider', mb: 0.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {exp.position !== undefined && (
          <Typography variant="caption" color="text.secondary">#{exp.position}</Typography>
        )}
        <Typography variant="caption" sx={{ fontFamily: monospaceFontFamily }}>
          {exp.expectationMethod} {exp.expectationPath || uiText('(any path)', '（任意路径）')}
        </Typography>
        {exp.expectationId && (
          <Chip size="small" variant="outlined" label={exp.expectationId} sx={{ fontFamily: monospaceFontFamily }} />
        )}
        {exp.priority !== undefined && exp.priority !== 0 && (
          <Typography variant="caption" color="text.secondary">{uiText(`priority ${exp.priority}`, `优先级 ${exp.priority}`)}</Typography>
        )}
        {exp.reason && (
          <Chip
            size="small"
            color={exp.reason === 'LOWER_PRIORITY' ? 'default' : 'warning'}
            label={REASON_LABELS[exp.reason] ?? exp.reason}
          />
        )}
      </Box>
      {exp.explanation && (
        <Typography variant="caption" component="div" color="text.secondary">
          {exp.explanation}
        </Typography>
      )}
      {exp.differences && Object.keys(exp.differences).length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          {Object.entries(exp.differences).map(([field, diffs]) => (
            <Typography
              key={field}
              variant="caption"
              component="div"
              color="text.secondary"
              sx={{ fontFamily: monospaceFontFamily, fontSize: '0.7rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              <b>{field}</b>: {diffs.join('\n')}
              {exp.remediation?.[field] && <em> — {exp.remediation[field]}</em>}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

function Section({ title, items, empty }: { title: string; items: ExplainedExpectation[]; empty: string }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="subtitle2" component="h3">{title} ({items.length})</Typography>
      {items.length === 0
        ? <Typography variant="caption" color="text.secondary">{empty}</Typography>
        : items.map((exp, i) => <ExpectationRow key={`${exp.expectationId ?? ''}-${i}`} exp={exp} />)}
    </Box>
  );
}

function Summary({ result }: { result: RequestExplanation }) {
  const arrival = result.atArrival;
  const arrivalText = arrival.outcome === 'MATCHED' && arrival.expectationId
    ? uiText(`matched expectation ${arrival.expectationId}${arrival.expectationStillStored === false ? ' (since removed)' : ''}`, `命中 Mock 规则 ${arrival.expectationId}${arrival.expectationStillStored === false ? '（此规则已删除）' : ''}`)
    : ARRIVAL_LABELS[arrival.outcome] ?? arrival.outcome;
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontFamily: monospaceFontFamily }}>
          {result.request.method} {result.request.path}
        </Typography>
        {result.request.timestamp && (
          <Typography variant="caption" color="text.secondary">{result.request.timestamp}</Typography>
        )}
      </Box>
      <Typography variant="body2">{uiText('When it arrived, the request ', '请求到达时')}{arrivalText}{arrival.forwardFailure ? uiText(', and its forward failed', '，且转发失败') : ''}{uiText('.', '。')}</Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {result.matchedExpectation
          ? <>{uiText('Now it would be served by expectation ', '按当前规则会命中 ')}<b>{result.matchedExpectation.expectationId}</b>{uiText('.', '。')}</>
          : <>{uiText('Now no expectation would serve it', '当前没有规则匹配此请求')}{result.closestExpectationId ? <>{uiText('; the closest is ', '，最接近的规则为 ')}<b>{result.closestExpectationId}</b></> : null}{uiText('.', '。')}</>}
        {result.sameOutcomeAsAtArrival === false && uiText(' That is a different outcome from when it arrived.', ' 此结果与请求到达时不同。')}
      </Typography>
      {arrival.forwardFailure && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {uiText(`MockServer answered ${arrival.forwardFailure.statusCode ?? 502} because the forward failed: `, `因转发失败，MockServer 返回 ${arrival.forwardFailure.statusCode ?? 502}。错误信息 `)}{arrival.forwardFailure.reason ?? uiText('unknown error', '未知错误')}
          {arrival.forwardFailure.causeNamed === false && (
            <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
              {uiText('MockServer could not name the cause, so this is the raw error. The log entries with this correlation ID show the request\'s whole lifecycle, including any exception logged for it.', 'MockServer 无法确定原因，因此显示原始错误。使用此关联 ID 可在日志中查看请求的完整处理过程及相关异常。')}
            </Box>
          )}
        </Alert>
      )}
      {result.expectationsChangedSince && (
        <Alert severity="info" sx={{ mb: 1 }}>
          {uiText('The expectations have changed since this request arrived, so this explanation may differ from what happened then.', '自请求到达以来，Mock 规则已发生变更，当前分析结果可能与当时不同。')}
        </Alert>
      )}
      {result.request.bodyTruncated && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {result.request.bodyTruncatedNote ?? uiText('The recorded body was truncated, so body matching used the truncated copy.', '记录中的正文已截断，正文匹配基于截断后的内容。')}
        </Alert>
      )}
      {result.truncated && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {uiText(`Only the first ${result.maxExpectationsEvaluated ?? result.evaluatedExpectations} expectations were evaluated.`, `仅评估了前 ${result.maxExpectationsEvaluated ?? result.evaluatedExpectations} 条规则。`)}
        </Alert>
      )}
    </>
  );
}

/**
 * Explains one recorded request (by correlation ID): the expectation that would serve it now, the
 * ones evaluated ahead of it that were skipped and why, and the lower-priority ones it shadows.
 */
export default function ExplainRequestDialog({
  open,
  onClose,
  correlationId,
  connectionParams,
}: {
  open: boolean;
  onClose: () => void;
  correlationId: string;
  connectionParams: ConnectionParams;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [result, setResult] = useState<RequestExplanation | null>(null);
  const [error, setError] = useState<HumanError | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => { setResult(null); setError(null); setRefreshTick((t) => t + 1); }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    explainRequest(connectionParams, correlationId, controller.signal)
      .then((next) => { setResult(next); setError(null); })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof ExplainRequestError ? { message: e.message } : humanizeError(e));
      });
    return () => controller.abort();
  }, [open, connectionParams, correlationId, refreshTick]);

  const loading = open && result === null && error === null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen} aria-labelledby="explain-request-dialog-title">
      <DialogTitle id="explain-request-dialog-title-row">
        <span id="explain-request-dialog-title">{uiText('Explain Request', '请求匹配分析')}</span>
        <Chip size="small" variant="outlined" label={correlationId} sx={{ ml: 1, fontFamily: monospaceFontFamily }} />
        <Button size="small" sx={{ ml: 2 }} disabled={loading} onClick={refresh}>{uiText('Refresh', '刷新')}</Button>
      </DialogTitle>
      <DialogContent>
        {error && <HumanErrorAlert error={error} sx={{ mb: 1.5 }} />}
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>}
        {!loading && result && (
          <>
            <Summary result={result} />
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Section
                title={uiText('Matched', '已匹配')}
                items={result.matchedExpectation ? [result.matchedExpectation] : []}
                empty={uiText('No expectation matches this request now.', '当前没有规则匹配此请求。')}
              />
              <Section
                title={uiText('Skipped', '已跳过')}
                items={result.skippedExpectations}
                empty={uiText('No expectation was evaluated ahead of the match.', '命中前没有评估其他规则。')}
              />
              <Section
                title={uiText('Shadowed', '被高优先级规则覆盖')}
                items={result.shadowedExpectations}
                empty={uiText('No lower-priority expectation also matches.', '没有优先级更低且也能匹配的规则。')}
              />
            </Paper>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
              {uiText(`Evaluated ${result.evaluatedExpectations} of ${result.totalExpectations} expectations. `, `共 ${result.totalExpectations} 条规则，已评估 ${result.evaluatedExpectations} 条。`)}{result.note}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{uiText('Close', '关闭')}</Button>
      </DialogActions>
    </Dialog>
  );
}

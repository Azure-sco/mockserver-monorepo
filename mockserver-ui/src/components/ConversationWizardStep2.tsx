import { uiText } from '../lib/dashboardLocale';
import { useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PredicatePills from './PredicatePills';
import type { TurnDraft, TurnMatchPredicates, TurnResponse, NormalizationDraft, ChaosDraft, StreamingPhysicsDraft } from '../lib/conversationCodegen';
import type { ToolCallDraft } from '../lib/expectationFromCapture';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Step2Props {
  turns: TurnDraft[];
  onTurnsChange: (turns: TurnDraft[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLES = ['USER', 'ASSISTANT', 'TOOL', 'SYSTEM'] as const;

function emptyTurn(): TurnDraft {
  return {
    predicates: {},
    response: { text: '', toolCalls: [], stopReason: '', streaming: false },
  };
}

// ---------------------------------------------------------------------------
// Range validation — bounds verified against server source:
//   StreamingPhysics.java: tokensPerSecond 1–10000, jitter 0.0–1.0
//   LlmChaosProfile.java: errorStatus 100–599, errorProbability 0.0–1.0,
//                          truncateAtFraction 0.0–1.0
// ---------------------------------------------------------------------------

function tokensPerSecondError(v: number | undefined): string | undefined {
  if (v == null) return undefined;
  if (v < 1 || v > 10000) return '1–10000';
  return undefined;
}

function jitterError(v: number | undefined): string | undefined {
  if (v == null) return undefined;
  if (v < 0 || v > 1) return '0.0–1.0';
  return undefined;
}

function chaosErrorStatusError(v: number | undefined): string | undefined {
  if (v == null) return undefined;
  if (!Number.isInteger(v) || v < 100 || v > 599) return '100–599';
  return undefined;
}

function errorProbabilityError(v: number | undefined): string | undefined {
  if (v == null) return undefined;
  if (v < 0 || v > 1) return '0.0–1.0';
  return undefined;
}

function truncateAtFractionError(v: number | undefined): string | undefined {
  if (v == null) return undefined;
  if (v < 0 || v > 1) return '0.0–1.0';
  return undefined;
}

function outputSchemaWarning(v: string | undefined): string | undefined {
  if (!v) return undefined;
  try {
    JSON.parse(v);
    return undefined;
  } catch {
    return uiText('Invalid JSON', "无效的 JSON");
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConversationWizardStep2({ turns, onTurnsChange }: Step2Props) {
  const updateTurn = useCallback(
    (index: number, partial: Partial<TurnDraft>) => {
      onTurnsChange(turns.map((t, i) => (i === index ? { ...t, ...partial } : t)));
    },
    [turns, onTurnsChange],
  );

  const updatePredicates = useCallback(
    (index: number, partial: Partial<TurnMatchPredicates>) => {
      const turn = turns[index]!;
      updateTurn(index, { predicates: { ...turn.predicates, ...partial } });
    },
    [turns, updateTurn],
  );

  const updateResponse = useCallback(
    (index: number, partial: Partial<TurnResponse>) => {
      const turn = turns[index]!;
      updateTurn(index, { response: { ...turn.response, ...partial } });
    },
    [turns, updateTurn],
  );

  const toggleNormalization = useCallback(
    (index: number, enabled: boolean) => {
      // Enabling seeds the backend's defaults (collapse whitespace + sort JSON
      // keys on); disabling clears the modifier so matching stays exact.
      updatePredicates(index, {
        normalization: enabled ? { collapseWhitespace: true, sortJsonKeys: true } : undefined,
      });
    },
    [updatePredicates],
  );

  const updateNormalization = useCallback(
    (index: number, partial: Partial<NormalizationDraft>) => {
      const turn = turns[index]!;
      updatePredicates(index, {
        normalization: { ...(turn.predicates.normalization ?? {}), ...partial },
      });
    },
    [turns, updatePredicates],
  );

  const toggleChaos = useCallback(
    (index: number, enabled: boolean) => {
      updateTurn(index, { chaos: enabled ? {} : undefined });
    },
    [updateTurn],
  );

  const updateChaos = useCallback(
    (index: number, partial: Partial<ChaosDraft>) => {
      const turn = turns[index]!;
      updateTurn(index, { chaos: { ...(turn.chaos ?? {}), ...partial } });
    },
    [turns, updateTurn],
  );

  const updateToolCall = useCallback(
    (turnIndex: number, tcIndex: number, partial: Partial<ToolCallDraft>) => {
      const turn = turns[turnIndex]!;
      const newToolCalls = turn.response.toolCalls.map((tc, i) =>
        i === tcIndex ? { ...tc, ...partial } : tc,
      );
      updateResponse(turnIndex, { toolCalls: newToolCalls });
    },
    [turns, updateResponse],
  );

  const addToolCall = useCallback(
    (turnIndex: number) => {
      const turn = turns[turnIndex]!;
      updateResponse(turnIndex, {
        toolCalls: [...turn.response.toolCalls, { name: '', arguments: '' }],
      });
    },
    [turns, updateResponse],
  );

  const removeToolCall = useCallback(
    (turnIndex: number, tcIndex: number) => {
      const turn = turns[turnIndex]!;
      updateResponse(turnIndex, {
        toolCalls: turn.response.toolCalls.filter((_, i) => i !== tcIndex),
      });
    },
    [turns, updateResponse],
  );

  const addTurn = useCallback(() => {
    onTurnsChange([...turns, emptyTurn()]);
  }, [turns, onTurnsChange]);

  const removeTurn = useCallback(
    (index: number) => {
      if (turns.length <= 1) return; // Keep at least one
      onTurnsChange(turns.filter((_, i) => i !== index));
    },
    [turns, onTurnsChange],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
      {turns.map((turn, i) => (
        <Card key={i} variant="outlined">
          <CardContent sx={{ pb: '12px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2">{uiText("Turn ", "对话轮次 ")}{i}</Typography>
              <IconButton
                size="small"
                onClick={() => removeTurn(i)}
                disabled={turns.length <= 1}
                aria-label={uiText(`Remove turn ${i}`, `移除第 ${i} 轮`)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>

            {/* Predicates */}
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
              {uiText("Match predicates", "匹配条件")}
            </Typography>

            {/* Preview pills */}
            <PredicatePills predicates={turn.predicates} />

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1, mb: 1.5 }}>
              <TextField
                label={uiText("Turn index", "轮次索引")}
                size="small"
                type="number"
                value={turn.predicates.turnIndex ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const n = parseInt(v, 10);
                  updatePredicates(i, {
                    turnIndex: v === '' || Number.isNaN(n) ? undefined : n,
                  });
                }}
                sx={{ width: { xs: '100%', sm: 110 } }}
              />
              <TextField
                label={uiText("Latest msg contains", "最新消息包含")}
                size="small"
                value={turn.predicates.latestMessageContains ?? ''}
                onChange={(e) =>
                  updatePredicates(i, {
                    latestMessageContains: e.target.value || undefined,
                  })
                }
                sx={{ flex: 1, minWidth: 160 }}
              />
              <TextField
                label={uiText("Latest msg regex", "最新消息正则表达式")}
                size="small"
                value={turn.predicates.latestMessageMatches ?? ''}
                onChange={(e) =>
                  updatePredicates(i, {
                    latestMessageMatches: e.target.value || undefined,
                  })
                }
                sx={{ flex: 1, minWidth: 160 }}
              />
              <TextField
                label={uiText("Latest msg role", "最新消息角色")}
                size="small"
                select
                value={turn.predicates.latestMessageRole ?? ''}
                onChange={(e) =>
                  updatePredicates(i, {
                    latestMessageRole:
                      (e.target.value as TurnMatchPredicates['latestMessageRole']) || undefined,
                  })
                }
                sx={{ width: { xs: '100%', sm: 130 } }}
              >
                <MenuItem value="">{uiText("None", "无")}</MenuItem>
                {ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={uiText("Contains tool result for", "包含此工具的执行结果")}
                size="small"
                value={turn.predicates.containsToolResultFor ?? ''}
                onChange={(e) =>
                  updatePredicates(i, {
                    containsToolResultFor: e.target.value || undefined,
                  })
                }
                sx={{ flex: 1, minWidth: 160 }}
              />
              <TextField
                label={uiText("Semantic match (exploratory)", "语义匹配（实验性）")}
                size="small"
                value={turn.predicates.semanticMatchAgainst ?? ''}
                onChange={(e) =>
                  updatePredicates(i, {
                    semanticMatchAgainst: e.target.value || undefined,
                  })
                }
                helperText={uiText("LLM-judged; off unless enabled server-side", "由 LLM 判定。需要在服务器端启用。")}
                sx={{ flex: 1, minWidth: 200 }}
              />
            </Box>

            {/* Prompt normalisation (opt-in, deterministic) */}
            <FormControlLabel
              control={
                <Switch
                  checked={turn.predicates.normalization != null}
                  onChange={(e) => toggleNormalization(i, e.target.checked)}
                  size="small"
                />
              }
              label={uiText("Normalise prompt matching", "匹配前规范化提示词")}
              sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.75rem' }, mb: 0.5 }}
            />
            <Collapse in={turn.predicates.normalization != null} unmountOnExit>
              <Box sx={{ pl: 1.5, mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {uiText("Applied to the latest message before the contains / regex predicates match — deterministic, so it never makes a test flaky.", "在检查最新消息是否满足包含或正则条件之前进行处理。规则固定，不会引入随机性。")}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                  {([
                    ['collapseWhitespace', uiText('Collapse whitespace', "合并连续空白")],
                    ['lowercase', uiText('Lowercase', "转为小写")],
                    ['sortJsonKeys', uiText('Sort JSON keys', "对 JSON 键排序")],
                    ['dropBuiltInVolatileFields', uiText('Drop timestamps / UUIDs / ids', "移除时间戳、UUID 和 ID")],
                  ] as [keyof NormalizationDraft, string][]).map(([key, label]) => (
                    <FormControlLabel
                      key={key}
                      control={
                        <Checkbox
                          size="small"
                          checked={turn.predicates.normalization?.[key] === true}
                          onChange={(e) => updateNormalization(i, { [key]: e.target.checked })}
                        />
                      }
                      label={label}
                      sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
                    />
                  ))}
                </Box>
                <TextField
                  label={uiText("Drop JSON fields (comma-separated)", "删除指定 JSON 字段（用逗号分隔）")}
                  size="small"
                  fullWidth
                  value={(turn.predicates.normalization?.dropVolatileFields ?? []).join(', ')}
                  onChange={(e) => {
                    const fields = e.target.value
                      .split(',')
                      .map((f) => f.trim())
                      .filter((f) => f.length > 0);
                    updateNormalization(i, { dropVolatileFields: fields.length > 0 ? fields : undefined });
                  }}
                  sx={{ mt: 0.5 }}
                />
              </Box>
            </Collapse>

            {/* Response */}
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
              {uiText("Response", "响应")}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField
                label={uiText("Text", "文本")}
                size="small"
                fullWidth
                multiline
                minRows={2}
                maxRows={6}
                value={turn.response.text}
                onChange={(e) => updateResponse(i, { text: e.target.value })}
              />

              {/* Tool calls */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {uiText("Tool Calls", "工具调用")}
                  </Typography>
                  <IconButton size="small" onClick={() => addToolCall(i)} aria-label={uiText("Add tool call", "添加工具调用")}>
                    <AddIcon sx={{ fontSize: '0.875rem' }} />
                  </IconButton>
                </Box>
                {turn.response.toolCalls.map((tc, j) => (
                  <Box key={j} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'flex-start' }}>
                    <TextField
                      label={uiText("Name", "名称")}
                      size="small"
                      value={tc.name}
                      onChange={(e) => updateToolCall(i, j, { name: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label={uiText("Arguments", "参数")}
                      size="small"
                      value={tc.arguments ?? ''}
                      onChange={(e) => updateToolCall(i, j, { arguments: e.target.value })}
                      sx={{ flex: 2 }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => removeToolCall(i, j)}
                      aria-label={uiText("Remove tool call", "移除工具调用")}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  label={uiText("Stop reason", "停止原因")}
                  size="small"
                  value={turn.response.stopReason}
                  onChange={(e) => updateResponse(i, { stopReason: e.target.value })}
                  sx={{ flex: 1 }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={turn.response.streaming}
                      onChange={(e) => updateResponse(i, { streaming: e.target.checked })}
                      size="small"
                    />
                  }
                  label={uiText("Streaming", "流式传输")}
                  sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
                />
              </Box>
              <Collapse in={turn.response.streaming} unmountOnExit>
                <Box sx={{ pl: 1.5, mb: 1, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mb: 0.5 }}>
                    {uiText("Streaming physics — controls the timing of SSE token delivery.", "设置 SSE 传输令牌的时序。")}
                  </Typography>
                  <TextField
                    label={uiText("Time to first token (ms)", "首个令牌等待时间（毫秒）")}
                    size="small"
                    type="number"
                    value={turn.response.streamingPhysics?.timeToFirstToken ?? ''}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      const val = e.target.value === '' || Number.isNaN(n) ? undefined : n;
                      const sp: StreamingPhysicsDraft = { ...(turn.response.streamingPhysics ?? {}), timeToFirstToken: val };
                      const hasValues = sp.timeToFirstToken != null || sp.tokensPerSecond != null || sp.jitter != null;
                      updateResponse(i, { streamingPhysics: hasValues ? sp : undefined });
                    }}
                    sx={{ width: { xs: '100%', sm: 180 } }}
                  />
                  <TextField
                    label={uiText("Tokens/sec", "令牌数/秒")}
                    size="small"
                    type="number"
                    value={turn.response.streamingPhysics?.tokensPerSecond ?? ''}
                    error={!!tokensPerSecondError(turn.response.streamingPhysics?.tokensPerSecond)}
                    helperText={tokensPerSecondError(turn.response.streamingPhysics?.tokensPerSecond)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      const val = e.target.value === '' || Number.isNaN(n) ? undefined : n;
                      const sp: StreamingPhysicsDraft = { ...(turn.response.streamingPhysics ?? {}), tokensPerSecond: val };
                      const hasValues = sp.timeToFirstToken != null || sp.tokensPerSecond != null || sp.jitter != null;
                      updateResponse(i, { streamingPhysics: hasValues ? sp : undefined });
                    }}
                    sx={{ width: { xs: '100%', sm: 120 } }}
                  />
                  <TextField
                    label={uiText("Jitter (0-1)", "抖动（0–1）")}
                    size="small"
                    type="number"
                    value={turn.response.streamingPhysics?.jitter ?? ''}
                    error={!!jitterError(turn.response.streamingPhysics?.jitter)}
                    helperText={jitterError(turn.response.streamingPhysics?.jitter)}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      const val = e.target.value === '' || Number.isNaN(n) ? undefined : n;
                      const sp: StreamingPhysicsDraft = { ...(turn.response.streamingPhysics ?? {}), jitter: val };
                      const hasValues = sp.timeToFirstToken != null || sp.tokensPerSecond != null || sp.jitter != null;
                      updateResponse(i, { streamingPhysics: hasValues ? sp : undefined });
                    }}
                    sx={{ width: { xs: '100%', sm: 120 } }}
                  />
                </Box>
              </Collapse>
            </Box>

            {/* Structured output schema */}
            <TextField
              label={uiText("Output schema (JSON Schema for structured output)", "输出结构（用于结构化输出的 JSON Schema）")}
              size="small"
              fullWidth
              multiline
              minRows={1}
              maxRows={4}
              value={turn.response.outputSchema ?? ''}
              onChange={(e) => updateResponse(i, { outputSchema: e.target.value || undefined })}
              placeholder='{"type":"object","properties":{"answer":{"type":"string"}}}'
              error={!!outputSchemaWarning(turn.response.outputSchema)}
              helperText={outputSchemaWarning(turn.response.outputSchema) ?? uiText('Optional JSON Schema to validate the response text against', "可选。使用 JSON Schema 验证响应文本。")}
              sx={{ mt: 0.5 }}
            />

            {/* Fault / chaos injection (resilience testing) */}
            <FormControlLabel
              control={
                <Switch
                  checked={turn.chaos != null}
                  onChange={(e) => toggleChaos(i, e.target.checked)}
                  size="small"
                />
              }
              label={uiText("Inject fault / chaos", "故障注入")}
              sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.75rem' }, mt: 0.5 }}
            />
            <Collapse in={turn.chaos != null} unmountOnExit>
              <Box sx={{ pl: 1.5, mb: 1, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                <TextField
                  label={uiText("Error status", "错误状态码")}
                  size="small"
                  type="number"
                  value={turn.chaos?.errorStatus ?? ''}
                  error={!!chaosErrorStatusError(turn.chaos?.errorStatus)}
                  helperText={chaosErrorStatusError(turn.chaos?.errorStatus)}
                  onChange={(e) => { const n = parseInt(e.target.value, 10); updateChaos(i, { errorStatus: e.target.value === '' || Number.isNaN(n) ? undefined : n }); }}
                  sx={{ width: { xs: '100%', sm: 110 } }}
                />
                <TextField
                  label="Retry-After"
                  size="small"
                  value={turn.chaos?.retryAfter ?? ''}
                  onChange={(e) => updateChaos(i, { retryAfter: e.target.value || undefined })}
                  sx={{ width: { xs: '100%', sm: 110 } }}
                />
                <TextField
                  label={uiText("Error prob (0-1)", "错误概率（0–1）")}
                  size="small"
                  type="number"
                  value={turn.chaos?.errorProbability ?? ''}
                  error={!!errorProbabilityError(turn.chaos?.errorProbability)}
                  helperText={errorProbabilityError(turn.chaos?.errorProbability)}
                  onChange={(e) => { const n = parseFloat(e.target.value); updateChaos(i, { errorProbability: e.target.value === '' || Number.isNaN(n) ? undefined : n }); }}
                  sx={{ width: { xs: '100%', sm: 130 } }}
                />
                <TextField
                  label={uiText("Truncate", "截断")}
                  size="small"
                  select
                  value={turn.chaos?.truncateMode ?? 'NONE'}
                  onChange={(e) => updateChaos(i, { truncateMode: e.target.value as ChaosDraft['truncateMode'] })}
                  sx={{ width: { xs: '100%', sm: 130 } }}
                >
                  <MenuItem value="NONE">{uiText("None", "无")}</MenuItem>
                  <MenuItem value="MID_STREAM">{uiText("Mid-stream", "流式传输中途")}</MenuItem>
                </TextField>
                <TextField
                  label={uiText("Truncate frac", "截断比例")}
                  size="small"
                  type="number"
                  value={turn.chaos?.truncateAtFraction ?? ''}
                  error={!!truncateAtFractionError(turn.chaos?.truncateAtFraction)}
                  helperText={truncateAtFractionError(turn.chaos?.truncateAtFraction)}
                  onChange={(e) => { const n = parseFloat(e.target.value); updateChaos(i, { truncateAtFraction: e.target.value === '' || Number.isNaN(n) ? undefined : n }); }}
                  sx={{ width: { xs: '100%', sm: 120 } }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={turn.chaos?.malformedSse === true}
                      onChange={(e) => updateChaos(i, { malformedSse: e.target.checked })}
                    />
                  }
                  label={uiText("Malformed SSE", "生成格式错误的 SSE")}
                  sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
                />
                <TextField
                  label={uiText("Seed", "随机种子")}
                  size="small"
                  type="number"
                  value={turn.chaos?.seed ?? ''}
                  onChange={(e) => { const n = parseInt(e.target.value, 10); updateChaos(i, { seed: e.target.value === '' || Number.isNaN(n) ? undefined : n }); }}
                  sx={{ width: { xs: '100%', sm: 100 } }}
                  helperText={uiText("reproducible prob", "用于复现随机故障")}
                />
              </Box>
            </Collapse>
          </CardContent>
        </Card>
      ))}

      <Button
        variant="outlined"
        size="small"
        startIcon={<AddIcon />}
        onClick={addTurn}
        sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
      >
        {uiText("Add turn", "添加一轮")}
      </Button>
    </Box>
  );
}

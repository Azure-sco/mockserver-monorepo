import { uiText } from '../lib/dashboardLocale';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Link from '@mui/material/Link';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { getConfiguration } from '../lib/configuration';
import ConfirmDialog from './ConfirmDialog';
import {
  registerLoadScenario,
  startScenariosByName,
  stopScenariosByName,
  listLoadScenarios,
  deleteLoadScenario,
  clearLoadScenarios,
  latestFinishedScenario,
  loadScenarioReportUrl,
  generateFromOpenAPI,
  generateFromRecording,
  errorRate,
  formatElapsed,
  LoadScenarioError,
  type LoadScenarioDTO,
  type LoadScenarioStatus,
  type LoadScenarioState,
  type RegisteredScenario,
  type LoadStepDTO,
  type LoadStageDTO,
  type LoadStageType,
  type RampCurve,
  type LoadRequestDTO,
  type SocketAddressDTO,
  type LoadShapeDTO,
  type LoadShapeType,
  type LoadShapeMetric,
  type LoadThresholdDTO,
  type LoadThresholdMetric,
  type LoadComparator,
  type ThresholdResult,
  type LoadCaptureDTO,
  type LoadCaptureSource,
  type LoadPacingMode,
  type LoadFeederDTO,
  type LoadFeederStrategy,
  type LoadStepSelection,
  type GenerateRecordingMode,
} from '../lib/loadScenario';
import { buildBaseUrl } from '../lib/mcpClient';
import { useDashboardStore } from '../store';
import HumanErrorAlert from './HumanErrorAlert';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import MetricsLineChart from './MetricsLineChart';
import LoadScenarioReview from './LoadScenarioReview';
import { trackFeature } from '../lib/analytics';

interface LoadScenarioPanelProps {
  connectionParams: ConnectionParams;
}

const RUNNING_POLL_MS = 1000;
const IDLE_POLL_MS = 5000;
const MAX_SAMPLES = 120;

const responsiveWidth = (px: number) => ({ width: { xs: '100%', sm: px } });
// Responsive grid for author-form field rows — fields fill available width and wrap
// uniformly via CSS Grid auto-fit (matching ServiceChaosPanel's CHAOS_GRID), so columns
// line up across rows instead of each row stretching its own items independently.
const FIELD_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1, alignItems: 'start' } as const;

/**
 * Sensible starting height (in rows) for the templated body field: the default of 2 when
 * empty/small, growing to fit a loaded multi-line body up to a 20-row cap. The field stays
 * `multiline` with no `maxRows`, so MUI continues to auto-grow beyond this as the user types;
 * this only ensures an existing large body opens expanded instead of clipped.
 */
function bodyMinRows(body: string): number {
  const lines = body ? body.split('\n').length : 0;
  return Math.min(20, Math.max(2, lines));
}

/** Parse a trimmed numeric field, or undefined when blank/NaN. */
function num(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

interface KeyValueRow { id: number; key: string; value: string; }

/** One cross-step capture rule editor row. */
interface CaptureFormState {
  id: number;
  name: string;
  source: LoadCaptureSource;
  expression: string;
  defaultValue: string;
}

function emptyCapture(): CaptureFormState {
  return { id: nextId(), name: '', source: 'BODY_JSONPATH', expression: '', defaultValue: '' };
}

/** One in-run threshold editor row. */
interface ThresholdFormState {
  id: number;
  metric: LoadThresholdMetric;
  comparator: LoadComparator;
  threshold: string;
}

function emptyThreshold(): ThresholdFormState {
  return { id: nextId(), metric: 'LATENCY_P95', comparator: 'LESS_THAN', threshold: '500' };
}

interface StepFormState {
  id: number;
  name: string;
  method: string;
  path: string;
  host: string;
  port: string;
  scheme: 'HTTP' | 'HTTPS';
  headers: KeyValueRow[];
  body: string;
  thinkTimeMs: string;
  /** WEIGHTED selection weight (blank → default 1.0); ignored under SEQUENTIAL. */
  weight: string;
  captures: CaptureFormState[];
}

/**
 * Profile authoring mode: an explicit ordered list of stages, or a single declarative named shape
 * that the server expands into stages. A UI-only toggle — the wire form is `profile.stages` or
 * `profile.shape`.
 */
type ProfileMode = 'STAGES' | 'SHAPE';

/** Shape editor card state — only the fields the chosen `type` needs are read. */
interface ShapeFormState {
  type: LoadShapeType;
  metric: LoadShapeMetric;
  curve: RampCurve;
  // SPIKE
  baseline: string;
  peak: string;
  rampUpMillis: string;
  holdMillis: string;
  rampDownMillis: string;
  recoveryHoldMillis: string;
  // STAIRS
  start: string;
  step: string;
  steps: string;
  stepDurationMillis: string;
  // RAMP_HOLD
  target: string;
  rampMillis: string;
}

function emptyShape(): ShapeFormState {
  return {
    type: 'RAMP_HOLD', metric: 'VU', curve: 'LINEAR',
    baseline: '0', peak: '20', rampUpMillis: '15000', holdMillis: '60000', rampDownMillis: '15000', recoveryHoldMillis: '',
    start: '5', step: '5', steps: '4', stepDurationMillis: '30000',
    target: '10', rampMillis: '30000',
  };
}

/** Feeder editor state — inline rows (primary) or raw CSV/JSON data. */
interface FeederFormState {
  enabled: boolean;
  mode: 'ROWS' | 'RAW';
  strategy: LoadFeederStrategy;
  /** Inline rows as a small key/value grid keyed by row index — modelled as columns × rows. */
  rows: FeederRowState[];
  rawFormat: 'CSV' | 'JSON';
  rawData: string;
}

/** One inline feeder row: a list of column=value pairs. */
interface FeederRowState { id: number; cells: KeyValueRow[]; }

function emptyFeederRow(): FeederRowState {
  return { id: nextId(), cells: [{ id: nextId(), key: '', value: '' }] };
}

function emptyFeeder(): FeederFormState {
  return { enabled: false, mode: 'ROWS', strategy: 'CIRCULAR', rows: [emptyFeederRow()], rawFormat: 'CSV', rawData: '' };
}

/**
 * One stage card in the profile stage-builder. `mode` is a UI-only toggle distinguishing a
 * hold (single setpoint) from a ramp (start→end + curve) for VU/RATE stages; PAUSE ignores both.
 */
interface StageFormState {
  id: number;
  type: LoadStageType;
  mode: 'HOLD' | 'RAMP';
  durationMillis: string;
  curve: RampCurve;
  // VU fields
  vus: string;
  startVus: string;
  endVus: string;
  // RATE fields (iterations/sec)
  rate: string;
  startRate: string;
  endRate: string;
  maxVus: string;
}

interface FormState {
  name: string;
  templateType: 'VELOCITY' | 'MUSTACHE';
  maxRequests: string;
  startDelayMillis: string;
  profileMode: ProfileMode;
  stages: StageFormState[];
  shape: ShapeFormState;
  labels: KeyValueRow[];
  steps: StepFormState[];
  stepSelection: LoadStepSelection;
  thresholds: ThresholdFormState[];
  abortOnFail: boolean;
  abortGraceMillis: string;
  pacingMode: LoadPacingMode;
  pacingValue: string;
  feeder: FeederFormState;
}

let idCounter = 1;
const nextId = () => idCounter++;

function emptyStep(): StepFormState {
  return {
    id: nextId(), name: '', method: 'GET', path: '/', host: '', port: '', scheme: 'HTTP', headers: [], body: '', thinkTimeMs: '',
    weight: '', captures: [],
  };
}

/** A fresh VU-hold stage card — the sensible default kind when adding a stage. */
function emptyStage(type: LoadStageType = 'VU', mode: 'HOLD' | 'RAMP' = 'HOLD'): StageFormState {
  return {
    id: nextId(), type, mode, durationMillis: '30000', curve: 'LINEAR',
    vus: '5', startVus: '1', endVus: '10',
    rate: '50', startRate: '10', endRate: '100', maxVus: '',
  };
}

const EMPTY_FORM: FormState = {
  name: '',
  templateType: 'VELOCITY',
  maxRequests: '',
  startDelayMillis: '',
  profileMode: 'STAGES',
  // Sensible default: ramp 1→10 VUs over 30s, then hold 10 VUs for 60s (mirrors the OpenAPI example).
  stages: [
    { ...emptyStage('VU', 'RAMP'), startVus: '1', endVus: '10', durationMillis: '30000', curve: 'LINEAR' },
    { ...emptyStage('VU', 'HOLD'), vus: '10', durationMillis: '60000' },
  ],
  shape: emptyShape(),
  labels: [],
  steps: [emptyStep()],
  stepSelection: 'SEQUENTIAL',
  thresholds: [],
  abortOnFail: false,
  abortGraceMillis: '',
  pacingMode: 'NONE',
  pacingValue: '',
  feeder: emptyFeeder(),
};

/**
 * Build the staged `profile` from the stage cards, or return a validation message. Each card emits a
 * {@link LoadStageDTO} carrying only the fields relevant to its type/mode. Validates: ≥1 stage,
 * ≥1 non-PAUSE (load) stage, every duration > 0, and ramp stages supply both endpoints.
 */
function buildProfile(stages: StageFormState[]): { stages: LoadStageDTO[] } | { error: string } {
  if (stages.length === 0) return { error: uiText('At least one stage is required', '至少需要一个阶段') };
  const out: LoadStageDTO[] = [];
  let hasLoadStage = false;
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]!;
    const label = uiText(`Stage ${i + 1}`, `阶段 ${i + 1}`);
    const durationMillis = num(s.durationMillis);
    if (durationMillis == null || durationMillis <= 0) return { error: uiText(`${label}: duration (ms) must be greater than 0`, `${label}：持续时间必须大于 0 毫秒`) };

    const stage: LoadStageDTO = { type: s.type, durationMillis };
    if (s.type === 'VU') {
      hasLoadStage = true;
      if (s.mode === 'HOLD') {
        const vus = num(s.vus);
        if (vus == null || vus < 1) return { error: uiText(`${label}: virtual users (VUs) must be at least 1`, `${label}：虚拟用户数必须至少为 1`) };
        stage.vus = vus;
      } else {
        const startVus = num(s.startVus);
        const endVus = num(s.endVus);
        if (startVus == null || startVus < 0) return { error: uiText(`${label}: start VUs must be 0 or greater`, `${label}：起始虚拟用户数必须大于或等于 0`) };
        if (endVus == null || endVus < 1) return { error: uiText(`${label}: end VUs must be at least 1`, `${label}：结束虚拟用户数必须至少为 1`) };
        stage.startVus = startVus;
        stage.endVus = endVus;
        stage.curve = s.curve;
      }
    } else if (s.type === 'RATE') {
      hasLoadStage = true;
      if (s.mode === 'HOLD') {
        const rate = num(s.rate);
        if (rate == null || rate <= 0) return { error: uiText(`${label}: rate (iterations/sec) must be greater than 0`, `${label}：速率必须大于 0 次迭代/秒`) };
        stage.rate = rate;
      } else {
        const startRate = num(s.startRate);
        const endRate = num(s.endRate);
        if (startRate == null || startRate < 0) return { error: uiText(`${label}: start rate must be 0 or greater`, `${label}：起始速率必须大于或等于 0`) };
        if (endRate == null || endRate <= 0) return { error: uiText(`${label}: end rate must be greater than 0`, `${label}：结束速率必须大于 0`) };
        stage.startRate = startRate;
        stage.endRate = endRate;
        stage.curve = s.curve;
      }
      const maxVus = num(s.maxVus);
      if (maxVus != null) {
        if (maxVus < 1) return { error: uiText(`${label}: max VUs must be at least 1 (or leave blank)`, `${label}：最大虚拟用户数必须至少为 1，也可留空`) };
        stage.maxVus = maxVus;
      }
    }
    // PAUSE: only durationMillis.
    out.push(stage);
  }
  if (!hasLoadStage) return { error: uiText('At least one VU or RATE stage is required (a profile of only pauses drives no load)', '至少需要一个按虚拟用户数或到达速率驱动的阶段。仅配置暂停阶段无法生成负载') };
  return { stages: out };
}

/**
 * Build the `profile` from the form, honouring the STAGES/SHAPE mode toggle. In SHAPE mode the
 * declarative shape is emitted (the server expands it into stages); in STAGES mode the explicit
 * stage cards are validated and emitted.
 */
function buildProfileFromForm(form: FormState): { profile: LoadScenarioDTO['profile'] } | { error: string } {
  if (form.profileMode === 'SHAPE') {
    const built = buildShape(form.shape);
    if ('error' in built) return { error: built.error };
    return { profile: { shape: built.shape } };
  }
  const built = buildProfile(form.stages);
  if ('error' in built) return { error: built.error };
  return { profile: { stages: built.stages } };
}

/** Validate + build a LoadShape from the shape card, or return a validation message. */
function buildShape(form: ShapeFormState): { shape: LoadShapeDTO } | { error: string } {
  const shape: LoadShapeDTO = { type: form.type, metric: form.metric };
  const positive = (raw: string, label: string): number | { error: string } => {
    const v = num(raw);
    if (v == null || v <= 0) return { error: uiText(`Shape: ${label} must be greater than 0`, `负载曲线：${label}必须大于 0`) };
    return v;
  };
  if (form.type === 'SPIKE') {
    shape.curve = form.curve;
    const baseline = num(form.baseline) ?? 0;
    const peak = positive(form.peak, 'peak');
    if (typeof peak === 'object') return peak;
    const rampUp = positive(form.rampUpMillis, 'ramp-up (ms)');
    if (typeof rampUp === 'object') return rampUp;
    const hold = positive(form.holdMillis, 'hold (ms)');
    if (typeof hold === 'object') return hold;
    const rampDown = positive(form.rampDownMillis, 'ramp-down (ms)');
    if (typeof rampDown === 'object') return rampDown;
    shape.baseline = baseline; shape.peak = peak; shape.rampUpMillis = rampUp; shape.holdMillis = hold; shape.rampDownMillis = rampDown;
    const recovery = num(form.recoveryHoldMillis);
    if (recovery != null) {
      if (recovery < 0) return { error: uiText('Shape: recovery hold (ms) must be 0 or greater (or leave blank)', '负载曲线：恢复后的保持时长必须大于或等于 0 毫秒，也可留空') };
      shape.recoveryHoldMillis = recovery;
    }
  } else if (form.type === 'STAIRS') {
    const start = num(form.start);
    if (start == null || start < 0) return { error: uiText('Shape: start must be 0 or greater', '负载曲线：起始值必须大于或等于 0') };
    const step = positive(form.step, 'step rise');
    if (typeof step === 'object') return step;
    const steps = positive(form.steps, 'number of steps');
    if (typeof steps === 'object') return steps;
    const stepDur = positive(form.stepDurationMillis, 'step duration (ms)');
    if (typeof stepDur === 'object') return stepDur;
    shape.start = start; shape.step = step; shape.steps = steps; shape.stepDurationMillis = stepDur;
  } else {
    // RAMP_HOLD
    shape.curve = form.curve;
    const target = positive(form.target, 'target');
    if (typeof target === 'object') return target;
    const ramp = positive(form.rampMillis, 'ramp (ms)');
    if (typeof ramp === 'object') return ramp;
    const hold = positive(form.holdMillis, 'hold (ms)');
    if (typeof hold === 'object') return hold;
    shape.target = target; shape.rampMillis = ramp; shape.holdMillis = hold;
  }
  return { shape };
}

/** Build a LoadScenarioDTO from the form, or return a validation message. */
function buildScenario(form: FormState): { scenario: LoadScenarioDTO } | { error: string } {
  if (form.name.trim() === '') return { error: uiText('Scenario name is required', '请输入场景名称') };

  const builtProfile = buildProfileFromForm(form);
  if ('error' in builtProfile) return { error: builtProfile.error };
  const profile = builtProfile.profile;

  if (form.steps.length === 0) return { error: uiText('At least one step is required', '至少需要一个步骤') };
  const weighted = form.stepSelection === 'WEIGHTED';
  const steps: LoadStepDTO[] = [];
  for (let i = 0; i < form.steps.length; i++) {
    const s = form.steps[i]!;
    if (s.host.trim() === '') return { error: uiText(`Step ${i + 1}: target host is required`, `步骤 ${i + 1}：请输入目标主机`) };
    const port = num(s.port);
    if (port == null || port < 1 || port > 65535) return { error: uiText(`Step ${i + 1}: target port must be 1–65535`, `步骤 ${i + 1}：目标端口必须在 1 至 65535 之间`) };
    if (s.path.trim() === '') return { error: uiText(`Step ${i + 1}: path is required`, `步骤 ${i + 1}：请输入路径`) };

    const socketAddress: SocketAddressDTO = { host: s.host.trim(), port, scheme: s.scheme };
    const step: LoadStepDTO = {
      request: { method: s.method.trim() || 'GET', path: s.path.trim(), socketAddress },
    };
    const headers = headerRowsToMultiValue(s.headers);
    if (headers) step.request.headers = headers;
    if (s.body.trim() !== '') step.request.body = s.body;
    if (s.name.trim() !== '') step.name = s.name.trim();
    const thinkTimeMs = num(s.thinkTimeMs);
    if (thinkTimeMs != null) {
      if (thinkTimeMs < 0) return { error: uiText(`Step ${i + 1}: think time (ms) must be 0 or greater`, `步骤 ${i + 1}：步骤结束后的延迟必须大于或等于 0 毫秒`) };
      step.thinkTime = { timeUnit: 'MILLISECONDS', value: thinkTimeMs };
    }
    const captures = buildCaptures(s.captures);
    if ('error' in captures) return { error: uiText(`Step ${i + 1}: ${captures.error}`, `步骤 ${i + 1}：${captures.error}`) };
    if (captures.captures.length > 0) step.captures = captures.captures;
    if (weighted) {
      const weight = num(s.weight);
      if (weight != null) {
        if (weight <= 0) return { error: uiText(`Step ${i + 1}: weight must be greater than 0 under WEIGHTED selection`, `步骤 ${i + 1}：按权重选择时，权重必须大于 0`) };
        step.weight = weight;
      }
    }
    steps.push(step);
  }

  const scenario: LoadScenarioDTO = {
    name: form.name.trim(),
    templateType: form.templateType,
    profile,
    steps,
  };
  const maxRequests = num(form.maxRequests);
  if (maxRequests != null) {
    if (maxRequests < 1) return { error: uiText('Max requests must be at least 1 (or leave blank for unlimited)', '最大请求数必须至少为 1，留空表示不限') };
    scenario.maxRequests = maxRequests;
  }
  const startDelayMillis = num(form.startDelayMillis);
  if (startDelayMillis != null) {
    if (startDelayMillis < 0) return { error: uiText('Start delay (ms) must be 0 or greater (or leave blank for none)', '启动延迟必须大于或等于 0 毫秒，留空表示无延迟') };
    scenario.startDelayMillis = startDelayMillis;
  }
  const labels = labelRowsToObject(form.labels);
  if (labels) scenario.labels = labels;

  if (form.stepSelection !== 'SEQUENTIAL') scenario.stepSelection = form.stepSelection;

  const thresholds = buildThresholds(form.thresholds);
  if ('error' in thresholds) return { error: thresholds.error };
  if (thresholds.thresholds.length > 0) {
    scenario.thresholds = thresholds.thresholds;
    if (form.abortOnFail) scenario.abortOnFail = true;
    const abortGraceMillis = num(form.abortGraceMillis);
    if (abortGraceMillis != null) {
      if (abortGraceMillis < 0) return { error: uiText('Abort grace (ms) must be 0 or greater (or leave blank)', '中止宽限期必须大于或等于 0 毫秒，也可留空') };
      scenario.abortGraceMillis = abortGraceMillis;
    }
  }

  if (form.pacingMode !== 'NONE') {
    const value = num(form.pacingValue);
    if (value == null || value <= 0) return { error: uiText('Pacing value must be greater than 0 when a pacing mode is selected', '选择执行节奏后，其值必须大于 0') };
    scenario.pacing = { mode: form.pacingMode, value };
  }

  const feeder = buildFeeder(form.feeder);
  if ('error' in feeder) return { error: feeder.error };
  if (feeder.feeder) scenario.feeder = feeder.feeder;

  return { scenario };
}

/** Validate + build the threshold list, or return a validation message. */
function buildThresholds(rows: ThresholdFormState[]): { thresholds: LoadThresholdDTO[] } | { error: string } {
  const out: LoadThresholdDTO[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const threshold = num(r.threshold);
    if (threshold == null) return { error: uiText(`Threshold ${i + 1}: a numeric threshold value is required`, `阈值 ${i + 1}：请输入数值`) };
    out.push({ metric: r.metric, comparator: r.comparator, threshold });
  }
  return { thresholds: out };
}

/** Validate + build a step's capture list, or return a (step-relative) validation message. */
function buildCaptures(rows: CaptureFormState[]): { captures: LoadCaptureDTO[] } | { error: string } {
  const out: LoadCaptureDTO[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const name = r.name.trim();
    const expression = r.expression.trim();
    if (name === '' && expression === '') continue; // an untouched row → skip
    if (name === '') return { error: uiText(`capture ${i + 1} needs a variable name`, `第 ${i + 1} 项变量提取需要变量名称`) };
    if (expression === '') return { error: uiText(`capture ${i + 1} (${name}) needs an expression`, `第 ${i + 1} 项变量提取（${name}）需要表达式`) };
    const capture: LoadCaptureDTO = { name, source: r.source, expression };
    if (r.defaultValue.trim() !== '') capture.defaultValue = r.defaultValue;
    out.push(capture);
  }
  return { captures: out };
}

/** Build the feeder from its editor, or return a validation message; null when disabled/empty. */
function buildFeeder(form: FeederFormState): { feeder: LoadFeederDTO | null } | { error: string } {
  if (!form.enabled) return { feeder: null };
  if (form.mode === 'RAW') {
    if (form.rawData.trim() === '') return { error: uiText('Feeder: raw data is required (or disable the feeder)', '请填写原始数据，或关闭测试数据源') };
    return { feeder: { data: form.rawData, format: form.rawFormat, strategy: form.strategy } };
  }
  const rows: Record<string, string>[] = [];
  for (const row of form.rows) {
    const obj: Record<string, string> = {};
    for (const cell of row.cells) {
      const key = cell.key.trim();
      if (key !== '') obj[key] = cell.value;
    }
    if (Object.keys(obj).length > 0) rows.push(obj);
  }
  if (rows.length === 0) return { error: uiText('Feeder: at least one non-empty row is required (or disable the feeder)', '请至少填写一行有效数据，或关闭测试数据源') };
  return { feeder: { rows, strategy: form.strategy } };
}

/**
 * Best-effort map of the form to a {@link LoadScenarioDTO} containing ONLY the fields the user has
 * actually filled in — used to drive the always-on code preview so the generated builder chain grows
 * field-by-field as the user types, never throwing on a half-filled form. Unlike {@link buildScenario}
 * (which gates submission and rejects anything invalid), this validates nothing: empty name → placeholder
 * handled downstream, blank stage/step values → omitted, unset optionals (templateType default, maxRequests,
 * startDelayMillis, zero thinkTime) → omitted. The codegen emitters tolerate the resulting partial shape.
 */
function buildPartialScenario(form: FormState): LoadScenarioDTO {
  const stages: LoadStageDTO[] = [];
  for (const s of form.stages) {
    const durationMillis = num(s.durationMillis);
    const stage: LoadStageDTO = { type: s.type, durationMillis: durationMillis ?? 0 };
    if (s.type === 'VU') {
      if (s.mode === 'HOLD') {
        const vus = num(s.vus);
        if (vus != null) stage.vus = vus;
      } else {
        const startVus = num(s.startVus);
        const endVus = num(s.endVus);
        if (startVus != null) stage.startVus = startVus;
        if (endVus != null) stage.endVus = endVus;
        stage.curve = s.curve;
      }
    } else if (s.type === 'RATE') {
      if (s.mode === 'HOLD') {
        const rate = num(s.rate);
        if (rate != null) stage.rate = rate;
      } else {
        const startRate = num(s.startRate);
        const endRate = num(s.endRate);
        if (startRate != null) stage.startRate = startRate;
        if (endRate != null) stage.endRate = endRate;
        stage.curve = s.curve;
      }
      const maxVus = num(s.maxVus);
      if (maxVus != null) stage.maxVus = maxVus;
    }
    // PAUSE: only durationMillis.
    stages.push(stage);
  }

  const weighted = form.stepSelection === 'WEIGHTED';
  const steps: LoadStepDTO[] = [];
  for (const s of form.steps) {
    const request: LoadRequestDTO = {};
    if (s.method.trim()) request.method = s.method.trim();
    if (s.path.trim()) request.path = s.path.trim();
    const host = s.host.trim();
    const port = num(s.port);
    if (host !== '' || port != null) {
      const socketAddress: SocketAddressDTO = { host, port: port ?? 0, scheme: s.scheme };
      request.socketAddress = socketAddress;
    }
    const headers = headerRowsToMultiValue(s.headers);
    if (headers) request.headers = headers;
    if (s.body.trim() !== '') request.body = s.body;
    const step: LoadStepDTO = { request };
    if (s.name.trim() !== '') step.name = s.name.trim();
    const thinkTimeMs = num(s.thinkTimeMs);
    if (thinkTimeMs != null && thinkTimeMs > 0) {
      step.thinkTime = { timeUnit: 'MILLISECONDS', value: thinkTimeMs };
    }
    const captures: LoadCaptureDTO[] = [];
    for (const c of s.captures) {
      const name = c.name.trim();
      const expression = c.expression.trim();
      if (name === '' || expression === '') continue;
      const capture: LoadCaptureDTO = { name, source: c.source, expression };
      if (c.defaultValue.trim() !== '') capture.defaultValue = c.defaultValue;
      captures.push(capture);
    }
    if (captures.length > 0) step.captures = captures;
    if (weighted) {
      const weight = num(s.weight);
      if (weight != null) step.weight = weight;
    }
    steps.push(step);
  }

  const profile: LoadScenarioDTO['profile'] = form.profileMode === 'SHAPE'
    ? { shape: partialShape(form.shape) }
    : { stages };

  const scenario: LoadScenarioDTO = {
    name: form.name.trim(),
    profile,
    steps,
  };
  if (form.templateType !== 'VELOCITY') scenario.templateType = form.templateType;
  const maxRequests = num(form.maxRequests);
  if (maxRequests != null) scenario.maxRequests = maxRequests;
  const startDelayMillis = num(form.startDelayMillis);
  if (startDelayMillis != null) scenario.startDelayMillis = startDelayMillis;
  const labels = labelRowsToObject(form.labels);
  if (labels) scenario.labels = labels;
  if (form.stepSelection !== 'SEQUENTIAL') scenario.stepSelection = form.stepSelection;

  const thresholds: LoadThresholdDTO[] = [];
  for (const t of form.thresholds) {
    const threshold = num(t.threshold);
    if (threshold != null) thresholds.push({ metric: t.metric, comparator: t.comparator, threshold });
  }
  if (thresholds.length > 0) {
    scenario.thresholds = thresholds;
    if (form.abortOnFail) scenario.abortOnFail = true;
    const abortGraceMillis = num(form.abortGraceMillis);
    if (abortGraceMillis != null) scenario.abortGraceMillis = abortGraceMillis;
  }

  if (form.pacingMode !== 'NONE') {
    const value = num(form.pacingValue);
    if (value != null) scenario.pacing = { mode: form.pacingMode, value };
  }

  const feeder = buildFeeder(form.feeder);
  if (!('error' in feeder) && feeder.feeder) scenario.feeder = feeder.feeder;

  return scenario;
}

/** Best-effort partial shape for the live preview (only filled fields, no validation). */
function partialShape(form: ShapeFormState): LoadShapeDTO {
  const shape: LoadShapeDTO = { type: form.type, metric: form.metric };
  const set = (key: keyof LoadShapeDTO, raw: string) => {
    const v = num(raw);
    if (v != null) (shape as unknown as Record<string, unknown>)[key] = v;
  };
  if (form.type === 'SPIKE') {
    shape.curve = form.curve;
    set('baseline', form.baseline); set('peak', form.peak); set('rampUpMillis', form.rampUpMillis);
    set('holdMillis', form.holdMillis); set('rampDownMillis', form.rampDownMillis); set('recoveryHoldMillis', form.recoveryHoldMillis);
  } else if (form.type === 'STAIRS') {
    set('start', form.start); set('step', form.step); set('steps', form.steps); set('stepDurationMillis', form.stepDurationMillis);
  } else {
    shape.curve = form.curve;
    set('target', form.target); set('rampMillis', form.rampMillis); set('holdMillis', form.holdMillis);
  }
  return shape;
}

function labelRowsToObject(rows: KeyValueRow[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key !== '') out[key] = row.value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Convert the per-step header rows into MockServer's `KeyToMultiValue` object-map form
 * (`{ "Name": ["value"] }`), collecting repeated names into a single multi-value entry.
 * Returns undefined when no non-empty header name exists so the request body stays minimal.
 */
function headerRowsToMultiValue(rows: KeyValueRow[]): Record<string, string[]> | undefined {
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key === '') continue;
    (out[key] ??= []).push(row.value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Read a step's request `headers` back into editor rows. Handles both MockServer
 * `KeyToMultiValue` shapes the server may echo: the object map `{ "Name": ["v1", "v2"] }`
 * and the array form `[{ name, values: ["v1"] }]`. Each value becomes its own row so the
 * round-trip through `headerRowsToMultiValue` is faithful.
 */
function headersToRows(headers: LoadRequestDTO['headers']): KeyValueRow[] {
  if (headers == null) return [];
  const rows: KeyValueRow[] = [];
  const push = (key: string, values: unknown) => {
    if (Array.isArray(values)) {
      for (const v of values) rows.push({ id: nextId(), key, value: String(v) });
    } else if (values != null) {
      rows.push({ id: nextId(), key, value: String(values) });
    }
  };
  if (Array.isArray(headers)) {
    for (const entry of headers as Array<{ name?: unknown; values?: unknown }>) {
      if (entry && typeof entry.name === 'string') push(entry.name, entry.values);
    }
  } else {
    for (const [key, values] of Object.entries(headers as Record<string, unknown>)) {
      if (key === 'keyMatchStyle') continue;
      push(key, values);
    }
  }
  return rows;
}

/** Map one wire LoadStageDTO back into an editor stage card, inferring hold-vs-ramp mode. */
function stageToForm(stage: LoadStageDTO): StageFormState {
  const base = emptyStage(stage.type);
  const isVuRamp = stage.type === 'VU' && stage.startVus != null && stage.endVus != null;
  const isRateRamp = stage.type === 'RATE' && stage.startRate != null && stage.endRate != null;
  return {
    ...base,
    type: stage.type,
    mode: isVuRamp || isRateRamp ? 'RAMP' : 'HOLD',
    durationMillis: String(stage.durationMillis),
    curve: stage.curve ?? 'LINEAR',
    vus: stage.vus != null ? String(stage.vus) : base.vus,
    startVus: stage.startVus != null ? String(stage.startVus) : base.startVus,
    endVus: stage.endVus != null ? String(stage.endVus) : base.endVus,
    rate: stage.rate != null ? String(stage.rate) : base.rate,
    startRate: stage.startRate != null ? String(stage.startRate) : base.startRate,
    endRate: stage.endRate != null ? String(stage.endRate) : base.endRate,
    maxVus: stage.maxVus != null ? String(stage.maxVus) : '',
  };
}

/** Map a wire LoadShape back into the shape editor card, filling unset fields from the defaults. */
function shapeToForm(shape: LoadShapeDTO): ShapeFormState {
  const base = emptyShape();
  const str = (v: number | undefined, fallback: string) => (v != null ? String(v) : fallback);
  return {
    ...base,
    type: shape.type,
    metric: shape.metric ?? 'VU',
    curve: shape.curve ?? 'LINEAR',
    baseline: str(shape.baseline, base.baseline),
    peak: str(shape.peak, base.peak),
    rampUpMillis: str(shape.rampUpMillis, base.rampUpMillis),
    holdMillis: str(shape.holdMillis, base.holdMillis),
    rampDownMillis: str(shape.rampDownMillis, base.rampDownMillis),
    recoveryHoldMillis: shape.recoveryHoldMillis != null ? String(shape.recoveryHoldMillis) : '',
    start: str(shape.start, base.start),
    step: str(shape.step, base.step),
    steps: str(shape.steps, base.steps),
    stepDurationMillis: str(shape.stepDurationMillis, base.stepDurationMillis),
    target: str(shape.target, base.target),
    rampMillis: str(shape.rampMillis, base.rampMillis),
  };
}

/** Map a wire LoadCapture back into a capture editor row. */
function captureToForm(capture: LoadCaptureDTO): CaptureFormState {
  return {
    id: nextId(),
    name: capture.name ?? '',
    source: capture.source ?? 'BODY_JSONPATH',
    expression: capture.expression ?? '',
    defaultValue: capture.defaultValue ?? '',
  };
}

/** Map a wire LoadFeeder back into the feeder editor (rows form preferred, else raw data). */
function feederToForm(feeder: LoadFeederDTO | undefined): FeederFormState {
  if (!feeder) return emptyFeeder();
  const strategy = feeder.strategy ?? 'CIRCULAR';
  if (feeder.rows && feeder.rows.length > 0) {
    return {
      enabled: true, mode: 'ROWS', strategy, rawFormat: 'CSV', rawData: '',
      rows: feeder.rows.map((row) => ({
        id: nextId(),
        cells: Object.entries(row).map(([key, value]) => ({ id: nextId(), key, value: String(value) })),
      })),
    };
  }
  if (feeder.data != null) {
    return { enabled: true, mode: 'RAW', strategy, rows: [emptyFeederRow()], rawFormat: feeder.format ?? 'CSV', rawData: feeder.data };
  }
  return emptyFeeder();
}

/** Reverse buildScenario: load a running/most-recent scenario back into the editor. */
function scenarioToForm(scenario: LoadScenarioDTO): FormState {
  const p = scenario.profile;
  const hasShape = p?.shape != null && (!p.stages || p.stages.length === 0);
  const stages = (p?.stages && p.stages.length > 0) ? p.stages.map(stageToForm) : [emptyStage('VU', 'HOLD')];
  return {
    name: scenario.name,
    templateType: scenario.templateType ?? 'VELOCITY',
    maxRequests: scenario.maxRequests != null ? String(scenario.maxRequests) : '',
    startDelayMillis: scenario.startDelayMillis != null ? String(scenario.startDelayMillis) : '',
    profileMode: hasShape ? 'SHAPE' : 'STAGES',
    stages,
    shape: hasShape && p?.shape ? shapeToForm(p.shape) : emptyShape(),
    labels: Object.entries(scenario.labels ?? {}).map(([key, value]) => ({ id: nextId(), key, value })),
    steps: (scenario.steps.length > 0 ? scenario.steps : [{ request: {} }]).map((step) => ({
      id: nextId(),
      name: step.name ?? '',
      method: step.request.method ?? 'GET',
      path: step.request.path ?? '/',
      host: step.request.socketAddress?.host ?? '',
      port: step.request.socketAddress?.port != null ? String(step.request.socketAddress.port) : '',
      scheme: step.request.socketAddress?.scheme ?? 'HTTP',
      headers: headersToRows(step.request.headers),
      body: step.request.body ?? '',
      thinkTimeMs: step.thinkTime?.value != null ? String(step.thinkTime.value) : '',
      weight: step.weight != null ? String(step.weight) : '',
      captures: (step.captures ?? []).map(captureToForm),
    })),
    stepSelection: scenario.stepSelection ?? 'SEQUENTIAL',
    thresholds: (scenario.thresholds ?? []).map((t) => ({
      id: nextId(), metric: t.metric, comparator: t.comparator, threshold: String(t.threshold),
    })),
    abortOnFail: scenario.abortOnFail ?? false,
    abortGraceMillis: scenario.abortGraceMillis != null ? String(scenario.abortGraceMillis) : '',
    pacingMode: scenario.pacing?.mode ?? 'NONE',
    pacingValue: scenario.pacing?.value != null ? String(scenario.pacing.value) : '',
    feeder: feederToForm(scenario.feeder),
  };
}

// --- Combined live chart series ---

interface Sample {
  at: number;
  requestsSent: number;
  succeeded: number;
  failed: number;
  currentVus: number;
  inFlight: number;
  p50: number;
  p95: number;
  p99: number;
}

type SeriesKey = 'rps' | 'vus' | 'inFlight' | 'p50' | 'p95' | 'p99' | 'errorRate';

interface SeriesDef {
  key: SeriesKey;
  label: string;
  /** axis group: latencies share a "ms" formatter; counts/rates are plain. */
  format: (v: number) => string;
  /** derive this series' value array from the accumulated samples. */
  derive: (samples: Sample[]) => number[];
  /**
   * How the "all scenarios" total combines the per-scenario lines:
   *  - 'sum'   additive metrics (RPS, VUs, in-flight) — element-wise sum of the per-scenario series.
   *            (Summing the per-scenario RATES, rather than differencing the pooled counter, avoids a
   *            one-frame spike when a scenario joins mid-run: a joiner contributes 0 on its first frame.)
   *  - 'max'   latency percentiles — element-wise worst case (percentiles cannot be summed).
   *  - 'ratio' error rate — pooled Σfailed/Σsent, which can't be recovered from per-scenario rates,
   *            so it is derived from the aggregated snapshot instead.
   */
  combine: 'sum' | 'max' | 'ratio';
}

/** RPS for each sample as Δsent / Δt against the previous sample (first point = 0). */
function ratePerSecond(samples: Sample[]): number[] {
  return samples.map((s, i) => {
    if (i === 0) return 0;
    const prev = samples[i - 1]!;
    const dt = (s.at - prev.at) / 1000;
    if (dt <= 0) return 0;
    return Math.max(0, (s.requestsSent - prev.requestsSent) / dt);
  });
}

const SERIES_DEFS: SeriesDef[] = [
  { key: 'rps', label: 'RPS', format: (v) => `${v.toFixed(1)}/s`, derive: ratePerSecond, combine: 'sum' },
  { key: 'vus', label: uiText('Active VUs', '活跃虚拟用户'), format: (v) => Math.round(v).toLocaleString(), derive: (s) => s.map((x) => x.currentVus), combine: 'sum' },
  { key: 'inFlight', label: uiText('In-flight', '在途请求'), format: (v) => Math.round(v).toLocaleString(), derive: (s) => s.map((x) => x.inFlight), combine: 'sum' },
  { key: 'p50', label: 'p50 ms', format: (v) => `${v.toFixed(0)} ms`, derive: (s) => s.map((x) => x.p50), combine: 'max' },
  { key: 'p95', label: 'p95 ms', format: (v) => `${v.toFixed(0)} ms`, derive: (s) => s.map((x) => x.p95), combine: 'max' },
  { key: 'p99', label: 'p99 ms', format: (v) => `${v.toFixed(0)} ms`, derive: (s) => s.map((x) => x.p99), combine: 'max' },
  { key: 'errorRate', label: uiText('Error rate %', '错误率（%）'), format: (v) => `${v.toFixed(1)}%`, derive: (s) => s.map((x) => (x.requestsSent > 0 ? (x.failed / x.requestsSent) * 100 : 0)), combine: 'ratio' },
];

// Default-visible subset — RPS + p95 + active VUs (per the brief).
const DEFAULT_VISIBLE: SeriesKey[] = ['rps', 'p95', 'vus'];

// --- Multi-scenario chart timeline ---
//
// The chart plots every concurrently-running scenario, split by scenario, plus an aggregate
// "all scenarios" total. We accumulate a shared timeline of frames (one per registry poll):
// each frame holds a snapshot of every scenario running at that instant, keyed by scenario
// name. A scenario absent from a frame leaves a null gap in its line, so lines start and stop
// independently as scenarios come and go.

/** A point on the shared timeline: each running scenario's snapshot, keyed by scenario name. */
interface Frame {
  at: number;
  tracks: Record<string, Sample>;
}

/** Legend/toggle label for the aggregate "all scenarios" line. */
const TOTAL_TRACK = 'All scenarios';

/** Build a chart Sample from a live status snapshot (a registry entry or the legacy run). */
function sampleOf(status: LoadScenarioStatus, at: number): Sample {
  const sent = status.requestsSent ?? 0;
  const succeeded = status.succeeded ?? 0;
  const failed = status.failed ?? 0;
  return {
    at,
    requestsSent: sent,
    succeeded,
    failed,
    currentVus: status.currentVus ?? 0,
    // in-flight ≈ requests dispatched but not yet completed.
    inFlight: Math.max(0, sent - succeeded - failed),
    p50: status.p50Millis ?? 0,
    p95: status.p95Millis ?? 0,
    p99: status.p99Millis ?? 0,
  };
}

/**
 * Pool several scenarios' snapshots into a single "all scenarios" sample for one frame: counts /
 * VUs / in-flight sum across scenarios; latency percentiles take the worst (max) case, since
 * percentiles cannot be summed. Used to back the pooled error-rate total (Σfailed / Σsent), which —
 * unlike the additive and latency totals — cannot be recombined from the per-scenario lines. The
 * additive (sum) and latency (max) totals are instead built element-wise from those lines, so a
 * scenario joining mid-run contributes 0 to the additive total on its first frame (no spike).
 */
function aggregateSamples(samples: Sample[], at: number): Sample {
  return samples.reduce<Sample>(
    (acc, s) => ({
      at,
      requestsSent: acc.requestsSent + s.requestsSent,
      succeeded: acc.succeeded + s.succeeded,
      failed: acc.failed + s.failed,
      currentVus: acc.currentVus + s.currentVus,
      inFlight: acc.inFlight + s.inFlight,
      p50: Math.max(acc.p50, s.p50),
      p95: Math.max(acc.p95, s.p95),
      p99: Math.max(acc.p99, s.p99),
    }),
    { at, requestsSent: 0, succeeded: 0, failed: 0, currentVus: 0, inFlight: 0, p50: 0, p95: 0, p99: 0 },
  );
}

/**
 * Derive one metric's line for a single track across the whole frame timeline. `aligned[i]` is the
 * track's snapshot at frame `i`, or null when the track was not running then. The metric is derived
 * over only the present snapshots (so RPS deltas use consecutive samples of THIS track) and scattered
 * back to their frame positions, leaving null gaps where the track was idle.
 */
function deriveTrackSeries(aligned: (Sample | null)[], def: SeriesDef): (number | null)[] {
  const indices: number[] = [];
  const present: Sample[] = [];
  aligned.forEach((s, i) => {
    if (s) {
      indices.push(i);
      present.push(s);
    }
  });
  const derived = def.derive(present);
  const out: (number | null)[] = new Array(aligned.length).fill(null);
  indices.forEach((frameIndex, k) => {
    out[frameIndex] = derived[k] ?? null;
  });
  return out;
}

export default function LoadScenarioPanel({ connectionParams }: LoadScenarioPanelProps) {
  const setView = useDashboardStore((s) => s.setView);

  // Sub-tab: 'run' focuses on running scenarios + live metrics; 'author' on creating/editing a
  // scenario (form + generated code). Defaults to 'run' so monitoring is what you land on.
  const [view, setPanelView] = useState<'run' | 'author'>('run');

  // True when the server reports loadGenerationEnabled=false, or refused a start with 403.
  const [disabled, setDisabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<HumanError | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // Registry (Wave C): all scenarios registered on the server + the user's selection.
  const [registry, setRegistry] = useState<RegisteredScenario[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // "Generate from…" dialog: null = closed, otherwise which source.
  const [generateSource, setGenerateSource] = useState<'openapi' | 'recording' | null>(null);
  const [visible, setVisible] = useState<Set<SeriesKey>>(() => new Set(DEFAULT_VISIBLE));
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  // Multi-scenario chart timeline: one frame per registry poll, each holding every running
  // scenario's snapshot. Scenarios the user has hidden from the chart (default: none → all shown).
  const [frames, setFrames] = useState<Frame[]>([]);
  const [hiddenScenarios, setHiddenScenarios] = useState<Set<string>>(() => new Set());
  // Whether any scenario was running on the previous registry poll — lets a new batch of runs
  // start a fresh timeline instead of appending to a stale one.
  const framesActiveRef = useRef(false);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Whether load generation is enabled comes from the live configuration, so the help is shown
  // up front and stays put; a config that cannot be read leaves the current state unchanged.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      try {
        const config = await getConfiguration(connectionParams, controller.signal);
        if (cancelled) return;
        const enabled = config['loadGenerationEnabled'];
        if (typeof enabled === 'boolean') setDisabled(!enabled);
      } catch {
        // configuration unavailable: keep the last known state
      } finally {
        if (!cancelled) timer = setTimeout(() => void poll(), IDLE_POLL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [connectionParams, refreshTick]);

  // Poll the registry listing. Faster while any scenario is RUNNING/PENDING so the
  // concurrent-running view, state badges, and live chart stay live.
  const anyActive = registry.some((s) => s.state === 'RUNNING' || s.state === 'PENDING');
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      try {
        const list = await listLoadScenarios(connectionParams, controller.signal);
        if (cancelled) return;
        setRegistry(list);
        setLoadError(null);
        // Drop selections for scenarios that no longer exist.
        setSelected((prev) => {
          const names = new Set(list.map((s) => s.name));
          const next = new Set([...prev].filter((n) => names.has(n)));
          return next.size === prev.size ? prev : next;
        });
        // Accumulate a chart frame from every actively-running scenario.
        const now = Date.now();
        const tracks: Record<string, Sample> = {};
        for (const entry of list) {
          if (entry.state === 'RUNNING' && entry.status) tracks[entry.name] = sampleOf(entry.status, now);
        }
        const active = Object.keys(tracks).length > 0;
        const wasActive = framesActiveRef.current;
        framesActiveRef.current = active;
        if (active) {
          setFrames((prev) => [...(wasActive ? prev : []), { at: now, tracks }].slice(-MAX_SAMPLES));
        }
      } catch (e) {
        // Leave the last-known registry in place and surface the failure.
        if (cancelled || controller.signal.aborted) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) {
          timer = setTimeout(() => void poll(), anyActive ? RUNNING_POLL_MS : IDLE_POLL_MS);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [connectionParams, refreshTick, anyActive]);

  // Every registered scenario that is currently RUNNING — drives the concurrent-running view.
  const runningEntries = useMemo(
    () => registry.filter((s) => s.state === 'RUNNING' && s.status),
    [registry],
  );
  const running = runningEntries.length > 0;
  // The end-of-run summary shows the most recently finished run once nothing is active.
  const finished = useMemo(() => latestFinishedScenario(registry), [registry]);
  const summary = !anyActive && finished?.status ? finished.status : null;
  const headerState = running
    ? 'running'
    : anyActive
      ? 'pending'
      : finished?.status?.state ?? 'none';

  const runAction = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      refresh();
    } catch (e) {
      if (e instanceof LoadScenarioError && e.status === 403) {
        setDisabled(true);
      } else {
        setActionError(humanizeError(e));
      }
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  // Fallback for "Edit running" when the server does not echo a definition (older servers):
  // remember the last scenario this tab submitted so its full config can still be reloaded.
  const lastSubmitted = useRef<LoadScenarioDTO | null>(null);

  // Load a running scenario's config back into the editor for tweak-and-restart. Prefer the
  // server-echoed definition (works for ANY run — a client's or another tab's), and fall back to
  // this tab's last-submitted scenario of the same name only when the server did not provide one.
  const handleEditRunning = useCallback((entry: RegisteredScenario) => {
    const fallback = lastSubmitted.current?.name === entry.name ? lastSubmitted.current : null;
    const definition = entry.definition ?? entry.status?.definition ?? fallback;
    if (definition) {
      setForm(scenarioToForm(definition));
    }
    setActionError(null);
    setPanelView('author'); // editing → jump to the Author sub-tab
  }, []);

  // (Author flow below registers/runs explicitly via handleLoad / handleLoadAndRun.)

  // "Load" — validate + REGISTER the scenario (does not run it). Allowed even when
  // load generation is disabled. Records the submitted scenario so "Edit running"
  // can reload it. Returns the registered scenario (or null on validation error).
  const registerForm = useCallback(async (): Promise<LoadScenarioDTO | null> => {
    const built = buildScenario(form);
    if ('error' in built) {
      setActionError({ message: built.error });
      return null;
    }
    lastSubmitted.current = built.scenario;
    let ok = false;
    await runAction(async () => {
      await registerLoadScenario(connectionParams, built.scenario);
      ok = true;
    });
    return ok ? built.scenario : null;
  }, [connectionParams, form, runAction]);

  const handleLoad = useCallback(() => {
    void registerForm();
  }, [registerForm]);

  // "Load & Run" — register, then start it by name (requires loadGenerationEnabled).
  const handleLoadAndRun = useCallback(() => {
    void (async () => {
      const scenario = await registerForm();
      if (!scenario) return;
      setPanelView('run'); // starting a run → jump to the Run & Monitor sub-tab
      await runAction(async () => {
        await startScenariosByName(connectionParams, [scenario.name]);
        trackFeature('load_run_started');
      });
    })();
  }, [connectionParams, registerForm, runAction]);

  // --- registry (Wave C) handlers ---
  const toggleSelected = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const startSelected = useCallback(() => {
    const names = [...selected];
    if (names.length === 0) return;
    setPanelView('run'); // starting runs → jump to the Run & Monitor sub-tab
    void runAction(async () => {
      await startScenariosByName(connectionParams, names);
      trackFeature('load_run_started');
    });
  }, [connectionParams, runAction, selected]);

  const startSelectedOne = useCallback((name: string) => {
    setPanelView('run'); // starting a run → jump to the Run & Monitor sub-tab
    void runAction(async () => {
      await startScenariosByName(connectionParams, [name]);
      trackFeature('load_run_started');
    });
  }, [connectionParams, runAction]);

  const stopOne = useCallback((name: string) => {
    void runAction(async () => {
      await stopScenariosByName(connectionParams, [name]);
    });
  }, [connectionParams, runAction]);

  const deleteOne = useCallback((entry: RegisteredScenario) => {
    const active = entry.state === 'RUNNING' || entry.state === 'PENDING';
    setConfirm({
      title: uiText(`Delete ${entry.name}?`, `删除 ${entry.name}？`),
      message: uiText(`This removes ${entry.name} from the registry${active ? ' and stops its run' : ''}. This cannot be undone.`, `此操作会移除场景 ${entry.name}${active ? ' 并停止运行' : ''}，且无法撤销。`),
      confirmLabel: uiText('Delete', '删除'),
      onConfirm: () => void runAction(async () => {
        await deleteLoadScenario(connectionParams, entry.name);
      }),
    });
  }, [connectionParams, runAction]);

  const clearAll = useCallback(() => {
    const activeCount = registry.filter((s) => s.state === 'RUNNING' || s.state === 'PENDING').length;
    setConfirm({
      title: uiText('Clear all load scenarios?', '清空所有负载场景？'),
      message: uiText(
        `This removes all ${registry.length} registered scenario${registry.length === 1 ? '' : 's'}`
          + `${activeCount > 0 ? ` and stops ${activeCount} active run${activeCount === 1 ? '' : 's'}` : ''}. This cannot be undone.`,
        `此操作会移除全部 ${registry.length} 个负载场景${activeCount > 0 ? `，并停止 ${activeCount} 项正在运行的任务` : ''}，且无法撤销。`,
      ),
      confirmLabel: uiText('Clear all', '清空全部'),
      onConfirm: () => void runAction(async () => {
        await clearLoadScenarios(connectionParams);
      }),
    });
  }, [connectionParams, registry, runAction]);

  // Load a registered scenario's definition back into the author form for tweaking.
  const editRegistered = useCallback((entry: RegisteredScenario) => {
    if (entry.definition) {
      setForm(scenarioToForm(entry.definition));
      setPanelView('author');
      setActionError(null);
    }
  }, []);

  // Load a freshly-generated scenario (from OpenAPI / recording) into the author form.
  const onGenerated = useCallback((scenario: LoadScenarioDTO) => {
    setForm(scenarioToForm(scenario));
    setGenerateSource(null);
    setPanelView('author');
    setActionError(null);
    refresh();
  }, [refresh]);

  // Download a run's end-of-run report (JSON or JUnit-XML) as a file rather than opening a tab.
  const downloadReport = useCallback((name: string, format?: 'junit') => {
    void (async () => {
      try {
        const res = await fetch(loadScenarioReportUrl(connectionParams, name, format));
        if (!res.ok) throw new Error(`Could not download the report (HTTP ${res.status})`);
        const url = URL.createObjectURL(await res.blob());
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${name}-report.${format === 'junit' ? 'xml' : 'json'}`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } catch (e) {
        setActionError(humanizeError(e));
      }
    })();
  }, [connectionParams]);

  // --- form field setters ---
  const setField = <K extends keyof FormState>(field: K) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // --- shape editor ---
  const setShapeField = (field: keyof ShapeFormState) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, shape: { ...prev.shape, [field]: e.target.value } }));
  const setShapeValue = <K extends keyof ShapeFormState>(field: K, value: ShapeFormState[K]) =>
    setForm((prev) => ({ ...prev, shape: { ...prev.shape, [field]: value } }));

  // --- thresholds ---
  const addThreshold = () => setForm((prev) => ({ ...prev, thresholds: [...prev.thresholds, emptyThreshold()] }));
  const removeThreshold = (index: number) => setForm((prev) => ({ ...prev, thresholds: prev.thresholds.filter((_, i) => i !== index) }));
  const setThresholdValue = <K extends keyof ThresholdFormState>(index: number, field: K, value: ThresholdFormState[K]) =>
    setForm((prev) => ({ ...prev, thresholds: prev.thresholds.map((t, i) => (i === index ? { ...t, [field]: value } : t)) }));

  // --- per-step captures ---
  const updateStepCaptures = (stepIndex: number, fn: (captures: CaptureFormState[]) => CaptureFormState[]) =>
    setForm((prev) => ({ ...prev, steps: prev.steps.map((s, i) => (i === stepIndex ? { ...s, captures: fn(s.captures) } : s)) }));
  const addStepCapture = (stepIndex: number) => updateStepCaptures(stepIndex, (c) => [...c, emptyCapture()]);
  const removeStepCapture = (stepIndex: number, captureIndex: number) =>
    updateStepCaptures(stepIndex, (c) => c.filter((_, i) => i !== captureIndex));
  const setStepCaptureValue = <K extends keyof CaptureFormState>(stepIndex: number, captureIndex: number, field: K, value: CaptureFormState[K]) =>
    updateStepCaptures(stepIndex, (c) => c.map((x, i) => (i === captureIndex ? { ...x, [field]: value } : x)));

  // --- feeder ---
  const setFeederValue = <K extends keyof FeederFormState>(field: K, value: FeederFormState[K]) =>
    setForm((prev) => ({ ...prev, feeder: { ...prev.feeder, [field]: value } }));
  const addFeederRow = () => setForm((prev) => ({ ...prev, feeder: { ...prev.feeder, rows: [...prev.feeder.rows, emptyFeederRow()] } }));
  const removeFeederRow = (rowIndex: number) =>
    setForm((prev) => ({ ...prev, feeder: { ...prev.feeder, rows: prev.feeder.rows.filter((_, i) => i !== rowIndex) } }));
  const addFeederCell = (rowIndex: number) =>
    setForm((prev) => ({
      ...prev,
      feeder: { ...prev.feeder, rows: prev.feeder.rows.map((r, i) => (i === rowIndex ? { ...r, cells: [...r.cells, { id: nextId(), key: '', value: '' }] } : r)) },
    }));
  const removeFeederCell = (rowIndex: number, cellIndex: number) =>
    setForm((prev) => ({
      ...prev,
      feeder: { ...prev.feeder, rows: prev.feeder.rows.map((r, i) => (i === rowIndex ? { ...r, cells: r.cells.filter((_, j) => j !== cellIndex) } : r)) },
    }));
  const setFeederCellField = (rowIndex: number, cellIndex: number, field: 'key' | 'value') => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({
      ...prev,
      feeder: { ...prev.feeder, rows: prev.feeder.rows.map((r, i) => (i === rowIndex ? { ...r, cells: r.cells.map((c, j) => (j === cellIndex ? { ...c, [field]: e.target.value } : c)) } : r)) },
    }));

  const setStepField = (index: number, field: keyof StepFormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, steps: prev.steps.map((s, i) => (i === index ? { ...s, [field]: e.target.value } : s)) }));

  const addStep = () => setForm((prev) => ({ ...prev, steps: [...prev.steps, emptyStep()] }));
  const removeStep = (index: number) => setForm((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }));

  // --- stage builder handlers ---
  const setStageField = (index: number, field: keyof StageFormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, stages: prev.stages.map((s, i) => (i === index ? { ...s, [field]: e.target.value } : s)) }));
  const setStageValue = <K extends keyof StageFormState>(index: number, field: K, value: StageFormState[K]) =>
    setForm((prev) => ({ ...prev, stages: prev.stages.map((s, i) => (i === index ? { ...s, [field]: value } : s)) }));
  const addStage = () => setForm((prev) => ({ ...prev, stages: [...prev.stages, emptyStage('VU', 'HOLD')] }));
  const removeStage = (index: number) => setForm((prev) => ({ ...prev, stages: prev.stages.filter((_, i) => i !== index) }));
  const moveStage = (index: number, delta: number) =>
    setForm((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.stages.length) return prev;
      const stages = [...prev.stages];
      const [moved] = stages.splice(index, 1);
      stages.splice(target, 0, moved!);
      return { ...prev, stages };
    });

  const updateStepHeaders = (stepIndex: number, fn: (headers: KeyValueRow[]) => KeyValueRow[]) =>
    setForm((prev) => ({ ...prev, steps: prev.steps.map((s, i) => (i === stepIndex ? { ...s, headers: fn(s.headers) } : s)) }));
  const addStepHeader = (stepIndex: number) =>
    updateStepHeaders(stepIndex, (headers) => [...headers, { id: nextId(), key: '', value: '' }]);
  const removeStepHeader = (stepIndex: number, headerIndex: number) =>
    updateStepHeaders(stepIndex, (headers) => headers.filter((_, i) => i !== headerIndex));
  const setStepHeaderField = (stepIndex: number, headerIndex: number, field: 'key' | 'value') =>
    (e: ChangeEvent<HTMLInputElement>) =>
      updateStepHeaders(stepIndex, (headers) => headers.map((h, i) => (i === headerIndex ? { ...h, [field]: e.target.value } : h)));

  const addLabel = () => setForm((prev) => ({ ...prev, labels: [...prev.labels, { id: nextId(), key: '', value: '' }] }));
  const removeLabel = (index: number) => setForm((prev) => ({ ...prev, labels: prev.labels.filter((_, i) => i !== index) }));
  const setLabelField = (index: number, field: 'key' | 'value') => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, labels: prev.labels.map((l, i) => (i === index ? { ...l, [field]: e.target.value } : l)) }));

  const toggleSeries = (key: SeriesKey) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleScenario = (name: string) =>
    setHiddenScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const chartTimestamps = useMemo(() => frames.map((f) => f.at), [frames]);

  // Every scenario that has appeared on the timeline, in stable sorted order — drives the
  // per-scenario toggles. A scenario is shown unless the user has explicitly hidden it.
  const scenarioNames = useMemo(() => {
    const names = new Set<string>();
    for (const f of frames) for (const n of Object.keys(f.tracks)) names.add(n);
    return [...names].sort();
  }, [frames]);
  const enabledScenarios = useMemo(
    () => scenarioNames.filter((n) => !hiddenScenarios.has(n)),
    [scenarioNames, hiddenScenarios],
  );

  // Build the chart lines: one per (visible metric × enabled scenario), plus an aggregate
  // "all scenarios" line per metric when 2+ scenarios are enabled (with a single scenario the
  // total would just duplicate it). Scenarios that come and go leave null gaps in their lines.
  const chartSeries = useMemo(() => {
    const visibleDefs = SERIES_DEFS.filter((d) => visible.has(d.key));
    if (frames.length === 0 || visibleDefs.length === 0 || enabledScenarios.length === 0) return [];
    const showTotal = enabledScenarios.length > 1;
    const series: { label: string; data: (number | null)[] }[] = [];
    for (const def of visibleDefs) {
      // Per-scenario lines first — also reused to build the additive/max total.
      const perScenario = enabledScenarios.map((name) => ({
        name,
        data: deriveTrackSeries(frames.map((f) => f.tracks[name] ?? null), def),
      }));
      if (showTotal) {
        let totalData: (number | null)[];
        if (def.combine === 'ratio') {
          // Error rate of the pooled totals (Σfailed/Σsent) — not recoverable from per-scenario rates.
          const totalAligned = frames.map((f) => {
            const present = enabledScenarios.map((n) => f.tracks[n]).filter((s): s is Sample => !!s);
            return present.length > 0 ? aggregateSamples(present, f.at) : null;
          });
          totalData = deriveTrackSeries(totalAligned, def);
        } else {
          // Sum (counts/rates) or max (latencies) the per-scenario lines element-wise; null where
          // no enabled scenario was running in that frame.
          totalData = frames.map((_, i) => {
            const vals = perScenario.map((p) => p.data[i]).filter((v): v is number => v != null);
            if (vals.length === 0) return null;
            return def.combine === 'max' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0);
          });
        }
        series.push({ label: `${def.label} · ${TOTAL_TRACK}`, data: totalData });
      }
      for (const p of perScenario) {
        // Suffix the scenario only when more than one line shares this metric, so a single-scenario
        // chart keeps the clean legacy labels ("RPS", "p95 ms", …).
        series.push({ label: showTotal ? `${def.label} · ${p.name}` : def.label, data: p.data });
      }
    }
    return series;
  }, [frames, visible, enabledScenarios]);

  const baseUrl = useMemo(() => buildBaseUrl(connectionParams), [connectionParams]);

  // The code preview always renders from a best-effort PARTIAL scenario (only the filled-in fields),
  // so the generated builder chain grows field-by-field as the user types — never blocked on full
  // validity. The strict buildScenario still gates the Load / Load & Run submit actions above; here
  // we only surface its message as a non-blocking inline hint about what is still needed to run.
  const codeScenario = useMemo(() => buildPartialScenario(form), [form]);
  const validation = useMemo(() => buildScenario(form), [form]);
  const codeError = 'error' in validation ? validation.error : null;

  const statusColor = running ? 'success' : headerState === 'completed' ? 'info' : headerState === 'stopped' ? 'warning' : 'default';

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }} data-testid="load-scenario-panel">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{uiText('Performance — Load Scenarios', '性能测试 · 负载场景')}</Typography>
        <Chip size="small" label={headerState} color={statusColor} variant="outlined" data-testid="load-header-state" />
        <Box sx={{ flex: 1 }} />
        <Tooltip title={uiText('Refresh now', '立即刷新')}>
          <IconButton size="small" onClick={refresh} aria-label={uiText('Refresh load scenario status', '刷新负载场景状态')}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {disabled && (
        <Alert severity="info" sx={{ mb: 1.5 }} data-testid="load-disabled-alert">
          <AlertTitle>{uiText('Load generation is disabled', '负载生成已禁用')}</AlertTitle>
          {uiText('Load scenarios are off by default. Start MockServer with load generation enabled to drive traffic from here:', '默认关闭负载场景。启动 MockServer 时启用负载生成，即可在此发起压测：')}
          <Box component="pre" sx={{ mt: 1, mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, typography: 'subtitle2', fontWeight: 400, overflow: 'auto' }}>
{`-Dmockserver.loadGenerationEnabled=true
# or environment variable:
MOCKSERVER_LOAD_GENERATION_ENABLED=true`}
          </Box>
          {uiText('For deeper analysis, the', '如需进一步分析，请查看')}{' '}
          <Link component="button" type="button" onClick={() => setView('metrics')}>{uiText('Metrics tab', '指标页')}</Link>{' '}
          {uiText('surfaces the', '，其中包含')} <code>mock_server_load_*</code> {uiText('Prometheus/OTEL series. See the', '的 Prometheus / OpenTelemetry 指标。参见')}{' '}
          <Link href="https://www.mock-server.com/mock_server/load_injection.html" target="_blank" rel="noopener noreferrer">
            {uiText('load injection docs', '负载注入文档')}
          </Link>{uiText('.', '。')}
        </Alert>
      )}

      {loadError && !disabled && (
        <Alert severity="error" sx={{ mb: 1.5 }} action={
          <IconButton color="inherit" size="small" onClick={refresh} aria-label={uiText('Retry', '重试')}><RefreshIcon fontSize="small" /></IconButton>
        }>
          <AlertTitle>{uiText('Could not load scenario status', '无法加载场景状态')}</AlertTitle>
          {loadError}
        </Alert>
      )}

      {actionError && (
        <HumanErrorAlert error={actionError} onClose={() => setActionError(null)} sx={{ mb: 1.5 }} data-testid="load-action-error" />
      )}

      {/* Registered scenarios (Wave C) — shared across both sub-tabs */}
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }} data-testid="load-registry">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{uiText('Registered Scenarios', '已注册的场景')}</Typography>
          <Chip size="small" label={registry.length} variant="outlined" />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small" variant="contained" startIcon={<PlayArrowIcon />}
            disabled={busy || disabled || selected.size === 0} onClick={startSelected}
            data-testid="load-start-selected"
          >
            {uiText('Start selected', '启动选中的场景')}{selected.size > 0 ? ` (${selected.size})` : ''}
          </Button>
          <Button
            size="small" color="error" variant="outlined" startIcon={<DeleteSweepIcon />}
            disabled={busy || registry.length === 0} onClick={clearAll}
            data-testid="load-clear-all"
          >
            {uiText('Clear all', '清空全部')}
          </Button>
        </Box>
        {registry.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {uiText('No scenarios registered yet. Use', '尚未注册负载场景。点击下方的')} <strong>{uiText('Load', '注册')}</strong> {uiText('below to register one without running it, or', '仅注册，点击')} <strong>{uiText('Load & Run', '注册并运行')}</strong> {uiText('to register and start it.', '可注册后立即启动。')}
          </Typography>
        ) : (
          registry.map((entry) => (
            <Box
              key={entry.name}
              data-testid={`load-registry-row-${entry.name}`}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderTop: 1, borderColor: 'divider', flexWrap: 'wrap' }}
            >
              <Checkbox
                size="small"
                checked={selected.has(entry.name)}
                onChange={() => toggleSelected(entry.name)}
                slotProps={{ input: { 'aria-label': `Select ${entry.name}` } }}
              />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.name}</Typography>
              <Chip
                size="small" variant="outlined"
                color={registryStateColor(entry.state)}
                label={entry.state}
                data-testid={`load-registry-state-${entry.name}`}
              />
              {entry.status && (entry.state === 'RUNNING' || entry.state === 'COMPLETED' || entry.state === 'STOPPED') && (
                <Typography variant="caption" color="text.secondary">
                  {(entry.status.requestsSent ?? 0).toLocaleString()} {uiText('sent ·', '已发送 ·')} {(errorRate(entry.status) * 100).toFixed(1)}{uiText('% err', '% 错误率')}
                  {entry.status.currentVus != null ? uiText(` · ${entry.status.currentVus} VUs`, ` · ${entry.status.currentVus} 个虚拟用户`) : ''}
                </Typography>
              )}
              {entry.status?.verdict && (
                <Chip
                  size="small"
                  color={entry.status.verdict === 'PASS' ? 'success' : 'error'}
                  label={entry.status.verdict}
                  data-testid={`load-registry-verdict-${entry.name}`}
                />
              )}
              <Box sx={{ flex: 1 }} />
              {entry.definition && (
                <Tooltip title={uiText('Load into author form', '载入编辑表单')}>
                  <span>
                    <IconButton size="small" onClick={() => editRegistered(entry)} aria-label={uiText(`Edit ${entry.name}`, `编辑 ${entry.name}`)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              {(entry.state === 'RUNNING' || entry.state === 'PENDING') ? (
                <Tooltip title={uiText('Stop', '停止')}>
                  <span>
                    <IconButton size="small" color="error" disabled={busy} onClick={() => stopOne(entry.name)} aria-label={uiText(`Stop ${entry.name}`, `停止 ${entry.name}`)}>
                      <StopIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              ) : (
                <Tooltip title={disabled ? uiText('Load generation disabled', '负载生成已禁用') : uiText('Start', '启动')}>
                  <span>
                    <IconButton size="small" color="primary" disabled={busy || disabled} onClick={() => startSelectedOne(entry.name)} aria-label={uiText(`Start ${entry.name}`, `启动 ${entry.name}`)}>
                      <PlayArrowIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              <Tooltip title={uiText('Remove from registry', '移除场景')}>
                <span>
                  <IconButton size="small" disabled={busy} onClick={() => deleteOne(entry)} aria-label={uiText(`Delete ${entry.name}`, `删除 ${entry.name}`)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))
        )}
      </Paper>

      {/* Sub-tabs: focus on running/metrics, or on authoring a scenario */}
      <Tabs
        value={view === 'author' ? 1 : 0}
        onChange={(_, v: number) => setPanelView(v === 1 ? 'author' : 'run')}
        sx={{ mb: 1.5, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
      >
        <Tab label={uiText('Run & Monitor', '运行与监控')} />
        <Tab label={uiText('Create / Edit', '创建或编辑')} />
      </Tabs>

      {view === 'run' ? (
      <>

      {/* Concurrent running view (Wave C): every actively-running registered scenario. */}
      {runningEntries.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }} data-testid="load-running-scenarios">
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            {uiText('Running Now (', '运行中 (')}{runningEntries.length})
          </Typography>
          {runningEntries.map((entry) => {
            const st = entry.status;
            return (
              <Box key={entry.name} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1 }} data-testid={`load-running-${entry.name}`}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{entry.name}</Typography>
                  {st?.elapsedMillis != null && (
                    <Chip size="small" variant="outlined" label={uiText(`${formatElapsed(st.elapsedMillis)} elapsed`, `已运行 ${formatElapsed(st.elapsedMillis)}`)} />
                  )}
                  {st && stageReadout(st) && (
                    <Chip size="small" color="primary" variant="outlined" label={stageReadout(st)} />
                  )}
                  {st && <VerdictBadge status={st} />}
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" variant="outlined" startIcon={<EditIcon />} disabled={busy} onClick={() => handleEditRunning(entry)}>
                    {uiText('Edit running', '编辑运行中的场景')}
                  </Button>
                  <Button size="small" color="error" variant="outlined" startIcon={<StopIcon />} disabled={busy} onClick={() => stopOne(entry.name)}>
                    {uiText('Stop', '停止')}
                  </Button>
                </Box>
                <RunProgressBar status={st} definition={entry.definition} />
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 1 }}>
                  <Stat label={uiText('Active VUs', '活跃虚拟用户')} value={(st?.currentVus ?? 0).toLocaleString()} />
                  <Stat label={uiText('Requests sent', '已发送请求')} value={(st?.requestsSent ?? 0).toLocaleString()} />
                  <Stat label={uiText('Succeeded', '成功')} value={(st?.succeeded ?? 0).toLocaleString()} />
                  <Stat label={uiText('Failed', '失败')} value={(st?.failed ?? 0).toLocaleString()} />
                  <Stat label={uiText('Error rate', '错误率')} value={st ? `${(errorRate(st) * 100).toFixed(1)}%` : '—'} />
                  <Stat label="p95" value={`${(st?.p95Millis ?? 0).toFixed(0)} ms`} />
                  {st?.p999Millis != null && <Stat label="p99.9" value={`${st.p999Millis.toFixed(0)} ms`} />}
                  {st?.droppedIterations != null && st.droppedIterations > 0 && (
                    <Stat label={uiText('Dropped', '已丢弃')} value={st.droppedIterations.toLocaleString()} />
                  )}
                </Box>
                {st && <ThresholdResultsTable results={st.thresholdResults} />}
                <ReportButtons name={entry.name} onDownload={downloadReport} />
              </Box>
            );
          })}
        </Paper>
      )}

      {/* Live chart — total across scenarios + a line per scenario, with metric and scenario toggles */}
      {frames.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }} data-testid="load-chart">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {uiText('Live throughput & latency', '实时吞吐量和延迟')}{enabledScenarios.length > 1 ? uiText(' — total + per scenario', '（整体及各场景）') : ''}
            </Typography>
          </Box>
          {/* Metric-type toggles (which series to plot) */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: scenarioNames.length > 1 ? 0.25 : 0.5 }} role="group" aria-label={uiText('Chart metric toggles', '切换图表指标')}>
            {SERIES_DEFS.map((d) => (
              <FormControlLabel
                key={d.key}
                sx={{ mr: 1 }}
                control={
                  <Checkbox
                    size="small"
                    checked={visible.has(d.key)}
                    onChange={() => toggleSeries(d.key)}
                  />
                }
                label={<Typography variant="caption">{d.label}</Typography>}
              />
            ))}
          </Box>
          {/* Per-scenario toggles — only when more than one scenario has data to compare */}
          {scenarioNames.length > 1 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5, alignItems: 'center' }} role="group" aria-label={uiText('Chart scenario toggles', '切换图表场景')}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>{uiText('Scenarios:', '场景')}</Typography>
              {scenarioNames.map((name) => (
                <FormControlLabel
                  key={name}
                  sx={{ mr: 1 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={!hiddenScenarios.has(name)}
                      onChange={() => toggleScenario(name)}
                    />
                  }
                  label={<Typography variant="caption">{name}</Typography>}
                />
              ))}
            </Box>
          )}
          {chartSeries.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              {visible.size === 0 ? uiText('Select at least one metric to plot.', '至少选择一个要绘制的指标。') : uiText('Select at least one scenario to plot.', '至少选择一个要绘制的场景。')}
            </Typography>
          ) : (
            <MetricsLineChart series={chartSeries} timestamps={chartTimestamps} height={240} />
          )}
        </Paper>
      )}

      {/* Key metrics summary on stop/completion */}
      {summary && (
        <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }} data-testid="load-summary">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary">
              {summary.state === 'completed' ? uiText('Run complete', '运行完成') : uiText('Run stopped', '运行已停止')} {uiText('— key metrics', '· 关键指标')}
              {summary.name ? ` · ${summary.name}` : ''}
            </Typography>
            <VerdictBadge status={summary} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1, mt: 1 }}>
            <Stat label={uiText('Requests sent', '已发送请求')} value={(summary.requestsSent ?? 0).toLocaleString()} />
            <Stat label={uiText('Succeeded', '成功')} value={(summary.succeeded ?? 0).toLocaleString()} />
            <Stat label={uiText('Failed', '失败')} value={(summary.failed ?? 0).toLocaleString()} />
            <Stat label={uiText('Error rate', '错误率')} value={`${(errorRate(summary) * 100).toFixed(1)}%`} />
            <Stat label={uiText('Peak VUs', '虚拟用户峰值')} value={peakVus(frames, summary).toLocaleString()} />
            <Stat label={uiText('Throughput', '吞吐量')} value={`${throughput(summary).toFixed(1)}/s`} />
            <Stat label="p50" value={`${(summary.p50Millis ?? 0).toFixed(0)} ms`} />
            <Stat label="p95" value={`${(summary.p95Millis ?? 0).toFixed(0)} ms`} />
            <Stat label="p99" value={`${(summary.p99Millis ?? 0).toFixed(0)} ms`} />
            {summary.p999Millis != null && <Stat label="p99.9" value={`${summary.p999Millis.toFixed(0)} ms`} />}
            {summary.droppedIterations != null && <Stat label={uiText('Dropped', '已丢弃')} value={summary.droppedIterations.toLocaleString()} />}
          </Box>
          <ThresholdResultsTable results={summary.thresholdResults} />
          {summary.name && <ReportButtons name={summary.name} onDownload={downloadReport} />}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {uiText('Deeper analysis lives in the', '如需深入分析，请查看')}{' '}
            <Link component="button" type="button" onClick={() => setView('metrics')}>{uiText('Metrics tab', '指标页')}</Link>{' '}
            {uiText('(the', '（')} <code>mock_server_load_*</code> {uiText('series).', '指标）。')}
          </Typography>
        </Paper>
      )}

      {/* Empty state — nothing has run yet in this view */}
      {!running && frames.length === 0 && !summary && (
        <Paper variant="outlined" sx={{ p: 2, mb: 1.5, textAlign: 'center' }} data-testid="load-run-empty">
          <Typography variant="body2" color="text.secondary">
            {uiText('Nothing running yet. Start a scenario from the registry above, or switch to the', '暂无正在运行的场景。可在上方启动已注册的场景，也可以前往')}{' '}
            <Link component="button" type="button" onClick={() => setPanelView('author')}>{uiText('Create / Edit', '创建或编辑')}</Link>{' '}
            {uiText('tab to create one. Live throughput, latency and per-scenario charts appear here while runs are active.', '创建场景。场景运行时，这里会显示实时吞吐量、延迟和各场景的图表。')}
          </Typography>
        </Paper>
      )}

      </>
      ) : (
      <>

      {/* Author form */}
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }} data-testid="load-author-form">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {running ? uiText('Edit / Restart Scenario', '编辑或重启场景') : uiText('Create a Load Scenario', '创建负载场景')}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="outlined" onClick={() => setGenerateSource('openapi')} data-testid="load-generate-openapi-open">
            {uiText('Generate from OpenAPI', '从 OpenAPI 生成')}
          </Button>
          <Button size="small" variant="outlined" onClick={() => setGenerateSource('recording')} data-testid="load-generate-recording-open">
            {uiText('Generate from recording', '从录制记录生成')}
          </Button>
        </Box>

        {/* Scenario-level fields in their own uniform grid (matching ServiceChaosPanel's
            CHAOS_GRID idiom). The profile fields follow as a separate labelled group using
            the same FIELD_GRID so column widths line up across both groups. */}
        <Box sx={FIELD_GRID}>
          <TextField
            label={uiText('Scenario name', '场景名称')} size="small" required value={form.name}
            onChange={setField('name')} fullWidth
          />
          <TextField
            select label={uiText('Template type', '模板类型')} size="small" value={form.templateType}
            onChange={(e) => setForm((p) => ({ ...p, templateType: e.target.value as FormState['templateType'] }))}
            helperText={uiText('Engine for rendering templated step path/body (whole scenario)', '用于渲染场景中各步骤的路径和请求体模板')}
            fullWidth
          >
            <MenuItem value="VELOCITY">Velocity</MenuItem>
            <MenuItem value="MUSTACHE">Mustache</MenuItem>
          </TextField>
          <TextField
            label={uiText('Max requests (optional)', '最大请求数（可选）')} size="small" value={form.maxRequests}
            onChange={setField('maxRequests')} fullWidth placeholder={uiText('unlimited', '不限')}
          />
          <TextField
            label={uiText('Start delay (ms)', '启动延迟（毫秒）')} size="small" value={form.startDelayMillis}
            onChange={setField('startDelayMillis')} fullWidth placeholder={uiText('none', '无')}
            helperText={uiText('Wait this long after Start before driving load', '启动后等待指定时间，再开始发起请求')}
          />
        </Box>

        {/* Profile — EITHER an explicit ordered list of stages OR a single declarative shape. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{uiText('Profile', '负载配置')}</Typography>
          <Tabs
            value={form.profileMode === 'SHAPE' ? 1 : 0}
            onChange={(_, v: number) => setForm((p) => ({ ...p, profileMode: v === 1 ? 'SHAPE' : 'STAGES' }))}
            sx={{ minHeight: 30, '& .MuiTab-root': { minHeight: 30, py: 0.25, fontSize: '0.75rem', minWidth: 0, px: 1.5 } }}
          >
            <Tab label={uiText('Explicit Stages', '手动配置阶段')} data-testid="load-profile-mode-stages" />
            <Tab label={uiText('Named Shape', '预设负载曲线')} data-testid="load-profile-mode-shape" />
          </Tabs>
          {form.profileMode === 'STAGES' && (
            <Button size="small" startIcon={<AddIcon />} onClick={addStage}>{uiText('Add stage', '添加阶段')}</Button>
          )}
        </Box>

        {form.profileMode === 'SHAPE' && (
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1 }} data-testid="load-shape">
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {uiText('A declarative load shape; the server expands it into stages.', '选择负载曲线后，服务器会自动生成各阶段。')}
            </Typography>
            <Box sx={FIELD_GRID}>
              <TextField
                select label={uiText('Shape type', '曲线类型')} size="small" value={form.shape.type}
                onChange={(e) => setShapeValue('type', e.target.value as LoadShapeType)}
                fullWidth data-testid="load-shape-type"
              >
                <MenuItem value="SPIKE">{uiText('Spike', '突增')}</MenuItem>
                <MenuItem value="STAIRS">{uiText('Stairs', '阶梯增长')}</MenuItem>
                <MenuItem value="RAMP_HOLD">{uiText('Ramp & hold', '逐步升高并保持')}</MenuItem>
              </TextField>
              <TextField
                select label={uiText('Drives', '负载驱动方式')} size="small" value={form.shape.metric}
                onChange={(e) => setShapeValue('metric', e.target.value as LoadShapeMetric)}
                helperText={uiText('VU (closed) or arrival rate (open)', '按虚拟用户数（闭环）或到达速率（开环）驱动')} fullWidth
              >
                <MenuItem value="VU">{uiText('VUs', '虚拟用户')}</MenuItem>
                <MenuItem value="RATE">{uiText('Rate (iterations/sec)', '速率（迭代次数/秒）')}</MenuItem>
              </TextField>
              {form.shape.type !== 'STAIRS' && (
                <TextField
                  select label={uiText('Curve', '曲线')} size="small" value={form.shape.curve}
                  onChange={(e) => setShapeValue('curve', e.target.value as RampCurve)}
                  fullWidth
                >
                  <MenuItem value="LINEAR">{uiText('Linear', '线性')}</MenuItem>
                  <MenuItem value="EXPONENTIAL">{uiText('Exponential', '指数')}</MenuItem>
                  <MenuItem value="QUADRATIC">{uiText('Quadratic', '二次曲线')}</MenuItem>
                </TextField>
              )}
              {form.shape.type === 'SPIKE' && (
                <>
                  <TextField label={uiText('Baseline', '基准值')} size="small" value={form.shape.baseline} onChange={setShapeField('baseline')} fullWidth />
                  <TextField label={uiText('Peak', '峰值')} size="small" value={form.shape.peak} onChange={setShapeField('peak')} fullWidth />
                  <TextField label={uiText('Ramp-up (ms)', '升高时长（毫秒）')} size="small" value={form.shape.rampUpMillis} onChange={setShapeField('rampUpMillis')} fullWidth />
                  <TextField label={uiText('Hold at peak (ms)', '峰值保持时长（毫秒）')} size="small" value={form.shape.holdMillis} onChange={setShapeField('holdMillis')} fullWidth />
                  <TextField label={uiText('Ramp-down (ms)', '降低时长（毫秒）')} size="small" value={form.shape.rampDownMillis} onChange={setShapeField('rampDownMillis')} fullWidth />
                  <TextField label={uiText('Recovery hold (ms, optional)', '恢复后的保持时长（毫秒，可选）')} size="small" value={form.shape.recoveryHoldMillis} onChange={setShapeField('recoveryHoldMillis')} fullWidth placeholder={uiText('none', '无')} />
                </>
              )}
              {form.shape.type === 'STAIRS' && (
                <>
                  <TextField label={uiText('Start level', '起始值')} size="small" value={form.shape.start} onChange={setShapeField('start')} fullWidth />
                  <TextField label={uiText('Step rise', '每阶增量')} size="small" value={form.shape.step} onChange={setShapeField('step')} fullWidth />
                  <TextField label={uiText('Number of steps', '阶数')} size="small" value={form.shape.steps} onChange={setShapeField('steps')} fullWidth />
                  <TextField label={uiText('Step duration (ms)', '每阶时长（毫秒）')} size="small" value={form.shape.stepDurationMillis} onChange={setShapeField('stepDurationMillis')} fullWidth />
                </>
              )}
              {form.shape.type === 'RAMP_HOLD' && (
                <>
                  <TextField label={uiText('Target', '目标值')} size="small" value={form.shape.target} onChange={setShapeField('target')} fullWidth />
                  <TextField label={uiText('Ramp (ms)', '逐步变化时长（毫秒）')} size="small" value={form.shape.rampMillis} onChange={setShapeField('rampMillis')} fullWidth />
                  <TextField label={uiText('Hold (ms)', '保持时长（毫秒）')} size="small" value={form.shape.holdMillis} onChange={setShapeField('holdMillis')} fullWidth />
                </>
              )}
            </Box>
          </Box>
        )}

        {form.profileMode === 'STAGES' && form.stages.map((stage, i) => (
          <Box key={stage.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1 }} data-testid={`load-stage-${i}`}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Stage', '阶段')} {i + 1}</Typography>
              <Box sx={{ flex: 1 }} />
              <IconButton size="small" onClick={() => moveStage(i, -1)} aria-label={uiText(`Move stage ${i + 1} up`, `上移第 ${i + 1} 阶段`)} disabled={i === 0}>
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => moveStage(i, 1)} aria-label={uiText(`Move stage ${i + 1} down`, `下移第 ${i + 1} 阶段`)} disabled={i === form.stages.length - 1}>
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => removeStage(i)} aria-label={uiText(`Remove stage ${i + 1}`, `移除第 ${i + 1} 阶段`)} disabled={form.stages.length <= 1}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={FIELD_GRID}>
              <TextField
                select label={uiText('Stage type', '阶段类型')} size="small" value={stage.type}
                onChange={(e) => setStageValue(i, 'type', e.target.value as LoadStageType)}
                fullWidth
              >
                <MenuItem value="VU">{uiText('VU (virtual users)', '虚拟用户数（VU）')}</MenuItem>
                <MenuItem value="RATE">{uiText('Rate (iterations/sec)', '速率（迭代次数/秒）')}</MenuItem>
                <MenuItem value="PAUSE">{uiText('Pause (no load)', '暂停（无负载）')}</MenuItem>
              </TextField>
              {stage.type !== 'PAUSE' && (
                <TextField
                  select label={uiText('Mode', '模式')} size="small" value={stage.mode}
                  onChange={(e) => setStageValue(i, 'mode', e.target.value as StageFormState['mode'])}
                  fullWidth
                >
                  <MenuItem value="HOLD">{uiText('Hold', '保持')}</MenuItem>
                  <MenuItem value="RAMP">{uiText('Ramp', '逐步变化')}</MenuItem>
                </TextField>
              )}
              {stage.type === 'VU' && stage.mode === 'HOLD' && (
                <TextField label={uiText('Virtual users (VUs)', '虚拟用户数（VU）')} size="small" value={stage.vus} onChange={setStageField(i, 'vus')} fullWidth />
              )}
              {stage.type === 'VU' && stage.mode === 'RAMP' && (
                <>
                  <TextField label={uiText('Start VUs', '起始虚拟用户数')} size="small" value={stage.startVus} onChange={setStageField(i, 'startVus')} fullWidth />
                  <TextField label={uiText('End VUs', '结束虚拟用户数')} size="small" value={stage.endVus} onChange={setStageField(i, 'endVus')} fullWidth />
                </>
              )}
              {stage.type === 'RATE' && stage.mode === 'HOLD' && (
                <TextField label={uiText('Rate (iterations/sec)', '速率（迭代次数/秒）')} size="small" value={stage.rate} onChange={setStageField(i, 'rate')} fullWidth />
              )}
              {stage.type === 'RATE' && stage.mode === 'RAMP' && (
                <>
                  <TextField label={uiText('Start rate (iterations/sec)', '起始速率（迭代次数/秒）')} size="small" value={stage.startRate} onChange={setStageField(i, 'startRate')} fullWidth />
                  <TextField label={uiText('End rate (iterations/sec)', '结束速率（迭代次数/秒）')} size="small" value={stage.endRate} onChange={setStageField(i, 'endRate')} fullWidth />
                </>
              )}
              {stage.type === 'RATE' && (
                <TextField label={uiText('Max VUs (optional)', '最大虚拟用户数（可选）')} size="small" value={stage.maxVus} onChange={setStageField(i, 'maxVus')} fullWidth placeholder={uiText('global cap', '全局上限')} />
              )}
              {stage.type !== 'PAUSE' && stage.mode === 'RAMP' && (
                <TextField
                  select label={uiText('Curve', '曲线')} size="small" value={stage.curve}
                  onChange={(e) => setStageValue(i, 'curve', e.target.value as RampCurve)}
                  fullWidth
                >
                  <MenuItem value="LINEAR">{uiText('Linear', '线性')}</MenuItem>
                  <MenuItem value="EXPONENTIAL">{uiText('Exponential', '指数')}</MenuItem>
                  <MenuItem value="QUADRATIC">{uiText('Quadratic', '二次曲线')}</MenuItem>
                </TextField>
              )}
              <TextField label={uiText('Duration (ms)', '持续时间（毫秒）')} size="small" value={stage.durationMillis} onChange={setStageField(i, 'durationMillis')} fullWidth />
            </Box>
          </Box>
        ))}

        {/* Labels */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{uiText('Labels (optional)', '标签（可选）')}</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addLabel}>{uiText('Add label', '添加标签')}</Button>
        </Box>
        {form.labels.map((label, i) => (
          <Box key={label.id} sx={{ display: 'flex', gap: 1, mt: 0.5, mb: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField label={uiText('Key', '键')} size="small" value={label.key} onChange={setLabelField(i, 'key')} sx={responsiveWidth(160)} />
            <TextField label={uiText('Value', '值')} size="small" value={label.value} onChange={setLabelField(i, 'value')} sx={responsiveWidth(160)} />
            <IconButton size="small" onClick={() => removeLabel(i)} aria-label={uiText(`Remove label ${i + 1}`, `移除第 ${i + 1} 个标签`)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}

        {/* Thresholds — in-run pass/fail criteria; run carries a PASS verdict iff all hold. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{uiText('Thresholds (optional)', '阈值（可选）')}</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addThreshold} data-testid="load-add-threshold">{uiText('Add threshold', '添加阈值')}</Button>
        </Box>
        {form.thresholds.map((t, i) => (
          <Box key={t.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }} data-testid={`load-threshold-${i}`}>
            <TextField
              select label={uiText('Metric', '指标')} size="small" value={t.metric}
              onChange={(e) => setThresholdValue(i, 'metric', e.target.value as LoadThresholdMetric)}
              sx={responsiveWidth(180)}
            >
              <MenuItem value="LATENCY_P50">{uiText('Latency p50 (ms)', 'p50 延迟（毫秒）')}</MenuItem>
              <MenuItem value="LATENCY_P95">{uiText('Latency p95 (ms)', 'p95 延迟（毫秒）')}</MenuItem>
              <MenuItem value="LATENCY_P99">{uiText('Latency p99 (ms)', 'p99 延迟（毫秒）')}</MenuItem>
              <MenuItem value="LATENCY_P999">{uiText('Latency p99.9 (ms)', 'p99.9 延迟（毫秒）')}</MenuItem>
              <MenuItem value="ERROR_RATE">{uiText('Error rate (0–1)', '错误率（0–1）')}</MenuItem>
              <MenuItem value="THROUGHPUT_RPS">{uiText('Throughput (req/s)', '吞吐量（请求数/秒）')}</MenuItem>
            </TextField>
            <TextField
              select label={uiText('Comparator', '比较方式')} size="small" value={t.comparator}
              onChange={(e) => setThresholdValue(i, 'comparator', e.target.value as LoadComparator)}
              sx={responsiveWidth(150)}
            >
              <MenuItem value="LESS_THAN">&lt;</MenuItem>
              <MenuItem value="LESS_THAN_OR_EQUAL">≤</MenuItem>
              <MenuItem value="GREATER_THAN">&gt;</MenuItem>
              <MenuItem value="GREATER_THAN_OR_EQUAL">≥</MenuItem>
            </TextField>
            <TextField
              label={uiText('Threshold', '阈值')} size="small" value={t.threshold}
              onChange={(e) => setThresholdValue(i, 'threshold', e.target.value)}
              sx={responsiveWidth(120)}
            />
            <IconButton size="small" onClick={() => removeThreshold(i)} aria-label={uiText(`Remove threshold ${i + 1}`, `移除第 ${i + 1} 个阈值`)}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}
        {form.thresholds.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small" checked={form.abortOnFail}
                  onChange={(e) => setForm((p) => ({ ...p, abortOnFail: e.target.checked }))}
                  data-testid="load-abort-on-fail"
                />
              }
              label={<Typography variant="caption">{uiText('Abort run on a FAIL verdict', '阈值验证失败时中止运行')}</Typography>}
            />
            {form.abortOnFail && (
              <TextField
                label={uiText('Abort grace (ms)', '中止宽限期（毫秒）')} size="small" value={form.abortGraceMillis}
                onChange={setField('abortGraceMillis')} sx={responsiveWidth(160)} placeholder="0"
                helperText={uiText('Ignore breaches for the first N ms', '运行开始后的指定时间内，忽略阈值超限')}
              />
            )}
          </Box>
        )}

        {/* Pacing — adaptive per-VU iteration cycle (closed-model VU loop only). */}
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mt: 1.5, mb: 0.5 }}>{uiText('Pacing (optional)', '执行节奏（可选）')}</Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            select label={uiText('Pacing mode', '节奏模式')} size="small" value={form.pacingMode}
            onChange={(e) => setForm((p) => ({ ...p, pacingMode: e.target.value as LoadPacingMode }))}
            sx={responsiveWidth(220)} data-testid="load-pacing-mode"
          >
            <MenuItem value="NONE">{uiText('None (immediate reschedule)', '无（立即开始下一次迭代）')}</MenuItem>
            <MenuItem value="CONSTANT_PACING">{uiText('Constant pacing (cycle ms)', '固定间隔（周期毫秒数）')}</MenuItem>
            <MenuItem value="CONSTANT_THROUGHPUT">{uiText('Constant throughput (iters/s per VU)', '固定吞吐量（每个虚拟用户的迭代次数/秒）')}</MenuItem>
          </TextField>
          {form.pacingMode !== 'NONE' && (
            <TextField
              label={form.pacingMode === 'CONSTANT_PACING' ? uiText('Cycle (ms)', '周期（毫秒）') : uiText('Iterations/sec per VU', '每个虚拟用户的迭代次数/秒')}
              size="small" value={form.pacingValue} onChange={setField('pacingValue')} sx={responsiveWidth(180)}
            />
          )}
        </Box>

        {/* Feeder — inline parameterized test data exposed per iteration. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small" checked={form.feeder.enabled}
                onChange={(e) => setFeederValue('enabled', e.target.checked)}
                data-testid="load-feeder-enabled"
              />
            }
            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>{uiText('Data feeder (optional)', '测试数据源（可选）')}</Typography>}
          />
        </Box>
        {form.feeder.enabled && (
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1 }} data-testid="load-feeder">
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <TextField
                select label={uiText('Source', '来源')} size="small" value={form.feeder.mode}
                onChange={(e) => setFeederValue('mode', e.target.value as FeederFormState['mode'])}
                sx={responsiveWidth(160)}
              >
                <MenuItem value="ROWS">{uiText('Inline rows', '手动填写数据行')}</MenuItem>
                <MenuItem value="RAW">{uiText('Raw CSV/JSON', '原始 CSV / JSON')}</MenuItem>
              </TextField>
              <TextField
                select label={uiText('Strategy', '取数策略')} size="small" value={form.feeder.strategy}
                onChange={(e) => setFeederValue('strategy', e.target.value as LoadFeederStrategy)}
                sx={responsiveWidth(160)}
              >
                <MenuItem value="CIRCULAR">{uiText('Circular', '循环')}</MenuItem>
                <MenuItem value="RANDOM">{uiText('Random', '随机')}</MenuItem>
                <MenuItem value="SEQUENTIAL">{uiText('Sequential (replay once)', '顺序（只读取一遍）')}</MenuItem>
              </TextField>
              {form.feeder.mode === 'RAW' && (
                <TextField
                  select label={uiText('Format', '格式')} size="small" value={form.feeder.rawFormat}
                  onChange={(e) => setFeederValue('rawFormat', e.target.value as 'CSV' | 'JSON')}
                  sx={responsiveWidth(120)}
                >
                  <MenuItem value="CSV">CSV</MenuItem>
                  <MenuItem value="JSON">JSON</MenuItem>
                </TextField>
              )}
            </Box>
            {form.feeder.mode === 'RAW' ? (
              <TextField
                label={form.feeder.rawFormat === 'CSV' ? uiText('CSV data (first line = header row)', 'CSV 数据（首行为表头）') : uiText('JSON data (array of flat objects)', 'JSON 数据（由平铺对象组成的数组）')}
                size="small" value={form.feeder.rawData} onChange={(e) => setFeederValue('rawData', e.target.value)}
                fullWidth multiline minRows={3}
                slotProps={{ htmlInput: { style: { resize: 'vertical', overflow: 'auto' } } }}
              />
            ) : (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {uiText('One row selected per iteration, exposed as', '每次迭代选择一行数据，可通过以下变量引用')} <code>{'$iteration.data.<column>'}</code>.
                </Typography>
                {form.feeder.rows.map((row, ri) => (
                  <Box key={row.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 0.75, mb: 0.75 }} data-testid={`load-feeder-row-${ri}`}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">{uiText('Row', '行')} {ri + 1}</Typography>
                      <Button size="small" startIcon={<AddIcon />} onClick={() => addFeederCell(ri)}>{uiText('Add column', '添加列')}</Button>
                      <Box sx={{ flex: 1 }} />
                      <IconButton size="small" onClick={() => removeFeederRow(ri)} aria-label={uiText(`Remove feeder row ${ri + 1}`, `移除数据源的第 ${ri + 1} 行`)} disabled={form.feeder.rows.length <= 1}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {row.cells.map((cell, ci) => (
                      <Box key={cell.id} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TextField label={uiText('Column', '列')} size="small" value={cell.key} onChange={setFeederCellField(ri, ci, 'key')} sx={responsiveWidth(160)} />
                        <TextField label={uiText('Value', '值')} size="small" value={cell.value} onChange={setFeederCellField(ri, ci, 'value')} sx={responsiveWidth(180)} />
                        <IconButton size="small" onClick={() => removeFeederCell(ri, ci)} aria-label={uiText(`Remove column ${ci + 1} of feeder row ${ri + 1}`, `移除数据源第 ${ri + 1} 行的第 ${ci + 1} 列`)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                ))}
                <Button size="small" startIcon={<AddIcon />} onClick={addFeederRow}>{uiText('Add row', '添加行')}</Button>
              </>
            )}
          </Box>
        )}

        {/* Steps */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{uiText('Steps', '步骤')}</Typography>
          <TextField
            select label={uiText('Step selection', '步骤选择')} size="small" value={form.stepSelection}
            onChange={(e) => setForm((p) => ({ ...p, stepSelection: e.target.value as LoadStepSelection }))}
            sx={responsiveWidth(220)} data-testid="load-step-selection"
          >
            <MenuItem value="SEQUENTIAL">{uiText('Sequential (all steps in order)', '顺序执行（按顺序运行所有步骤）')}</MenuItem>
            <MenuItem value="WEIGHTED">{uiText('Weighted (one step per iteration)', '按权重选择（每次迭代选一个步骤）')}</MenuItem>
          </TextField>
          <Button size="small" startIcon={<AddIcon />} onClick={addStep}>{uiText('Add step', '添加步骤')}</Button>
        </Box>
        {form.steps.map((step, i) => (
          <Box key={step.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1 }} data-testid={`load-step-${i}`}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">{uiText('Step', '步骤')} {i + 1}</Typography>
              <Box sx={{ flex: 1 }} />
              <IconButton size="small" onClick={() => removeStep(i)} aria-label={uiText(`Remove step ${i + 1}`, `移除第 ${i + 1} 个步骤`)} disabled={form.steps.length <= 1}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
            {/* Step fields on TWO rows so Path gets ample width. Row 1: name, method,
                Path (widest column). Row 2: the remaining four fields in the uniform
                auto-fit FIELD_GRID. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(110px, 0.6fr) minmax(260px, 2.5fr)', gap: 1, alignItems: 'start', mb: 1 }}>
              <TextField label={uiText('Step name (optional)', '步骤名称（可选）')} size="small" value={step.name} onChange={setStepField(i, 'name')} fullWidth />
              <TextField select label={uiText('Method', '请求方法')} size="small" value={step.method}
                onChange={(e) => setForm((p) => ({ ...p, steps: p.steps.map((s, j) => (j === i ? { ...s, method: e.target.value } : s)) }))}
                fullWidth>
                {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
              <TextField label={uiText('Path', '路径')} size="small" value={step.path} onChange={setStepField(i, 'path')} fullWidth />
            </Box>
            <Box sx={FIELD_GRID}>
              <TextField label={uiText('Target host', '目标主机')} size="small" value={step.host} onChange={setStepField(i, 'host')} fullWidth />
              <TextField label={uiText('Target port', '目标端口')} size="small" value={step.port} onChange={setStepField(i, 'port')} fullWidth />
              <TextField select label={uiText('Scheme', '协议')} size="small" value={step.scheme}
                onChange={(e) => setForm((p) => ({ ...p, steps: p.steps.map((s, j) => (j === i ? { ...s, scheme: e.target.value as 'HTTP' | 'HTTPS' } : s)) }))}
                fullWidth>
                <MenuItem value="HTTP">HTTP</MenuItem>
                <MenuItem value="HTTPS">HTTPS</MenuItem>
              </TextField>
              <TextField label={uiText('Delay after step (ms)', '步骤结束后的延迟（毫秒）')} size="small" value={step.thinkTimeMs} onChange={setStepField(i, 'thinkTimeMs')} helperText={uiText('Wait this long after this step\'s request before the next step (a.k.a. think-time)', '本步骤发送请求后，等待指定时间再进入下一步')} fullWidth placeholder={uiText('none', '无')} />
              {form.stepSelection === 'WEIGHTED' && (
                <TextField label={uiText('Weight', '权重')} size="small" value={step.weight} onChange={setStepField(i, 'weight')} fullWidth placeholder="1.0" helperText={uiText('Relative selection weight (> 0)', '相对选择权重（大于 0）')} data-testid={`load-step-weight-${i}`} />
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{uiText('Request headers (optional)', '请求头（可选）')}</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => addStepHeader(i)}>{uiText('Add header', '添加请求头')}</Button>
            </Box>
            {step.headers.map((header, h) => (
              <Box key={header.id} sx={{ display: 'flex', gap: 1, mt: 0.5, mb: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField label={uiText('Header name', '请求头名称')} size="small" value={header.key} onChange={setStepHeaderField(i, h, 'key')} sx={responsiveWidth(180)} />
                <TextField label={uiText('Header value', '请求头值')} size="small" value={header.value} onChange={setStepHeaderField(i, h, 'value')} sx={responsiveWidth(200)} />
                <IconButton size="small" onClick={() => removeStepHeader(i, h)} aria-label={uiText(`Remove header ${h + 1} of step ${i + 1}`, `移除步骤 ${i + 1} 的第 ${h + 1} 个请求头`)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <TextField
              label={uiText('Body (optional, templated)', '请求体（可选，支持模板）')} size="small" value={step.body}
              onChange={setStepField(i, 'body')}
              fullWidth multiline minRows={bodyMinRows(step.body)} sx={{ mt: 1 }}
              slotProps={{ htmlInput: { style: { resize: 'vertical', overflow: 'auto' } } }}
            />
            {/* Captures — extract from this step's response into variables later steps can use. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{uiText('Captures (optional)', '提取变量（可选）')}</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => addStepCapture(i)} data-testid={`load-add-capture-${i}`}>{uiText('Add capture', '添加变量提取')}</Button>
            </Box>
            {step.captures.map((capture, c) => (
              <Box key={capture.id} sx={{ display: 'flex', gap: 1, mt: 0.5, mb: 0.75, alignItems: 'center', flexWrap: 'wrap' }} data-testid={`load-capture-${i}-${c}`}>
                <TextField label={uiText('Variable name', '变量名称')} size="small" value={capture.name} onChange={(e) => setStepCaptureValue(i, c, 'name', e.target.value)} sx={responsiveWidth(150)} />
                <TextField
                  select label={uiText('Source', '来源')} size="small" value={capture.source}
                  onChange={(e) => setStepCaptureValue(i, c, 'source', e.target.value as LoadCaptureSource)}
                  sx={responsiveWidth(160)}
                >
                  <MenuItem value="BODY_JSONPATH">{uiText('Body JSONPath', '响应体 JSONPath')}</MenuItem>
                  <MenuItem value="HEADER">{uiText('Header', '响应头')}</MenuItem>
                  <MenuItem value="BODY_REGEX">{uiText('Body regex', '响应体正则表达式')}</MenuItem>
                </TextField>
                <TextField label={uiText('Expression', '表达式')} size="small" value={capture.expression} onChange={(e) => setStepCaptureValue(i, c, 'expression', e.target.value)} sx={responsiveWidth(180)} />
                <TextField label={uiText('Default (optional)', '默认值（可选）')} size="small" value={capture.defaultValue} onChange={(e) => setStepCaptureValue(i, c, 'defaultValue', e.target.value)} sx={responsiveWidth(140)} placeholder={uiText('unset', '未设置')} />
                <IconButton size="small" onClick={() => removeStepCapture(i, c)} aria-label={uiText(`Remove capture ${c + 1} of step ${i + 1}`, `移除步骤 ${i + 1} 的第 ${c + 1} 个变量提取`)}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
          </Box>
        ))}

        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant="outlined" color="primary" startIcon={<SaveIcon />}
            disabled={busy} onClick={handleLoad}
            data-testid="load-register"
          >
            {uiText('Load', '注册')}
          </Button>
          <Button
            variant="contained" color="primary" startIcon={<PlayArrowIcon />}
            disabled={busy || disabled} onClick={handleLoadAndRun}
            data-testid="load-register-run"
          >
            {uiText('Load & Run', '注册并运行')}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            <strong>{uiText('Load', '注册')}</strong> {uiText('registers without running (allowed even when load generation is off).', '只保存场景，关闭负载生成时也可以使用。')}{' '}
            <strong>{uiText('Load & Run', '注册并运行')}</strong> {uiText('registers then starts it.', '保存并立即启动场景。')}
          </Typography>
        </Box>
      </Paper>

      {/* Generated client code — inline below the form, always rendered from the best-effort
          partial scenario so it grows field-by-field as the user types. */}
      <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }} data-testid="load-codegen">
        {codeError && (
          <Alert severity="info" data-testid="load-code-incomplete" sx={{ mb: 1 }}>
            <AlertTitle>{uiText('Preview updates as you type', '预览随输入实时更新')}</AlertTitle>
            {uiText('Still needed before you can run it:', '运行前还需完成以下设置：')} {codeError}
          </Alert>
        )}
        <LoadScenarioReview scenario={codeScenario} baseUrl={baseUrl} />
      </Paper>

      </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel ?? uiText('Confirm', '确认')}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />

      {generateSource && (
        <GenerateDialog
          source={generateSource}
          connectionParams={connectionParams}
          onClose={() => setGenerateSource(null)}
          onGenerated={onGenerated}
        />
      )}
    </Box>
  );
}

/**
 * Modal that seeds a load scenario from an OpenAPI spec or recorded proxy traffic, then loads the
 * returned scenario into the author form. Both endpoints register the scenario server-side (LOADED,
 * no traffic) and echo it back; on success the parent loads it into the editor for review/tweaking.
 */
function GenerateDialog({
  source,
  connectionParams,
  onClose,
  onGenerated,
}: {
  source: 'openapi' | 'recording';
  connectionParams: ConnectionParams;
  onClose: () => void;
  onGenerated: (scenario: LoadScenarioDTO) => void;
}) {
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [mode, setMode] = useState<GenerateRecordingMode>('VERBATIM');
  const [maxSteps, setMaxSteps] = useState('');
  const [targetHost, setTargetHost] = useState('');
  const [targetPort, setTargetPort] = useState('');
  const [targetScheme, setTargetScheme] = useState<'http' | 'https'>('http');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HumanError | null>(null);

  const buildTarget = () => {
    const host = targetHost.trim();
    const port = num(targetPort);
    if (host === '' && port == null) return undefined;
    return { host: host || undefined, port: port ?? undefined, scheme: targetScheme };
  };

  const submit = () => {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        if (source === 'openapi') {
          const scenario = await generateFromOpenAPI(connectionParams, {
            name: name.trim(),
            specUrlOrPayload: spec,
            target: buildTarget(),
          });
          onGenerated(scenario);
        } else {
          const ms = num(maxSteps);
          const scenario = await generateFromRecording(connectionParams, {
            name: name.trim(),
            mode,
            maxSteps: ms ?? undefined,
            target: buildTarget(),
          });
          onGenerated(scenario);
        }
      } catch (e) {
        setError(humanizeError(e));
      } finally {
        setBusy(false);
      }
    })();
  };

  const title = source === 'openapi'
    ? uiText('Generate from OpenAPI', '从 OpenAPI 生成')
    : uiText('Generate from Recording', '从录制记录生成');
  const canSubmit = name.trim() !== '' && (source === 'recording' || spec.trim() !== '');

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth data-testid="load-generate-dialog">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error && <HumanErrorAlert error={error} onClose={() => setError(null)} sx={{ mb: 1.5 }} />}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 0.5 }}>
          <TextField
            label={uiText('Scenario name', '场景名称')} size="small" required value={name}
            onChange={(e) => setName(e.target.value)} fullWidth autoFocus
            data-testid="load-generate-name"
          />
          {source === 'openapi' ? (
            <TextField
              label={uiText('OpenAPI spec (inline JSON/YAML, URL, or file/classpath)', 'OpenAPI 规范（JSON / YAML 内容、URL 或文件 / 类路径）')} size="small" required
              value={spec} onChange={(e) => setSpec(e.target.value)} fullWidth multiline minRows={4}
              data-testid="load-generate-spec"
              slotProps={{ htmlInput: { style: { resize: 'vertical', overflow: 'auto' } } }}
            />
          ) : (
            <>
              <TextField
                select label={uiText('Mode', '模式')} size="small" value={mode}
                onChange={(e) => setMode(e.target.value as GenerateRecordingMode)} fullWidth
                helperText={uiText('VERBATIM: one step per recorded request. TEMPLATIZED: one per unique route.', '原样：每条已录制请求生成一个步骤。模板化：每条不同的路由生成一个步骤。')}
                data-testid="load-generate-mode"
              >
                <MenuItem value="VERBATIM">{uiText('Verbatim', '原样')}</MenuItem>
                <MenuItem value="TEMPLATIZED">{uiText('Templatized', '模板化')}</MenuItem>
              </TextField>
              {mode === 'VERBATIM' && (
                <TextField
                  label={uiText('Max steps (optional)', '最大步骤数（可选）')} size="small" value={maxSteps}
                  onChange={(e) => setMaxSteps(e.target.value)} fullWidth placeholder={uiText('all recorded requests', '全部已录制请求')}
                />
              )}
            </>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {uiText('Target (optional — overrides the spec/recording routing)', '目标（可选，覆盖规范或录制中的路由）')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField label={uiText('Host', '主机')} size="small" value={targetHost} onChange={(e) => setTargetHost(e.target.value)} sx={responsiveWidth(180)} />
            <TextField label={uiText('Port', '端口')} size="small" value={targetPort} onChange={(e) => setTargetPort(e.target.value)} sx={responsiveWidth(120)} />
            <TextField
              select label={uiText('Scheme', '协议')} size="small" value={targetScheme}
              onChange={(e) => setTargetScheme(e.target.value as 'http' | 'https')} sx={responsiveWidth(120)}
            >
              <MenuItem value="http">http</MenuItem>
              <MenuItem value="https">https</MenuItem>
            </TextField>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{uiText('Cancel', '取消')}</Button>
        <Button variant="contained" onClick={submit} disabled={busy || !canSubmit} data-testid="load-generate-submit">
          {uiText('Generate', '生成')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** MUI Chip colour for each registry lifecycle state. */
function registryStateColor(
  state: LoadScenarioState,
): 'default' | 'success' | 'info' | 'warning' | 'primary' {
  switch (state) {
    case 'RUNNING': return 'success';
    case 'PENDING': return 'primary';
    case 'COMPLETED': return 'info';
    case 'STOPPED': return 'warning';
    case 'LOADED':
    default: return 'default';
  }
}

/** A small label/value stat cell used in the live + summary metric grids. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card elevation={0} sx={{ p: 1, bgcolor: 'action.hover' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
    </Card>
  );
}

const THRESHOLD_METRIC_LABEL: Record<LoadThresholdMetric, string> = {
  LATENCY_P50: 'p50 latency',
  LATENCY_P95: 'p95 latency',
  LATENCY_P99: 'p99 latency',
  LATENCY_P999: 'p99.9 latency',
  ERROR_RATE: 'error rate',
  THROUGHPUT_RPS: 'throughput',
};

const COMPARATOR_SYMBOL: Record<LoadComparator, string> = {
  LESS_THAN: '<',
  LESS_THAN_OR_EQUAL: '≤',
  GREATER_THAN: '>',
  GREATER_THAN_OR_EQUAL: '≥',
};

/** Format a per-run metric value for display (ms for latency, % for error rate, /s for throughput). */
function formatMetricValue(metric: LoadThresholdMetric, value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (metric === 'ERROR_RATE') return `${(value * 100).toFixed(2)}%`;
  if (metric === 'THROUGHPUT_RPS') return `${value.toFixed(1)}/s`;
  return `${value.toFixed(0)} ms`;
}

/**
 * The threshold verdict badge (PASS / FAIL) plus an "aborted early" note when the run was stopped by
 * an abortOnFail breach. Renders nothing when no verdict was computed (the scenario had no thresholds).
 */
function VerdictBadge({ status }: { status: LoadScenarioStatus }) {
  if (!status.verdict) return null;
  return (
    <>
      <Chip
        size="small"
        color={status.verdict === 'PASS' ? 'success' : 'error'}
        label={status.verdict === 'PASS' ? uiText('Thresholds PASS', '阈值验证通过') : uiText('Thresholds FAIL', '阈值验证失败')}
        data-testid="load-verdict"
      />
      {status.abortedByThreshold && (
        <Chip size="small" color="error" variant="outlined" label={uiText('aborted early', '已提前中止')} />
      )}
    </>
  );
}

/** Per-threshold results table behind the verdict. Renders nothing when there are no results. */
function ThresholdResultsTable({ results }: { results?: ThresholdResult[] }) {
  if (!results || results.length === 0) return null;
  return (
    <Box sx={{ mt: 1 }} data-testid="load-threshold-results">
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{uiText('Threshold results', '阈值验证结果')}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', gap: 0.5, mt: 0.5, alignItems: 'center' }}>
        {results.map((r, i) => (
          <Box key={i} sx={{ display: 'contents' }}>
            <Chip
              size="small"
              color={r.satisfied ? 'success' : 'error'}
              variant="outlined"
              label={r.satisfied ? uiText('PASS', '通过') : uiText('FAIL', '失败')}
            />
            <Typography variant="caption">{THRESHOLD_METRIC_LABEL[r.metric]}</Typography>
            <Typography variant="caption" color="text.secondary">
              {COMPARATOR_SYMBOL[r.comparator]} {formatMetricValue(r.metric, r.threshold)}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {uiText('observed', '观测值')} {formatMetricValue(r.metric, r.observed)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Two buttons that download the run's end-of-run report as JSON or JUnit-XML. */
function ReportButtons({ name, onDownload }: { name: string; onDownload: (name: string, format?: 'junit') => void }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
      <Button size="small" variant="outlined" onClick={() => onDownload(name)} data-testid={`load-report-json-${name}`}>
        {uiText('Download report (JSON)', '下载报告（JSON）')}
      </Button>
      <Button size="small" variant="outlined" onClick={() => onDownload(name, 'junit')} data-testid={`load-report-junit-${name}`}>
        {uiText('Download report (JUnit XML)', '下载报告（JUnit XML）')}
      </Button>
    </Box>
  );
}

/** Sum of all stage durations (ms) for a scenario definition; 0 when unknown. */
function totalDurationMillis(definition?: LoadScenarioDTO): number {
  return (definition?.profile?.stages ?? []).reduce((sum, s) => sum + (s.durationMillis ?? 0), 0);
}

/**
 * Determinate run-progress bar: fills with elapsed/total time so you can see how far through the
 * scenario a run is, and is coloured by phase — green while driving load, amber during a PAUSE
 * stage. Replaces the old indeterminate bar, whose constant sweep was distracting. Falls back to an
 * empty bar when the total duration is unknown (e.g. an older server that doesn't echo the
 * definition).
 */
function RunProgressBar({ status, definition }: { status?: LoadScenarioStatus; definition?: LoadScenarioDTO }) {
  const total = totalDurationMillis(definition ?? status?.definition);
  const elapsed = status?.elapsedMillis ?? 0;
  const value = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
  const paused = status?.stageType === 'PAUSE';
  return (
    <LinearProgress
      variant="determinate"
      value={value}
      color={paused ? 'warning' : 'success'}
      aria-label={paused ? uiText('Run paused', '运行已暂停') : uiText('Run progress', '运行进度')}
      sx={{ mb: 1, height: 6, borderRadius: 1 }}
    />
  );
}

/**
 * Compact readout of which staged-profile stage is currently active, e.g. "Stage 2/3 · RATE · target 50/s".
 * Uses the server's `stageIndex`/`stageType`/`currentTarget`; the total stage count comes from the echoed
 * definition when available. Returns '' when the server doesn't report a running stage (older servers).
 */
function stageReadout(status: LoadScenarioStatus): string {
  if (status.stageIndex == null && status.stageType == null) return '';
  const total = status.definition?.profile?.stages?.length;
  const position = status.stageIndex != null
    ? `Stage ${status.stageIndex + 1}${total ? `/${total}` : ''}`
    : 'Stage';
  const parts = [position];
  if (status.stageType) parts.push(status.stageType);
  if (status.currentTarget != null && status.stageType && status.stageType !== 'PAUSE') {
    const target = status.stageType === 'RATE'
      ? `target ${Number(status.currentTarget.toFixed(1))}/s`
      : `target ${Math.round(status.currentTarget)} VUs`;
    parts.push(target);
  }
  return parts.join(' · ');
}

/** Peak active VUs observed across samples, falling back to the final status. */
function peakVus(frames: Frame[], status: LoadScenarioStatus): number {
  const name = status.name ?? '';
  const fromFrames = frames.reduce((m, f) => Math.max(m, f.tracks[name]?.currentVus ?? 0), 0);
  return Math.max(fromFrames, status.currentVus ?? 0);
}

/** Overall throughput (req/s) = requestsSent / elapsed seconds. */
function throughput(status: LoadScenarioStatus): number {
  const sent = status.requestsSent ?? 0;
  const seconds = (status.elapsedMillis ?? 0) / 1000;
  if (seconds <= 0) return 0;
  return sent / seconds;
}

import MuiAppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Box from '@mui/material/Box';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SettingsIcon from '@mui/icons-material/Settings';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import RuleIcon from '@mui/icons-material/Rule';
import ClockDialog from './ClockDialog';
import ConfigurationDialog from './ConfigurationDialog';
import ExplainUnmatchedDialog from './ExplainUnmatchedDialog';
import MatcherPlaygroundDialog from './MatcherPlaygroundDialog';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import LayersClearIcon from '@mui/icons-material/LayersClear';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TrafficIcon from '@mui/icons-material/Traffic';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import PostAddIcon from '@mui/icons-material/PostAdd';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SpeedIcon from '@mui/icons-material/Speed';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import BoltIcon from '@mui/icons-material/Bolt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import VerifiedIcon from '@mui/icons-material/Verified';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import PanToolIcon from '@mui/icons-material/PanTool';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RpcIcon from '@mui/icons-material/Cable';
import SchemaIcon from '@mui/icons-material/Schema';
import HistoryIcon from '@mui/icons-material/History';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import TabIcon from '@mui/icons-material/Tab';
import type { ReactNode } from 'react';
// Snackbar/Alert removed — mode errors now use the app-wide notification store
import BuildIcon from '@mui/icons-material/Build';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import { useState, useEffect, useCallback } from 'react';
import { useDashboardStore, type ViewMode } from '../store';
import type { ConnectionStatus } from '../types';
import { useConnectionParams } from '../hooks/useConnectionParams';
import { usePolling } from '../hooks/usePolling';
import {
  fetchMode,
  setMode as setServerMode,
  MOCK_SERVER_MODES,
  MODE_DESCRIPTIONS,
  type MockServerMode,
} from '../lib/mockServerMode';
import { fetchHttp3Status, type Http3Status } from '../lib/http3Status';
import { humanizeError } from '../lib/errorMessage';
import WsdlImportDialog from './WsdlImportDialog';
import GraphqlImportDialog from './GraphqlImportDialog';
import OpenApiImportDialog from './OpenApiImportDialog';
import PactExportDialog from './PactExportDialog';
import OidcDialog from './OidcDialog';
import SamlDialog from './SamlDialog';
import ScimDialog from './ScimDialog';
import AsyncApiDialog from './AsyncApiDialog';
import CrudDialog from './CrudDialog';
import FileStoreDialog from './FileStoreDialog';
import DiffRequestsDialog from './DiffRequestsDialog';
import ConfirmDialog from './ConfirmDialog';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import HubIcon from '@mui/icons-material/Hub';
import StorageIcon from '@mui/icons-material/Storage';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Divider from '@mui/material/Divider';
import BaselineCompareDialog from './BaselineCompareDialog';
import { CLEAR_LOGS_CONFIRM_LABEL, CLEAR_LOGS_CONFIRM_MESSAGE, CLEAR_LOGS_CONFIRM_TITLE, CLEAR_LOGS_MENU_LABEL } from '../lib/clearServerText';
import { uiText } from '../lib/dashboardLocale';

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: uiText('connected', '已连接'),
  connecting: uiText('connecting', '连接中'),
  disconnected: uiText('disconnected', '未连接'),
  error: uiText('error', '连接错误'),
};

const MODE_LABELS: Record<MockServerMode, string> = {
  SIMULATE: uiText('SIMULATE', 'SIMULATE · 规则模拟'),
  SPY: uiText('SPY', 'SPY · 未命中时转发'),
  CAPTURE: uiText('CAPTURE', 'CAPTURE · 代理录制'),
};

const MODE_TOOLTIPS: Record<MockServerMode, string> = {
  SIMULATE: uiText(MODE_DESCRIPTIONS.SIMULATE, '按规则匹配请求，未匹配时返回 404'),
  SPY: uiText(MODE_DESCRIPTIONS.SPY, '按规则匹配请求，转发并记录未匹配的请求'),
  CAPTURE: uiText(MODE_DESCRIPTIONS.CAPTURE, '命中规则时按规则处理，未命中时转发并记录。无规则时，可录制所有可代理的请求。'),
};

function statusColor(status: ConnectionStatus): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'connected':
      return 'success';
    case 'connecting':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'default';
  }
}

/**
 * MUI's default outlined-chip colours (`success.main`, `error.main`, …) are
 * dark enough to disappear against the primary-coloured AppBar background in
 * light mode. Override with pale tints of the same hue in light mode only;
 * in dark mode the defaults already contrast against the deep-blue bar so we
 * leave them alone.
 */
function statusChipPaletteSx(themeMode: 'light' | 'dark', status: ConnectionStatus): Record<string, unknown> {
  if (themeMode === 'dark') return {};
  const tints: Record<ConnectionStatus, string> = {
    // Each tint keeps at least 4.5:1 against the light primary bar.
    connected: '#ccffd8',    // pale green
    connecting: '#fff0d6',   // pale amber
    error: '#ffe3e6',        // pale red
    disconnected: 'rgba(255,255,255,0.9)',
  };
  const tint = tints[status] ?? 'rgba(255,255,255,0.9)';
  return {
    color: tint,
    borderColor: tint,
    '& .MuiChip-label': { color: tint },
  };
}

interface NavTab {
  value: ViewMode;
  label: string;
  ariaLabel: string;
  /**
   * One-line summary of what the tab is for, shown in a bar under the nav.
   * Optional — tabs that omit it (e.g. Get Started, which is self-explanatory)
   * render no description bar.
   */
  description?: string;
  icon: ReactNode;
}

// A labelled group of related views. The nav renders one top-level group button
// per entry; clicking it opens a dropdown Menu of that group's views. Grouping
// the views into a handful of intuitive categories makes the full nav
// discoverable at a glance instead of hiding most views behind a flat "More"
// overflow. Every ViewMode appears in at least one group (asserted by a test);
// a view may deliberately appear in more than one — the Trace view (`sessions`)
// is listed under both Observe and AI — in which case every owning group's
// button highlights when it is active.
interface NavGroup {
  /** Stable id used for keys, aria, and active-group lookup. */
  id: string;
  /** Top-level group button label. */
  label: string;
  ariaLabel: string;
  /** Icon shown on the group button (typically the group's leading view icon). */
  icon: ReactNode;
  tabs: NavTab[];
}

const tabIconSx = { fontSize: '0.875rem', mr: 0.5 } as const;

// Single source of truth for the navigation, organised into intuitive groups.
// The order of groups (and of tabs within each group) is the order shown.
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'mock',
    label: 'Mock',
    ariaLabel: uiText('Mock views', 'Mock 功能'),
    icon: <PostAddIcon sx={tabIconSx} />,
    tabs: [
      { value: 'get-started', label: uiText('Get Started', '快速入门'), ariaLabel: uiText('Get started view', '快速入门页面'), icon: <RocketLaunchIcon sx={tabIconSx} /> },
      { value: 'composer', label: uiText('Mocks', 'Mock 规则'), ariaLabel: uiText('Mocks view', 'Mock 规则页面'), description: uiText('Create, edit, and manage mock expectations — quick mode for common cases, advanced mode for full control.', '创建、编辑和管理 Mock 规则。常见场景可用快速模式，复杂规则可用高级模式。'), icon: <PostAddIcon sx={tabIconSx} /> },
      { value: 'scenarios', label: uiText('Scenarios', '场景'), ariaLabel: uiText('Scenarios view', '场景页面'), description: uiText('Manage scenario states and transitions — drive stateful, multi-step mock flows through a state machine.', '管理场景状态和状态转换，用状态机模拟有状态的多步骤流程。'), icon: <SchemaIcon sx={tabIconSx} /> },
      { value: 'grpc', label: 'gRPC', ariaLabel: uiText('gRPC services view', 'gRPC 服务页面'), description: uiText('Mock gRPC services and inspect gRPC calls.', '模拟 gRPC 服务并查看 gRPC 调用。'), icon: <RpcIcon sx={tabIconSx} /> },
      { value: 'async', label: uiText('Async', '异步消息'), ariaLabel: uiText('AsyncAPI broker mock view', 'AsyncAPI 消息代理模拟页面'), description: uiText('Mock event-driven APIs from an AsyncAPI spec — publish test messages to Kafka, MQTT, and AMQP (RabbitMQ) brokers.', '根据 AsyncAPI 规范模拟事件驱动的 API，向 Kafka、MQTT 和 AMQP（RabbitMQ）消息代理发布测试消息。'), icon: <HubIcon sx={tabIconSx} /> },
    ],
  },
  {
    id: 'observe',
    label: uiText('Observe', '观测'),
    ariaLabel: uiText('Observe views', '观测功能'),
    icon: <DashboardIcon sx={tabIconSx} />,
    tabs: [
      { value: 'dashboard', label: uiText('Dashboard', '运行面板'), ariaLabel: uiText('Dashboard view', '运行面板页面'), description: uiText('Live view of incoming requests, active expectations, and what matched.', '实时查看接收的请求、生效规则和请求匹配结果。'), icon: <DashboardIcon sx={tabIconSx} /> },
      { value: 'traffic', label: uiText('Traffic', '请求记录'), ariaLabel: uiText('Traffic inspector view', '请求记录页面'), description: uiText('Browse recorded request and response traffic — select an item to open its full details.', '浏览已记录的请求和响应，点击任意一项查看完整详情。'), icon: <TrafficIcon sx={tabIconSx} /> },
      { value: 'sessions', label: uiText('Trace', '调用链'), ariaLabel: uiText('Trace inspector view', '调用链页面'), description: uiText('Trace related requests grouped together — including LLM agent runs — to debug multi-step flows end to end.', '按关联请求查看完整调用链，包括 LLM 智能体的运行过程，便于排查多步骤流程。'), icon: <AccountTreeIcon sx={tabIconSx} /> },
      { value: 'metrics', label: uiText('Metrics', '指标'), ariaLabel: uiText('Metrics view', '指标页面'), description: uiText('Prometheus metrics plus memory and performance monitoring.', '查看 Prometheus 指标，监控内存和性能。'), icon: <SpeedIcon sx={tabIconSx} /> },
    ],
  },
  {
    id: 'verify',
    label: uiText('Verify', '验证'),
    ariaLabel: uiText('Verify views', '验证功能'),
    icon: <FactCheckIcon sx={tabIconSx} />,
    tabs: [
      { value: 'verification', label: uiText('Verify', '请求与响应验证'), ariaLabel: uiText('Verification view', '请求与响应验证页面'), description: uiText('Assert which requests were — or were not — received.', '检查已记录的请求或响应是否符合预期的次数或顺序。'), icon: <PlaylistAddCheckIcon sx={tabIconSx} /> },
      { value: 'contract', label: uiText('Contract', '契约测试'), ariaLabel: uiText('Contract test view', '契约测试页面'), description: uiText('Validate mocks and traffic against an OpenAPI contract.', '按 OpenAPI 契约校验 Mock 规则和请求流量。'), icon: <FactCheckIcon sx={tabIconSx} /> },
      { value: 'slo', label: 'SLO', ariaLabel: uiText('SLO verification view', 'SLO 验证页面'), description: uiText('Assert service-level objectives — latency percentiles and error rate — against recorded traffic.', '根据已记录的流量，验证延迟分位数和错误率是否达到服务等级目标。'), icon: <VerifiedIcon sx={tabIconSx} /> },
      { value: 'drift', label: uiText('Drift', '差异检测'), ariaLabel: uiText('Drift detection view', '差异检测页面'), description: uiText('Detect when your mocks drift away from the real API they stand in for.', '检测 Mock 规则与所模拟的真实 API 之间的差异。'), icon: <CompareArrowsIcon sx={tabIconSx} /> },
    ],
  },
  {
    id: 'resilience',
    label: uiText('Resilience', '可靠性测试'),
    ariaLabel: uiText('Resilience views', '可靠性测试功能'),
    icon: <BoltIcon sx={tabIconSx} />,
    tabs: [
      { value: 'chaos', label: uiText('Chaos', '故障注入'), ariaLabel: uiText('Service chaos view', '故障注入页面'), description: uiText('Inject latency, errors, and faults to test how your system handles failure.', '注入延迟、错误和故障，测试系统的故障处理能力。'), icon: <BoltIcon sx={tabIconSx} /> },
      { value: 'performance', label: uiText('Performance', '性能测试'), ariaLabel: uiText('Performance testing view', '性能测试页面'), description: uiText('Create, run, and monitor load scenarios — drive traffic at a target and watch live throughput and latency.', '创建、运行和监控负载场景，向目标发送流量并实时查看吞吐量和延迟。'), icon: <TrendingUpIcon sx={tabIconSx} /> },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    ariaLabel: uiText('AI views', 'AI 功能'),
    icon: <AutoAwesomeIcon sx={tabIconSx} />,
    tabs: [
      { value: 'optimise', label: uiText('LLM Optimise', 'LLM 优化'), ariaLabel: uiText('LLM Optimise view', 'LLM 优化页面'), description: uiText('Analyse captured LLM traffic to optimise prompts, inference cost, safety, and speed.', '分析捕获的 LLM 流量，优化提示词、推理成本、安全性和速度。'), icon: <AutoAwesomeIcon sx={tabIconSx} /> },
      { value: 'mcp-health', label: uiText('MCP Health', 'MCP 健康状态'), ariaLabel: uiText('MCP server health view', 'MCP 服务健康状态页面'), description: uiText('See which MCP servers your proxied tools call are slow or erroring — the MCP server is often the real bottleneck behind a slow coding assistant.', '查看代理工具调用的 MCP 服务中有哪些响应缓慢或出错，帮助定位编程助手的性能瓶颈。'), icon: <MonitorHeartIcon sx={tabIconSx} /> },
      { value: 'sessions', label: uiText('Trace', '调用链'), ariaLabel: uiText('Trace inspector view', '调用链页面'), description: uiText('Trace related requests grouped together — including LLM agent runs — to debug multi-step flows end to end.', '按关联请求查看完整调用链，包括 LLM 智能体的运行过程，便于排查多步骤流程。'), icon: <AccountTreeIcon sx={tabIconSx} /> },
    ],
  },
  {
    id: 'inspect',
    label: uiText('Inspect', '诊断'),
    ariaLabel: uiText('Inspect views', '诊断功能'),
    icon: <PanToolIcon sx={tabIconSx} />,
    tabs: [
      { value: 'breakpoints', label: uiText('Breakpoints', '断点'), ariaLabel: uiText('Breakpoints view', '断点页面'), description: uiText('Pause matching requests or responses mid-flight to inspect and edit them.', '暂停符合条件的请求或响应，查看和修改其内容。'), icon: <PanToolIcon sx={tabIconSx} /> },
      { value: 'audit', label: uiText('Audit', '审计日志'), ariaLabel: uiText('Audit trail view', '审计日志页面'), description: uiText('Review recent control-plane changes — a chronological trail of mutations to expectations, configuration, and server state.', '按时间顺序查看最近的管理操作，包括规则、配置和服务器状态的变更。'), icon: <HistoryIcon sx={tabIconSx} /> },
      { value: 'library', label: uiText('Library', '资源库'), ariaLabel: uiText('Library of captured content', '已捕获内容的资源库'), description: uiText('Browse and reuse captured requests, responses, and content.', '浏览并复用捕获的请求、响应和其他内容。'), icon: <Inventory2Icon sx={tabIconSx} /> },
      { value: 'cluster', label: uiText('Cluster', '集群'), ariaLabel: uiText('Cluster status view', '集群状态页面'), description: uiText('Monitor MockServer cluster nodes and shared state.', '监控 MockServer 集群节点和共享状态。'), icon: <HubOutlinedIcon sx={tabIconSx} /> },
    ],
  },
];

// Flat list of every tab, derived from the groups — used for label lookup and
// to build the description map. Keeping it derived guarantees it never drifts
// from the grouped source of truth.
const NAV_TABS: NavTab[] = NAV_GROUPS.flatMap((g) => g.tabs);

// Compile-time exhaustiveness guard. This `Record<ViewMode, string>` must name
// every ViewMode at least once — TypeScript errors if a value is added to the
// ViewMode union without an entry here. The build of NAV_TABS above guarantees
// each of these values is grouped, so the missing-key error effectively means
// "a new view was added without being placed in a NAV_GROUPS group". (A runtime
// assertion below also proves every listed view is actually rendered.) The map
// is used only for this existence check; for a view that appears in more than
// one group the reduce keeps the last group id, so do NOT use it to decide
// "the owning group" — use `groupsForView` (membership), which returns all of
// them.
const NAV_VIEW_GROUP_ID: Record<ViewMode, string> = NAV_GROUPS.reduce<Record<string, string>>(
  (acc, group) => {
    for (const tab of group.tabs) acc[tab.value] = group.id;
    return acc;
  },
  {},
) as Record<ViewMode, string>;
// Fail fast at module load if a ViewMode is missing a group (defence in depth
// behind the type — also catches a hand-edited NAV_GROUPS that drops a value).
{
  const ALL_VIEW_MODES: Record<ViewMode, true> = {
    'get-started': true, dashboard: true, traffic: true, sessions: true,
    composer: true, library: true, chaos: true, performance: true,
    metrics: true, drift: true, verification: true, slo: true, async: true,
    grpc: true, breakpoints: true, contract: true, cluster: true, optimise: true,
    'mcp-health': true, scenarios: true, audit: true,
  };
  for (const v of Object.keys(ALL_VIEW_MODES) as ViewMode[]) {
    if (!(v in NAV_VIEW_GROUP_ID)) {
      throw new Error(`Navigation misconfiguration: ViewMode "${v}" is not in any NAV_GROUPS group`);
    }
  }
}

// The groups a given view belongs to, for active-group highlighting. A view may
// live in more than one group (e.g. Trace under both Observe and AI), so every
// owning group is returned and each highlights when the view is active.
function groupsForView(view: ViewMode): NavGroup[] {
  return NAV_GROUPS.filter((g) => g.tabs.some((t) => t.value === view));
}

// Lookup of the active view's one-line description, for the bar under the nav.
// Exported so App can render it without duplicating the per-tab copy.
export const NAV_TAB_DESCRIPTIONS: Partial<Record<ViewMode, string>> = Object.fromEntries(
  NAV_TABS
    .filter((t): t is NavTab & { description: string } => Boolean(t.description))
    .map((t) => [t.value, t.description]),
);

interface AppBarProps {
  onClearServer: () => Promise<void>;
  onClearLogs: () => Promise<void>;
  onClearExpectations: () => Promise<void>;
  /** Open the app-owned keyboard-shortcuts help dialog (shared with the `?` shortcut). */
  onShowShortcuts: () => void;
}

export default function AppBar({ onClearServer, onClearLogs, onClearExpectations, onShowShortcuts }: AppBarProps) {
  const connectionStatus = useDashboardStore((s) => s.connectionStatus);
  const themeMode = useDashboardStore((s) => s.themeMode);
  const toggleTheme = useDashboardStore((s) => s.toggleThemeMode);
  const autoScroll = useDashboardStore((s) => s.autoScroll);
  const toggleAutoScroll = useDashboardStore((s) => s.toggleAutoScroll);
  const autoScrollAction = autoScroll
    ? uiText('Stop following new entries', '暂停所有列表的自动滚动')
    : uiText('Follow new entries', '恢复所有列表的自动滚动');
  const view = useDashboardStore((s) => s.view);
  const setView = useDashboardStore((s) => s.setView);
  const addWorkspace = useDashboardStore((s) => s.addWorkspace);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const theme = useTheme();
  // Below this width the grouped group-button bar would crowd the toolbar, so
  // collapse the whole nav into a single "hamburger" Menu (with grouped
  // sections) instead.
  const compactNav = useMediaQuery(theme.breakpoints.down('lg'));
  const [navAnchorEl, setNavAnchorEl] = useState<null | HTMLElement>(null);
  // Wide-screen grouped nav: the group whose dropdown is currently open (by id),
  // and the element it anchors to. Only one group menu is open at a time.
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [groupMenuAnchorEl, setGroupMenuAnchorEl] = useState<null | HTMLElement>(null);

  // The groups that own the active view — each of their group buttons is
  // highlighted (a view may belong to more than one group, e.g. Trace).
  const activeGroupIds = new Set(groupsForView(view).map((g) => g.id));

  const connectionParams = useConnectionParams();
  // Human-readable server location for the connection-status chip tooltip, so the
  // chip finally says WHERE it is connected (host:port), not just "connected".
  const serverUrl = `${connectionParams.secure ? 'https' : 'http'}://${connectionParams.host}:${connectionParams.port}${connectionParams.basePath ?? ''}`;
  const [mode, setModeState] = useState<MockServerMode | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modeTooltipOpen, setModeTooltipOpen] = useState(false);
  const [toolsAnchorEl, setToolsAnchorEl] = useState<null | HTMLElement>(null);
  const [clockOpen, setClockOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [oidcOpen, setOidcOpen] = useState(false);
  const [samlOpen, setSamlOpen] = useState(false);
  const [scimOpen, setScimOpen] = useState(false);
  const [asyncApiOpen, setAsyncApiOpen] = useState(false);
  const [wsdlOpen, setWsdlOpen] = useState(false);
  const [graphqlOpen, setGraphqlOpen] = useState(false);
  const [openApiOpen, setOpenApiOpen] = useState(false);
  const [pactOpen, setPactOpen] = useState(false);
  const [crudOpen, setCrudOpen] = useState(false);
  const [fileStoreOpen, setFileStoreOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);
  // Mode errors are now surfaced through the app-wide notification store.
  const setNotification = useDashboardStore((s) => s.setNotification);
  // Confirmation for destructive actions (reset / bulk clear). Holds the pending action.
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchMode(connectionParams, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setModeState(r.mode);
      })
      .catch(() => {
        /* mode endpoint unavailable (older server) — hide the control */
      });
    return () => controller.abort();
  }, [connectionParams]);

  // Poll the HTTP/3 status every 5s so the active-connection count stays fresh.
  // usePolling self-reschedules (no overlapping fetches), pauses while the tab is
  // hidden, and aborts in-flight requests on unmount — important because the AppBar
  // mounts on every view. A rejected fetch (older server, or H3 not compiled in)
  // leaves `data` null so the chip stays hidden; the error is intentionally ignored.
  const fetchHttp3 = useCallback(
    (signal: AbortSignal) => fetchHttp3Status(connectionParams, signal),
    [connectionParams],
  );
  const { data: http3Status } = usePolling<Http3Status>({ fetcher: fetchHttp3, intervalMs: 5000 });

  const handleModeChange = (event: SelectChangeEvent) => {
    const next = event.target.value as MockServerMode;
    const previous = mode;
    setModeState(next);
    void setServerMode(connectionParams, next)
      .then((r) => {
        setModeState(r.mode);
        setNotification({ message: uiText(`Operating mode set to ${r.mode}`, `运行模式已切换为${MODE_LABELS[r.mode]}`), severity: 'success' });
      })
      .catch((e) => {
        setModeState(previous); // revert on failure
        setNotification({ message: humanizeError(e).message, severity: 'error' });
      });
  };

  // Open a group's dropdown menu, anchored to its group button.
  const handleOpenGroup = (groupId: string, anchor: HTMLElement) => {
    setOpenGroupId(groupId);
    setGroupMenuAnchorEl(anchor);
  };
  const handleCloseGroupMenu = () => {
    setOpenGroupId(null);
    setGroupMenuAnchorEl(null);
  };
  // Select a view (preserves the store setView path: view persistence + URL hash)
  // and close any open menu.
  const handleSelectView = (value: ViewMode) => {
    setView(value);
    handleCloseGroupMenu();
    setNavAnchorEl(null);
  };

  // Base styling for a top-level group button. Light mode forces white text +
  // translucent border so it reads against the primary-coloured AppBar; dark
  // mode keeps MUI defaults which already contrast against the bar. The active
  // group (the one owning the current view) gets a theme-appropriate highlight:
  // a pale-white tint in light mode (matching the old ToggleButton `.Mui-selected`
  // styling) and the theme's translucent action-selected overlay in dark mode,
  // so selected nav reads consistently with other selected controls in each theme.
  const groupButtonSx = (active: boolean) => {
    // Light mode darkens the bar under the active group: a white tint lowered
    // the white label below 4.5:1 contrast.
    const activeBg = themeMode === 'light'
      ? 'rgba(0, 0, 0, 0.22)'
      : theme.palette.action.selected;
    return {
      ml: 0.5,
      py: 0.25,
      px: 1,
      fontSize: '0.7rem',
      textTransform: 'none' as const,
      lineHeight: 1.4,
      whiteSpace: 'nowrap' as const,
      flexShrink: 0,
      color: 'inherit',
      ...(themeMode === 'light' ? { borderColor: 'rgba(255, 255, 255, 0.3)' } : {}),
      '&:hover': {
        backgroundColor: themeMode === 'light'
          ? 'rgba(255, 255, 255, 0.08)'
          : theme.palette.action.hover,
      },
      ...(active ? { backgroundColor: activeBg } : {}),
    };
  };

  return (
    <MuiAppBar position="static" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ gap: 1, minHeight: 36, flexWrap: 'wrap', rowGap: 0.5, py: 0.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
          MockServer
        </Typography>
        <Tooltip title={uiText(`MockServer at ${serverUrl}`, `MockServer 地址 ${serverUrl}`)}>
          <Chip
            data-testid="connection-status"
            data-status={connectionStatus}
            label={STATUS_LABELS[connectionStatus]}
            size="small"
            color={statusColor(connectionStatus)}
            variant="outlined"
            sx={{
              textTransform: 'capitalize',
              ...statusChipPaletteSx(themeMode, connectionStatus),
            }}
          />
        </Tooltip>
        {http3Status?.enabled && (
          <Tooltip title={uiText(`HTTP/3 (QUIC) on UDP port ${http3Status.port} -- ${http3Status.activeConnections} active connection${http3Status.activeConnections === 1 ? '' : 's'}`, `HTTP/3（QUIC）使用 UDP 端口 ${http3Status.port}，当前有 ${http3Status.activeConnections} 个活跃连接`)}>
            <Chip
              label={`H3 :${http3Status.port} (${http3Status.activeConnections})`}
              size="small"
              color="info"
              variant="outlined"
              sx={{
                fontSize: '0.7rem',
                ...(themeMode === 'light' ? {
                  color: 'rgba(255,255,255,0.9)',
                  borderColor: 'rgba(255,255,255,0.4)',
                  '& .MuiChip-label': { color: 'rgba(255,255,255,0.9)' },
                } : {}),
              }}
            />
          </Tooltip>
        )}
        {compactNav ? (
          <>
            <Tooltip title={uiText('Navigate', '导航')}>
              <IconButton
                size="small"
                color="inherit"
                aria-label={uiText('Open navigation menu', '打开导航菜单')}
                onClick={(e) => setNavAnchorEl(e.currentTarget)}
                sx={{ ml: 1 }}
              >
                <MenuIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
              {NAV_TABS.find((t) => t.value === view)?.label ?? ''}
            </Typography>
            {/* Single hamburger Menu containing every view, organised into
                labelled group sections so the full nav stays discoverable on
                narrow screens. */}
            <Menu
              anchorEl={navAnchorEl}
              open={Boolean(navAnchorEl)}
              onClose={() => setNavAnchorEl(null)}
            >
              {NAV_GROUPS.flatMap((group, groupIndex) => [
                groupIndex > 0 ? <Divider key={`${group.id}-divider`} /> : null,
                <ListSubheader key={`${group.id}-heading`} disableSticky sx={{ lineHeight: '2em', bgcolor: 'transparent' }}>
                  {group.label}
                </ListSubheader>,
                ...group.tabs.map((tab) => (
                  <MenuItem
                    key={`${group.id}-${tab.value}`}
                    selected={view === tab.value}
                    aria-current={view === tab.value ? 'page' : undefined}
                    aria-label={tab.ariaLabel}
                    onClick={() => handleSelectView(tab.value)}
                  >
                    <ListItemIcon>{tab.icon}</ListItemIcon>
                    <ListItemText>{tab.label}</ListItemText>
                  </MenuItem>
                )),
              ])}
            </Menu>
          </>
        ) : (
          <Box
            sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
          >
            {/* One top-level button per group; each opens a dropdown of its
                views. The active view's group button is highlighted so the
                current location is always indicated. */}
            {NAV_GROUPS.map((group) => {
              const isActiveGroup = activeGroupIds.has(group.id);
              const isOpen = openGroupId === group.id;
              return (
                <Button
                  key={group.id}
                  size="small"
                  color="inherit"
                  aria-label={group.ariaLabel}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  aria-current={isActiveGroup ? 'true' : undefined}
                  endIcon={<ExpandMoreIcon sx={{ fontSize: '0.875rem' }} />}
                  onClick={(e) => handleOpenGroup(group.id, e.currentTarget)}
                  sx={groupButtonSx(isActiveGroup)}
                >
                  {group.icon}
                  {group.label}
                </Button>
              );
            })}
            {/* Dropdown for whichever group button was clicked. Anchored to that
                button; one menu reused across all groups. */}
            <Menu
              anchorEl={groupMenuAnchorEl}
              open={Boolean(groupMenuAnchorEl) && openGroupId !== null}
              onClose={handleCloseGroupMenu}
            >
              {(NAV_GROUPS.find((g) => g.id === openGroupId)?.tabs ?? []).map((tab) => (
                <MenuItem
                  key={tab.value}
                  selected={view === tab.value}
                  aria-current={view === tab.value ? 'page' : undefined}
                  aria-label={tab.ariaLabel}
                  onClick={() => handleSelectView(tab.value)}
                >
                  <ListItemIcon>{tab.icon}</ListItemIcon>
                  <ListItemText>{tab.label}</ListItemText>
                </MenuItem>
              ))}
            </Menu>
          </Box>
        )}
        <Box sx={{ flex: compactNav ? 1 : '0 0 auto' }} />
        {/* The ONLY workspace control in the app bar: a single icon in the fixed
            utility cluster, deliberately not a labelled tab in the flexible nav
            region (that is what crowded the bar in the reverted d536433f1). Every
            other workspace affordance — switching, closing, renaming — lives in
            the WorkspaceTabBar row below, which only appears once a second
            workspace exists. */}
        <Tooltip title={uiText('New workspace — an independent view and set of search filters', '新建工作区，单独保存当前视图和筛选条件')}>
          <IconButton
            size="small"
            color="inherit"
            onClick={addWorkspace}
            aria-label={uiText('New workspace', '新建工作区')}
          >
            <TabIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={uiText('Keyboard shortcuts', '键盘快捷键')}>
          <IconButton size="small" color="inherit" onClick={onShowShortcuts} aria-label={uiText('Keyboard shortcuts', '键盘快捷键')}>
            <KeyboardIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={uiText('Server clock (freeze / advance time)', '服务器时钟（冻结或推进时间）')}>
          <IconButton size="small" color="inherit" onClick={() => setClockOpen(true)} aria-label={uiText('Server clock', '服务器时钟')}>
            <AccessTimeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={uiText('Explain unmatched requests', '分析未匹配的请求')}>
          <IconButton size="small" color="inherit" onClick={() => setExplainOpen(true)} aria-label={uiText('Explain unmatched requests', '分析未匹配的请求')}>
            <TroubleshootIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={uiText('Matcher test playground — try a request against a candidate expectation', '预览规则匹配，检查示例请求能否命中指定规则')}>
          <IconButton size="small" color="inherit" onClick={() => setPlaygroundOpen(true)} aria-label={uiText('Matcher test playground', '预览规则匹配')}>
            <RuleIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={uiText('Server configuration', '服务器配置')}>
          <IconButton size="small" color="inherit" onClick={() => setConfigOpen(true)} aria-label={uiText('Server configuration', '服务器配置')}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {/* Master switch over every panel's Follow control. The panels run in
            console order and each owns whether it follows the newest entry, but
            "stop everything moving" should not be four separate clicks. Toggling
            this re-syncs them all; a panel may diverge again afterwards. */}
        <Tooltip title={autoScrollAction}>
          <IconButton size="small" color="inherit" onClick={toggleAutoScroll} aria-label={autoScrollAction}>
            {autoScroll ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title={uiText(`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`, `切换到${themeMode === 'dark' ? '浅色' : '深色'}模式`)}>
          <IconButton size="small" color="inherit" onClick={toggleTheme} aria-label={uiText(`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`, `切换到${themeMode === 'dark' ? '浅色' : '深色'}模式`)}>
            {themeMode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        {mode !== null && (
          <Tooltip
            title={MODE_TOOLTIPS[mode]}
            open={modeTooltipOpen && !modeMenuOpen}
            onOpen={() => setModeTooltipOpen(true)}
            onClose={() => setModeTooltipOpen(false)}
          >
            <Select
              value={mode}
              onChange={handleModeChange}
              open={modeMenuOpen}
              onOpen={() => setModeMenuOpen(true)}
              onClose={() => setModeMenuOpen(false)}
              size="small"
              aria-label={uiText('Operating mode', '运行模式')}
              sx={{
                color: 'inherit',
                fontSize: '0.7rem',
                height: 28,
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                '.MuiSvgIcon-root': { color: 'inherit' },
              }}
            >
              {MOCK_SERVER_MODES.map((m) => (
                <MenuItem key={m} value={m} sx={{ fontSize: '0.8rem' }}>
                  {MODE_LABELS[m]}
                </MenuItem>
              ))}
            </Select>
          </Tooltip>
        )}
        <Tooltip title={uiText('Import / export', '导入和导出')}>
          <IconButton
            size="small"
            color="inherit"
            aria-label={uiText('Import / export tools', '导入和导出工具')}
            onClick={(e) => setToolsAnchorEl(e.currentTarget)}
          >
            <BuildIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={uiText('Clear', '清空')}>
          <IconButton
            size="small"
            color="inherit"
            aria-label={uiText('Clear logs, expectations, or reset server', '清空请求记录及相关日志、清空 Mock 规则或重置服务器')}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <DeleteSweepIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              setConfirm({
                title: CLEAR_LOGS_CONFIRM_TITLE,
                message: CLEAR_LOGS_CONFIRM_MESSAGE,
                confirmLabel: CLEAR_LOGS_CONFIRM_LABEL,
                onConfirm: () => { void onClearLogs(); },
              });
            }}
          >
            <ListItemIcon><LayersClearIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{CLEAR_LOGS_MENU_LABEL}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              setConfirm({
                title: uiText('Clear all expectations?', '清空所有 Mock 规则？'),
                message: uiText('This removes every registered expectation from the server. Recorded requests and logs are kept. This cannot be undone.', '此操作会删除服务器中已注册的全部 Mock 规则，保留请求记录和日志。删除后无法撤销。'),
                confirmLabel: uiText('Clear expectations', '清空 Mock 规则'),
                onConfirm: () => { void onClearExpectations(); },
              });
            }}
          >
            <ListItemIcon><LayersClearIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Clear Server Expectations', '清空服务器的 Mock 规则')}</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              setConfirm({
                title: uiText('Reset the entire server?', '重置整个服务器？'),
                message: uiText('This clears ALL expectations, recorded requests and logs, and resets server state. This cannot be undone.', '此操作会清空所有 Mock 规则、请求记录和日志，并重置服务器状态。操作无法撤销。'),
                confirmLabel: uiText('Reset server', '重置服务器'),
                onConfirm: () => { void onClearServer(); },
              });
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon><RestartAltIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>{uiText('Reset Server (all)', '重置服务器')}</ListItemText>
          </MenuItem>
        </Menu>
        <Menu
          anchorEl={toolsAnchorEl}
          open={Boolean(toolsAnchorEl)}
          onClose={() => setToolsAnchorEl(null)}
        >
          <MenuItem
            onClick={() => {
              setOpenApiOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Import OpenAPI…', '导入 OpenAPI…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setWsdlOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Import WSDL…', '导入 WSDL…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setGraphqlOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Import GraphQL Schema…', '导入 GraphQL 模式…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setPactOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Pact Contract (export / verify)…', 'Pact 契约（导出或验证）…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOidcOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><VpnKeyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Mock OIDC Provider…', '模拟 OIDC 提供方…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setSamlOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><VpnKeyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Mock SAML Provider…', '模拟 SAML 提供方…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setScimOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><VpnKeyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Mock SCIM Provider…', '模拟 SCIM 提供方…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAsyncApiOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><HubIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('AsyncAPI Broker Mock…', '模拟 AsyncAPI 消息代理…')}</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              setCrudOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><StorageIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Register CRUD Resource…', '注册 CRUD 资源…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setFileStoreOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Mock File Store…', '模拟文件存储…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setDiffOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><CompareArrowsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Diff Two Requests…', '比较两个请求…')}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setBaselineOpen(true);
              setToolsAnchorEl(null);
            }}
          >
            <ListItemIcon><CompareArrowsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{uiText('Compare Against Baseline…', '与基线比较…')}</ListItemText>
          </MenuItem>
        </Menu>
        <OpenApiImportDialog
          open={openApiOpen}
          onClose={() => setOpenApiOpen(false)}
          connectionParams={connectionParams}
        />
        <WsdlImportDialog
          open={wsdlOpen}
          onClose={() => setWsdlOpen(false)}
          connectionParams={connectionParams}
        />
        <GraphqlImportDialog
          open={graphqlOpen}
          onClose={() => setGraphqlOpen(false)}
          connectionParams={connectionParams}
        />
        <PactExportDialog
          open={pactOpen}
          onClose={() => setPactOpen(false)}
          connectionParams={connectionParams}
        />
        {/* Mode errors are surfaced through the app-wide notification store */}
      </Toolbar>
      <ClockDialog open={clockOpen} onClose={() => setClockOpen(false)} connectionParams={connectionParams} />
      <ConfigurationDialog open={configOpen} onClose={() => setConfigOpen(false)} connectionParams={connectionParams} />
      <ExplainUnmatchedDialog open={explainOpen} onClose={() => setExplainOpen(false)} connectionParams={connectionParams} />
      <MatcherPlaygroundDialog open={playgroundOpen} onClose={() => setPlaygroundOpen(false)} />
      <OidcDialog open={oidcOpen} onClose={() => setOidcOpen(false)} connectionParams={connectionParams} />
      <SamlDialog open={samlOpen} onClose={() => setSamlOpen(false)} connectionParams={connectionParams} />
      <ScimDialog open={scimOpen} onClose={() => setScimOpen(false)} connectionParams={connectionParams} />
      <AsyncApiDialog open={asyncApiOpen} onClose={() => setAsyncApiOpen(false)} connectionParams={connectionParams} />
      <CrudDialog open={crudOpen} onClose={() => setCrudOpen(false)} connectionParams={connectionParams} />
      <FileStoreDialog open={fileStoreOpen} onClose={() => setFileStoreOpen(false)} connectionParams={connectionParams} />
      <DiffRequestsDialog open={diffOpen} onClose={() => setDiffOpen(false)} connectionParams={connectionParams} />
      <BaselineCompareDialog open={baselineOpen} onClose={() => setBaselineOpen(false)} connectionParams={connectionParams} />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel ?? uiText('Confirm', '确认')}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      />
    </MuiAppBar>
  );
}

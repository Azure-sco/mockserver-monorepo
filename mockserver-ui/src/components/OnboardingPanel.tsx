import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SavingsIcon from '@mui/icons-material/Savings';
import BoltIcon from '@mui/icons-material/Bolt';
import { useState } from 'react';
import OpenApiImportDialog from './OpenApiImportDialog';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { useDashboardStore, type ViewMode } from '../store';
import { uiText } from '../lib/dashboardLocale';

interface OnboardingPanelProps {
  connectionParams: ConnectionParams;
}

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  /** Optional second CTA rendered as an outlined button alongside the primary one. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

function ActionCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: ActionCardProps) {
  return (
    <Card
      variant="outlined"
      sx={(theme) => ({
        // Wide enough that the longest title ("Performance Testing") stays on one
        // line; whole tiles wrap to the next row rather than being squeezed narrow
        // enough to wrap the heading. The maxWidth stops a lone wrapped tile from
        // stretching across the full row.
        flex: '1 1 200px',
        minWidth: 200,
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        transition: theme.transitions.create(['transform', 'box-shadow', 'border-color'], {
          duration: theme.transitions.duration.shorter,
        }),
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: 4,
          borderColor: 'primary.main',
        },
      })}
    >
      <CardContent sx={{ flex: 1, p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          {icon}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            {title}
          </Typography>
        </Box>
        <Typography variant="caption" component="p" color="text.secondary" sx={{ lineHeight: 1.45 }}>
          {description}
        </Typography>
      </CardContent>
      <CardActions sx={{ px: 1.5, pb: 1.5, pt: 0, gap: 0.75 }}>
        <Button size="small" variant="contained" onClick={onAction}>
          {actionLabel}
        </Button>
        {secondaryActionLabel && onSecondaryAction && (
          <Button size="small" variant="outlined" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </Button>
        )}
      </CardActions>
    </Card>
  );
}

const OTHER_TABS: { view: ViewMode; label: string; description: string }[] = [
  { view: 'dashboard', label: uiText('Dashboard', '运行面板'), description: uiText('active mocks & live event log', '生效规则和实时事件日志') },
  { view: 'library', label: uiText('Library', '资源库'), description: uiText('import / export, Postman, WSDL, HAR', '导入和导出 Postman、WSDL、HAR 等资源') },
  { view: 'verification', label: uiText('Verification', '请求与响应验证'), description: uiText('assert which requests were received', '检查请求或响应是否符合预期的次数或顺序') },
  { view: 'drift', label: uiText('Drift', '差异检测'), description: uiText('spot when an upstream API changes', '识别上游 API 的变更') },
  { view: 'async', label: uiText('Async', '异步消息'), description: uiText('Kafka / MQTT / AMQP broker mocking', '模拟 Kafka、MQTT、AMQP 消息代理') },
  { view: 'metrics', label: uiText('Metrics', '指标'), description: uiText('Prometheus stats', '查看 Prometheus 指标') },
];

export default function OnboardingPanel({ connectionParams }: OnboardingPanelProps) {
  const [openApiOpen, setOpenApiOpen] = useState(false);
  const setView = useDashboardStore((s) => s.setView);
  // The server's TOTAL expectation count. Falls back to the page length when the
  // server does not send a total — an older server, or the first frame before one
  // has arrived — so the count degrades to the old (capped) behaviour rather than
  // to a confident zero.
  const activeMockCount = useDashboardStore(
    (s) => s.activeExpectationsTotal || s.activeExpectations.length,
  );
  // Deliberately a PRESENCE flag, not a count. recordedRequests is a capped live
  // window, so its length pins at the cap and a sentence asserting "this server
  // has N recorded requests" becomes false on any busy server.
  const hasRecordedRequests = useDashboardStore((s) => s.recordedRequests.length > 0);
  const hasExistingState = activeMockCount > 0 || hasRecordedRequests;

  const go = (view: ViewMode) => () => setView(view);

  // The six key features, rendered as tiles on wide screens and as a compact
  // bulleted list on narrow ones (mobile / the IDE-embedded dashboard).
  // Ordered to lead with the most common first task (Mocking) and otherwise
  // follow the AppBar tab order (Traffic, Breakpoints, Chaos, Performance,
  // LLM Optimise) so the onboarding and the navigation tell a consistent story.
  const primaryActions: (ActionCardProps & { id: ViewMode })[] = [
    {
      id: 'composer',
      icon: <UploadFileIcon color="primary" />,
      title: uiText('Mocking', '模拟 API'),
      description:
        uiText('Build mock responses by hand, or import an OpenAPI / Swagger spec, Postman collection, WSDL, or HAR file to generate stubs automatically.', '手动配置模拟响应，也可以导入 OpenAPI / Swagger 规范、Postman 集合、WSDL 或 HAR 文件，自动生成 Mock 规则。'),
      actionLabel: uiText('Create Mock', '创建 Mock 规则'),
      onAction: go('composer'),
      secondaryActionLabel: uiText('Import OpenAPI', '导入 OpenAPI'),
      onSecondaryAction: () => setOpenApiOpen(true),
    },
    {
      id: 'traffic',
      icon: <SwapHorizIcon color="primary" />,
      title: uiText('Debugging Proxy', '代理调试'),
      description:
        uiText('Sit MockServer between your app and a real API to record, inspect, and replay live traffic — and validate or rewrite it on the way through.', '让 MockServer 代理应用对真实 API 的调用，记录、查看和回放流量，并在转发过程中校验或改写内容。'),
      actionLabel: uiText('View Traffic', '查看请求记录'),
      onAction: go('traffic'),
    },
    {
      id: 'breakpoints',
      icon: <PauseCircleIcon color="primary" />,
      title: uiText('Breakpoints', '断点'),
      description:
        uiText('Pause requests and responses mid-flight — proxied, mocked, or unmatched — then inspect, edit, continue, or abort them.', '在处理过程中暂停代理请求、模拟请求或未匹配的请求与响应，查看或修改内容，再继续处理或中止。'),
      actionLabel: uiText('Open Breakpoints', '打开断点'),
      onAction: go('breakpoints'),
    },
    {
      id: 'chaos',
      icon: <BoltIcon color="primary" />,
      title: uiText('Chaos Testing', '故障注入测试'),
      description:
        uiText('Inject latency, errors, and dropped connections to test how your system copes when the APIs it depends on misbehave.', '模拟 API 延迟、错误和连接中断，测试系统在依赖服务发生故障时的表现。'),
      actionLabel: uiText('Open Chaos', '打开故障注入'),
      onAction: go('chaos'),
    },
    {
      id: 'performance',
      icon: <TrendingUpIcon color="primary" />,
      title: uiText('Performance Testing', '性能测试'),
      description:
        uiText('Inject load against any target — drive traffic at a chosen arrival rate, ramp it up and down, and watch live throughput and latency.', '以指定速率向目标发送请求，逐步增加或减少负载，并实时查看吞吐量和延迟。'),
      actionLabel: uiText('Open Performance', '打开性能测试'),
      onAction: go('performance'),
    },
    {
      id: 'optimise',
      icon: <SavingsIcon color="primary" />,
      title: uiText('LLM Optimise', 'LLM 优化'),
      description:
        uiText('Capture LLM traffic through the proxy, then analyse it to optimise prompts, inference cost, safety, and speed.', '通过代理捕获并分析 LLM 流量，优化提示词、推理成本、安全性和速度。'),
      actionLabel: uiText('Open LLM Optimise', '打开 LLM 优化'),
      onAction: go('optimise'),
    },
  ];

  return (
    <Box
      data-testid="onboarding-scroller"
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        p: 4,
        overflow: 'auto',
      }}
    >
      {/* Centred with auto margins, not justify-content: when the content is
          taller than the window, auto margins collapse to 0 and it overflows
          downwards into the scroll area instead of above its top edge. */}
      <Box
        data-testid="onboarding-content"
        sx={{ my: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
        {uiText('Welcome to MockServer', '欢迎使用 MockServer')}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{ mb: 4, maxWidth: 640, textAlign: 'center' }}
      >
        {uiText('Mock, proxy, and debug HTTP, HTTPS, and other APIs. These are the key things you can do — open any one below, or use the tabs above for the full feature set.', '使用 MockServer 模拟、代理和调试 HTTP、HTTPS 等 API。可从下方选择常用功能，也可通过上方菜单浏览全部功能。')}
      </Typography>

      {/* Returning-user awareness: when this server already holds state, offer a
          jump straight to the Dashboard instead of the empty first-run flow. We
          surface it (never auto-redirect) so the user stays in control of the view. */}
      {hasExistingState && (
        <Alert
          severity="info"
          sx={{ mb: 3, maxWidth: 760, width: '100%' }}
          action={
            <Button color="inherit" size="small" onClick={go('dashboard')}>
              {uiText('Open Dashboard', '打开运行面板')}
            </Button>
          }
        >
          {uiText(
            `This server has ${activeMockCount} active mock${activeMockCount === 1 ? '' : 's'}${hasRecordedRequests ? ' and has recorded requests' : ''}.`,
            `此服务器有 ${activeMockCount} 条生效规则${hasRecordedRequests ? '，并已记录请求' : ''}。`,
          )}
        </Alert>
      )}

      {/* Responsive switch keyed off the CONTAINER width, not the viewport. The
          dashboard is embedded in a narrow IDE tool window (JCEF) whose CSS
          viewport stays wide regardless of the visible panel size, so a viewport
          media query never fires there. A container query reacts to the actual
          panel width, so this behaves the same in a browser and in the IDE.
          Tiles are the default and only collapse to the bulleted list when the
          panel is narrow — so an engine without container-query support (older
          browsers, jsdom in tests) falls back to tiles rather than nothing. */}
      <Box sx={{ containerType: 'inline-size', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Wide panels: feature tiles side by side, wrapping to a second row when
            six no longer fit at their one-line-title minimum width rather than
            squeezing all six abreast (which wrapped the headings). */}
        <Box
          sx={{
            display: 'flex',
            '@container (max-width: 899.98px)': { display: 'none' },
            flexWrap: 'wrap',
            gap: 1.5,
            alignItems: 'stretch',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 1320,
          }}
        >
          {primaryActions.map((action) => (
            <ActionCard key={action.id} {...action} />
          ))}
        </Box>

        {/* Narrow panels (mobile / IDE-embedded): a compact bulleted list, since
            six tiles side by side become unreadably squished. */}
        <Box
          component="ul"
          sx={{
            display: 'none',
            '@container (max-width: 899.98px)': { display: 'block' },
            m: 0,
            pl: 3,
            width: '100%',
            maxWidth: 760,
          }}
        >
          {primaryActions.map((action) => (
            <Box component="li" key={action.id} sx={{ mb: 1 }}>
              <Link
                component="button"
                type="button"
                onClick={action.onAction}
                sx={{ verticalAlign: 'baseline', fontWeight: 600 }}
              >
                {action.title}
              </Link>
              <Typography component="span" variant="body2" color="text.secondary">
                {' '}— {action.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ mt: 4, maxWidth: 760, width: '100%' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {uiText('More in the tabs above (or see ', '更多功能请查看上方菜单（也可参阅')}
          <Link
            href="https://www.mock-server.com/mock_server/mockserver_ui.html"
            target="_blank"
            rel="noopener"
          >
            {uiText('UI docs', '界面文档')}
          </Link>
          {uiText('):', '）')}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 3 }}>
          {OTHER_TABS.map((tab) => (
            <Box component="li" key={tab.view} sx={{ mb: 0.5 }}>
              <Link component="button" type="button" onClick={go(tab.view)} sx={{ verticalAlign: 'baseline' }}>
                {tab.label}
              </Link>
              <Typography component="span" variant="body2" color="text.secondary">
                {' '}— {tab.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
      </Box>

      <OpenApiImportDialog
        open={openApiOpen}
        onClose={() => setOpenApiOpen(false)}
        connectionParams={connectionParams}
      />
    </Box>
  );
}

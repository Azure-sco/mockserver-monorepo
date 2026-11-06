import { uiText } from '../lib/dashboardLocale';
import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { humanizeError } from '../lib/errorMessage';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { fetchClusterInfo, type ClusterInfo } from '../lib/cluster';

interface ClusterPanelProps {
  connectionParams: ConnectionParams;
}

const POLL_INTERVAL_MS = 5000;

/** A missing cluster endpoint can return just an HTTP 404 status line. */
function isUnavailable(message: string): boolean {
  return (
    message.includes('404') ||
    message.includes('Not Found') ||
    message.includes('isn’t available')
  );
}

export default function ClusterPanel({ connectionParams }: ClusterPanelProps) {
  const [data, setData] = useState<ClusterInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Auto-refresh the read-only cluster status. The lib throws on a non-OK
  // response, so a 500 surfaces as a real error and a 404 routes to the "not
  // available" branch.
  const loadCluster = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetchClusterInfo(connectionParams, signal);
      setData(response);
      setLoadError(null);
    } catch (e) {
      if (signal?.aborted) return;
      setLoadError(humanizeError(e).message);
    }
  }, [connectionParams]);

  useAutoRefresh(loadCluster, { intervalMs: POLL_INTERVAL_MS });

  const refresh = useCallback(() => {
    void loadCluster();
  }, [loadCluster]);

  const members = data?.members ?? [];

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {uiText('Cluster', '集群')}
        </Typography>
        {data && (
          <Chip
            size="small"
            label={data.clustered ? uiText('Clustered', '集群模式') : uiText('Single node', '单节点')}
            color={data.clustered ? 'success' : 'default'}
            variant="outlined"
          />
        )}
        {data && (
          <Chip
            size="small"
            label={uiText(`${data.memberCount} member${data.memberCount === 1 ? '' : 's'}`, `${data.memberCount} 个成员`)}
            variant="outlined"
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={uiText('Refresh now', '立即刷新')}>
          <IconButton size="small" onClick={refresh} aria-label={uiText('Refresh cluster', '刷新集群状态')}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {uiText('Shows the state-backend cluster this MockServer node participates in. A standalone server reports a single local node.', '显示当前 MockServer 节点所在的状态存储集群。独立运行的服务只会报告一个本地节点。')}
      </Typography>

      {loadError && (
        <Alert
          severity={isUnavailable(loadError) ? 'info' : 'error'}
          sx={{ mb: 1.5 }}
          action={
            <IconButton color="inherit" size="small" onClick={refresh} aria-label={uiText('Retry', '重试')}><RefreshIcon fontSize="small" /></IconButton>
          }
        >
          <AlertTitle>
            {isUnavailable(loadError)
              ? uiText('Cluster status not available', '集群状态不可用')
              : uiText('Could not load cluster status', '无法加载集群状态')}
          </AlertTitle>
          {isUnavailable(loadError)
            ? uiText('The connected server does not expose cluster status. This feature requires a newer version of MockServer.', '当前连接的服务未提供集群状态。此功能需要较新版本的 MockServer。')
            : loadError}
        </Alert>
      )}

      {data && (
        <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {uiText('Node ID', '节点 ID')}
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {data.nodeId}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {uiText('Coordinator', '协调节点')}
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {data.coordinator}
              </Typography>
            </Box>
            {data.clusterName && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {uiText('Cluster name', '集群名称')}
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {data.clusterName}
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 1.25 }}>
        {members.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
            {data ? uiText('No cluster members reported.', '暂无集群成员信息。') : uiText('Loading cluster status…', '正在加载集群状态…')}
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{uiText('Member ID', '成员 ID')}</TableCell>
                  <TableCell>{uiText('Role', '角色')}</TableCell>
                  <TableCell>{uiText('This node', '当前节点')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {member.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={member.coordinator ? uiText('Coordinator', '协调节点') : uiText('Member', '成员节点')}
                        color={member.coordinator ? 'primary' : 'default'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      {member.local && (
                        <Chip
                          size="small"
                          label={uiText('Local', '本地')}
                          color="info"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}

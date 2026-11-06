import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { describeTarget, pageOriginDashboardUrl, resolveUrlConnection, type UrlTargetField } from '../lib/connectionTarget';
import { uiText } from '../lib/dashboardLocale';

const FIELD_NAMES: Record<UrlTargetField, string> = {
  host: uiText('host', '主机'),
  port: uiText('port', '端口'),
  basePath: uiText('base path', '基础路径'),
};

function listOf(names: string[]): string {
  return names.length <= 1 ? names.join('') : uiText(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`, names.join('、'));
}

/**
 * Says when the dashboard link points the dashboard at a server on another host, and which
 * `?host=`, `?port=` or `?basePath=` values in it were invalid and so ignored, so a link never
 * silently retargets the dashboard.
 */
export default function UrlTargetNotice() {
  const [{ params, rejected, page, foreignHost }] = useState(resolveUrlConnection);
  const [dismissed, setDismissed] = useState(false);
  const fields = listOf(rejected.map((field) => FIELD_NAMES[field]));
  return (
    <>
      {foreignHost && (
        <Alert
          severity="warning"
          sx={{ mx: 1, mt: 1, flexShrink: 0 }}
          data-testid="url-target-foreign-host"
          action={(
            <Button color="inherit" size="small" href={pageOriginDashboardUrl()}>
              {uiText(`Use ${describeTarget(page)}`, `使用 ${describeTarget(page)}`)}
            </Button>
          )}
        >
          {uiText(
            `This dashboard link points at ${describeTarget(params)}, not the server that served this page. Workspaces that follow the link show that server's data, and what you create or upload in them is sent there.`,
            `此链接将运行面板连接到 ${describeTarget(params)}。跟随此链接的工作区会显示该服务器的数据，创建或上传的内容也会发送到该服务器。`,
          )}
        </Alert>
      )}
      {rejected.length > 0 && !dismissed && (
        <Alert
          severity="warning"
          onClose={() => setDismissed(true)}
          sx={{ mx: 1, mt: 1, flexShrink: 0 }}
          data-testid="url-target-notice"
        >
          {uiText(
            `The ${fields} in this dashboard link ${rejected.length === 1 ? 'is' : 'are'} not valid, so the dashboard ignored ${rejected.length === 1 ? 'it' : 'them'}; workspaces that follow the link use ${describeTarget(params)}.`,
            `此链接中的${fields}无效，已忽略。跟随此链接的工作区将连接到 ${describeTarget(params)}。`,
          )}
        </Alert>
      )}
    </>
  );
}

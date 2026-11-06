import { uiText } from '../lib/dashboardLocale';
import { useState } from 'react';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import LintDialog from './LintDialog';

/**
 * The `x-mockserver-lint-warnings` count from creating an expectation, as a chip that opens the
 * Lint Expectations dialog. Renders nothing for a count of 0.
 */
export default function LintWarningsBadge({ count, connectionParams }: { count: number; connectionParams: ConnectionParams }) {
  const [open, setOpen] = useState(false);
  if (count <= 0) return null;
  return (
    <>
      <Tooltip describeChild title={uiText("The expectation was stored, but lint found problems that may stop it matching. Click to see them.", "规则已保存，但检查发现可能影响匹配的问题。点击查看详情。")}>
        <Chip
          size="small"
          color="warning"
          icon={<WarningAmberIcon />}
          label={uiText(`${count} Lint ${count === 1 ? uiText('Warning', "警告") : uiText('Warnings', "条警告")}`, `${count} 条规则检查警告`)}
          onClick={() => setOpen(true)}
          data-testid="lint-warnings-badge"
        />
      </Tooltip>
      {open && <LintDialog open onClose={() => setOpen(false)} connectionParams={connectionParams} />}
    </>
  );
}

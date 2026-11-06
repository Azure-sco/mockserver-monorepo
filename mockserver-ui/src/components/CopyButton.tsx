import { useTransientFlag } from '../hooks/useTransientFlag';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { uiText } from '../lib/dashboardLocale';

interface CopyButtonProps {
  text: string;
  size?: 'small' | 'medium';
}

export default function CopyButton({ text, size = 'small' }: CopyButtonProps) {
  const [status, flashStatus] = useTransientFlag<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      flashStatus('copied', 'idle', 1500);
    } catch {
      flashStatus('failed', 'idle', 2000);
    }
  };

  const tooltipTitle = status === 'copied' ? uiText('Copied!', '已复制') : status === 'failed' ? uiText('Copy failed', '复制失败') : uiText('Copy', '复制');

  return (
    <Tooltip title={tooltipTitle}>
      <IconButton
        size={size}
        onClick={handleCopy}
        sx={{
          opacity: 0.6,
          '&:hover': { opacity: 1 },
          p: '2px',
          '& .MuiSvgIcon-root': { fontSize: '0.875rem' },
        }}
      >
        {status === 'copied' ? <CheckIcon /> : <ContentCopyIcon />}
      </IconButton>
    </Tooltip>
  );
}

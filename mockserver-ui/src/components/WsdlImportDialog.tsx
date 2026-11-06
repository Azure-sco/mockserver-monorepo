import { uiText } from '../lib/dashboardLocale';
import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { importWsdl } from '../lib/wsdlImport';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import HumanErrorAlert from './HumanErrorAlert';
import type { ConnectionParams } from '../hooks/useConnectionParams';

interface WsdlImportDialogProps {
  open: boolean;
  onClose: () => void;
  connectionParams: ConnectionParams;
}

/**
 * Dialog to import a WSDL 1.1 document (SOAP 1.1/1.2) via PUT /mockserver/wsdl,
 * creating one expectation per SOAP operation.
 */
export default function WsdlImportDialog({ open, onClose, connectionParams }: WsdlImportDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [wsdl, setWsdl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HumanError | null>(null);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    setCreatedCount(null);
    try {
      const created = await importWsdl(connectionParams, wsdl);
      setCreatedCount(created.length);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setWsdl('');
    setError(null);
    setCreatedCount(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth fullScreen={fullScreen} aria-labelledby="wsdl-dialog-title">
      <DialogTitle id="wsdl-dialog-title">{uiText("Import WSDL", "导入 WSDL")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {uiText("Paste a WSDL 1.1 document (SOAP 1.1 or 1.2). MockServer generates one expectation per SOAP operation, matching on the SOAPAction (or content-type action) and responding with a skeleton SOAP envelope.", "粘贴 WSDL 1.1 文档（SOAP 1.1 或 1.2）。MockServer 会为每项 SOAP 操作生成一条规则，根据 SOAPAction 或 Content-Type 中的 action 匹配请求，并返回基础 SOAP Envelope。")}
        </Typography>
        <TextField
          value={wsdl}
          onChange={(e) => setWsdl(e.target.value)}
          label="WSDL XML"
          multiline
          minRows={10}
          fullWidth
          spellCheck={false}
        />
        {error !== null && (
          <HumanErrorAlert error={error} sx={{ mt: 1 }} />
        )}
        {createdCount !== null && (
          <Alert severity="success" sx={{ mt: 1 }}>
            {uiText("Imported ", "已导入 ")}{createdCount}{uiText(" expectation", " 条规则")}{createdCount === 1 ? '' : uiText('s', "")}.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{uiText("Close", "关闭")}</Button>
        <Button
          variant="contained"
          onClick={() => void handleImport()}
          disabled={busy || wsdl.trim().length === 0}
        >
          {busy ? uiText('Importing…', "正在导入…") : uiText('Import', "导入")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

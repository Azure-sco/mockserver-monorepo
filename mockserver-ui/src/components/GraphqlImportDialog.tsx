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
import { importGraphql } from '../lib/graphqlImport';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import HumanErrorAlert from './HumanErrorAlert';
import type { ConnectionParams } from '../hooks/useConnectionParams';

interface GraphqlImportDialogProps {
  open: boolean;
  onClose: () => void;
  connectionParams: ConnectionParams;
}

/**
 * Dialog to import a GraphQL SDL schema via PUT /mockserver/graphql, generating
 * an expectation that matches GraphQL queries against the schema and responds
 * with schema-shaped mock data.
 */
export default function GraphqlImportDialog({ open, onClose, connectionParams }: GraphqlImportDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [schema, setSchema] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HumanError | null>(null);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    setCreatedCount(null);
    try {
      const created = await importGraphql(connectionParams, schema, path);
      setCreatedCount(created.length);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setSchema('');
    setPath('');
    setError(null);
    setCreatedCount(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth fullScreen={fullScreen} aria-labelledby="graphql-dialog-title">
      <DialogTitle id="graphql-dialog-title">{uiText("Import GraphQL Schema", "导入 GraphQL Schema")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {uiText("Paste a GraphQL SDL schema. MockServer generates an expectation that matches GraphQL queries posted to the endpoint against the schema and responds with schema-shaped mock data.", "粘贴 GraphQL SDL Schema。MockServer 会生成一条规则，按 Schema 匹配提交到端点的 GraphQL 查询，并返回符合 Schema 的模拟数据。")}
        </Typography>
        <TextField
          value={path}
          onChange={(e) => setPath(e.target.value)}
          label={uiText("Endpoint path", "端点路径")}
          placeholder="/graphql"
          fullWidth
          size="small"
          spellCheck={false}
          sx={{ mb: 1 }}
        />
        <TextField
          value={schema}
          onChange={(e) => setSchema(e.target.value)}
          label="GraphQL SDL"
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
          disabled={busy || schema.trim().length === 0}
        >
          {busy ? uiText('Importing…', "正在导入…") : uiText('Import', "导入")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

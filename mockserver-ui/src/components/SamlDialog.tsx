import { uiText } from '../lib/dashboardLocale';
import { useState, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { createSamlProvider, type SamlConfig } from '../lib/saml';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import HumanErrorAlert from './HumanErrorAlert';

/** Parse the "key=value" lines of the attributes textarea into a map. Blank lines ignored. */
function parseAttributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

export default function SamlDialog({
  open,
  onClose,
  connectionParams,
}: {
  open: boolean;
  onClose: () => void;
  connectionParams: ConnectionParams;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [idpEntityId, setIdpEntityId] = useState('');
  const [spEntityId, setSpEntityId] = useState('');
  const [acsUrl, setAcsUrl] = useState('');
  const [subjectNameId, setSubjectNameId] = useState('');
  const [nameIdFormat, setNameIdFormat] = useState('');
  const [sessionDuration, setSessionDuration] = useState('');
  const [attributes, setAttributes] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HumanError | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCreated(null);
    // Only send fields the user set; blanks fall back to the server defaults.
    const config: SamlConfig = {};
    if (idpEntityId.trim()) config.idpEntityId = idpEntityId.trim();
    if (spEntityId.trim()) config.spEntityId = spEntityId.trim();
    if (acsUrl.trim()) config.assertionConsumerServiceUrl = acsUrl.trim();
    if (subjectNameId.trim()) config.subjectNameId = subjectNameId.trim();
    if (nameIdFormat.trim()) config.nameIdFormat = nameIdFormat.trim();
    const duration = parseInt(sessionDuration, 10);
    if (!isNaN(duration) && duration > 0) config.sessionDurationSeconds = duration;
    const attrs = parseAttributes(attributes);
    if (Object.keys(attrs).length > 0) config.attributes = attrs;
    try {
      setCreated(await createSamlProvider(connectionParams, config));
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [connectionParams, idpEntityId, spEntityId, acsUrl, subjectNameId, nameIdFormat, sessionDuration, attributes]);

  const handleClose = useCallback(() => {
    setIdpEntityId('');
    setSpEntityId('');
    setAcsUrl('');
    setSubjectNameId('');
    setNameIdFormat('');
    setSessionDuration('');
    setAttributes('');
    setError(null);
    setCreated(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="saml-dialog-title">
      <DialogTitle id="saml-dialog-title">{uiText("Mock SAML Provider", "模拟 SAML 身份提供方")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {uiText("Register a mock SAML 2.0 identity provider — IdP metadata plus an SSO endpoint implementing the SP-initiated Web-Browser-SSO POST profile — as expectations. Leave a field blank to use the server default.", "将 SAML 2.0 身份提供方注册为 Mock 规则，涵盖 IdP 元数据和实现 SP 发起的浏览器 SSO POST 流程的接口。字段留空时使用服务器默认值。")}
        </Typography>
        {error && <HumanErrorAlert error={error} sx={{ mb: 1.5 }} />}
        {created !== null && (
          <Alert severity="success" sx={{ mb: 1.5 }}>{uiText("Created ", "已创建 ")}{created}{uiText(" expectation", " 条规则")}{created === 1 ? '' : uiText('s', "")}{uiText(" for the mock SAML provider.", " ，用于模拟 SAML 身份提供方。")}</Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField size="small" label={uiText("IdP entity ID (issuer)", "IdP 实体 ID（签发方）")} placeholder="http://localhost:1080/saml/idp" value={idpEntityId} onChange={(e) => setIdpEntityId(e.target.value)} />
          <TextField size="small" label={uiText("SP entity ID", "SP 实体 ID")} placeholder="http://localhost:8080/saml/sp" value={spEntityId} onChange={(e) => setSpEntityId(e.target.value)} />
          <TextField size="small" label={uiText("Assertion Consumer Service (ACS) URL", "断言消费服务（ACS）URL")} placeholder="http://localhost:8080/saml/acs" value={acsUrl} onChange={(e) => setAcsUrl(e.target.value)} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField size="small" label={uiText("Subject NameID", "主体 NameID")} placeholder="mock-user@example.com" value={subjectNameId} onChange={(e) => setSubjectNameId(e.target.value)} sx={{ flex: 1 }} />
            <TextField size="small" label={uiText("Session (s)", "会话有效期（秒）")} type="number" placeholder="3600" value={sessionDuration} onChange={(e) => setSessionDuration(e.target.value)} sx={{ width: { xs: '100%', sm: 130 } }} />
          </Box>
          <TextField size="small" label={uiText("NameID format", "NameID 格式")} placeholder="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" value={nameIdFormat} onChange={(e) => setNameIdFormat(e.target.value)} />
          <TextField
            size="small"
            label={uiText("Attributes (one key=value per line)", "属性（每行一项 key=value）")}
            placeholder={'email=mock-user@example.com\nrole=admin'}
            value={attributes}
            onChange={(e) => setAttributes(e.target.value)}
            multiline
            minRows={2}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{uiText("Close", "关闭")}</Button>
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>{uiText("Create provider", "创建服务提供方")}</Button>
      </DialogActions>
    </Dialog>
  );
}

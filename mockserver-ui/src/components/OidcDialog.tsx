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
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import type { ConnectionParams } from '../hooks/useConnectionParams';
import { createOidcProvider, type OidcConfig } from '../lib/oidc';
import { humanizeError, type HumanError } from '../lib/errorMessage';
import HumanErrorAlert from './HumanErrorAlert';

export default function OidcDialog({
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
  const [issuer, setIssuer] = useState('');
  const [subject, setSubject] = useState('');
  const [clientId, setClientId] = useState('');
  const [audience, setAudience] = useState('');
  const [scopes, setScopes] = useState('');
  const [tokenExpiry, setTokenExpiry] = useState('');
  const [issueExpiredToken, setIssueExpiredToken] = useState(false);
  const [wrongIssuer, setWrongIssuer] = useState(false);
  const [tamperedSignature, setTamperedSignature] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HumanError | null>(null);
  const [created, setCreated] = useState<number | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCreated(null);
    // Only send fields the user set; blanks fall back to the server defaults.
    const config: OidcConfig = {};
    if (issuer.trim()) config.issuer = issuer.trim();
    if (subject.trim()) config.subject = subject.trim();
    if (clientId.trim()) config.clientId = clientId.trim();
    if (audience.trim()) config.audience = audience.trim();
    const scopeList = scopes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (scopeList.length > 0) config.scopes = scopeList;
    const expiry = parseInt(tokenExpiry, 10);
    if (!isNaN(expiry) && expiry > 0) config.tokenExpirySeconds = expiry;
    if (issueExpiredToken) config.issueExpiredToken = true;
    if (wrongIssuer) config.wrongIssuer = true;
    if (tamperedSignature) config.tamperedSignature = true;
    try {
      setCreated(await createOidcProvider(connectionParams, config));
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }, [connectionParams, issuer, subject, clientId, audience, scopes, tokenExpiry, issueExpiredToken, wrongIssuer, tamperedSignature]);

  const handleClose = useCallback(() => {
    setIssuer('');
    setSubject('');
    setClientId('');
    setAudience('');
    setScopes('');
    setTokenExpiry('');
    setIssueExpiredToken(false);
    setWrongIssuer(false);
    setTamperedSignature(false);
    setError(null);
    setCreated(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth fullScreen={fullScreen} aria-labelledby="oidc-dialog-title">
      <DialogTitle id="oidc-dialog-title">{uiText("Mock OIDC Provider", "模拟 OIDC 服务提供方")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {uiText("Register a mock OIDC/OAuth2 provider — discovery document, JWKS, and token / userinfo / introspection / revocation endpoints — as expectations. Leave a field blank to use the server default.", "将 OIDC/OAuth2 服务注册为 Mock 规则，涵盖发现文档、JWKS、令牌、用户信息、令牌内省和撤销接口。字段留空时使用服务器默认值。")}
        </Typography>
        {error && <HumanErrorAlert error={error} sx={{ mb: 1.5 }} />}
        {created !== null && (
          <Alert severity="success" sx={{ mb: 1.5 }}>{uiText("Created ", "已创建 ")}{created}{uiText(" expectation", " 条规则")}{created === 1 ? '' : uiText('s', "")}{uiText(" for the mock OIDC provider.", " ，用于模拟 OIDC 服务提供方。")}</Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField size="small" label={uiText("Issuer", "签发方")} placeholder="http://localhost:1080" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField size="small" label={uiText("Subject", "主体")} placeholder="mock-user" value={subject} onChange={(e) => setSubject(e.target.value)} sx={{ flex: 1 }} />
            <TextField size="small" label={uiText("Client ID", "客户端 ID")} placeholder="mock-client" value={clientId} onChange={(e) => setClientId(e.target.value)} sx={{ flex: 1 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField size="small" label={uiText("Audience", "受众")} placeholder="mock-audience" value={audience} onChange={(e) => setAudience(e.target.value)} sx={{ flex: 1 }} />
            <TextField size="small" label={uiText("Token expiry (s)", "令牌有效期（秒）")} type="number" placeholder="3600" value={tokenExpiry} onChange={(e) => setTokenExpiry(e.target.value)} sx={{ width: { xs: '100%', sm: 150 } }} />
          </Box>
          <TextField size="small" label={uiText("Scopes (space/comma separated)", "权限范围（用空格或逗号分隔）")} placeholder="openid profile email" value={scopes} onChange={(e) => setScopes(e.target.value)} />
          <Box>
            <Typography variant="caption" color="text.secondary">{uiText("Negative testing", "异常场景测试")}</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControlLabel control={<Switch size="small" checked={issueExpiredToken} onChange={(e) => setIssueExpiredToken(e.target.checked)} />} label={<Typography variant="body2">{uiText("Expired token", "令牌已过期")}</Typography>} />
              <FormControlLabel control={<Switch size="small" checked={wrongIssuer} onChange={(e) => setWrongIssuer(e.target.checked)} />} label={<Typography variant="body2">{uiText("Wrong issuer", "签发方不正确")}</Typography>} />
              <FormControlLabel control={<Switch size="small" checked={tamperedSignature} onChange={(e) => setTamperedSignature(e.target.checked)} />} label={<Typography variant="body2">{uiText("Tampered signature", "签名被篡改")}</Typography>} />
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{uiText("Close", "关闭")}</Button>
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>{uiText("Create provider", "创建服务提供方")}</Button>
      </DialogActions>
    </Dialog>
  );
}

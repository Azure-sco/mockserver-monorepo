import type { RefObject } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Tooltip from '@mui/material/Tooltip';
import SearchIcon from '@mui/icons-material/Search';
import HelpOutlinedIcon from '@mui/icons-material/HelpOutlined';
import type { SxProps, Theme } from '@mui/material/styles';
import { filterFields, parseSearchTerm, describeUnsupportedOperators } from '../lib/filterDSL';
import { uiText } from '../lib/dashboardLocale';

/** The fields advertised by this field, honouring an optional call-site subset. */
function advertisedFields(fields?: readonly string[]) {
  // Lower-cased to match parseSearchTerm / describeUnsupportedOperators, so a
  // call site passing 'Status' advertises the same operator it can match.
  const allowed = fields?.map((f) => f.toLowerCase());
  return filterFields().filter((f) => !allowed || allowed.includes(f.name));
}

/**
 * Hint shown in the search box. Surfaces the otherwise-hidden operators so users
 * discover them in passing; the full reference lives in the adjacent help
 * tooltip. Read from the lib/filterDSL registry at render — not snapshotted at
 * module load — so a field registered later by a feature module shows up.
 */
function searchPlaceholder(fields?: readonly string[]): string {
  const examples = advertisedFields(fields).map((f) => f.example);
  return uiText(`Search — try ${[...examples, '/regex/'].join(', ')}`, `搜索，可试用 ${[...examples, '/regex/'].join('、')}`);
}

/**
 * Operator reference for the search box, rendered from the lib/filterDSL field
 * registry (name, example and description are declared alongside each field's
 * resolver). Field operators are ANDed with the free text.
 */
function searchHelp(fields?: readonly string[]) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, py: 0.25, maxWidth: 320 }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>{uiText('Search operators', '搜索运算符')}</Typography>
      {advertisedFields(fields).map((f) => (
        <Typography key={f.name} variant="caption">
          {f.example} — {f.description}
        </Typography>
      ))}
      <Typography variant="caption">
        {uiText('/regex/ — free-text regular expression (optional flags, defaults to case-insensitive)', '/regex/ 用于自由文本的正则匹配，可指定标志，默认忽略大小写')}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {uiText('Plain text matches anywhere; operators combine with AND.', '纯文本可匹配任意位置。使用多个运算符时，所有条件必须同时满足。')}
      </Typography>
    </Box>
  );
}

interface OperatorSearchFieldProps {
  /** Stable DOM id for the input (labels the field for tests / a11y tooling). */
  id: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Maximum width of the field. Defaults to 240 (the dashboard-panel width). */
  maxWidth?: number;
  /** Extra sx merged over the base styles (e.g. a caller-specific height). */
  sx?: SxProps<Theme>;
  /**
   * Field operators this surface can actually satisfy (lib/filterDSL field
   * names). Omit to advertise the whole vocabulary. When set, the placeholder
   * and help list only these operators, and typing one outside the subset flags
   * the input rather than letting it silently do nothing.
   */
  fields?: readonly string[];
  /** Accessible name of the input. Defaults to "Search". */
  ariaLabel?: string;
}

/**
 * Operator-aware search field shared by the dashboard panels and the Traffic
 * inspector: a compact search input with the operator placeholder and an inline
 * help tooltip, both generated from the `lib/filterDSL` field registry. Keeping a
 * single component means every surface discovers the same operators
 * (status:/method:/path:/host:/operation:/`/regex/`) and stays in sync, while
 * `fields` lets a surface narrow that vocabulary to what it can answer.
 */
export default function OperatorSearchField({
  id,
  value,
  onChange,
  inputRef,
  maxWidth = 240,
  sx,
  fields,
  ariaLabel = uiText('Search', '搜索'),
}: OperatorSearchFieldProps) {
  // Only a restricted surface can produce an unsupported operator, so the
  // unrestricted panels never pay for this beyond a cheap re-parse.
  const options = fields ? { fields } : undefined;
  const unsupported = describeUnsupportedOperators(parseSearchTerm(value, options), options);

  return (
    <TextField
      id={id}
      size="small"
      placeholder={searchPlaceholder(fields)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputRef={inputRef}
      error={unsupported != null}
      helperText={unsupported ?? undefined}
      slotProps={{
        htmlInput: { 'aria-label': ariaLabel },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={searchHelp(fields)} arrow>
                <HelpOutlinedIcon
                  fontSize="small"
                  role="img"
                  aria-label={uiText('Search operator help', '搜索运算符帮助')}
                  tabIndex={0}
                  sx={{ color: 'text.secondary', cursor: 'help' }}
                />
              </Tooltip>
            </InputAdornment>
          ),
        },
      }}
      sx={[
        {
          ml: 'auto',
          maxWidth,
          '& .MuiInputBase-root': { height: 28, typography: 'subtitle2', fontWeight: 400 },
          '& .MuiSvgIcon-root': { fontSize: '0.875rem' },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
}

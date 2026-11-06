import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import type { OpenApiLoadProblem } from '../lib/openapiImport';
import { monospaceFontFamily } from '../theme';
import { uiText } from '../lib/dashboardLocale';

/** Enough to act on; the import response holds every problem. */
const MAX_SHOWN = 50;

interface OpenApiLoadProblemsAlertProps {
  problems: OpenApiLoadProblem[];
  /** The import created no expectations, so the problems are reported as an error, not a caveat. */
  noExpectationsCreated?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * Lists the problems of an OpenAPI spec that loaded but breaks the OpenAPI rules,
 * grouped by kind, each with its JSON-pointer location and any hint. Renders
 * nothing when there are no problems.
 */
export default function OpenApiLoadProblemsAlert({ problems, noExpectationsCreated = false, sx }: OpenApiLoadProblemsAlertProps) {
  if (problems.length === 0) {
    return null;
  }
  const shown = problems.slice(0, MAX_SHOWN);
  const groups = new Map<string, OpenApiLoadProblem[]>();
  for (const problem of shown) {
    const group = groups.get(problem.kindLabel);
    if (group) {
      group.push(problem);
    } else {
      groups.set(problem.kindLabel, [problem]);
    }
  }
  const count = problems.length;
  const problemCount = uiText(`${count} Problem${count === 1 ? '' : 's'}`, `${count} 个问题`);
  return (
    <Alert
      severity={noExpectationsCreated ? 'error' : 'warning'}
      variant="outlined"
      sx={sx}
      data-testid="openapi-load-problems"
    >
      <AlertTitle>
        {noExpectationsCreated
          ? uiText(`No Expectations Created: Spec Has ${problemCount}`, `未创建 Mock 规则，规范包含 ${problemCount}`)
          : uiText(`Spec Loaded With ${problemCount}`, `规范已加载，发现 ${problemCount}`)}
      </AlertTitle>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {noExpectationsCreated
          ? uiText('These parts of the spec break the OpenAPI rules. Fix them and import the spec again.', '这些内容不符合 OpenAPI 规范。请修正后重新导入。')
          : uiText('These parts of the spec break the OpenAPI rules, so the expectations generated from them may not behave as expected.', '这些内容不符合 OpenAPI 规范，由此生成的 Mock 规则可能与预期不符。')}
      </Typography>
      {[...groups.entries()].map(([kindLabel, group]) => (
        <Box key={kindLabel} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" component="p">
            {kindLabel} ({group.length})
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {group.map((problem, index) => (
              <Box component="li" key={`${problem.specIndex ?? 0}-${problem.location ?? ''}-${index}`} sx={{ mb: 0.5 }}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {problem.location && (
                    <Box component="span" sx={{ fontFamily: monospaceFontFamily, fontSize: '0.78rem' }}>
                      {problem.location}
                      {': '}
                    </Box>
                  )}
                  {problem.description}
                </Typography>
                {problem.hint && (
                  <Typography variant="caption" color="text.secondary" component="p">
                    {uiText('Hint: ', '提示：')}{problem.hint}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
      {count > MAX_SHOWN && (
        <Typography variant="caption" component="p">
          {count - MAX_SHOWN}{uiText(' more not shown; PUT /mockserver/openapi?includeLoadProblems=true returns every problem.', ' 个问题未显示。可通过 PUT /mockserver/openapi?includeLoadProblems=true 查看全部问题。')}
        </Typography>
      )}
    </Alert>
  );
}

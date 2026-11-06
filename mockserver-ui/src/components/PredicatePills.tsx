import { uiText } from '../lib/dashboardLocale';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import type { ConversationPredicates } from '../lib/llmTraffic';

interface PredicatePillsProps {
  predicates: ConversationPredicates;
}

interface PillDef {
  key: string;
  label: string;
}

// Cap user-supplied values rendered in pill labels so a long regex source or
// substring (whether accidental or deliberately crafted) cannot break the
// dashboard layout. Chip labels are React nodes (not HTML), so this is a
// length-only concern — not an XSS one.
const MAX_PILL_VALUE_LENGTH = 60;

function truncate(value: string): string {
  if (value.length <= MAX_PILL_VALUE_LENGTH) return value;
  return value.substring(0, MAX_PILL_VALUE_LENGTH) + '…';
}

function buildPills(predicates: ConversationPredicates): PillDef[] {
  const pills: PillDef[] = [];

  // The turnIndex predicate is intentionally NOT rendered as a pill here —
  // the parent JsonListItem already shows a `turn N of M` ordering chip
  // derived from scenario state, which is more useful (it's always present
  // even when the turn matches via other predicates) and would be a
  // duplicate with this pill.
  if (predicates.latestMessageContains != null) {
    pills.push({
      key: 'latestMessageContains',
      label: uiText(`latest msg ⊃ "${truncate(predicates.latestMessageContains)}"`, `最新消息包含“${truncate(predicates.latestMessageContains)}”`),
    });
  }
  if (predicates.latestMessageMatches != null) {
    pills.push({
      key: 'latestMessageMatches',
      label: uiText(`latest msg ~ /${truncate(predicates.latestMessageMatches)}/`, `最新消息匹配 /${truncate(predicates.latestMessageMatches)}/`),
    });
  }
  if (predicates.latestMessageRole != null) {
    pills.push({
      key: 'latestMessageRole',
      label: uiText(`latest role = ${predicates.latestMessageRole}`, `最新消息角色 = ${predicates.latestMessageRole}`),
    });
  }
  if (predicates.containsToolResultFor != null) {
    pills.push({
      key: 'containsToolResultFor',
      label: uiText(`has tool_result for ${truncate(predicates.containsToolResultFor)}`, `包含 ${truncate(predicates.containsToolResultFor)} 的工具执行结果`),
    });
  }
  if (predicates.semanticMatchAgainst != null) {
    // Flagged "exploratory" to match the wizard: this predicate is opt-in,
    // non-deterministic (LLM-judged), and never on the assertion path.
    pills.push({
      key: 'semanticMatchAgainst',
      label: uiText(`semantic ≈ "${truncate(predicates.semanticMatchAgainst)}" (exploratory)`, `语义接近“${truncate(predicates.semanticMatchAgainst)}”（实验性）`),
    });
  }
  if (predicates.normalization != null) {
    const n = predicates.normalization;
    const parts: string[] = [];
    if (n.collapseWhitespace) parts.push(uiText('ws', "合并空白"));
    if (n.lowercase) parts.push(uiText('lower', "转为小写"));
    if (n.sortJsonKeys) parts.push(uiText('json-keys', "JSON 键排序"));
    if (n.dropBuiltInVolatileFields) parts.push(uiText('volatile', "移除动态字段"));
    if (n.dropVolatileFields && n.dropVolatileFields.length > 0) parts.push(uiText(`drop ${n.dropVolatileFields.length}`, `移除 ${n.dropVolatileFields.length} 个字段`));
    pills.push({
      key: 'normalization',
      label: parts.length > 0 ? uiText(`normalised: ${parts.join(', ')}`, `已规范化：${parts.join(', ')}`) : uiText('normalised', "已规范化"),
    });
  }

  return pills;
}

export default function PredicatePills({ predicates }: PredicatePillsProps) {
  const pills = buildPills(predicates);
  if (pills.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {pills.map((pill) => (
        <Chip
          key={pill.key}
          label={pill.label}
          size="small"
          color="info"
          variant="outlined"
          sx={{ height: 22 }}
        />
      ))}
    </Box>
  );
}

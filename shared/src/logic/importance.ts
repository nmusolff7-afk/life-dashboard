/**
 * Email importance classifier — deterministic, sub-millisecond.
 *
 * Primary signal: sender/domain rules learned from user labels. Port of
 * db.py score_email_importance + get_importance_rules.
 *
 * Secondary signals (scaffolded for future use — Flask v1.18 does not
 * populate keyword or thread rules):
 *   - keyword matches in subject/body
 *   - user reply behavior in the thread
 */

export type ImportanceLabel = 'important' | 'unimportant';
export type Classification = 'important' | 'stream';

export interface ImportanceRule {
  /** Sender address (will be lowercased & trimmed). */
  sender: string;
  /** Sender domain without the '@'. Derived from the email if empty. */
  senderDomain: string;
  label: ImportanceLabel;
  /** How many times the user has applied this label to this sender. */
  count: number;
}

export interface KeywordRule {
  keyword: string;
  /** Positive boosts importance; negative demotes. */
  weight: number;
}

export interface ImportanceRules {
  senderRules: ImportanceRule[];
  keywordRules?: KeywordRule[];
  /** Points added when userRepliedInThread is true. Default 1. */
  threadReplyWeight?: number;
}

export interface ImportanceInput {
  sender: string;
  subject?: string;
  bodyPreview?: string;
  userRepliedInThread?: boolean;
}

export interface ImportanceBreakdown {
  senderRules: number;
  keywords: number;
  thread: number;
}

export interface ImportanceResult {
  score: number;
  classification: Classification;
  breakdown: ImportanceBreakdown;
}

/** Build the {sender|@domain: score} map from raw label rows. Mirrors db.py get_importance_rules. */
export function buildRuleScores(rules: ImportanceRule[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const r of rules) {
    const value = r.label === 'important' ? r.count : -r.count;
    const sender = r.sender.trim().toLowerCase();
    scores[sender] = (scores[sender] ?? 0) + value;
    const domain = r.senderDomain.trim().toLowerCase();
    if (domain) {
      const key = '@' + domain;
      scores[key] = (scores[key] ?? 0) + value * 0.5;
    }
  }
  return scores;
}

export function classifyImportance(
  input: ImportanceInput,
  rules: ImportanceRules,
): ImportanceResult {
  // Signal 1: sender/domain rules (the active Flask signal).
  const scores = buildRuleScores(rules.senderRules);
  const senderClean = input.sender.trim().toLowerCase();
  const senderMatch = scores[senderClean] ?? 0;
  const domain = senderClean.includes('@') ? senderClean.split('@').pop() ?? '' : '';
  const domainMatch = domain ? (scores['@' + domain] ?? 0) : 0;
  const senderRulesSignal = senderMatch + domainMatch;

  // Signal 2: keyword hits in subject + body.
  const keywordRules = rules.keywordRules ?? [];
  const content = `${input.subject ?? ''} ${input.bodyPreview ?? ''}`.toLowerCase();
  let keywordsSignal = 0;
  for (const k of keywordRules) {
    if (!k.keyword) continue;
    if (content.includes(k.keyword.toLowerCase())) {
      keywordsSignal += k.weight;
    }
  }

  // Signal 3: thread reciprocity.
  const replyWeight = rules.threadReplyWeight ?? 1;
  const threadSignal = input.userRepliedInThread ? replyWeight : 0;

  const total = senderRulesSignal + keywordsSignal + threadSignal;
  return {
    score: total,
    classification: total > 0 ? 'important' : 'stream',
    breakdown: {
      senderRules: senderRulesSignal,
      keywords: keywordsSignal,
      thread: threadSignal,
    },
  };
}

/**
 * Client-side intent classifier — PRD §4.7.9.
 *
 * Fast regex-based check that runs before any API call. Catches three
 * states:
 *   - `logging_intent` — user typed "log 3 eggs" / "I ate a sandwich" /
 *     "spent $14 at Starbucks" etc. Returns a templated redirect per
 *     §4.7.8 without burning an AI call.
 *   - `out_of_scope`   — medical/investment/external-world queries. Refused
 *     client-side with no AI round-trip.
 *   - `query_intent`   — everything else. Forwarded to /api/chatbot/query.
 *
 * Returns domain tags only as hints for future container-selection
 * optimization — the server currently loads all real containers
 * regardless, so tags are informational at Phase 4.
 */

export type ChatIntent =
  | { kind: 'logging'; domain: LogDomain; confidence: number }
  | { kind: 'out_of_scope'; reason: OutOfScopeReason }
  | { kind: 'query'; domains: Domain[] };

export type LogDomain = 'meal' | 'workout' | 'weight' | 'transaction' | 'task' | 'generic';
export type Domain = 'nutrition' | 'fitness' | 'finance' | 'life';
export type OutOfScopeReason = 'medical' | 'investment' | 'external_world' | 'action';

const LOG_VERBS = /\b(log|logged|add|ate|had|eating|drank|drinking|spent|paid|bought|ran|jogged|walked|worked out|worked out)\b/i;
const MEAL_NOUNS = /\b(breakfast|lunch|dinner|snack|meal|eggs?|sandwich|salad|pizza|chicken|rice|pasta|protein shake|smoothie|coffee|oatmeal|burrito|taco|bowl|banana|apple)\b/i;
const WORKOUT_NOUNS = /\b(workout|run|jog|lift|lifted|bench|squat|deadlift|press|cardio|sets?|reps?|session|training)\b/i;
const TRANSACTION_HINT = /\$[\d]+|\b(\d+\s+dollars?)\b/i;
const TASK_HINT = /\b(add (a |an )?task|todo|reminder)\b/i;
const WEIGHT_HINT = /\b(weigh(?:ed)? \d|scale said|\d+\s*lbs?|body\s?weight)\b/i;

const MEDICAL = /\b(safe to|should I take|medication|symptom|diagnos|disease|fast(?:ing)? for|doctor)\b/i;
const INVESTMENT = /\b(buy|sell)\s+[A-Z]{2,5}\b|\binvest(?:ment)? advice\b|\bstock pick\b/i;
const EXTERNAL = /\b(weather|news|game|score|president|election|movie|concert)\b/i;
const ACTION = /\b(send|email|text|message|call|write|draft (me )?an email)\b/i;

/** Runs in <1ms. Pure function. */
export function classifyChatIntent(input: string): ChatIntent {
  const q = input.trim();
  if (!q) return { kind: 'query', domains: [] };

  // Medical / investment / external / action → refuse client-side
  if (MEDICAL.test(q)) return { kind: 'out_of_scope', reason: 'medical' };
  if (INVESTMENT.test(q)) return { kind: 'out_of_scope', reason: 'investment' };
  if (EXTERNAL.test(q)) return { kind: 'out_of_scope', reason: 'external_world' };
  if (ACTION.test(q)) return { kind: 'out_of_scope', reason: 'action' };

  // Logging intent detection
  const hasLogVerb = LOG_VERBS.test(q);
  const hasMealHint = MEAL_NOUNS.test(q);
  const hasWorkoutHint = WORKOUT_NOUNS.test(q);
  const hasTxnHint = TRANSACTION_HINT.test(q);
  const hasTaskHint = TASK_HINT.test(q);
  const hasWeightHint = WEIGHT_HINT.test(q);

  if (hasLogVerb && hasMealHint) return { kind: 'logging', domain: 'meal', confidence: 0.9 };
  if (hasLogVerb && hasWorkoutHint) return { kind: 'logging', domain: 'workout', confidence: 0.9 };
  if (hasLogVerb && hasWeightHint) return { kind: 'logging', domain: 'weight', confidence: 0.85 };
  if (hasTxnHint) return { kind: 'logging', domain: 'transaction', confidence: 0.8 };
  if (hasTaskHint) return { kind: 'logging', domain: 'task', confidence: 0.85 };

  // Simple declarative "I ate / I had / I ran" without obvious nouns
  if (/^(I|i)['']?ve? (ate|had|did|ran|jogged|walked)\b/.test(q)) {
    return { kind: 'logging', domain: 'generic', confidence: 0.75 };
  }

  // Domain tagging for informational purposes
  const domains: Domain[] = [];
  if (/\b(calorie|protein|carb|fat|macro|meal|nutrition|fiber|sugar|sodium)\b/i.test(q)) domains.push('nutrition');
  if (/\b(workout|run|lift|steps|weight|sleep|recover|strength|cardio|muscle)\b/i.test(q)) domains.push('fitness');
  if (/\b(spend|budget|saving|bill|finance|money|debit|credit|bank|afford)\b/i.test(q)) domains.push('finance');
  if (/\b(task|calendar|email|focus|schedule|meeting|reminder)\b/i.test(q)) domains.push('life');

  return { kind: 'query', domains };
}

export const LOG_REDIRECTS: Record<LogDomain, string> = {
  meal:
    "I don't log meals directly — tap the Log Meal shortcut or head to Nutrition to log that. I can answer nutrition questions though, like how you're doing on protein today.",
  workout:
    "I don't log workouts directly — tap the Log Workout shortcut to record that. I can answer training questions, like how your strength progress looks this month.",
  weight:
    "I don't log weight directly — tap Log Weight on the Fitness tab. I can answer questions about your weight trend or goal pace.",
  transaction:
    "I don't log transactions — those come from your bank connection. I can answer finance questions once you've connected a bank.",
  task:
    "I don't create tasks directly — that comes in once calendar + email are connected. I can answer life questions then.",
  generic:
    "I don't log entries directly — use the shortcut buttons to log quickly. I can answer questions about your data, like how your week is going.",
};

export const OUT_OF_SCOPE_RESPONSES: Record<OutOfScopeReason, string> = {
  medical:
    "I can't give medical advice. I can share what your data shows — want me to summarize your last week?",
  investment:
    "I can't give investment advice. I can summarize your own spending and saving patterns once finance is connected.",
  external_world:
    "I don't have access to outside information — I can only answer about your own data.",
  action:
    "I can't send messages or compose external things from here. I can answer questions about your data though.",
};

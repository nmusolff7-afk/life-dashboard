import { describe, expect, it } from 'vitest';

import {
  buildRuleScores,
  classifyImportance,
  type ImportanceRule,
} from '../importance';

const boss: ImportanceRule = {
  sender: 'boss@example.com',
  senderDomain: 'example.com',
  label: 'important',
  count: 3,
};
const newsletter: ImportanceRule = {
  sender: 'deals@newsletter.biz',
  senderDomain: 'newsletter.biz',
  label: 'unimportant',
  count: 2,
};

describe('buildRuleScores', () => {
  it('important adds +count to sender and +count*0.5 to domain', () => {
    const scores = buildRuleScores([boss]);
    expect(scores['boss@example.com']).toBe(3);
    expect(scores['@example.com']).toBe(1.5);
  });

  it('unimportant adds -count to sender and -count*0.5 to domain', () => {
    const scores = buildRuleScores([newsletter]);
    expect(scores['deals@newsletter.biz']).toBe(-2);
    expect(scores['@newsletter.biz']).toBe(-1);
  });

  it('sender stored lowercased and trimmed', () => {
    const rule: ImportanceRule = {
      sender: '  BOSS@EXAMPLE.COM  ',
      senderDomain: 'EXAMPLE.COM',
      label: 'important',
      count: 1,
    };
    const scores = buildRuleScores([rule]);
    expect(scores['boss@example.com']).toBe(1);
    expect(scores['@example.com']).toBe(0.5);
  });
});

describe('classifyImportance — default rules (no signals)', () => {
  it('unknown sender, no rules → score 0, stream', () => {
    const r = classifyImportance(
      { sender: 'unknown@stranger.com' },
      { senderRules: [] },
    );
    expect(r.score).toBe(0);
    expect(r.classification).toBe('stream');
    expect(r.breakdown).toEqual({ senderRules: 0, keywords: 0, thread: 0 });
  });
});

describe('classifyImportance — sender/domain rules', () => {
  it('exact sender match: +3 sender + 1.5 domain = 4.5 → important', () => {
    const r = classifyImportance(
      { sender: 'boss@example.com' },
      { senderRules: [boss] },
    );
    expect(r.score).toBe(4.5);
    expect(r.classification).toBe('important');
    expect(r.breakdown.senderRules).toBe(4.5);
  });

  it('different sender but matching domain: only domain signal', () => {
    const r = classifyImportance(
      { sender: 'colleague@example.com' },
      { senderRules: [boss] },
    );
    expect(r.score).toBe(1.5);
    expect(r.classification).toBe('important');
  });

  it('unimportant sender wins: -2 sender + -1 domain = -3 → stream', () => {
    const r = classifyImportance(
      { sender: 'deals@newsletter.biz' },
      { senderRules: [newsletter] },
    );
    expect(r.score).toBe(-3);
    expect(r.classification).toBe('stream');
  });

  it('case-insensitive sender match', () => {
    const r = classifyImportance(
      { sender: 'BOSS@Example.COM' },
      { senderRules: [boss] },
    );
    expect(r.score).toBe(4.5);
  });
});

describe('classifyImportance — keyword signal', () => {
  it('boost keyword hit in subject → adds weight', () => {
    const r = classifyImportance(
      { sender: 'random@x.com', subject: 'URGENT: review needed' },
      {
        senderRules: [],
        keywordRules: [{ keyword: 'urgent', weight: 2 }],
      },
    );
    expect(r.breakdown.keywords).toBe(2);
    expect(r.classification).toBe('important');
  });

  it('demote keyword hit in body preview → subtracts weight', () => {
    const r = classifyImportance(
      {
        sender: 'sale@store.com',
        subject: 'special offer',
        bodyPreview: 'unsubscribe anytime',
      },
      {
        senderRules: [],
        keywordRules: [{ keyword: 'unsubscribe', weight: -3 }],
      },
    );
    expect(r.breakdown.keywords).toBe(-3);
    expect(r.classification).toBe('stream');
  });

  it('multiple keyword hits stack', () => {
    const r = classifyImportance(
      { sender: 'a@b.com', subject: 'urgent deadline tomorrow' },
      {
        senderRules: [],
        keywordRules: [
          { keyword: 'urgent', weight: 2 },
          { keyword: 'deadline', weight: 1 },
        ],
      },
    );
    expect(r.breakdown.keywords).toBe(3);
  });

  it('no keyword match → 0 contribution', () => {
    const r = classifyImportance(
      { sender: 'a@b.com', subject: 'hello' },
      {
        senderRules: [],
        keywordRules: [{ keyword: 'urgent', weight: 2 }],
      },
    );
    expect(r.breakdown.keywords).toBe(0);
  });
});

describe('classifyImportance — thread signal', () => {
  it('user replied in thread → +1 default', () => {
    const r = classifyImportance(
      { sender: 'a@b.com', userRepliedInThread: true },
      { senderRules: [] },
    );
    expect(r.breakdown.thread).toBe(1);
    expect(r.classification).toBe('important');
  });

  it('no reply → 0', () => {
    const r = classifyImportance(
      { sender: 'a@b.com' },
      { senderRules: [] },
    );
    expect(r.breakdown.thread).toBe(0);
  });

  it('custom threadReplyWeight honored', () => {
    const r = classifyImportance(
      { sender: 'a@b.com', userRepliedInThread: true },
      { senderRules: [], threadReplyWeight: 5 },
    );
    expect(r.breakdown.thread).toBe(5);
  });
});

describe('classifyImportance — combined scoring', () => {
  it('sender (+4.5) + keyword (-3) + thread (+1) = 2.5 → important', () => {
    const r = classifyImportance(
      {
        sender: 'boss@example.com',
        subject: 'unsubscribe from this newsletter',
        userRepliedInThread: true,
      },
      {
        senderRules: [boss],
        keywordRules: [{ keyword: 'unsubscribe', weight: -3 }],
      },
    );
    expect(r.score).toBe(2.5);
    expect(r.classification).toBe('important');
    expect(r.breakdown).toEqual({ senderRules: 4.5, keywords: -3, thread: 1 });
  });

  it('tie at 0 → stream (score > 0 required for important)', () => {
    const r = classifyImportance(
      { sender: 'a@b.com' },
      { senderRules: [] },
    );
    expect(r.score).toBe(0);
    expect(r.classification).toBe('stream');
  });
});

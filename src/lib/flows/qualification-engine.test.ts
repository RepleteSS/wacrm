import { describe, it, expect } from 'vitest';
import {
  evaluateProductSuitability,
  calculateLeadScore,
  isOptOutMessage,
  deriveVarKeyForNode,
  handleHumanHandoffInCrm,
  parseAttributionSource,
  extractReferralSource,
  persistLeadSourceIfEmpty,
  WELCOME_TO_PRIMARY_NEED_MAP,
  REPETE_TAGS,
  REPETE_PIPELINE_STAGES,
  REPETE_CUSTOM_FIELDS,
  type QualificationAnswers,
} from './qualification-engine';

describe('Qualification Engine — Product Suitability & 100-Point Scoring', () => {
  // Scenario 1: Beginner with a fundamentals requirement
  it('Scenario 1: Beginner with fundamentals need -> Foundations, Qualified score', () => {
    const answers: QualificationAnswers = {
      welcome_interest: 'wel_fundamentals',
      primary_need: 'pneed_basics',
      trading_experience: 'exp_beginner',
      options_knowledge: 'know_beginner',
      trading_capital_band: 'cap_50k_1l',
      primary_challenge: 'chal_fundamentals',
      time_availability: 'time_1_2h',
      support_preference: 'supp_basics',
      purchase_readiness: 'ready_7d_fnd',
    };

    const res = evaluateProductSuitability(answers, 0);
    expect(res.product).toBe('foundations');
    expect(res.isContradictory).toBe(false);
    expect(res.recommendedTags).toContain(REPETE_TAGS.FOUNDATION);
    expect(res.recommendedTags).toContain(REPETE_TAGS.QUALIFIED);
    // Score check: Need(25) + Exp(5) + Chal(10) + Readiness(20) + Engagement(10) = 70
    expect(res.score).toBe(70);
    expect(res.scoreBand).toBe('QUALIFIED');
  });

  // Scenario 2: Experienced trader seeking a structured execution framework
  it('Scenario 2: Experienced trader seeking structured execution -> Execution System, High Intent', () => {
    const answers: QualificationAnswers = {
      welcome_interest: 'wel_execution',
      primary_need: 'pneed_execution',
      trading_experience: 'exp_1_3yr',
      options_knowledge: 'know_independent',
      trading_capital_band: 'cap_3_5l',
      primary_challenge: 'chal_discipline',
      time_availability: 'time_lt_30m',
      support_preference: 'supp_execution',
      purchase_readiness: 'ready_now_exe',
    };

    const res = evaluateProductSuitability(answers, 0);
    expect(res.product).toBe('execution_system');
    expect(res.isContradictory).toBe(false);
    expect(res.recommendedTags).toContain(REPETE_TAGS.EXECUTION);
    expect(res.recommendedTags).toContain(REPETE_TAGS.HIGH_INTENT);
    // Score check: Need(30) + Exp(20) + Chal(15) + Readiness(20) + Engagement(15) = 100
    expect(res.score).toBe(100);
    expect(res.scoreBand).toBe('HIGH_INTENT');
  });

  // Scenario 3: Experienced trader seeking advanced hedging education
  it('Scenario 3: Experienced trader seeking advanced hedging -> Mentorship, High Intent', () => {
    const answers: QualificationAnswers = {
      welcome_interest: 'wel_mentorship',
      primary_need: 'pneed_advanced',
      trading_experience: 'exp_3_5yr',
      options_knowledge: 'know_experienced',
      trading_capital_band: 'cap_above_10l',
      primary_challenge: 'chal_hedges',
      time_availability: 'time_gt_2h',
      support_preference: 'supp_mentorship',
      purchase_readiness: 'ready_now_mnt',
    };

    const res = evaluateProductSuitability(answers, 0);
    expect(res.product).toBe('mentorship');
    expect(res.isContradictory).toBe(false);
    expect(res.recommendedTags).toContain(REPETE_TAGS.MENTORSHIP);
    expect(res.recommendedTags).toContain(REPETE_TAGS.HIGH_INTENT);
    // Score check: Need(30) + Exp(20) + Chal(15) + Readiness(20) + Engagement(15) = 100
    expect(res.score).toBe(100);
  });

  // Scenario 4: High-capital beginner
  it('Scenario 4: High-capital beginner (>10L capital, ready now) -> Foundations ONLY, never Mentorship', () => {
    const answers: QualificationAnswers = {
      welcome_interest: 'wel_mentorship', // User mistakenly wanted mentorship
      primary_need: 'pneed_basics',
      trading_experience: 'exp_beginner', // Beginner!
      options_knowledge: 'know_beginner',
      trading_capital_band: 'cap_above_10l', // High capital
      primary_challenge: 'chal_fundamentals',
      time_availability: 'time_1_2h',
      support_preference: 'supp_mentorship',
      purchase_readiness: 'ready_now_mnt', // High intent
    };

    const res = evaluateProductSuitability(answers, 0);
    expect(res.product).toBe('foundations');
    expect(res.product).not.toBe('mentorship');
    expect(res.rationale).toContain('Even with substantial capital');
    expect(res.recommendedTags).toContain(REPETE_TAGS.FOUNDATION);
  });

  // Scenario 5: Low-capital experienced trader
  it('Scenario 5: Experienced trader with low capital (<50k) seeking execution -> Execution System with tailored capital rationale', () => {
    const answers: QualificationAnswers = {
      welcome_interest: 'wel_execution',
      primary_need: 'pneed_process',
      trading_experience: 'exp_1_3yr',
      options_knowledge: 'know_independent',
      trading_capital_band: 'cap_below_50k',
      primary_challenge: 'chal_consistency',
      time_availability: 'time_1_2h',
      support_preference: 'supp_execution',
      purchase_readiness: 'ready_7d_exe',
    };

    const res = evaluateProductSuitability(answers, 0);
    expect(res.product).toBe('execution_system');
    expect(res.rationale).toContain('defined-risk spread structures adaptable to your capital scale');
    expect(res.recommendedTags).toContain(REPETE_TAGS.EXECUTION);
  });

  // Scenario 6: Prospect who is still researching
  it('Scenario 6: Prospect who is still researching -> Researching tag, Nurture stage', () => {
    const answers: QualificationAnswers = {
      welcome_interest: 'wel_fundamentals',
      primary_need: 'pneed_explore',
      trading_experience: 'exp_lt_1yr',
      options_knowledge: 'know_basics',
      trading_capital_band: 'cap_undisclosed',
      primary_challenge: 'chal_unsure',
      time_availability: 'time_lt_30m',
      support_preference: 'supp_unsure',
      purchase_readiness: 'ready_research_fnd',
    };

    const res = evaluateProductSuitability(answers, 0);
    expect(res.product).toBe('human_review');
    expect(res.scoreBand).toBe('RESEARCHING');
    // Need(5) + Exp(10) + Chal(5) + Readiness(0) + Engagement(10) = 30 (<50)
    expect(res.score).toBe(30);
  });

  // Scenario 7: Prospect with contradictory answers
  it('Scenario 7: Contradictory answers (Beginner exp + Claims Advanced knowledge) -> Human Review', () => {
    const answers: QualificationAnswers = {
      welcome_interest: 'wel_execution',
      primary_need: 'pneed_advanced',
      trading_experience: 'exp_beginner', // Beginner
      options_knowledge: 'know_experienced', // Claims advanced knowledge
      trading_capital_band: 'cap_1_3l',
      primary_challenge: 'chal_hedges',
      time_availability: 'time_1_2h',
      support_preference: 'supp_mentorship',
      purchase_readiness: 'ready_now_mnt',
    };

    const res = evaluateProductSuitability(answers, 0);
    expect(res.product).toBe('human_review');
    expect(res.isContradictory).toBe(true);
    expect(res.recommendedTags).toContain(REPETE_TAGS.NEEDS_HUMAN_REVIEW);
  });

  // Scenario 8: Prospect requesting a human
  it('Scenario 8: Direct request for human -> Human Review with appropriate tags and stage', () => {
    const answers: QualificationAnswers = {
      welcome_interest: 'wel_team',
    };

    const res = evaluateProductSuitability(answers, 0);
    expect(res.product).toBe('human_review');
    expect(res.pipelineStageName).toBe('Human Follow-up Required');
    expect(res.recommendedTags).toContain(REPETE_TAGS.NEEDS_HUMAN_REVIEW);
  });

  // Scenario 9: Opt-Out detection
  it('Scenario 9: Opt-out messages detected accurately', () => {
    expect(isOptOutMessage('STOP')).toBe(true);
    expect(isOptOutMessage('stop')).toBe(true);
    expect(isOptOutMessage('unsubscribe')).toBe(true);
    expect(isOptOutMessage('OPT OUT')).toBe(true);
    expect(isOptOutMessage('CANCEL')).toBe(true);
    expect(isOptOutMessage('Hello there')).toBe(false);
  });

  // Score Band Boundaries & Exact Model Verification
  it('Score band boundaries: 80+ HIGH_INTENT, 50-79 QUALIFIED, <50 RESEARCHING', () => {
    // 25 + 20 + 15 + 30 + 10 = 100
    const score100 = calculateLeadScore({
      primary_need: 'pneed_basics',
      trading_experience: 'exp_gt_5yr',
      primary_challenge: 'chal_discipline',
      purchase_readiness: 'ready_now_fnd',
    }, 0);
    expect(score100.score).toBe(100);
    expect(score100.band).toBe('HIGH_INTENT');

    // Incomplete answers
    const incomplete = calculateLeadScore({
      primary_need: 'pneed_explore', // 5
      trading_experience: 'exp_beginner', // 5
    }, 0);
    // 5 + 5 + 0 + 0 + 10 = 20
    expect(incomplete.score).toBe(20);
    expect(incomplete.band).toBe('RESEARCHING');
  });

  // Category-by-category scoring unit tests
  it('Scoring: Need & Product Fit awards correct points', () => {
    expect(calculateLeadScore({ primary_need: 'pneed_basics' }).breakdown.needAlignment).toBe(25);
    expect(calculateLeadScore({ primary_need: 'pneed_execution' }).breakdown.needAlignment).toBe(25);
    expect(calculateLeadScore({ primary_need: 'pneed_advanced' }).breakdown.needAlignment).toBe(25);
    expect(calculateLeadScore({ primary_need: 'pneed_process' }).breakdown.needAlignment).toBe(15);
    expect(calculateLeadScore({ primary_need: 'pneed_explore' }).breakdown.needAlignment).toBe(5);
    expect(calculateLeadScore({}).breakdown.needAlignment).toBe(0);
  });

  it('Scoring: Trading Experience awards correct points and fixes >5yr anomaly', () => {
    expect(calculateLeadScore({ trading_experience: 'exp_gt_5yr' }).breakdown.tradingExperience).toBe(20);
    expect(calculateLeadScore({ trading_experience: 'exp_3_5yr' }).breakdown.tradingExperience).toBe(20);
    expect(calculateLeadScore({ trading_experience: 'exp_1_3yr' }).breakdown.tradingExperience).toBe(20);
    expect(calculateLeadScore({ trading_experience: 'exp_lt_1yr' }).breakdown.tradingExperience).toBe(10);
    expect(calculateLeadScore({ trading_experience: 'exp_beginner' }).breakdown.tradingExperience).toBe(5);
  });

  it('Scoring: Challenge Clarity awards correct points', () => {
    expect(calculateLeadScore({ primary_challenge: 'chal_discipline' }).breakdown.challengeClarity).toBe(15);
    expect(calculateLeadScore({ primary_challenge: 'chal_consistency' }).breakdown.challengeClarity).toBe(15);
    expect(calculateLeadScore({ primary_challenge: 'chal_hedges' }).breakdown.challengeClarity).toBe(15);
    expect(calculateLeadScore({ primary_challenge: 'chal_time' }).breakdown.challengeClarity).toBe(15);
    expect(calculateLeadScore({ primary_challenge: 'chal_strategies' }).breakdown.challengeClarity).toBe(10);
    expect(calculateLeadScore({ primary_challenge: 'chal_fundamentals' }).breakdown.challengeClarity).toBe(10);
    expect(calculateLeadScore({ primary_challenge: 'chal_unsure' }).breakdown.challengeClarity).toBe(5);
  });

  it('Scoring: Purchase Readiness awards correct points and decouples researching', () => {
    expect(calculateLeadScore({ purchase_readiness: 'ready_now_exe' }).breakdown.readiness).toBe(30);
    expect(calculateLeadScore({ purchase_readiness: 'ready_7d_exe' }).breakdown.readiness).toBe(20);
    expect(calculateLeadScore({ purchase_readiness: 'ready_30d_exe' }).breakdown.readiness).toBe(10);
    expect(calculateLeadScore({ purchase_readiness: 'ready_research_exe' }).breakdown.readiness).toBe(0);
  });

  it('Scoring: Engagement Quality awards correct points based on reprompts', () => {
    expect(calculateLeadScore({}, 0).breakdown.engagement).toBe(10);
    expect(calculateLeadScore({}, 1).breakdown.engagement).toBe(5);
    expect(calculateLeadScore({}, 2).breakdown.engagement).toBe(2);
    expect(calculateLeadScore({}, 5).breakdown.engagement).toBe(2);
  });

  it('Scoring: Strict boundary enforcement [0, 100]', () => {
    // Maximum theoretical inputs
    const maxScore = calculateLeadScore({
      primary_need: 'pneed_execution', // 25
      trading_experience: 'exp_gt_5yr', // 20
      primary_challenge: 'chal_discipline', // 15
      purchase_readiness: 'ready_now_exe', // 30
    }, 0); // 10
    expect(maxScore.score).toBe(100);

    // Minimum inputs
    const minScore = calculateLeadScore({}, 5);
    expect(minScore.score).toBe(2);
    expect(minScore.score).toBeGreaterThanOrEqual(0);
    expect(minScore.score).toBeLessThanOrEqual(100);
  });

  // Welcome Menu Mapping Verification
  it('Welcome Menu: maps selections to primary_need accurately', () => {
    expect(WELCOME_TO_PRIMARY_NEED_MAP['wel_fundamentals']).toBe('pneed_basics');
    expect(WELCOME_TO_PRIMARY_NEED_MAP['wel_execution']).toBe('pneed_execution');
    expect(WELCOME_TO_PRIMARY_NEED_MAP['wel_mentorship']).toBe('pneed_advanced');
    expect(WELCOME_TO_PRIMARY_NEED_MAP['wel_team']).toBeUndefined();
  });

  // Lead Acquisition Attribution Parsing
  it('Attribution: parses supported source identifiers accurately and strips tags', () => {
    expect(parseAttributionSource('Hello [src:x]')).toEqual({ cleanText: 'Hello', source: 'X' });
    expect(parseAttributionSource('Hi [src:linkedin] I want details')).toEqual({ cleanText: 'Hi  I want details', source: 'LinkedIn' });
    expect(parseAttributionSource('Starting trading [src:telegram]')).toEqual({ cleanText: 'Starting trading', source: 'Telegram' });
    expect(parseAttributionSource('[src:website] Hello Replete')).toEqual({ cleanText: 'Hello Replete', source: 'Website' });
    expect(parseAttributionSource('Referral link [src:referral]')).toEqual({ cleanText: 'Referral link', source: 'Referral' });
    
    // Case insensitivity
    expect(parseAttributionSource('Hi [SRC:LINKEDIN]')).toEqual({ cleanText: 'Hi', source: 'LinkedIn' });
    
    // Invalid source tag is stripped but returns null source
    expect(parseAttributionSource('Hi [src:unknown_channel]')).toEqual({ cleanText: 'Hi', source: null });
    
    // No attribution tag
    expect(parseAttributionSource('Hi regular message')).toEqual({ cleanText: 'Hi regular message', source: null });
  });

  it('Attribution: extracts Meta referral source from ad or URL', () => {
    expect(extractReferralSource({ source_type: 'ad', source_id: 'ad-123' })).toBe('Meta Ads');
    expect(extractReferralSource({ source_url: 'https://repleteequities.com' })).toBe('Website');
    expect(extractReferralSource(null)).toBeNull();
  });

  it('Attribution: persistLeadSourceIfEmpty preserves original source and does not overwrite', async () => {
    const existingValues: any[] = [];
    const mockDb = {
      from: (table: string) => ({
        select: () => ({
          eq: (_col1: string, _val1: any) => ({
            eq: (_col2: string, _val2: any) => ({
              maybeSingle: async () => ({
                data: existingValues.find(v => v.custom_field_id === REPETE_CUSTOM_FIELDS.LEAD_SOURCE) || null,
              }),
            }),
          }),
        }),
        upsert: (row: any) => {
          existingValues.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    };

    // First source: saved
    await persistLeadSourceIfEmpty(mockDb, 'c-100', 'X');
    expect(existingValues.length).toBe(1);
    expect(existingValues[0].value).toBe('X');

    // Second source on subsequent message: preserved (NOT overwritten)
    await persistLeadSourceIfEmpty(mockDb, 'c-100', 'LinkedIn');
    expect(existingValues.length).toBe(1);
    expect(existingValues[0].value).toBe('X');
  });

  // Human Handoff Lead Dossier Persistence
  it('Human Handoff: persists complete lead dossier in CONVERSATION_NOTES without duplicate retry', async () => {
    const customValues: any[] = [];
    const tags: any[] = [];
    const deals: any[] = [];
    const convs: any[] = [];

    const mockDb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: customValues.find(v => v.custom_field_id === REPETE_CUSTOM_FIELDS.CONVERSATION_NOTES) || null,
              }),
            }),
          }),
        }),
        upsert: (row: any) => {
          if (table === 'contact_custom_values') {
            const idx = customValues.findIndex(v => v.custom_field_id === row.custom_field_id);
            if (idx >= 0) customValues[idx] = row;
            else customValues.push(row);
          }
          if (table === 'contact_tags') tags.push(row);
          return Promise.resolve({ error: null });
        },
        update: (row: any) => ({
          eq: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        }),
      }),
    };

    const vars: QualificationAnswers = {
      primary_need: 'pneed_execution',
      trading_experience: 'exp_gt_5yr',
      options_knowledge: 'know_independent',
      trading_capital_band: 'cap_3_5l',
      time_availability: 'time_lt_30m',
      primary_challenge: 'chal_discipline',
      purchase_readiness: 'ready_now_exe',
    };

    // First call: generates dossier
    await handleHumanHandoffInCrm(mockDb, {
      contactId: 'c-200',
      accountId: 'a-200',
      reason: 'User requested team walkthrough',
      vars,
      contactName: 'Rohit Sharma',
      contactPhone: '+91 98765 43210',
    });

    const noteRecord = customValues.find(v => v.custom_field_id === REPETE_CUSTOM_FIELDS.CONVERSATION_NOTES);
    expect(noteRecord).toBeDefined();
    expect(noteRecord.value).toContain('Human Handoff Request: User requested team walkthrough');
    expect(noteRecord.value).toContain('--- LEAD QUALIFICATION DOSSIER ---');
    expect(noteRecord.value).toContain('Rohit Sharma (+91 98765 43210)');
    expect(noteRecord.value).toContain('Systematic Execution Framework');
    expect(noteRecord.value).toContain('5+ Years');
    expect(noteRecord.value).toContain('Lead Score: 100/100 (HIGH_INTENT)');

    // Retry call with same reason: idempotent, does not duplicate dossier
    const lenBefore = noteRecord.value.length;
    await handleHumanHandoffInCrm(mockDb, {
      contactId: 'c-200',
      accountId: 'a-200',
      reason: 'User requested team walkthrough',
      vars,
    });
    expect(noteRecord.value.length).toBe(lenBefore);
  });

  // Node variable mapping
  it('deriveVarKeyForNode correctly maps flow nodes to qualification variable keys', () => {
    expect(deriveVarKeyForNode('welcome_prompt')).toBe('welcome_interest');
    expect(deriveVarKeyForNode('ask_q1_primary_need')).toBe('primary_need');
    expect(deriveVarKeyForNode('ask_q2_trading_experience')).toBe('trading_experience');
    expect(deriveVarKeyForNode('ask_q3_options_knowledge')).toBe('options_knowledge');
    expect(deriveVarKeyForNode('ask_q4_trading_capital_band')).toBe('trading_capital_band');
    expect(deriveVarKeyForNode('ask_q5_primary_challenge')).toBe('primary_challenge');
    expect(deriveVarKeyForNode('ask_q6_time_availability')).toBe('time_availability');
    expect(deriveVarKeyForNode('ask_q7_support_preference')).toBe('support_preference');
    expect(deriveVarKeyForNode('branch_execution_q8')).toBe('purchase_readiness');
    expect(deriveVarKeyForNode('other_node')).toBeNull();
  });

  // Human Conversation Guard & Greeting Length Safeguard
  it('Human Conversation Guard: isConversationUnderHumanHandling detects active agent context', async () => {
    const { isConversationUnderHumanHandling, matchesKeywordTrigger } = await import('./engine');

    // 1. Keyword check: Short greeting vs long conversational message
    const triggerCfg = {
      keywords: ['hi', 'hello', 'hey', 'replete'],
      match_type: 'word' as const,
      case_sensitive: false,
    };
    expect(matchesKeywordTrigger('hi', triggerCfg)).toBe(true);
    expect(matchesKeywordTrigger('Hi', triggerCfg)).toBe(true);
    expect(matchesKeywordTrigger('hi there', triggerCfg)).toBe(true);
    expect(matchesKeywordTrigger('Hi! I want to join', triggerCfg)).toBe(true);
    // Long business message starting with "Hi" should NOT trigger flow
    expect(
      matchesKeywordTrigger(
        'Hi Sachin Sir, Update is like for R Money, I am running with Tradetron so I do not want to do any changes with R Money broker',
        triggerCfg,
      ),
    ).toBe(false);

    // 2. Active agent message in conversation
    const mockDbAgentActive: any = {
      from: (table: string) => ({
        select: () => ({
          eq: (col: string, val: string) => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: table === 'messages' ? { id: 'm-1', created_at: new Date().toISOString() } : null,
                  }),
                }),
              }),
            }),
            maybeSingle: async () => ({ data: null }),
            order: () => ({
              limit: () => ({
                data: [],
              }),
            }),
          }),
        }),
      }),
    };
    const isAgentActive = await isConversationUnderHumanHandling(mockDbAgentActive, 'conv-123', 'contact-123');
    expect(isAgentActive).toBe(true);

    // 3. Assigned conversation
    const mockDbAssigned: any = {
      from: (table: string) => ({
        select: () => ({
          eq: (col: string, val: string) => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
            maybeSingle: async () => ({
              data: table === 'conversations' ? { assigned_agent_id: 'agent-456' } : null,
            }),
            order: () => ({
              limit: () => ({
                data: [],
              }),
            }),
          }),
        }),
      }),
    };
    const isAssigned = await isConversationUnderHumanHandling(mockDbAssigned, 'conv-123', 'contact-123');
    expect(isAssigned).toBe(true);

    // 4. Contact with prior handoff or paused run
    const mockDbPriorHandoff: any = {
      from: (table: string) => ({
        select: () => ({
          eq: (col: string, val: string) => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
            maybeSingle: async () => ({ data: null }),
            order: () => ({
              limit: async () => ({
                data: table === 'flow_runs' ? [{ id: 'r-1', status: 'paused_by_agent' }] : [],
              }),
            }),
          }),
        }),
      }),
    };
    const isPriorHandoff = await isConversationUnderHumanHandling(mockDbPriorHandoff, 'conv-123', 'contact-123');
    expect(isPriorHandoff).toBe(true);

    // 5. Clean fresh conversation with no agent activity or handoff
    const mockDbClean: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
            maybeSingle: async () => ({ data: null }),
            order: () => ({
              limit: async () => ({
                data: [],
              }),
            }),
          }),
        }),
      }),
    };
    const isClean = await isConversationUnderHumanHandling(mockDbClean, 'conv-new', 'contact-new');
    expect(isClean).toBe(false);
  });
});

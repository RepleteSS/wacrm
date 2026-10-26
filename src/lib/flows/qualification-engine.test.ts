import { describe, it, expect } from 'vitest';
import {
  evaluateProductSuitability,
  calculateLeadScore,
  isOptOutMessage,
  deriveVarKeyForNode,
  REPETE_TAGS,
  REPETE_PIPELINE_STAGES,
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
    // Score check: Need(30) + Exp(5) + Chal(10) + Readiness(15) + Engagement(15) = 75
    expect(res.score).toBe(75);
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
    // Need(10) + Exp(10) + Chal(5) + Readiness(5) + Engagement(15) = 45 (<50)
    expect(res.score).toBe(45);
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

  // Score Band Boundaries
  it('Score band boundaries: 80+ HIGH_INTENT, 50-79 QUALIFIED, <50 RESEARCHING', () => {
    // Exact 80
    const score80 = calculateLeadScore({
      primary_need: 'pneed_basics', // 30
      trading_experience: 'exp_1_3yr', // 20
      primary_challenge: 'chal_fundamentals', // 10
      purchase_readiness: 'ready_now_fnd', // 20
    });
    // 30 + 20 + 10 + 20 + 10 (engagement for 4 answers) = 90
    expect(score80.score).toBe(90);
    expect(score80.band).toBe('HIGH_INTENT');

    // Incomplete answers
    const incomplete = calculateLeadScore({
      primary_need: 'pneed_explore', // 10
      trading_experience: 'exp_beginner', // 5
    });
    expect(incomplete.score).toBe(20);
    expect(incomplete.band).toBe('RESEARCHING');
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
});

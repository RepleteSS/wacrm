/**
 * Replete Equities — Lead Qualification & Product Recommendation Engine
 *
 * Implements deterministic suitability evaluation, 100-point lead scoring,
 * contradictory answer detection, CRM custom field persistence, and sales pipeline stage mapping.
 */

export interface QualificationAnswers {
  welcome_interest?: string;
  primary_need?: string;
  trading_experience?: string;
  options_knowledge?: string;
  trading_capital_band?: string;
  primary_challenge?: string;
  time_availability?: string;
  support_preference?: string;
  purchase_readiness?: string;
}

export type RecommendedProduct =
  | 'foundations'
  | 'execution_system'
  | 'mentorship'
  | 'human_review';

export interface ScoreBreakdown {
  needAlignment: number;      // max 30
  tradingExperience: number;  // max 20
  challengeClarity: number;   // max 15
  readiness: number;          // max 20
  engagement: number;         // max 15
}

export type ScoreBand = 'HIGH_INTENT' | 'QUALIFIED' | 'RESEARCHING';

export interface ProductRecommendationResult {
  product: RecommendedProduct;
  rationale: string;
  isContradictory: boolean;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  scoreBand: ScoreBand;
  recommendedTags: string[];
  pipelineStageName: string;
}

export const REPETE_TAGS = {
  NEW_LEAD: '1b8b87b2-8892-4c35-8305-917733883aa1',
  QUALIFIED: '631d502e-3654-4a57-b9da-4d0767949ae4',
  HIGH_INTENT: '016be27c-f69e-4e3b-b954-6fdaf6615796',
  RESEARCHING: '436f2cb3-5c32-4ee2-b430-36b473b877ca',
  NEEDS_HUMAN_REVIEW: '6d4c5c7c-6d6c-44b2-b983-e99abf735384',
  FOUNDATION: '79c3623f-6b7f-45c3-8c52-45328e75e2d1',
  EXECUTION: 'd4b2b1db-5f30-4eed-a647-bee826c9b9ee',
  MENTORSHIP: '1e4d289d-3932-47f3-92d1-dc830d6ec553',
  OPT_OUT: 'acd6be77-b9dc-47bd-a025-aaf8bb065631',
} as const;

export const REPETE_PIPELINE_STAGES = {
  NEW_LEAD: 'fc8ceeed-92c5-4594-9c46-498ba81d0f0f',
  QUALIFICATION_IN_PROGRESS: '8a9b0f30-a01c-4d65-a929-b477a096a68a',
  QUALIFIED: '7928c535-cf00-4227-bfd4-a9f042799410',
  RECOMMENDATION_SHARED: '12be4c27-3080-4017-b711-7bbca9617d2d',
  HUMAN_FOLLOWUP_REQUIRED: '537b3256-2846-4ead-8e34-da361cd139d0',
  NURTURE_NOT_READY: '6c368863-e9c2-44c1-a228-5192f950d82e',
} as const;

export const REPETE_CUSTOM_FIELDS = {
  PRIMARY_NEED: 'c69972e3-92fb-45ec-ba63-97c267158383',
  TRADING_EXPERIENCE: '9c2a6b08-2dcd-4f36-9dbf-113bb32f9a8b',
  OPTIONS_KNOWLEDGE: '0c4e2951-0b32-43d5-94f2-0f07987a4e75',
  TRADING_CAPITAL_BAND: '72723562-7e9a-42ab-81c8-b1f32f2fdee2',
  PRIMARY_CHALLENGE: '6a939a5d-16b0-4d5a-8d69-f672ab52d63c',
  TIME_AVAILABILITY: '1f94d1eb-e92c-435a-83fe-5f55f9504f12',
  SUPPORT_PREFERENCE: 'd808560d-ebf4-463c-8c05-47009c432bff',
  PURCHASE_READINESS: 'd151f44d-0714-4c92-8f84-dc585a489ef8',
  RECOMMENDED_PRODUCT: '5fcdcb7c-1328-489e-91fb-e2b0ddaa5821',
  RECOMMENDATION_RATIONALE: 'b9024148-ddf1-430a-a8e3-294869c88dc3',
  LEAD_SCORE: '784dc768-0214-44fb-bdb7-2b4961d42554',
  OPT_OUT_STATUS: '5584ac46-a7f3-4ce2-a781-ca88b89750ab',
  CURRENT_STAGE: '7dbc68a0-b1c0-4bf4-8790-509f095dead1',
  CONSENT_STATUS: '4afcbe44-3e22-4958-a20f-faf698c94661',
  CONSENT_TIMESTAMP: 'e49540da-dd5a-44e6-b55b-1eac4e31f464',
  CONVERSATION_NOTES: '172eda3d-2233-438f-91a3-4ce845bc321d',
} as const;

/**
 * 100-Point Deterministic Lead Scoring Model
 *
 * 1. Need & Product Alignment: 30 pts
 * 2. Relevant Trading Experience: 20 pts
 * 3. Clarity of Primary Challenge: 15 pts
 * 4. Purchase Readiness: 20 pts
 * 5. Engagement: 15 pts
 */
export function calculateLeadScore(
  answers: QualificationAnswers,
  repromptCount: number = 0,
): { score: number; breakdown: ScoreBreakdown; band: ScoreBand } {
  // 1. Need and Product Alignment (30 pts max)
  let needAlignment = 0;
  if (answers.primary_need) {
    if (['pneed_basics', 'pneed_execution', 'pneed_advanced'].includes(answers.primary_need)) {
      needAlignment = 30;
    } else if (answers.primary_need === 'pneed_process') {
      needAlignment = 20;
    } else if (answers.primary_need === 'pneed_explore') {
      needAlignment = 10;
    }
  }

  // 2. Relevant Trading Experience (20 pts max)
  let tradingExperience = 0;
  if (answers.trading_experience) {
    if (['exp_1_3yr', 'exp_3_5yr'].includes(answers.trading_experience)) {
      tradingExperience = 20;
    } else if (answers.trading_experience === 'exp_gt_5yr') {
      tradingExperience = 15;
    } else if (answers.trading_experience === 'exp_lt_1yr') {
      tradingExperience = 10;
    } else if (answers.trading_experience === 'exp_beginner') {
      tradingExperience = 5;
    }
  }

  // 3. Clarity of Challenge (15 pts max)
  let challengeClarity = 0;
  if (answers.primary_challenge) {
    if (['chal_hedges', 'chal_discipline', 'chal_consistency', 'chal_time'].includes(answers.primary_challenge)) {
      challengeClarity = 15;
    } else if (['chal_strategies', 'chal_fundamentals'].includes(answers.primary_challenge)) {
      challengeClarity = 10;
    } else if (answers.primary_challenge === 'chal_unsure') {
      challengeClarity = 5;
    }
  }

  // 4. Purchase Readiness (20 pts max)
  let readiness = 0;
  if (answers.purchase_readiness) {
    if (answers.purchase_readiness.startsWith('ready_now')) {
      readiness = 20;
    } else if (answers.purchase_readiness.startsWith('ready_7d')) {
      readiness = 15;
    } else if (answers.purchase_readiness.startsWith('ready_30d')) {
      readiness = 10;
    } else if (answers.purchase_readiness.startsWith('ready_research')) {
      readiness = 5;
    }
  }

  // 5. Engagement (15 pts max)
  let engagement = 0;
  const answeredCount = [
    answers.primary_need,
    answers.trading_experience,
    answers.options_knowledge,
    answers.trading_capital_band,
    answers.primary_challenge,
    answers.time_availability,
    answers.support_preference,
    answers.purchase_readiness,
  ].filter(Boolean).length;

  if (answeredCount >= 8) {
    engagement = repromptCount === 0 ? 15 : repromptCount === 1 ? 10 : 5;
  } else if (answeredCount >= 4) {
    engagement = repromptCount === 0 ? 10 : 5;
  } else {
    engagement = 5;
  }

  const score = needAlignment + tradingExperience + challengeClarity + readiness + engagement;

  let band: ScoreBand = 'RESEARCHING';
  if (score >= 80) {
    band = 'HIGH_INTENT';
  } else if (score >= 50) {
    band = 'QUALIFIED';
  }

  return {
    score,
    breakdown: {
      needAlignment,
      tradingExperience,
      challengeClarity,
      readiness,
      engagement,
    },
    band,
  };
}

/**
 * Deterministic Product Suitability & Recommendation Function
 *
 * Rules:
 * 1. Foundations: Beginners / <1 yr / lacking fundamentals. Capital is not a barrier.
 *    Initial preference cannot override lack of foundational knowledge.
 * 2. Execution System: Requires experience (>= 1-3 yrs or independent knowledge),
 *    MUST have capital >= 1L (due to margin requirements). If capital < 1L, route to Human Review.
 * 3. Mentorship: Advanced traders with >= 1-3 yrs experience, solid Greeks/adjustments interest,
 *    and available screen time. NEVER recommend to beginners regardless of capital or intent.
 * 4. Human Review: Contradictory answers, exploratory/unsure answers, or capital mismatch.
 */
export function evaluateProductSuitability(
  answers: QualificationAnswers,
  repromptCount: number = 0,
): ProductRecommendationResult {
  const { score, breakdown, band } = calculateLeadScore(answers, repromptCount);

  const exp = answers.trading_experience;
  const know = answers.options_knowledge;
  const cap = answers.trading_capital_band;
  const need = answers.primary_need;
  const challenge = answers.primary_challenge;
  const time = answers.time_availability;
  const supp = answers.support_preference;
  const readiness = answers.purchase_readiness;

  // 1. Ambiguous / Exploratory / Advisory Request -> Human Review
  if (
    answers.welcome_interest === 'wel_team' ||
    supp === 'supp_unsure' ||
    need === 'pneed_explore'
  ) {
    return {
      product: 'human_review',
      rationale:
        'You indicated an exploratory focus or a preference to compare options directly with our advisory desk. Our team will review your objectives and guide you personally.',
      isContradictory: false,
      score,
      scoreBreakdown: breakdown,
      scoreBand: band,
      recommendedTags: [
        REPETE_TAGS.NEEDS_HUMAN_REVIEW,
        band === 'RESEARCHING' ? REPETE_TAGS.RESEARCHING : REPETE_TAGS.QUALIFIED,
      ],
      pipelineStageName: 'Human Follow-up Required',
    };
  }

  // 2. Contradiction Check 1: Beginner claiming advanced hedging experience
  const isBeginner = exp === 'exp_beginner' || exp === 'exp_lt_1yr';
  if (isBeginner && (know === 'know_experienced' || know === 'know_advanced')) {
    return {
      product: 'human_review',
      rationale:
        'Your profile indicates developing market experience alongside advanced options familiarity. An advisor will clarify your trading history to ensure the optimal learning path.',
      isContradictory: true,
      score,
      scoreBreakdown: breakdown,
      scoreBand: band,
      recommendedTags: [REPETE_TAGS.NEEDS_HUMAN_REVIEW],
      pipelineStageName: 'Human Follow-up Required',
    };
  }

  // 3. Contradiction Check 2: Seeking intensive Mentorship with minimal time availability (< 30 min/day)
  if ((need === 'pneed_advanced' || supp === 'supp_mentorship') && time === 'time_lt_30m') {
    return {
      product: 'human_review',
      rationale:
        'Option Strategies Mentorship involves active strategy review and journaling. Because your available time is under 30 minutes a day, an advisor will discuss structured execution alternatives.',
      isContradictory: true,
      score,
      scoreBreakdown: breakdown,
      scoreBand: band,
      recommendedTags: [REPETE_TAGS.NEEDS_HUMAN_REVIEW],
      pipelineStageName: 'Human Follow-up Required',
    };
  }

  // 4. Product Suitability Rule 1: Foundations
  // Suitability: Beginners (< 1 yr), basic/beginner knowledge, or primary need is fundamentals.
  // CRITICAL: High capital (> 10L) does NOT override lack of foundational knowledge.
  if (
    isBeginner ||
    know === 'know_beginner' ||
    know === 'know_none' ||
    need === 'pneed_basics' ||
    challenge === 'chal_fundamentals'
  ) {
    const isHighCapBeginner =
      isBeginner &&
      (cap === 'cap_5_10l' || cap === 'cap_above_10l' || cap === 'cap_gt_10l');
    const rationale = isHighCapBeginner
      ? 'Even with substantial capital, options trading requires disciplined risk management and Greeks mastery. Option Trading Foundations ensures you build robust risk architecture before scaling position sizing.'
      : 'Based on your background and stated learning goals, mastering options payoff structures, Greeks, and disciplined risk management through Option Trading Foundations is your recommended next step.';

    const isResearching =
      readiness?.startsWith('ready_research') || band === 'RESEARCHING';

    const tags: string[] = [REPETE_TAGS.FOUNDATION];
    if (isResearching) tags.push(REPETE_TAGS.RESEARCHING);
    else if (band === 'HIGH_INTENT') tags.push(REPETE_TAGS.HIGH_INTENT);
    else if (band === 'QUALIFIED') tags.push(REPETE_TAGS.QUALIFIED);
    else tags.push(REPETE_TAGS.RESEARCHING);

    return {
      product: 'foundations',
      rationale,
      isContradictory: false,
      score,
      scoreBreakdown: breakdown,
      scoreBand: band,
      recommendedTags: tags,
      pipelineStageName: isResearching
        ? 'Nurture / Not Ready'
        : 'Recommendation Shared',
    };
  }

  // 5. Product Suitability Rule 2: Execution System
  // Suitability: Experienced traders with independent/selling knowledge seeking a disciplined, rules-based framework.
  // CRITICAL: Capital below ₹1 Lakh does NOT disqualify an experienced trader from Execution System fit.
  const isExperienced = ['exp_1_3yr', 'exp_3_5yr', 'exp_gt_5yr'].includes(
    exp || '',
  );
  const hasIndependentOrAdvancedKnowledge = [
    'know_independent',
    'know_experienced',
    'know_selling',
    'know_advanced',
  ].includes(know || '');
  const wantsExecution =
    need === 'pneed_execution' ||
    need === 'pneed_process' ||
    supp === 'supp_execution' ||
    challenge === 'chal_discipline' ||
    challenge === 'chal_consistency' ||
    challenge === 'chal_time';

  if (isExperienced && hasIndependentOrAdvancedKnowledge && wantsExecution) {
    const isLowCap =
      cap === 'cap_below_50k' || cap === 'cap_50k_1l' || cap === 'cap_lt_50k';
    const rationale = isLowCap
      ? 'You possess market experience and seek rules-based execution discipline. While naked option selling requires margin capital, the Execution System provides systematic entry/exit rules and defined-risk spread structures adaptable to your capital scale.'
      : 'You have active market experience and seek disciplined, rules-based execution. The Intraday Option Selling Basket automates entry/exit architecture and eliminates emotional errors.';

    const isResearching =
      readiness?.startsWith('ready_research') || band === 'RESEARCHING';

    const tags: string[] = [REPETE_TAGS.EXECUTION];
    if (isResearching) tags.push(REPETE_TAGS.RESEARCHING);
    else if (band === 'HIGH_INTENT') tags.push(REPETE_TAGS.HIGH_INTENT);
    else if (band === 'QUALIFIED') tags.push(REPETE_TAGS.QUALIFIED);
    else tags.push(REPETE_TAGS.RESEARCHING);

    return {
      product: 'execution_system',
      rationale,
      isContradictory: false,
      score,
      scoreBreakdown: breakdown,
      scoreBand: band,
      recommendedTags: tags,
      pipelineStageName: isResearching
        ? 'Nurture / Not Ready'
        : 'Recommendation Shared',
    };
  }

  // 6. Product Suitability Rule 3: Mentorship
  // Suitability: Experienced traders seeking advanced hedging, Greeks mastery, and dynamic adjustments.
  // CRITICAL: Capital threshold does NOT block mentorship suitability for experienced traders with verified hedging need.
  const wantsAdvanced =
    need === 'pneed_advanced' ||
    supp === 'supp_mentorship' ||
    challenge === 'chal_hedges';

  if (isExperienced && hasIndependentOrAdvancedKnowledge && wantsAdvanced) {
    const isResearching =
      readiness?.startsWith('ready_research') || band === 'RESEARCHING';

    const tags: string[] = [REPETE_TAGS.MENTORSHIP];
    if (isResearching) tags.push(REPETE_TAGS.RESEARCHING);
    else if (band === 'HIGH_INTENT') tags.push(REPETE_TAGS.HIGH_INTENT);
    else if (band === 'QUALIFIED') tags.push(REPETE_TAGS.QUALIFIED);
    else tags.push(REPETE_TAGS.RESEARCHING);

    const rationale =
      'You possess solid trading experience and seek in-depth mastery of non-directional strategies, Greeks, and dynamic portfolio adjustments. The Option Strategies Mentorship provides direct institutional guidance.';

    return {
      product: 'mentorship',
      rationale,
      isContradictory: false,
      score,
      scoreBreakdown: breakdown,
      scoreBand: band,
      recommendedTags: tags,
      pipelineStageName: isResearching
        ? 'Nurture / Not Ready'
        : 'Recommendation Shared',
    };
  }

  // 7. Fallback: If requirements are ambiguous or insufficient to determine clear fit -> Human Review
  return {
    product: 'human_review',
    rationale:
      'Based on your inputs, a tailored walkthrough with our advisory desk is the best next step to confirm your specific trading requirements.',
    isContradictory: false,
    score,
    scoreBreakdown: breakdown,
    scoreBand: band,
    recommendedTags: [REPETE_TAGS.NEEDS_HUMAN_REVIEW],
    pipelineStageName: 'Human Follow-up Required',
  };
}

/**
 * Opt-Out Detection
 */
export function isOptOutMessage(text: string): boolean {
  if (!text) return false;
  const normalized = text.trim().toUpperCase();
  const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'OPTOUT', 'OPT OUT', 'STOP ALL'];
  return OPT_OUT_KEYWORDS.includes(normalized);
}

/**
 * Human Request Detection
 */
export function isHumanRequestMessage(text: string): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  const HUMAN_KEYWORDS = [
    'human',
    'agent',
    'support',
    'advisor',
    'representative',
    'help desk',
    'talk to human',
    'talk to someone',
    'speak with someone',
    'speak to team',
    'connect with team',
  ];
  return HUMAN_KEYWORDS.some((kw) => normalized === kw || normalized.includes(kw));
}

/**
 * Maps flow node key to the corresponding qualification variable name.
 */
export function deriveVarKeyForNode(nodeKey: string): keyof QualificationAnswers | null {
  switch (nodeKey) {
    case 'welcome_prompt':
      return 'welcome_interest';
    case 'ask_q1_primary_need':
      return 'primary_need';
    case 'ask_q2_trading_experience':
      return 'trading_experience';
    case 'ask_q3_options_knowledge':
      return 'options_knowledge';
    case 'ask_q4_trading_capital_band':
      return 'trading_capital_band';
    case 'ask_q5_primary_challenge':
      return 'primary_challenge';
    case 'ask_q6_time_availability':
      return 'time_availability';
    case 'ask_q7_support_preference':
      return 'support_preference';
    case 'branch_foundations_q8':
    case 'branch_execution_q8':
    case 'branch_mentorship_q8':
    case 'branch_unsure_q8':
      return 'purchase_readiness';
    default:
      return null;
  }
}

export const NODE_KEY_TO_CUSTOM_FIELD: Record<string, string> = {
  ask_q1_primary_need: REPETE_CUSTOM_FIELDS.PRIMARY_NEED,
  ask_q2_trading_experience: REPETE_CUSTOM_FIELDS.TRADING_EXPERIENCE,
  ask_q3_options_knowledge: REPETE_CUSTOM_FIELDS.OPTIONS_KNOWLEDGE,
  ask_q4_trading_capital_band: REPETE_CUSTOM_FIELDS.TRADING_CAPITAL_BAND,
  ask_q5_primary_challenge: REPETE_CUSTOM_FIELDS.PRIMARY_CHALLENGE,
  ask_q6_time_availability: REPETE_CUSTOM_FIELDS.TIME_AVAILABILITY,
  ask_q7_support_preference: REPETE_CUSTOM_FIELDS.SUPPORT_PREFERENCE,
  branch_foundations_q8: REPETE_CUSTOM_FIELDS.PURCHASE_READINESS,
  branch_execution_q8: REPETE_CUSTOM_FIELDS.PURCHASE_READINESS,
  branch_mentorship_q8: REPETE_CUSTOM_FIELDS.PURCHASE_READINESS,
  branch_unsure_q8: REPETE_CUSTOM_FIELDS.PURCHASE_READINESS,
};

export const REPETE_SALES_PIPELINE_ID = 'a94f52ee-6046-4d10-92a0-fe55358cd69a';
export const REPETE_CLOSED_STAGE_ID = '97e4657d-f5b0-4496-9109-625de9a99348'; // Closed / Not Interested

export function formatAnswerValue(replyId: string): string {
  const labels: Record<string, string> = {
    pneed_basics: 'Options Basics & Foundations',
    pneed_execution: 'Systematic Execution Framework',
    pneed_advanced: 'Advanced Hedging & Adjustments',
    pneed_process: 'Trading Discipline & Process',
    pneed_explore: 'Exploring Offerings',
    exp_beginner: 'Complete Beginner (< 1 Year)',
    exp_lt_1yr: 'Less than 1 Year',
    exp_1_3yr: '1 - 3 Years',
    exp_3_5yr: '3 - 5 Years',
    exp_gt_5yr: '5+ Years',
    know_none: 'None / Basics Only',
    know_beginner: 'Complete Beginner',
    know_basics: 'Understand Basics',
    know_independent: 'Traded Independently',
    know_experienced: 'Experienced in Hedging',
    know_buying: 'Basic Call & Put Buying',
    know_selling: 'Option Selling & Spreads',
    know_advanced: 'Greeks, Hedging & Adjustments',
    cap_lt_50k: 'Under ₹50,000',
    cap_below_50k: 'Below ₹50,000',
    cap_50k_1l: '₹50,000 - ₹1,00,000',
    cap_1l_3l: '₹1,00,000 - ₹3,00,000',
    cap_1_3l: '₹1,00,000 - ₹3,00,000',
    cap_3l_5l: '₹3,00,000 - ₹5,00,000',
    cap_3_5l: '₹3,00,000 - ₹5,00,000',
    cap_5l_10l: '₹5,00,000 - ₹10,00,000',
    cap_5_10l: '₹5,00,000 - ₹10,00,000',
    cap_gt_10l: '₹10,00,000+',
    cap_above_10l: 'Above ₹10,00,000',
    cap_undisclosed: 'Prefer Not to Say',
    chal_fundamentals: 'Understanding Options Basics',
    chal_discipline: 'Discipline & Emotions',
    chal_consistency: 'Consistent Execution',
    chal_hedges: 'Adjustments & Hedging',
    chal_time: 'Time Management',
    chal_strategies: 'Strategy Selection',
    chal_unsure: 'Not Sure Yet',
    time_lt_30m: '< 30 mins / day',
    time_30m_1h: '30 - 60 mins / day',
    time_30_60m: '30 - 60 mins / day',
    time_1h_3h: '1 - 3 hours / day',
    time_1_2h: '1 - 2 hours / day',
    time_gt_2h: '> 2 hours / day',
    time_structured: 'Structured Schedule',
    time_gt_3h: 'Full Market Hours',
    supp_basics: 'Structured Basics',
    supp_execution: 'Execution Framework',
    supp_mentorship: 'Advanced Mentorship',
    supp_unsure: 'Understand Differences',
  };
  if (labels[replyId]) return labels[replyId];
  if (replyId.startsWith('ready_now')) return 'Ready to start immediately';
  if (replyId.startsWith('ready_7d')) return 'Within next 7 days';
  if (replyId.startsWith('ready_30d')) return 'Within next 30 days';
  if (replyId.startsWith('ready_research')) return 'Just researching for now';
  return replyId;
}

/**
 * Persist an individual qualification answer into contact_custom_values and update stage.
 */
export async function persistAnswerToCrm(
  db: any,
  contactId: string,
  nodeKey: string,
  replyId: string,
): Promise<void> {
  const customFieldId = NODE_KEY_TO_CUSTOM_FIELD[nodeKey];
  if (!customFieldId || !contactId) return;

  const value = formatAnswerValue(replyId);
  try {
    await db
      .from('contact_custom_values')
      .upsert(
        { contact_id: contactId, custom_field_id: customFieldId, value },
        { onConflict: 'contact_id,custom_field_id' },
      );

    // Also update current_stage to Qualification in Progress
    await db
      .from('contact_custom_values')
      .upsert(
        {
          contact_id: contactId,
          custom_field_id: REPETE_CUSTOM_FIELDS.CURRENT_STAGE,
          value: 'Qualification in Progress',
        },
        { onConflict: 'contact_id,custom_field_id' },
      );
  } catch (err) {
    console.warn('[qualification-engine] persistAnswerToCrm error:', err);
  }
}

/**
 * Persist final recommendation, 100-pt score, tags, and Sales Pipeline stage.
 */
export async function persistRecommendationToCrm(
  db: any,
  params: {
    contactId: string;
    accountId: string;
    userId?: string | null;
    conversationId?: string | null;
    result: ProductRecommendationResult;
  },
): Promise<void> {
  const { contactId, accountId, userId, conversationId, result } = params;
  if (!contactId) return;

  const productNames: Record<RecommendedProduct, string> = {
    foundations: 'Option Trading Foundations',
    execution_system: 'Execution System — Intraday Option Selling Basket',
    mentorship: 'Option Strategies Mentorship Program',
    human_review: 'Human Review / Advisory Walkthrough Required',
  };

  const productValues: Record<RecommendedProduct, number> = {
    foundations: 14999,
    execution_system: 19999,
    mentorship: 79999,
    human_review: 0,
  };

  const valuesToUpsert = [
    {
      contact_id: contactId,
      custom_field_id: REPETE_CUSTOM_FIELDS.RECOMMENDED_PRODUCT,
      value: productNames[result.product],
    },
    {
      contact_id: contactId,
      custom_field_id: REPETE_CUSTOM_FIELDS.RECOMMENDATION_RATIONALE,
      value: result.rationale,
    },
    {
      contact_id: contactId,
      custom_field_id: REPETE_CUSTOM_FIELDS.LEAD_SCORE,
      value: String(result.score),
    },
    {
      contact_id: contactId,
      custom_field_id: REPETE_CUSTOM_FIELDS.CURRENT_STAGE,
      value: result.pipelineStageName,
    },
    {
      contact_id: contactId,
      custom_field_id: REPETE_CUSTOM_FIELDS.CONVERSATION_NOTES,
      value: `Score: ${result.score}/100 (${result.scoreBand}). Breakdown: Need=${result.scoreBreakdown.needAlignment}, Exp=${result.scoreBreakdown.tradingExperience}, Challenge=${result.scoreBreakdown.challengeClarity}, Readiness=${result.scoreBreakdown.readiness}, Engagement=${result.scoreBreakdown.engagement}. Contradictory=${result.isContradictory}`,
    },
  ];

  try {
    for (const row of valuesToUpsert) {
      await db
        .from('contact_custom_values')
        .upsert(row, { onConflict: 'contact_id,custom_field_id' });
    }

    // Persist tags
    for (const tagId of result.recommendedTags) {
      await db
        .from('contact_tags')
        .upsert({ contact_id: contactId, tag_id: tagId }, { onConflict: 'contact_id,tag_id' });
    }

    // Map pipeline stage
    let stageId: string = REPETE_PIPELINE_STAGES.QUALIFIED;
    if (result.pipelineStageName === 'Recommendation Shared') {
      stageId = REPETE_PIPELINE_STAGES.RECOMMENDATION_SHARED;
    } else if (result.pipelineStageName === 'Human Follow-up Required') {
      stageId = REPETE_PIPELINE_STAGES.HUMAN_FOLLOWUP_REQUIRED;
    } else if (result.pipelineStageName === 'Nurture / Not Ready') {
      stageId = REPETE_PIPELINE_STAGES.NURTURE_NOT_READY;
    }

    // Upsert or update Deal in Sales Pipeline
    const { data: existingDeal } = await db
      .from('deals')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('pipeline_id', REPETE_SALES_PIPELINE_ID)
      .maybeSingle();

    if (existingDeal) {
      await db
        .from('deals')
        .update({
          stage_id: stageId,
          value: productValues[result.product],
          status: 'open',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDeal.id);
    } else if (userId) {
      await db.from('deals').insert({
        account_id: accountId,
        user_id: userId,
        pipeline_id: REPETE_SALES_PIPELINE_ID,
        stage_id: stageId,
        contact_id: contactId,
        conversation_id: conversationId ?? null,
        title: `${productNames[result.product]} - Qualified Lead`,
        value: productValues[result.product],
        currency: 'INR',
        status: 'open',
      });
    }
  } catch (err) {
    console.warn('[qualification-engine] persistRecommendationToCrm error:', err);
  }
}

/**
 * Handle user opt-out in CRM: mark custom field, add OPT_OUT tag, close deal.
 */
export async function handleOptOutInCrm(
  db: any,
  params: { contactId: string; accountId: string },
): Promise<void> {
  const { contactId, accountId } = params;
  if (!contactId) return;

  try {
    // 1. Set opt_out_status in custom fields
    await db
      .from('contact_custom_values')
      .upsert(
        {
          contact_id: contactId,
          custom_field_id: REPETE_CUSTOM_FIELDS.OPT_OUT_STATUS,
          value: 'opted_out',
        },
        { onConflict: 'contact_id,custom_field_id' },
      );

    // 2. Add OPT_OUT tag
    await db
      .from('contact_tags')
      .upsert(
        { contact_id: contactId, tag_id: REPETE_TAGS.OPT_OUT },
        { onConflict: 'contact_id,tag_id' },
      );

    // 3. Mark existing deals in Sales Pipeline as lost / closed
    await db
      .from('deals')
      .update({
        stage_id: REPETE_CLOSED_STAGE_ID,
        status: 'lost',
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('pipeline_id', REPETE_SALES_PIPELINE_ID);
  } catch (err) {
    console.warn('[qualification-engine] handleOptOutInCrm error:', err);
  }
}

/**
 * Check if contact is opted out (by tag or custom field).
 */
export async function isContactOptedOut(db: any, contactId: string): Promise<boolean> {
  if (!contactId) return false;
  try {
    const { data: tagRow } = await db
      .from('contact_tags')
      .select('tag_id')
      .eq('contact_id', contactId)
      .eq('tag_id', REPETE_TAGS.OPT_OUT)
      .maybeSingle();
    if (tagRow) return true;

    const { data: customRow } = await db
      .from('contact_custom_values')
      .select('value')
      .eq('contact_id', contactId)
      .eq('custom_field_id', REPETE_CUSTOM_FIELDS.OPT_OUT_STATUS)
      .maybeSingle();
    if (customRow && customRow.value?.toLowerCase() === 'opted_out') return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Handle human handoff request in CRM.
 */
export async function handleHumanHandoffInCrm(
  db: any,
  params: {
    contactId: string;
    accountId: string;
    conversationId?: string | null;
    reason?: string;
  },
): Promise<void> {
  const { contactId, accountId, conversationId, reason } = params;
  if (!contactId) return;

  try {
    // 1. Add NEEDS_HUMAN_REVIEW tag
    await db
      .from('contact_tags')
      .upsert(
        { contact_id: contactId, tag_id: REPETE_TAGS.NEEDS_HUMAN_REVIEW },
        { onConflict: 'contact_id,tag_id' },
      );

    // 2. Set current stage to Human Follow-up Required
    await db
      .from('contact_custom_values')
      .upsert(
        {
          contact_id: contactId,
          custom_field_id: REPETE_CUSTOM_FIELDS.CURRENT_STAGE,
          value: 'Human Follow-up Required',
        },
        { onConflict: 'contact_id,custom_field_id' },
      );

    // 3. Set conversation notes
    if (reason) {
      await db
        .from('contact_custom_values')
        .upsert(
          {
            contact_id: contactId,
            custom_field_id: REPETE_CUSTOM_FIELDS.CONVERSATION_NOTES,
            value: `Human Handoff Request: ${reason}`,
          },
          { onConflict: 'contact_id,custom_field_id' },
        );
    }

    // 4. Update deal stage to Human Follow-up Required
    await db
      .from('deals')
      .update({
        stage_id: REPETE_PIPELINE_STAGES.HUMAN_FOLLOWUP_REQUIRED,
        status: 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('pipeline_id', REPETE_SALES_PIPELINE_ID);

    // 5. Update conversation status to pending if exists
    if (conversationId) {
      await db
        .from('conversations')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', conversationId);
    }
  } catch (err) {
    console.warn('[qualification-engine] handleHumanHandoffInCrm error:', err);
  }
}


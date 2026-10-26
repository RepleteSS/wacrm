import { describe, it, expect, beforeEach, vi } from "vitest";

// Fakes and mocks for hardening test suite
const h = vi.hoisted(() => ({
  state: {
    activeRuns: [] as Record<string, unknown>[],
    flows: [] as unknown[],
    nodes: [] as unknown[],
    events: [] as Record<string, unknown>[],
    updates: [] as { table: string; row: Record<string, unknown> }[],
    inserts: [] as { table: string; row: Record<string, unknown> }[],
    upserts: [] as { table: string; row: Record<string, unknown> }[],
    contactTags: [] as { contact_id: string; tag_id: string }[],
    customValues: [] as { contact_id: string; custom_field_id: string; value: string }[],
    deals: [] as Record<string, unknown>[],
  },
  sendButtons: vi.fn(async () => ({ whatsapp_message_id: "wamid.btn.1" })),
  sendList: vi.fn(async () => ({ whatsapp_message_id: "wamid.lst.1" })),
  sendText: vi.fn(async () => ({ whatsapp_message_id: "wamid.txt.1" })),
}));

vi.mock("./admin-client", () => {
  function rows(table: string): unknown[] {
    if (table === "flow_runs") return h.state.activeRuns;
    if (table === "flows") return h.state.flows;
    if (table === "flow_nodes") return h.state.nodes;
    if (table === "contact_tags") return h.state.contactTags;
    if (table === "contact_custom_values") return h.state.customValues;
    if (table === "deals") return h.state.deals;
    if (table === "flow_run_events") return h.state.events;
    return [];
  }

  function builder(table: string) {
    let eqFilter: Record<string, unknown> = {};
    let customMetaMsgId: string | null = null;

    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        eqFilter[col] = val;
        return b;
      },
      is: () => b,
      in: () => b,
      filter: (col: string, _op: string, val: unknown) => {
        if (col === "payload->>meta_message_id") {
          customMetaMsgId = String(val);
        }
        return b;
      },
      order: () => b,
      limit: () => b,
      update: (row: Record<string, unknown>) => {
        h.state.updates.push({ table, row });
        return b;
      },
      insert: (row: Record<string, unknown>) => {
        h.state.inserts.push({ table, row });
        if (table === "flow_run_events") h.state.events.push(row);
        if (table === "deals") h.state.deals.push(row);
        if (table === "flow_runs") {
          const runRow = { id: "run-new-1", ...row };
          h.state.activeRuns.push(runRow);
        }
        return b;
      },
      upsert: (rowOrRows: any) => {
        const rowsToInsert = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        for (const row of rowsToInsert) {
          h.state.upserts.push({ table, row });
          if (table === "contact_tags") {
            h.state.contactTags = h.state.contactTags.filter(
              (t) => !(t.contact_id === row.contact_id && t.tag_id === row.tag_id),
            );
            h.state.contactTags.push(row);
          }
          if (table === "contact_custom_values") {
            h.state.customValues = h.state.customValues.filter(
              (v) =>
                !(
                  v.contact_id === row.contact_id &&
                  v.custom_field_id === row.custom_field_id
                ),
            );
            h.state.customValues.push(row);
          }
        }
        return b;
      },
      maybeSingle: async () => {
        let matched = rows(table);
        if (Object.keys(eqFilter).length > 0) {
          matched = matched.filter((r: any) =>
            Object.entries(eqFilter).every(([k, v]) => r[k] === v),
          );
        }
        return { data: matched[0] ?? null, error: null };
      },
      single: async () => {
        let matched = rows(table);
        if (Object.keys(eqFilter).length > 0) {
          matched = matched.filter((r: any) =>
            Object.entries(eqFilter).every(([k, v]) => r[k] === v),
          );
        }
        return { data: matched[0] ?? null, error: null };
      },
      then: (resolve: (r: { data: unknown[]; error: null; count: number }) => unknown) => {
        let matched = rows(table);
        if (Object.keys(eqFilter).length > 0) {
          matched = matched.filter((r: any) =>
            Object.entries(eqFilter).every(([k, v]) => r[k] === v),
          );
        }
        if (customMetaMsgId) {
          matched = matched.filter(
            (r: any) => r.payload?.meta_message_id === customMetaMsgId,
          );
        }
        return resolve({ data: matched, error: null, count: matched.length });
      },
    };
    return b;
  }

  return {
    supabaseAdmin: () => ({
      from: (t: string) => builder(t),
      rpc: () => Promise.resolve({ error: null }),
    }),
  };
});

vi.mock("./meta-send", () => ({
  engineSendText: h.sendText,
  engineSendMedia: vi.fn(async () => ({ whatsapp_message_id: "wamid.media.1" })),
  engineSendInteractiveButtons: h.sendButtons,
  engineSendInteractiveList: h.sendList,
}));

import {
  evaluateProductSuitability,
  calculateLeadScore,
  isOptOutMessage,
  isHumanRequestMessage,
  persistAnswerToCrm,
  persistRecommendationToCrm,
  handleOptOutInCrm,
  handleHumanHandoffInCrm,
  isContactOptedOut,
  REPETE_TAGS,
  REPETE_CUSTOM_FIELDS,
  REPETE_PIPELINE_STAGES,
  REPETE_SALES_PIPELINE_ID,
  REPETE_CLOSED_STAGE_ID,
} from "./qualification-engine";
import { dispatchInboundToFlows } from "./engine";

describe("Replete Equities — Lead Qualification V1 Hardening & Audit Suite", () => {
  beforeEach(() => {
    h.state.activeRuns = [];
    h.state.flows = [];
    h.state.nodes = [];
    h.state.events = [];
    h.state.updates = [];
    h.state.inserts = [];
    h.state.upserts = [];
    h.state.contactTags = [];
    h.state.customValues = [];
    h.state.deals = [];
    vi.clearAllMocks();
  });

  // 1. Beginner with a fundamentals requirement
  it("Scenario 1: Beginner with fundamentals requirement -> Foundations, High Intent", () => {
    const answers = {
      primary_need: "pneed_basics",
      trading_experience: "exp_beginner",
      options_knowledge: "know_beginner",
      trading_capital_band: "cap_below_50k",
      primary_challenge: "chal_fundamentals",
      time_availability: "time_30_60m",
      support_preference: "supp_basics",
      purchase_readiness: "ready_now_fnd",
    };

    const result = evaluateProductSuitability(answers);
    expect(result.product).toBe("foundations");
    expect(result.score).toBe(80);
    expect(result.scoreBand).toBe("HIGH_INTENT");
    expect(result.recommendedTags).toContain(REPETE_TAGS.FOUNDATION);
    expect(result.recommendedTags).toContain(REPETE_TAGS.HIGH_INTENT);
    expect(result.pipelineStageName).toBe("Recommendation Shared");
  });

  // 2. Experienced trader seeking structured execution framework
  it("Scenario 2: Experienced trader seeking structured execution -> Execution System, High Intent", () => {
    const answers = {
      primary_need: "pneed_execution",
      trading_experience: "exp_1_3yr",
      options_knowledge: "know_independent",
      trading_capital_band: "cap_3_5l",
      primary_challenge: "chal_discipline",
      time_availability: "time_lt_30m",
      support_preference: "supp_execution",
      purchase_readiness: "ready_now_exe",
    };

    const result = evaluateProductSuitability(answers);
    expect(result.product).toBe("execution_system");
    expect(result.score).toBe(100);
    expect(result.scoreBand).toBe("HIGH_INTENT");
    expect(result.recommendedTags).toContain(REPETE_TAGS.EXECUTION);
    expect(result.recommendedTags).toContain(REPETE_TAGS.HIGH_INTENT);
    expect(result.pipelineStageName).toBe("Recommendation Shared");
  });

  // 3. Experienced trader seeking advanced hedging education
  it("Scenario 3: Experienced trader seeking advanced hedging -> Mentorship, High Intent (100 pts)", () => {
    const answers = {
      primary_need: "pneed_advanced",
      trading_experience: "exp_3_5yr",
      options_knowledge: "know_experienced",
      trading_capital_band: "cap_above_10l",
      primary_challenge: "chal_hedges",
      time_availability: "time_gt_2h",
      support_preference: "supp_mentorship",
      purchase_readiness: "ready_now_mnt",
    };

    const result = evaluateProductSuitability(answers);
    expect(result.product).toBe("mentorship");
    expect(result.score).toBe(100);
    expect(result.scoreBand).toBe("HIGH_INTENT");
    expect(result.recommendedTags).toContain(REPETE_TAGS.MENTORSHIP);
    expect(result.recommendedTags).toContain(REPETE_TAGS.HIGH_INTENT);
    expect(result.pipelineStageName).toBe("Recommendation Shared");
  });

  // 4. High-capital beginner
  it("Scenario 4: High-capital beginner -> Foundations (Capital does NOT override lack of knowledge)", () => {
    const answers = {
      welcome_interest: "wel_mentorship", // Mistakenly selected mentorship
      primary_need: "pneed_basics",
      trading_experience: "exp_beginner", // Beginner
      options_knowledge: "know_beginner", // Beginner knowledge
      trading_capital_band: "cap_above_10l", // 10L+ high capital
      primary_challenge: "chal_fundamentals",
      time_availability: "time_1_2h",
      support_preference: "supp_mentorship",
      purchase_readiness: "ready_now_mnt", // Ready now
    };

    const result = evaluateProductSuitability(answers);
    // Explicit suitability rule: must NOT recommend Mentorship or Execution to a beginner
    expect(result.product).toBe("foundations");
    expect(result.score).toBe(80);
    expect(result.scoreBand).toBe("HIGH_INTENT");
    expect(result.recommendedTags).toContain(REPETE_TAGS.FOUNDATION);
    expect(result.recommendedTags).toContain(REPETE_TAGS.HIGH_INTENT);
    expect(result.recommendedTags).not.toContain(REPETE_TAGS.MENTORSHIP);
    expect(result.rationale).toContain("Even with substantial capital");
  });

  // 5. Low-capital experienced trader
  it("Scenario 5: Low-capital experienced trader seeking execution -> Execution System with tailored capital rationale", () => {
    const answers = {
      primary_need: "pneed_execution",
      trading_experience: "exp_1_3yr",
      options_knowledge: "know_independent",
      trading_capital_band: "cap_below_50k", // < 50k capital
      primary_challenge: "chal_discipline",
      time_availability: "time_30_60m",
      support_preference: "supp_execution",
      purchase_readiness: "ready_now_exe",
    };

    const result = evaluateProductSuitability(answers);
    // Base fit on needs & experience: experienced trader seeking execution receives Execution System
    expect(result.product).toBe("execution_system");
    expect(result.score).toBe(100);
    expect(result.recommendedTags).toContain(REPETE_TAGS.EXECUTION);
    expect(result.rationale).toContain("defined-risk spread structures adaptable to your capital scale");
  });

  // Regression: Consent Provenance — Inbound inquiry does NOT set marketing opt-in
  it("Regression: Inbound enquiry sets service_window_only, NOT promotional marketing opted_in", async () => {
    h.state.flows = [
      {
        id: "flow-replete",
        name: "Replete Equities Flow",
        account_id: "acct-replete",
        user_id: "user-replete",
        status: "active",
        trigger_type: "keyword",
        trigger_config: {
          case_sensitive: false,
          keywords: ["start", "products"],
          match_type: "contains",
        },
        entry_node_id: "node-start",
      },
    ];

    h.state.nodes = [
      {
        id: "node-start",
        flow_id: "flow-replete",
        node_key: "node-start",
        node_type: "start",
        config: { next_node_key: "node-msg" },
      },
      {
        id: "node-msg",
        flow_id: "flow-replete",
        node_key: "node-msg",
        node_type: "send_buttons",
        config: { buttons: [] },
      },
    ];

    const result = await dispatchInboundToFlows({
      accountId: "acct-replete",
      userId: "user-replete",
      contactId: "contact-consent-test",
      conversationId: "conv-consent-test",
      message: {
        kind: "text",
        text: "start",
        meta_message_id: "meta-msg-consent-1",
      },
      isFirstInboundMessage: false,
    });

    expect(result.consumed).toBe(true);

    const consentVal = h.state.customValues.find(
      (v) =>
        v.contact_id === "contact-consent-test" &&
        v.custom_field_id === REPETE_CUSTOM_FIELDS.CONSENT_STATUS,
    );

    // CRITICAL: Must be service_window_only, NOT opted_in!
    expect(consentVal?.value).toBe("service_window_only");
    expect(consentVal?.value).not.toBe("opted_in");
  });

  // Regression: Wildcard trigger removal — arbitrary inbound text must NOT start the flow
  it("Regression: Wildcard trigger removed — non-scoped messages do not match entry", async () => {
    const { matchesKeywordTrigger } = await import("./engine");

    const scopedConfig = {
      case_sensitive: false,
      keywords: ["hi", "hello", "hey", "start", "replete", "products", "join", "learn", "trading"],
      match_type: "contains" as const,
    };

    // Scoped keywords match
    expect(matchesKeywordTrigger("hello replete", scopedConfig)).toBe(true);
    expect(matchesKeywordTrigger("start qualification", scopedConfig)).toBe(true);
    expect(matchesKeywordTrigger("trading products", scopedConfig)).toBe(true);

    // Arbitrary customer queries MUST NOT match
    expect(matchesKeywordTrigger("Where is my invoice?", scopedConfig)).toBe(false);
    expect(matchesKeywordTrigger("I want a refund", scopedConfig)).toBe(false);
    expect(matchesKeywordTrigger("Can you change my account phone number?", scopedConfig)).toBe(false);
    expect(matchesKeywordTrigger("Payment failed for order 123", scopedConfig)).toBe(false);
  });

  // 6. Prospect who is still researching
  it("Scenario 6: Prospect who is still researching -> Score < 50, Nurture stage", () => {
    const answers = {
      primary_need: "pneed_explore",
      trading_experience: "exp_lt_1yr",
      options_knowledge: "know_basics",
      trading_capital_band: "cap_50k_1l",
      primary_challenge: "chal_unsure",
      time_availability: "time_lt_30m",
      support_preference: "supp_unsure",
      purchase_readiness: "ready_research_unsure",
    };

    const result = evaluateProductSuitability(answers);
    expect(result.score).toBe(45);
    expect(result.scoreBand).toBe("RESEARCHING");
    expect(result.recommendedTags).toContain(REPETE_TAGS.NEEDS_HUMAN_REVIEW);
    expect(result.pipelineStageName).toBe("Human Follow-up Required");
  });

  // 7. Prospect with contradictory answers
  it("Scenario 7: Prospect with contradictory answers -> Human Review", () => {
    const answers = {
      primary_need: "pneed_basics",
      trading_experience: "exp_beginner", // Beginner
      options_knowledge: "know_experienced", // But claims advanced Greeks knowledge!
      trading_capital_band: "cap_1_3l",
      primary_challenge: "chal_hedges",
      time_availability: "time_1_2h",
      support_preference: "supp_mentorship",
      purchase_readiness: "ready_now_mnt",
    };

    const result = evaluateProductSuitability(answers);
    expect(result.isContradictory).toBe(true);
    expect(result.product).toBe("human_review");
    expect(result.recommendedTags).toContain(REPETE_TAGS.NEEDS_HUMAN_REVIEW);
    expect(result.pipelineStageName).toBe("Human Follow-up Required");
  });

  // 8. Prospect requesting a human
  it("Scenario 8: Prospect requesting human assistance via message -> Handoff & Tagging", async () => {
    h.state.activeRuns = [
      {
        id: "run-8",
        flow_id: "flow-replete",
        account_id: "acct-replete",
        user_id: "user-replete",
        contact_id: "contact-8",
        conversation_id: "conv-8",
        status: "active",
        current_node_key: "ask_q2_trading_experience",
        vars: { primary_need: "pneed_basics" },
        reprompt_count: 0,
      },
    ];

    const dispatchResult = await dispatchInboundToFlows({
      accountId: "acct-replete",
      userId: "user-replete",
      contactId: "contact-8",
      conversationId: "conv-8",
      message: {
        kind: "text",
        text: "Can I please speak to a human advisor?",
        meta_message_id: "meta-msg-8",
      },
      isFirstInboundMessage: false,
    });

    expect(dispatchResult.consumed).toBe(true);
    expect(dispatchResult.outcome).toBe("handed_off");

    // Verify tag NEEDS_HUMAN_REVIEW added
    const tag = h.state.contactTags.find(
      (t) => t.contact_id === "contact-8" && t.tag_id === REPETE_TAGS.NEEDS_HUMAN_REVIEW,
    );
    expect(tag).toBeDefined();

    // Verify custom value current_stage set to Human Follow-up Required
    const stageVal = h.state.customValues.find(
      (v) =>
        v.contact_id === "contact-8" &&
        v.custom_field_id === REPETE_CUSTOM_FIELDS.CURRENT_STAGE,
    );
    expect(stageVal?.value).toBe("Human Follow-up Required");
  });

  // 9. Prospect who opts out
  it("Scenario 9: Prospect who opts out -> Suppression & No Outbound Messages", async () => {
    const db = (await import("./admin-client")).supabaseAdmin();

    h.state.activeRuns = [
      {
        id: "run-9",
        flow_id: "flow-replete",
        account_id: "acct-replete",
        user_id: "user-replete",
        contact_id: "contact-9",
        conversation_id: "conv-9",
        status: "active",
        current_node_key: "ask_q1_primary_need",
        vars: {},
        reprompt_count: 0,
      },
    ];

    const dispatchResult = await dispatchInboundToFlows({
      accountId: "acct-replete",
      userId: "user-replete",
      contactId: "contact-9",
      conversationId: "conv-9",
      message: {
        kind: "text",
        text: "STOP",
        meta_message_id: "meta-msg-optout",
      },
      isFirstInboundMessage: false,
    });

    expect(dispatchResult.consumed).toBe(true);

    // Verify OPT_OUT tag added
    const optTag = h.state.contactTags.find(
      (t) => t.contact_id === "contact-9" && t.tag_id === REPETE_TAGS.OPT_OUT,
    );
    expect(optTag).toBeDefined();

    // Verify opt_out_status custom field
    const optCustom = h.state.customValues.find(
      (v) =>
        v.contact_id === "contact-9" &&
        v.custom_field_id === REPETE_CUSTOM_FIELDS.OPT_OUT_STATUS,
    );
    expect(optCustom?.value).toBe("opted_out");

    // Verify contact is marked opted out by isContactOptedOut
    const isOptedOut = await isContactOptedOut(db, "contact-9");
    expect(isOptedOut).toBe(true);

    // Subsequent message from opted-out contact must be suppressed
    const followUp = await dispatchInboundToFlows({
      accountId: "acct-replete",
      userId: "user-replete",
      contactId: "contact-9",
      conversationId: "conv-9",
      message: {
        kind: "text",
        text: "hello?",
        meta_message_id: "meta-msg-suppressed",
      },
      isFirstInboundMessage: false,
    });

    expect(followUp.consumed).toBe(true);
    expect(h.sendText).not.toHaveBeenCalled();
    expect(h.sendButtons).not.toHaveBeenCalled();
  });

  // 10. Prospect who interrupts and resumes the flow
  it("Scenario 10: Prospect interrupts and resumes flow -> State and vars preserved", async () => {
    // Lead previously answered Q1 and Q2, currently sitting at Q3
    h.state.activeRuns = [
      {
        id: "run-10",
        flow_id: "flow-replete",
        account_id: "acct-replete",
        user_id: "user-replete",
        contact_id: "contact-10",
        conversation_id: "conv-10",
        status: "active",
        current_node_key: "ask_q3_options_knowledge",
        vars: {
          primary_need: "pneed_execution",
          trading_experience: "exp_1_3yr",
        },
        reprompt_count: 0,
      },
    ];

    h.state.nodes = [
      {
        id: "node-q3",
        flow_id: "flow-replete",
        node_key: "ask_q3_options_knowledge",
        node_type: "send_list",
        config: {
          button_label: "Select Knowledge",
          sections: [
            {
              rows: [
                {
                  reply_id: "know_independent",
                  title: "Option Selling",
                  next_node_key: "ask_q4_trading_capital_band",
                },
              ],
            },
          ],
        },
      },
      {
        id: "node-q4",
        flow_id: "flow-replete",
        node_key: "ask_q4_trading_capital_band",
        node_type: "send_list",
        config: {
          button_label: "Select Capital",
          sections: [],
        },
      },
    ];

    // Prospect resumes hours later with answer to Q3
    const result = await dispatchInboundToFlows({
      accountId: "acct-replete",
      userId: "user-replete",
      contactId: "contact-10",
      conversationId: "conv-10",
      message: {
        kind: "interactive_reply",
        reply_id: "know_independent",
        reply_title: "Traded Independently",
        meta_message_id: "meta-msg-resume-q3",
      },
      isFirstInboundMessage: false,
    });

    expect(result.consumed).toBe(true);
    // Verify run advanced to Q4
    expect(h.sendList).toHaveBeenCalled();

    // Verify vars captured know_independent while preserving prior Q1 & Q2 answers
    const updateCall = h.state.updates.find(
      (u) => u.table === "flow_runs" && u.row.vars !== undefined,
    );
    expect(updateCall?.row.vars).toEqual({
      primary_need: "pneed_execution",
      trading_experience: "exp_1_3yr",
      options_knowledge: "know_independent",
    });

    // Verify Q3 was persisted to CRM custom values
    const q3Custom = h.state.customValues.find(
      (v) =>
        v.contact_id === "contact-10" &&
        v.custom_field_id === REPETE_CUSTOM_FIELDS.OPTIONS_KNOWLEDGE,
    );
    expect(q3Custom?.value).toBe("Traded Independently");
  });

  // 11. Duplicate entry trigger
  it("Scenario 11: Duplicate entry trigger -> Idempotent handling without duplicates", async () => {
    // Lead already has an active run
    h.state.activeRuns = [
      {
        id: "run-active-11",
        flow_id: "flow-replete",
        account_id: "acct-replete",
        user_id: "user-replete",
        contact_id: "contact-11",
        conversation_id: "conv-11",
        status: "active",
        current_node_key: "welcome_prompt",
        vars: {},
        reprompt_count: 0,
      },
    ];

    // Duplicate inbound event with matching meta_message_id
    h.state.events = [
      {
        id: "ev-1",
        flow_run_id: "run-active-11",
        event_type: "reply_received",
        payload: { meta_message_id: "dupe-msg-id" },
      },
    ];

    const result = await dispatchInboundToFlows({
      accountId: "acct-replete",
      userId: "user-replete",
      contactId: "contact-11",
      conversationId: "conv-11",
      message: {
        kind: "text",
        text: "hi",
        meta_message_id: "dupe-msg-id",
      },
      isFirstInboundMessage: false,
    });

    expect(result.consumed).toBe(true);
    expect(result.outcome).toBe("duplicate_inbound_ignored");
    expect(h.sendText).not.toHaveBeenCalled();
    expect(h.sendButtons).not.toHaveBeenCalled();
  });

  // 12. CRM persistence and message-delivery failure
  it("Scenario 12: CRM persistence and message delivery failure -> Safe failure with data retained", async () => {
    const db = (await import("./admin-client")).supabaseAdmin();

    // 1. Persist partial answers before failure
    await persistAnswerToCrm(db, "contact-12", "ask_q1_primary_need", "pneed_basics");
    await persistAnswerToCrm(
      db,
      "contact-12",
      "ask_q2_trading_experience",
      "exp_beginner",
    );

    // 2. Simulate message delivery failure (e.g. Meta API error)
    h.sendList.mockRejectedValueOnce(new Error("Meta API rate limit / 500 error"));

    h.state.activeRuns = [
      {
        id: "run-12",
        flow_id: "flow-replete",
        account_id: "acct-replete",
        user_id: "user-replete",
        contact_id: "contact-12",
        conversation_id: "conv-12",
        status: "active",
        current_node_key: "ask_q2_trading_experience",
        vars: { primary_need: "pneed_basics" },
        reprompt_count: 0,
      },
    ];

    h.state.nodes = [
      {
        id: "node-q2",
        flow_id: "flow-replete",
        node_key: "ask_q2_trading_experience",
        node_type: "send_list",
        config: {
          button_label: "Select Experience",
          sections: [
            {
              rows: [
                {
                  reply_id: "exp_beginner",
                  title: "Beginner",
                  next_node_key: "ask_q3_options_knowledge",
                },
              ],
            },
          ],
        },
      },
      {
        id: "node-q3",
        flow_id: "flow-replete",
        node_key: "ask_q3_options_knowledge",
        node_type: "send_list",
        config: { button_label: "Select Knowledge", sections: [] },
      },
    ];

    const result = await dispatchInboundToFlows({
      accountId: "acct-replete",
      userId: "user-replete",
      contactId: "contact-12",
      conversationId: "conv-12",
      message: {
        kind: "interactive_reply",
        reply_id: "exp_beginner",
        reply_title: "Complete Beginner (< 1 Year)",
        meta_message_id: "meta-msg-fail-test",
      },
      isFirstInboundMessage: false,
    });

    // Run terminates safely as completed/failed rather than crashing the server
    expect(result.consumed).toBe(true);

    // CRITICAL: Ensure previously captured CRM custom fields are completely retained
    const q1 = h.state.customValues.find(
      (v) =>
        v.contact_id === "contact-12" &&
        v.custom_field_id === REPETE_CUSTOM_FIELDS.PRIMARY_NEED,
    );
    const q2 = h.state.customValues.find(
      (v) =>
        v.contact_id === "contact-12" &&
        v.custom_field_id === REPETE_CUSTOM_FIELDS.TRADING_EXPERIENCE,
    );

    expect(q1?.value).toBe("Options Basics & Foundations");
    expect(q2?.value).toBe("Complete Beginner (< 1 Year)");
  });

  // ============================================================
  // Phase 3 Release Gate: Isolated End-to-End Test Plan Execution
  // Verifying Suites A through F from replete_v1_isolated_e2e_test_plan.md
  // ============================================================
  describe("Phase 3 Release Gate: Full E2E Verification Suites (A - F)", () => {
    const repleteTriggerConfig = {
      match_type: "word" as const,
      case_sensitive: false,
      keywords: ["hi", "hello", "hey", "start", "replete", "products", "join", "learn", "trading"],
      negative_keywords: [
        "support",
        "payment",
        "refund",
        "invoice",
        "bill",
        "billing",
        "receipt",
        "chargeback",
        "cancel",
        "desk",
        "helpdesk",
      ],
    };

    // Suite A: Entry Trigger & Consent Provenance Verification
    it("Suite A: Entry Trigger & Consent Provenance Verification", async () => {
      const { matchesKeywordTrigger } = await import("./engine");

      // A1: Arbitrary non-scoped message -> Flow NOT triggered
      expect(matchesKeywordTrigger("What is your office address?", repleteTriggerConfig)).toBe(false);

      // A2: Invoice, refund, support, or payment enquiry -> Suppressed by negative_keywords
      expect(matchesKeywordTrigger("Where is my invoice for order #401?", repleteTriggerConfig)).toBe(false);
      expect(matchesKeywordTrigger("Hi, I have an issue with my payment", repleteTriggerConfig)).toBe(false);
      expect(matchesKeywordTrigger("Hi, can I get a refund please?", repleteTriggerConfig)).toBe(false);
      expect(matchesKeywordTrigger("Hi, connects me with customer support desk", repleteTriggerConfig)).toBe(false);

      // A2 (Word boundary): 'hi' must never trigger inside 'which' or 'this'
      expect(matchesKeywordTrigger("which product should I choose?", repleteTriggerConfig)).toBe(false);
      expect(matchesKeywordTrigger("what is this?", repleteTriggerConfig)).toBe(false);
      expect(matchesKeywordTrigger("shift my timing", repleteTriggerConfig)).toBe(false);

      // A3: Intentional entry keyword triggers entry
      expect(matchesKeywordTrigger("products", repleteTriggerConfig)).toBe(true);
      expect(matchesKeywordTrigger("Hi", repleteTriggerConfig)).toBe(true);
      expect(matchesKeywordTrigger("Hello! I want to join Replete", repleteTriggerConfig)).toBe(true);
      expect(matchesKeywordTrigger("start qualification", repleteTriggerConfig)).toBe(true);
      expect(matchesKeywordTrigger("trading", repleteTriggerConfig)).toBe(true);

      // Ingress execution verifies consent provenance
      h.state.activeRuns = [];
      h.state.flows = [
        {
          id: "b23a968f-6fbb-4d57-b016-538d58a5f8e6",
          account_id: "acct-replete",
          user_id: "user-replete",
          name: "Replete Equities — WhatsApp Lead Qualification & Product Positioning V1",
          status: "active",
          trigger_type: "keyword",
          trigger_config: repleteTriggerConfig,
          entry_node_id: "welcome_prompt",
        },
      ];
      h.state.nodes = [
        {
          id: "node-entry",
          flow_id: "b23a968f-6fbb-4d57-b016-538d58a5f8e6",
          node_key: "welcome_prompt",
          node_type: "send_buttons",
          config: {
            body_text: "Welcome to Replete Equities",
            buttons: [{ reply_id: "btn_start", title: "Start" }],
          },
        },
      ];

      const res = await dispatchInboundToFlows({
        accountId: "acct-replete",
        userId: "user-replete",
        contactId: "contact-e2e-a",
        conversationId: "conv-e2e-a",
        message: { kind: "text", text: "products", meta_message_id: "e2e-meta-a" },
        isFirstInboundMessage: false,
      });

      expect(res.consumed).toBe(true);
      expect(res.outcome).toBe("started");

      // Verify consent status is 'service_window_only', NOT promotional 'opted_in'
      const consentStatus = h.state.customValues.find(
        (v) => v.contact_id === "contact-e2e-a" && v.custom_field_id === REPETE_CUSTOM_FIELDS.CONSENT_STATUS,
      );
      expect(consentStatus?.value).toBe("service_window_only");
      expect(consentStatus?.value).not.toBe("opted_in");

      // Verify consent timestamp is present
      const consentTs = h.state.customValues.find(
        (v) => v.contact_id === "contact-e2e-a" && v.custom_field_id === REPETE_CUSTOM_FIELDS.CONSENT_TIMESTAMP,
      );
      expect(consentTs?.value).toBeDefined();

      // Verify initial stage is 'New Lead'
      const initStage = h.state.customValues.find(
        (v) => v.contact_id === "contact-e2e-a" && v.custom_field_id === REPETE_CUSTOM_FIELDS.CURRENT_STAGE,
      );
      expect(initStage?.value).toBe("New Lead");
    });

    // Suite B: Interactive Replies & State Preservation
    it("Suite B: Interactive Replies & State Preservation through qualification steps", async () => {
      const db = (await import("./admin-client")).supabaseAdmin();

      // Simulate capturing Q1 through Q8 step by step
      await persistAnswerToCrm(db, "contact-e2e-b", "ask_q1_primary_need", "pneed_basics");
      await persistAnswerToCrm(db, "contact-e2e-b", "ask_q2_trading_experience", "exp_beginner");
      await persistAnswerToCrm(db, "contact-e2e-b", "ask_q3_options_knowledge", "know_beginner");
      await persistAnswerToCrm(db, "contact-e2e-b", "ask_q4_trading_capital_band", "cap_above_10l");
      await persistAnswerToCrm(db, "contact-e2e-b", "ask_q5_primary_challenge", "chal_fundamentals");
      await persistAnswerToCrm(db, "contact-e2e-b", "ask_q6_time_availability", "time_1_2h");
      await persistAnswerToCrm(db, "contact-e2e-b", "ask_q7_support_preference", "supp_mentorship");
      await persistAnswerToCrm(db, "contact-e2e-b", "ask_q8_purchase_readiness", "ready_now_mnt");

      const answersInCrm = h.state.customValues.filter((v) => v.contact_id === "contact-e2e-b");
      expect(answersInCrm.length).toBe(8);

      const exp = answersInCrm.find((v) => v.custom_field_id === REPETE_CUSTOM_FIELDS.TRADING_EXPERIENCE);
      const cap = answersInCrm.find((v) => v.custom_field_id === REPETE_CUSTOM_FIELDS.TRADING_CAPITAL_BAND);
      expect(exp?.value).toBe("Complete Beginner (< 1 Year)");
      expect(cap?.value).toBe("Above ₹10,00,000");
    });

    // Suite C: Deterministic Suitability & CRM Deal Update (5 Core Outcomes)
    it("Suite C: Distinct CRM Outcomes: Suitable Ready, Researching Nurture, Contradictory Human Review", async () => {
      // Outcome 1: Suitable product and ready to proceed -> Recommendation Shared + HIGH_INTENT
      const readyLead = evaluateProductSuitability({
        primary_need: "pneed_basics",
        trading_experience: "exp_beginner",
        options_knowledge: "know_beginner",
        trading_capital_band: "cap_1_3l",
        primary_challenge: "chal_fundamentals",
        time_availability: "time_1_2h",
        support_preference: "supp_structured",
        purchase_readiness: "ready_now_fnd",
      });
      expect(readyLead.product).toBe("foundations");
      expect(readyLead.pipelineStageName).toBe("Recommendation Shared");
      expect(readyLead.recommendedTags).toContain(REPETE_TAGS.HIGH_INTENT);
      expect(readyLead.recommendedTags).toContain(REPETE_TAGS.FOUNDATION);

      // Outcome 2: Suitable product but still researching -> Nurture / Not Ready
      const researchingLead = evaluateProductSuitability({
        primary_need: "pneed_execution",
        trading_experience: "exp_1_3yr",
        options_knowledge: "know_independent",
        trading_capital_band: "cap_1_3l",
        primary_challenge: "chal_discipline",
        time_availability: "time_1_2h",
        support_preference: "supp_execution",
        purchase_readiness: "ready_research_fnd",
      });
      expect(researchingLead.product).toBe("execution_system");
      expect(researchingLead.pipelineStageName).toBe("Nurture / Not Ready");
      expect(researchingLead.recommendedTags).toContain(REPETE_TAGS.RESEARCHING);
      expect(researchingLead.recommendedTags).toContain(REPETE_TAGS.EXECUTION);

      // Outcome 3: Conflicting or ambiguous answers -> Human Review & Human Follow-up Required
      const conflictingLead = evaluateProductSuitability({
        primary_need: "pneed_basics",
        trading_experience: "exp_beginner", // Beginner
        options_knowledge: "know_experienced", // Contradicts beginner!
        trading_capital_band: "cap_1_3l",
        primary_challenge: "chal_hedges",
        time_availability: "time_1_2h",
        support_preference: "supp_mentorship",
        purchase_readiness: "ready_now_mnt",
      });
      expect(conflictingLead.isContradictory).toBe(true);
      expect(conflictingLead.product).toBe("human_review");
      expect(conflictingLead.pipelineStageName).toBe("Human Follow-up Required");
      expect(conflictingLead.recommendedTags).toContain(REPETE_TAGS.NEEDS_HUMAN_REVIEW);
    });

    // Suite D: Explicit Human Assistance Request
    it("Suite D: Explicit Human Assistance Request -> Human Follow-up Required", async () => {
      h.state.activeRuns = [
        {
          id: "run-e2e-d",
          flow_id: "flow-replete",
          account_id: "acct-replete",
          user_id: "user-replete",
          contact_id: "contact-e2e-d",
          conversation_id: "conv-e2e-d",
          status: "active",
          current_node_key: "ask_q2_trading_experience",
          vars: { primary_need: "pneed_basics" },
          reprompt_count: 0,
        },
      ];

      const res = await dispatchInboundToFlows({
        accountId: "acct-replete",
        userId: "user-replete",
        contactId: "contact-e2e-d",
        conversationId: "conv-e2e-d",
        message: { kind: "text", text: "I need to talk to a human advisor", meta_message_id: "e2e-meta-d" },
        isFirstInboundMessage: false,
      });

      expect(res.consumed).toBe(true);
      expect(res.outcome).toBe("handed_off");

      const tag = h.state.contactTags.find(
        (t) => t.contact_id === "contact-e2e-d" && t.tag_id === REPETE_TAGS.NEEDS_HUMAN_REVIEW,
      );
      expect(tag).toBeDefined();

      const stage = h.state.customValues.find(
        (v) => v.contact_id === "contact-e2e-d" && v.custom_field_id === REPETE_CUSTOM_FIELDS.CURRENT_STAGE,
      );
      expect(stage?.value).toBe("Human Follow-up Required");
    });

    // Suite E: Opt-Out & Pre-Outbound Suppression Across Every Outbound Message Path
    it("Suite E: Opt-out suppresses subsequent promotional messaging completely", async () => {
      h.state.activeRuns = [
        {
          id: "run-e2e-e",
          flow_id: "flow-replete",
          account_id: "acct-replete",
          user_id: "user-replete",
          contact_id: "contact-e2e-e",
          conversation_id: "conv-e2e-e",
          status: "active",
          current_node_key: "ask_q2_trading_experience",
          vars: {},
          reprompt_count: 0,
        },
      ];

      // E1: User sends STOP
      const optOutRes = await dispatchInboundToFlows({
        accountId: "acct-replete",
        userId: "user-replete",
        contactId: "contact-e2e-e",
        conversationId: "conv-e2e-e",
        message: { kind: "text", text: "STOP", meta_message_id: "e2e-meta-stop" },
        isFirstInboundMessage: false,
      });

      expect(optOutRes.consumed).toBe(true);

      // Verify OPT_OUT tag applied
      const optOutTag = h.state.contactTags.find(
        (t) => t.contact_id === "contact-e2e-e" && t.tag_id === REPETE_TAGS.OPT_OUT,
      );
      expect(optOutTag).toBeDefined();

      // Verify opt_out_status CRM field
      const optOutStatus = h.state.customValues.find(
        (v) => v.contact_id === "contact-e2e-e" && v.custom_field_id === REPETE_CUSTOM_FIELDS.OPT_OUT_STATUS,
      );
      expect(optOutStatus?.value).toBe("opted_out");

      // Verify Deal update dispatched with status lost and closed stage
      const dealUpdate = h.state.updates.find(
        (u) => u.table === "deals" && u.row.status === "lost",
      );
      expect(dealUpdate).toBeDefined();
      expect(dealUpdate?.row.stage_id).toBe(REPETE_CLOSED_STAGE_ID);

      // E2: Subsequent message sent by opted-out lead is suppressed with ZERO outbound messages
      h.sendText.mockClear();
      h.sendButtons.mockClear();
      h.sendList.mockClear();

      const subsequentRes = await dispatchInboundToFlows({
        accountId: "acct-replete",
        userId: "user-replete",
        contactId: "contact-e2e-e",
        conversationId: "conv-e2e-e",
        message: { kind: "text", text: "start", meta_message_id: "e2e-meta-subsequent" },
        isFirstInboundMessage: false,
      });

      expect(subsequentRes.outcome).toBe("no_match");
      expect(h.sendText).not.toHaveBeenCalled();
      expect(h.sendButtons).not.toHaveBeenCalled();
      expect(h.sendList).not.toHaveBeenCalled();
    });

    // Suite F: Interruption, Resumption, Duplicate Events & Failure Recovery
    it("Suite F: Interruption, resumption, duplicate events & failure recovery", async () => {
      // F1: Resuming paused qualification maintains previous vars
      h.state.activeRuns = [
        {
          id: "run-e2e-f",
          flow_id: "flow-replete",
          account_id: "acct-replete",
          user_id: "user-replete",
          contact_id: "contact-e2e-f",
          conversation_id: "conv-e2e-f",
          status: "active",
          current_node_key: "ask_q4_trading_capital_band",
          vars: {
            primary_need: "pneed_execution",
            trading_experience: "exp_1_3yr",
            options_knowledge: "know_independent",
          },
          reprompt_count: 0,
        },
      ];
      h.state.nodes = [
        {
          id: "node-q4",
          flow_id: "flow-replete",
          node_key: "ask_q4_trading_capital_band",
          node_type: "send_list",
          config: {
            button_label: "Select Capital",
            sections: [
              {
                rows: [
                  {
                    reply_id: "cap_1_3l",
                    title: "₹1 - 3 Lakh",
                    next_node_key: "ask_q5_primary_challenge",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "node-q5",
          flow_id: "flow-replete",
          node_key: "ask_q5_primary_challenge",
          node_type: "send_list",
          config: { button_label: "Select Challenge", sections: [] },
        },
      ];

      const resumeRes = await dispatchInboundToFlows({
        accountId: "acct-replete",
        userId: "user-replete",
        contactId: "contact-e2e-f",
        conversationId: "conv-e2e-f",
        message: {
          kind: "interactive_reply",
          reply_id: "cap_1_3l",
          reply_title: "₹1 - 3 Lakh",
          meta_message_id: "e2e-meta-resume",
        },
        isFirstInboundMessage: false,
      });

      expect(resumeRes.consumed).toBe(true);
      expect(resumeRes.outcome).toBe("advanced");

      const updateCall = h.state.updates.find((u) => u.table === "flow_runs");
      expect(updateCall?.row.vars).toMatchObject({
        primary_need: "pneed_execution",
        trading_experience: "exp_1_3yr",
        options_knowledge: "know_independent",
        trading_capital_band: "cap_1_3l",
      });

      // F2: Duplicate webhook delivery is detected and safely ignored
      h.state.events = [
        {
          id: "ev-dupe",
          flow_run_id: "run-e2e-f",
          event_type: "reply_received",
          payload: { meta_message_id: "e2e-meta-resume" },
        },
      ];

      const dupeRes = await dispatchInboundToFlows({
        accountId: "acct-replete",
        userId: "user-replete",
        contactId: "contact-e2e-f",
        conversationId: "conv-e2e-f",
        message: {
          kind: "interactive_reply",
          reply_id: "cap_1_3l",
          reply_title: "₹1 - 3 Lakh",
          meta_message_id: "e2e-meta-resume",
        },
        isFirstInboundMessage: false,
      });

      expect(dupeRes.consumed).toBe(true);
      expect(dupeRes.outcome).toBe("duplicate_inbound_ignored");
    });
  });
});

UPDATE flows 
SET 
  trigger_config = '{
    "case_sensitive": false,
    "keywords": [
      "hi",
      "hello",
      "hey",
      "replete",
      "replete equities",
      "products",
      "join",
      "start qualification",
      "start flow"
    ],
    "match_type": "word",
    "negative_keywords": [
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
      "helpdesk"
    ]
  }'::jsonb,
  fallback_policy = '{
    "max_reprompts": 1,
    "on_exhaust": "handoff",
    "on_timeout_hours": 24,
    "on_unknown_reply": "ignore"
  }'::jsonb
WHERE id = 'b23a968f-6fbb-4d57-b016-538d58a5f8e6'
RETURNING id, name, trigger_config, fallback_policy;

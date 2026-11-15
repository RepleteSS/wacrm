UPDATE flow_nodes 
SET config = '{
  "button_label": "Choose Starting Path",
  "sections": [
    {
      "rows": [
        {
          "description": "Learn trading & options basics",
          "next_node_key": "ask_q2_trading_experience",
          "reply_id": "wel_fundamentals",
          "title": "Learn Fundamentals"
        },
        {
          "description": "Rules-based execution system",
          "next_node_key": "ask_q2_trading_experience",
          "reply_id": "wel_execution",
          "title": "Structured Execution"
        },
        {
          "description": "Option strategies & hedging",
          "next_node_key": "ask_q2_trading_experience",
          "reply_id": "wel_mentorship",
          "title": "Advanced Mentorship"
        },
        {
          "description": "Connect with our advisory desk",
          "next_node_key": "route_human_handoff",
          "reply_id": "wel_team",
          "title": "Speak to the Team"
        }
      ],
      "title": "Starting Options"
    }
  ],
  "text": "Hi {{vars.first_name}}! Welcome to Replete Equities.\n\nI''m here to help you identify which of our trading education and execution solutions best fits your current experience, requirements, and available capital.\n\nI''ll ask a few quick questions so we can guide you towards the right option. There is no obligation to purchase.\n\nLet''s start!"
}'::jsonb 
WHERE flow_id = 'b23a968f-6fbb-4d57-b016-538d58a5f8e6' 
  AND node_key = 'welcome_prompt' 
RETURNING id, node_key, config;

-- ============================================================
-- 048_deals_conversation_delete_set_null.sql
--
-- The same defect as migration 004, one column over.
--
-- `deals.conversation_id` was declared `REFERENCES conversations(id)`
-- with no ON DELETE action (001_initial_schema.sql:273), so Postgres
-- defaults to NO ACTION. The first time a conversation that a deal
-- still points at is deleted, the statement fails with:
--
--   ERROR 23503: update or delete on table "conversations" violates
--   foreign key constraint "deals_conversation_id_fkey" on table "deals"
--
-- Migration 004 fixed `deals.contact_id` and left this column alone, so
-- conversation deletion stayed impossible for any account with a linked
-- deal — which is exactly what the inbox's delete / "Clear inbox"
-- actions need to do in one statement.
--
-- SET NULL, not CASCADE: a deal is pipeline history. Winning a deal from
-- a thread and then archiving that thread must not erase the deal, and
-- it must not retroactively move the aggregate triggers that 004's
-- header describes. The UI already treats `conversation_id` as optional
-- and nothing in src/ has ever written it, so today every row is NULL
-- and existing data is untouched by this migration.
--
-- The constraint is dropped by looking up any FK from deals ->
-- conversations rather than by auto-generated name, so this holds even
-- if the constraint was ever renamed.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'deals'::regclass
      AND confrelid = 'conversations'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE deals DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;

ALTER TABLE deals
  ADD CONSTRAINT deals_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ON DELETE SET NULL;

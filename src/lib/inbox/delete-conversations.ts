// ============================================================
// delete-conversations.ts
//
// Inbox deletion. Before this existed the app had NO way to delete a
// conversation — so an inbox that had been filled with data imported
// from another tool could not be emptied at all.
//
// Two things make this more than a bare `.delete()`:
//
//   1. DEPENDENT ROWS. Deleting a conversation cascades to `messages`,
//      `message_reactions` and `notifications` (001 / 009 / 027) and
//      SET NULLs `flow_runs.conversation_id` and
//      `ai_reply.conversation_id` (010 / 033). Postgres does all of
//      that itself. The single row that used to BLOCK the delete —
//      `deals.conversation_id`, declared with no ON DELETE action — is
//      switched to SET NULL by migration 048. `deals` itself survives:
//      pipeline history is not thrown away with the thread it came from.
//      Contacts are deliberately untouched.
//
//   2. MEDIA IS NOT A TABLE. Attachments live in the public `chat-media`
//      Storage bucket (023) under `account-<account_id>/<file>`, and
//      inbound media is mirrored into `.../inbound/<file>` (039). The
//      object path carries NO conversation id, so deleting the rows
//      orphans the objects silently: they keep occupying the bucket and
//      stay publicly fetchable forever. So the URLs are harvested
//      BEFORE the rows go and the objects removed afterwards.
//
// ORDERING IS THE INVARIANT: harvest, then delete rows, then GC storage.
// Harvesting has to succeed first, otherwise a failure mid-way would
// leave permanently orphaned public files with no way to find them again.
// Storage GC is best-effort by contrast — a missed object is a storage
// nit, and retrying the delete is always safe because the rows are gone.
//
// Everything here runs as the signed-in user under RLS, deliberately not
// with the service role: no server secret needed, and a caller can only
// ever reach its own account's rows and objects.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { chunk, fetchAllInChunks, fetchAllPages } from "@/lib/supabase/paged-query";

/**
 * The bucket conversations store attachments in (migration 023). Same
 * value as `MIRROR_BUCKET` in `@/lib/whatsapp/mirror-inbound-media`,
 * declared here rather than imported so the inbox doesn't depend on a
 * WhatsApp-specific module for a storage name.
 */
const CHAT_MEDIA_BUCKET = "chat-media";

/** `in`-list width while harvesting media urls for a set of conversations. */
const HARVEST_CHUNK = 100;

/** Conversation ids per DELETE round-trip. */
const DELETE_CHUNK = 200;

/** Storage paths per `storage.remove()` call. */
const STORAGE_CHUNK = 100;

export interface DeleteConversationsResult {
  /** Distinct conversation ids asked for. */
  requested: number;
  /** Rows actually removed (RLS may have excluded some). */
  deleted: number;
  /** `chat-media` objects removed. */
  mediaRemoved: number;
  /** Objects the bucket refused to remove — left in place, not fatal. */
  mediaFailed: number;
}

/**
 * Split a value into slices of at most `size`. Re-exported from
 * `paged-query` so callers that only need chunking don't import two
 * modules; identical semantics.
 */
export { chunk };

/**
 * Object path inside `chat-media` that a `media_url` points at, or null
 * when the URL is not a chat-media object.
 *
 * Returns null for every URL this must NOT touch:
 *   - the inbound media proxy (`/api/whatsapp/media/<meta-id>`), which is
 *     a pointer to bytes Meta still holds, not a stored object;
 *   - `flow-media` and `avatars` objects, which belong to the flow
 *     builder and profiles and have nothing to do with a conversation.
 *
 * Pure + exported so it is unit-testable without a Supabase client.
 */
export function chatMediaPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  let pathname: string;
  try {
    pathname = new URL(url, "http://media.invalid").pathname;
  } catch {
    return null;
  }

  const match = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/.exec(
    pathname,
  );
  if (!match) return null;

  const [, bucket, rawPath] = match;
  if (bucket !== CHAT_MEDIA_BUCKET) return null;

  let path = rawPath;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    // Malformed escape — keep the raw segment rather than dropping the
    // object on the floor over a decoding problem.
  }

  // Both real shapes start with the account folder (023 outbound,
  // 039 mirrored inbound under `inbound/`). Anything else isn't ours.
  if (!path.startsWith("account-") || path.endsWith("/")) return null;
  return path;
}

/** Every distinct chat-media object path referenced by these conversations. */
async function harvestMediaPaths(
  db: SupabaseClient,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];

  const rows = await fetchAllInChunks<{ media_url: string | null }, string>(
    ids,
    (slice, from, to) =>
      db
        .from("messages")
        .select("media_url")
        .in("conversation_id", slice)
        .not("media_url", "is", null)
        .order("id")
        .range(from, to),
    HARVEST_CHUNK,
  );

  // Two rows can share one object (the inbound mirror keys on Meta's
  // media id, so a redelivered webhook rewrites the same path).
  const paths = new Set<string>();
  for (const row of rows) {
    const path = chatMediaPathFromUrl(row.media_url);
    if (path) paths.add(path);
  }
  return [...paths];
}

/**
 * Best-effort removal of chat-media objects. Never throws: a bucket that
 * refuses (or an object already gone) leaves the path in `mediaFailed`
 * so the caller can report it without failing the delete.
 */
async function removeMediaPaths(
  db: SupabaseClient,
  paths: readonly string[],
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;

  for (const slice of chunk(paths, STORAGE_CHUNK)) {
    const { error } = await db.storage.from(CHAT_MEDIA_BUCKET).remove([...slice]);
    if (error) {
      failed += slice.length;
      continue;
    }
    removed += slice.length;
  }

  return { removed, failed };
}

/**
 * Delete conversations and everything hanging off them, then GC the
 * chat-media objects those threads referenced.
 *
 * Media urls are harvested first on purpose — see the ordering note in
 * this file's header.
 */
export async function deleteConversations(
  db: SupabaseClient,
  ids: readonly string[],
): Promise<DeleteConversationsResult> {
  const targets = [...new Set(ids)].filter(Boolean);
  if (targets.length === 0) {
    return { requested: 0, deleted: 0, mediaRemoved: 0, mediaFailed: 0 };
  }

  const mediaPaths = await harvestMediaPaths(db, targets);

  let deleted = 0;
  for (const slice of chunk(targets, DELETE_CHUNK)) {
    const { data, error } = await db
      .from("conversations")
      .delete()
      .in("id", slice)
      .select("id");
    if (error) {
      throw new Error(error.message);
    }
    deleted += data?.length ?? 0;
  }

  const { removed, failed } = await removeMediaPaths(db, mediaPaths);

  return {
    requested: targets.length,
    deleted,
    mediaRemoved: removed,
    mediaFailed: failed,
  };
}

/**
 * Every conversation id in the account. RLS scopes the select to the
 * caller's account, so this is only ever their own threads.
 *
 * Callers that want to empty the inbox compose this with
 * {@link deleteConversations} — going through the ids explicitly means
 * the removed set can be reported to whatever else is holding the rows
 * in state.
 */
export async function listAllConversationIds(
  db: SupabaseClient,
): Promise<string[]> {
  const rows = await fetchAllPages<{ id: string }>((from, to) =>
    db.from("conversations").select("id").order("id").range(from, to),
  );
  return rows.map((row) => row.id);
}

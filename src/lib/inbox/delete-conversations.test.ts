import { describe, it, expect } from "vitest";
import { chatMediaPathFromUrl, chunk } from "./delete-conversations";

const ORIGIN = "https://mfyfbwhpbzleewgfeses.supabase.co";

/**
 * Deleting a conversation orphans its attachments unless the objects are
 * found and removed too — the `chat-media` path carries no conversation
 * id (migrations 023 / 039), so the only way back from a `media_url` to
 * an object is this parser. Over-matching here deletes somebody else's
 * bytes: `flow-media` and `avatars` live in the same Storage and must
 * survive an inbox wipe untouched.
 */
describe("chatMediaPathFromUrl", () => {
  it("resolves an outbound chat-media object", () => {
    expect(
      chatMediaPathFromUrl(
        `${ORIGIN}/storage/v1/object/public/chat-media/account-abc/1770000000000-invoice.pdf`,
      ),
    ).toBe("account-abc/1770000000000-invoice.pdf");
  });

  it("resolves a mirrored inbound object under inbound/", () => {
    expect(
      chatMediaPathFromUrl(
        `${ORIGIN}/storage/v1/object/public/chat-media/account-abc/inbound/1234567890123456-image-1700000000.jpg`,
      ),
    ).toBe("account-abc/inbound/1234567890123456-image-1700000000.jpg");
  });

  it("decodes percent-escapes in the object name", () => {
    expect(
      chatMediaPathFromUrl(
        `${ORIGIN}/storage/v1/object/public/chat-media/account-abc/1770000000000-my%20photo.jpg?token=1`,
      ),
    ).toBe("account-abc/1770000000000-my photo.jpg");
  });

  it("keeps the raw segment when the escapes are malformed", () => {
    expect(
      chatMediaPathFromUrl(
        `${ORIGIN}/storage/v1/object/public/chat-media/account-abc/1700-bad%zz.jpg`,
      ),
    ).toBe("account-abc/1700-bad%zz.jpg");
  });

  it("accepts signed and authenticated object URLs", () => {
    expect(
      chatMediaPathFromUrl(
        `${ORIGIN}/storage/v1/object/sign/chat-media/account-abc/1-a.png`,
      ),
    ).toBe("account-abc/1-a.png");
    expect(
      chatMediaPathFromUrl(
        `${ORIGIN}/storage/v1/object/authenticated/chat-media/account-abc/1-a.png`,
      ),
    ).toBe("account-abc/1-a.png");
  });

  it("parses a path-only URL via the base fallback", () => {
    expect(
      chatMediaPathFromUrl("/storage/v1/object/public/chat-media/account-abc/1-a.png"),
    ).toBe("account-abc/1-a.png");
  });

  it("ignores the inbound media proxy, which points at Meta's copy", () => {
    expect(chatMediaPathFromUrl("/api/whatsapp/media/1234567890123456")).toBeNull();
    expect(
      chatMediaPathFromUrl(`${ORIGIN}/api/whatsapp/media/1234567890123456`),
    ).toBeNull();
  });

  it("never touches the flow-media or avatars buckets", () => {
    expect(
      chatMediaPathFromUrl(
        `${ORIGIN}/storage/v1/object/public/flow-media/account-abc/1-a.png`,
      ),
    ).toBeNull();
    expect(
      chatMediaPathFromUrl(`${ORIGIN}/storage/v1/object/public/avatars/user-1/a.png`),
    ).toBeNull();
  });

  it("ignores unrelated and empty URLs", () => {
    expect(chatMediaPathFromUrl(null)).toBeNull();
    expect(chatMediaPathFromUrl(undefined)).toBeNull();
    expect(chatMediaPathFromUrl("")).toBeNull();
    expect(chatMediaPathFromUrl("https://cdn.example.com/photos/a.jpg")).toBeNull();
  });

  it("ignores a chat-media URL with no object path", () => {
    expect(chatMediaPathFromUrl(`${ORIGIN}/storage/v1/object/public/chat-media`)).toBeNull();
    expect(
      chatMediaPathFromUrl(`${ORIGIN}/storage/v1/object/public/chat-media/`),
    ).toBeNull();
  });

  it("ignores an object outside an account folder", () => {
    expect(
      chatMediaPathFromUrl(`${ORIGIN}/storage/v1/object/public/chat-media/stray.png`),
    ).toBeNull();
    expect(
      chatMediaPathFromUrl(`${ORIGIN}/storage/v1/object/public/chat-media/user-1/1-a.png`),
    ).toBeNull();
  });

  it("ignores a directory-looking path", () => {
    expect(
      chatMediaPathFromUrl(`${ORIGIN}/storage/v1/object/public/chat-media/account-abc/`),
    ).toBeNull();
  });
});

describe("chunk", () => {
  it("splits into slices of at most the requested size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  it("returns nothing for an empty input", () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it("rejects a non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
});

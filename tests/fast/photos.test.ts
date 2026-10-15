process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "placeholder-publishable-key";
process.env.SUPABASE_SECRET_KEY ??= "placeholder-secret-key";

import { describe, expect, it } from "bun:test";

// Report photos are public, so their bytes must match the type the browser
// claimed, as proofs already do. No live Supabase: only the check itself.

const { PHOTO_TYPE_ERROR, checkPhoto } = await import("../../src/server/lib/photos.js");

const photo = (mimetype: string, bytes: number[] | string) =>
  ({ mimetype, buffer: typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes) }) as Express.Multer.File;

describe("PHO-01 a report photo must be the image it claims to be", () => {
  it("accepts JPG, PNG, and WebP by their first bytes", () => {
    expect(checkPhoto(photo("image/jpeg", [0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(checkPhoto(photo("image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(checkPhoto(photo("image/webp", "RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
  });

  it("refuses a file whose bytes do not match its claimed type", () => {
    expect(() => checkPhoto(photo("image/jpeg", "<html><script>alert(1)</script>"))).toThrow(PHOTO_TYPE_ERROR);
    expect(() => checkPhoto(photo("image/png", [0xff, 0xd8, 0xff]))).toThrow(PHOTO_TYPE_ERROR);
  });

  it("refuses types that are not photos, even with valid bytes", () => {
    expect(() => checkPhoto(photo("application/pdf", "%PDF-1.7"))).toThrow(PHOTO_TYPE_ERROR);
  });
});

import { describe, expect, test } from "bun:test";
import { formatFileSize, formatMimeType } from "../../src/web/components/PhotoPicker.js";

describe("KR-18: Decimal file size formatting", () => {
  test("formats bytes under 1000 B without unit scaling", () => {
    expect(formatFileSize(0)).toBe("0\u00a0B");
    expect(formatFileSize(500)).toBe("500\u00a0B");
    expect(formatFileSize(999)).toBe("999\u00a0B");
  });

  test("formats kilobytes using decimal base (1000)", () => {
    expect(formatFileSize(1000)).toBe("1\u00a0KB");
    expect(formatFileSize(1500)).toBe("1.5\u00a0KB");
    expect(formatFileSize(200_000)).toBe("200\u00a0KB");
    expect(formatFileSize(999_999)).toBe("1000\u00a0KB");
  });

  test("formats megabytes using decimal base (1,000,000)", () => {
    expect(formatFileSize(1_000_000)).toBe("1\u00a0MB");
    expect(formatFileSize(1_500_000)).toBe("1.5\u00a0MB");
    expect(formatFileSize(2_750_000)).toBe("2.75\u00a0MB");
    expect(formatFileSize(3_000_000)).toBe("3\u00a0MB");
  });
});

describe("KR-19: Friendly MIME type format badges", () => {
  test("maps JPEG MIME types to JPEG badge", () => {
    expect(formatMimeType("image/jpeg")).toBe("JPEG");
    expect(formatMimeType("image/jpg")).toBe("JPEG");
    expect(formatMimeType("IMAGE/JPEG")).toBe("JPEG");
  });

  test("maps PNG MIME type to PNG badge", () => {
    expect(formatMimeType("image/png")).toBe("PNG");
    expect(formatMimeType("IMAGE/PNG")).toBe("PNG");
  });

  test("maps WebP MIME type to WebP badge", () => {
    expect(formatMimeType("image/webp")).toBe("WebP");
    expect(formatMimeType("IMAGE/WEBP")).toBe("WebP");
  });

  test("falls back to uppercase subtype or raw string", () => {
    expect(formatMimeType("image/gif")).toBe("GIF");
    expect(formatMimeType("plain")).toBe("plain");
  });

  test("handles empty or missing MIME string gracefully", () => {
    expect(formatMimeType("")).toBe("");
  });
});

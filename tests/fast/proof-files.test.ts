import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  PROOF_ACTIVE_ERROR,
  PROOF_DAMAGED_ERROR,
  PROOF_PAGES_ERROR,
  PROOF_PIXELS_ERROR,
  hasCompleteTrailer,
  inspectProofFile,
} from "../../src/server/lib/proof-files.js";
import { syntheticPdf as pdf } from "./synthetic-pdf.js";

// Issue #62: every file here is synthetic, made in memory for the test.

const blank = () => sharp({ create: { width: 320, height: 200, channels: 3, background: "#d9e4e8" } });
const jpeg = await blank().jpeg().toBuffer();
const png = await blank().png().toBuffer();
const webp = await blank().webp().toBuffer();

// A real PNG of 6500 x 6500 pixels (42 megapixels) of one colour: a few hundred
// kilobytes on disk that would need over 120 MB to decode.
const oversized = await sharp({ create: { width: 6500, height: 6500, channels: 3, background: "#ffffff" } })
  .png({ compressionLevel: 9 })
  .toBuffer();

async function refusal(buffer: Buffer, type: string) {
  try {
    await inspectProofFile(buffer, type);
    return "accepted";
  } catch (error) {
    return (error as Error).message;
  }
}

describe("PRF-01 complete, valid proofs are accepted", () => {
  test("JPEG, PNG, WebP, and PDF", async () => {
    for (const [buffer, type] of [[jpeg, "image/jpeg"], [png, "image/png"], [webp, "image/webp"], [pdf(), "application/pdf"]] as const) {
      expect(await refusal(buffer, type)).toBe("accepted");
    }
  });

  test("a multi-page PDF within the limit", async () => {
    const pages = pdf({ pages: 20 });
    expect(await refusal(pages, "application/pdf")).toBe("accepted");
  });
});

describe("PRF-02 damaged or mismatched files are refused", () => {
  test("truncated images and PDFs", async () => {
    for (const [buffer, type] of [[jpeg, "image/jpeg"], [png, "image/png"], [webp, "image/webp"], [pdf(), "application/pdf"]] as const) {
      expect(await refusal(buffer.subarray(0, Math.floor(buffer.length * 0.6)), type)).toBe(PROOF_DAMAGED_ERROR);
    }
  });

  test("header-only files", async () => {
    expect(await refusal(Buffer.from("%PDF-1.7 rest"), "application/pdf")).toBe(PROOF_DAMAGED_ERROR);
    expect(await refusal(jpeg.subarray(0, 16), "image/jpeg")).toBe(PROOF_DAMAGED_ERROR);
    expect(await refusal(png.subarray(0, 33), "image/png")).toBe(PROOF_DAMAGED_ERROR);
  });

  test("a valid image sent as another image type", async () => {
    expect(await refusal(png, "image/jpeg")).toBe(PROOF_DAMAGED_ERROR);
    expect(await refusal(jpeg, "image/webp")).toBe(PROOF_DAMAGED_ERROR);
  });

  test("a PDF whose startxref points nowhere", async () => {
    const valid = pdf().toString("latin1");
    const broken = Buffer.from(valid.replace(/startxref\s+\d+/, "startxref\n12"), "latin1");
    expect(hasCompleteTrailer(broken)).toBe(false);
    expect(await refusal(broken, "application/pdf")).toBe(PROOF_DAMAGED_ERROR);
  });
});

describe("PRF-03 resource limits hold before any decoding", () => {
  test("a small file that decodes to more than 40 megapixels, refused from its header", async () => {
    expect(oversized.length).toBeLessThan(5 * 1024 * 1024);
    const started = performance.now();
    expect(await refusal(oversized, "image/png")).toBe(PROOF_PIXELS_ERROR);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("a PDF over 20 pages", async () => {
    const pages = pdf({ pages: 21 });
    expect(await refusal(pages, "application/pdf")).toBe(PROOF_PAGES_ERROR);
  });
});

describe("PRF-04 PDFs that act on opening are refused", () => {
  test("JavaScript that runs on opening", async () => {
    const script = pdf({ catalog: "/OpenAction << /S /JavaScript /JS (app.alert(1)) >> " });
    expect(await refusal(script, "application/pdf")).toBe(PROOF_ACTIVE_ERROR);
  });

  test("JavaScript whose names are escaped past a plain text search", async () => {
    // #61 is "a" and #53 is "S": PDF.js reads these as /JavaScript and /JS.
    const hidden = pdf({ catalog: "/OpenAction << /S /J#61vaScript /J#53 (app.alert(1)) >> " });
    expect(hidden.toString("latin1")).not.toMatch(/\/JavaScript|\/JS/);
    expect(await refusal(hidden, "application/pdf")).toBe(PROOF_ACTIVE_ERROR);
  });

  test("a password", async () => {
    const locked = pdf({ trailer: "/Encrypt << /Filter /Standard /V 1 /R 2 /O (x) /U (y) /P -4 >> " });
    expect(await refusal(locked, "application/pdf")).toBe(PROOF_ACTIVE_ERROR);
  });
});

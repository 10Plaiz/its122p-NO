import sharp from "sharp";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// Issue #62: a residency proof must be a complete, readable file, not just one
// that starts with the right bytes. Images are fully decoded with sharp; PDFs must
// end with a proper trailer and open with PDF.js. Both run under fixed limits, so
// a small upload cannot cost unbounded memory or time.
//
// This establishes only that the file is a well-formed image or a plain PDF. It is
// not a malware scan, and it says nothing about whose document it is or whether
// the address is in Makati: an administrator still reviews that.

export const PROOF_MAX_PIXELS = 40_000_000;
export const PROOF_MAX_PAGES = 20;
export const PROOF_CHECK_MS = 5_000;

export const PROOF_DAMAGED_ERROR = "That file is damaged or incomplete. Scan or photograph the document again and upload the new file.";
export const PROOF_PIXELS_ERROR = "That image is too large to check. Use a photo or scan under 40 megapixels.";
export const PROOF_PAGES_ERROR = "That PDF has more than 20 pages. Send only the pages that show your name and address.";
export const PROOF_ACTIVE_ERROR =
  "That PDF is password-protected or contains scripts or attachments. Send a plain scan or photo of the document instead.";
export const PROOF_SLOW_ERROR = "That file took too long to check. Send a smaller scan or a photo of the document.";

// Images are never cached by sharp: every proof is untrusted and seen once.
sharp.cache(false);

// PDF.js runs its parser on this thread in Node. Importing the worker here, rather
// than letting PDF.js load it on demand, keeps it in the deployed bundle.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfWorker;

export class ProofFileError extends Error {}

const IMAGE_FORMATS = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;

// timeoutMs exists for tests; uploads always use PROOF_CHECK_MS.
export async function inspectProofFile(buffer: Buffer, mimetype: string, { timeoutMs = PROOF_CHECK_MS } = {}): Promise<void> {
  if (mimetype === "application/pdf") return inspectPdf(buffer, timeoutMs);
  const format = IMAGE_FORMATS[mimetype as keyof typeof IMAGE_FORMATS];
  if (!format) throw new ProofFileError(PROOF_DAMAGED_ERROR);
  return inspectImage(buffer, format, timeoutMs);
}

async function inspectImage(buffer: Buffer, format: string, timeoutMs: number) {
  // The header first: it is cheap, and the size is known before any decoding.
  let width = 0;
  let height = 0;
  try {
    const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
    if (metadata.format !== format) throw new ProofFileError(PROOF_DAMAGED_ERROR);
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
  } catch (error) {
    if (error instanceof ProofFileError) throw error;
    throw new ProofFileError(PROOF_DAMAGED_ERROR);
  }
  if (width < 1 || height < 1) throw new ProofFileError(PROOF_DAMAGED_ERROR);
  if (width * height > PROOF_MAX_PIXELS) throw new ProofFileError(PROOF_PIXELS_ERROR);

  // Then every pixel of the first frame, failing on a truncated or corrupt image.
  // stats() streams through the image, so memory stays well under a full copy.
  // sharp's timeout (whole seconds) stops libvips itself, so nothing runs on after
  // the answer. Under 5 MB and 40 megapixels a check measured about 0.4 s, so the
  // limit is a backstop.
  try {
    await sharp(buffer, { failOn: "error", limitInputPixels: PROOF_MAX_PIXELS })
      .timeout({ seconds: Math.max(1, Math.ceil(timeoutMs / 1000)) })
      .stats();
  } catch (error) {
    if (/timeout/i.test((error as Error)?.message ?? "")) throw new ProofFileError(PROOF_SLOW_ERROR);
    throw new ProofFileError(PROOF_DAMAGED_ERROR);
  }
}

// PDF.js repairs broken files to show what it can, so it cannot tell a complete
// PDF from a cut-off one. The trailer can: a complete file ends with startxref,
// the offset of a real cross-reference table or stream, and %%EOF.
export function hasCompleteTrailer(buffer: Buffer): boolean {
  const tail = buffer.subarray(Math.max(0, buffer.length - 1024)).toString("latin1");
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
  if (!match) return false;
  const offset = Number(match[1]);
  if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= buffer.length) return false;
  const target = buffer.subarray(offset, offset + 32).toString("latin1");
  return /^xref\s/.test(target) || /^\d+\s+\d+\s+obj\b/.test(target);
}

// Names that make a PDF do something when opened, or carry another file. Most are
// found again through PDF.js below; this also catches them in plain dictionaries.
const ACTIVE_NAMES = /\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|Encrypt)(?![A-Za-z0-9])/;

async function inspectPdf(buffer: Buffer, timeoutMs: number) {
  if (!hasCompleteTrailer(buffer)) throw new ProofFileError(PROOF_DAMAGED_ERROR);
  if (ACTIVE_NAMES.test(buffer.toString("latin1"))) throw new ProofFileError(PROOF_ACTIVE_ERROR);

  // PDF.js takes ownership of the bytes it is given, so it gets a copy.
  const task = getDocument({
    data: new Uint8Array(buffer),
    stopAtErrors: true,
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    verbosity: 0,
  });
  // PDF.js parses on this thread in one chain of promises, so a timer could not
  // fire until it finished. The deadline is checked between steps instead: once
  // it passes, no further step starts. Each step is bounded by the 5 MB and
  // 20-page limits.
  const deadline = performance.now() + timeoutMs;
  const inTime = () => {
    if (performance.now() > deadline) throw new ProofFileError(PROOF_SLOW_ERROR);
  };
  try {
    const pdf = await task.promise;
    inTime();
    if (pdf.numPages < 1) throw new ProofFileError(PROOF_DAMAGED_ERROR);
    if (pdf.numPages > PROOF_MAX_PAGES) throw new ProofFileError(PROOF_PAGES_ERROR);
    const [scripts, attachments] = await Promise.all([pdf.getJSActions(), pdf.getAttachments()]);
    if (scripts || attachments) throw new ProofFileError(PROOF_ACTIVE_ERROR);
    for (let number = 1; number <= pdf.numPages; number++) {
      inTime();
      const page = await pdf.getPage(number);
      const [pageScripts, annotations] = await Promise.all([page.getJSActions(), page.getAnnotations()]);
      if (pageScripts) throw new ProofFileError(PROOF_ACTIVE_ERROR);
      for (const annotation of annotations as Array<{ actions?: unknown; attachment?: unknown }>) {
        if (annotation.actions || annotation.attachment) throw new ProofFileError(PROOF_ACTIVE_ERROR);
      }
    }
  } catch (error) {
    if (error instanceof ProofFileError) throw error;
    // PDF.js asks for a password through its own exception.
    if ((error as { name?: string })?.name === "PasswordException") throw new ProofFileError(PROOF_ACTIVE_ERROR);
    throw new ProofFileError(PROOF_DAMAGED_ERROR);
  } finally {
    await task.destroy();
  }
}

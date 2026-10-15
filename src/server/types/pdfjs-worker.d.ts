// PDF.js ships no types for its worker module. proof-files.ts only hands the
// module to PDF.js (as globalThis.pdfjsWorker), so its shape is not used here.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}

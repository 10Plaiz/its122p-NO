// The Content-Security-Policy forbids eval. Zod would otherwise probe it with
// Function("") while building each object schema, which the browser reports as a
// violation. Zod reads its settings from this global when it loads, and reads
// jitless when each schema is built, so this must run before any module: it is a
// classic script, not bundled. tests/fast/zod-config.test.ts checks that Zod
// still uses this global.
globalThis.__zod_globalConfig = Object.assign(globalThis.__zod_globalConfig || {}, { jitless: true });

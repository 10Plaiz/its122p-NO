import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// src/web/public/zod-config.js turns off Zod's eval probe for the CSP by setting
// a global before Zod loads. This fails if a Zod upgrade stops reading it.

describe("CSP-01 Zod runs without eval in the browser", () => {
  it("reads its settings from the global that zod-config.js sets", async () => {
    const script = readFileSync(new URL("../../src/web/public/zod-config.js", import.meta.url), "utf8");
    const sandbox: { __zod_globalConfig?: { jitless?: boolean } } = {};
    runInNewContext(script, { globalThis: sandbox });
    expect(sandbox.__zod_globalConfig?.jitless).toBe(true);

    const core = await import("zod/v4/core");
    const shared: object | undefined = (globalThis as { __zod_globalConfig?: object }).__zod_globalConfig;
    expect(shared).toBeDefined();
    expect(core.globalConfig === shared).toBe(true);
  });
});

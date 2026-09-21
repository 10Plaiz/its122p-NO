import { describe, expect, it, mock } from "bun:test";
import { MulterError } from "multer";
import type { Request, Response } from "express";
import { errorHandler, notFoundHandler } from "../../src/server/middleware/error.js";
import { ApiError } from "../../src/server/lib/errors.js";

function createMockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("ERR-01 safe public error responses", () => {
  it("returns generic 500 and hides internal database errors and stack traces", () => {
    const res = createMockRes();
    const req = { method: "GET", originalUrl: "/api/reports" } as Request;
    const sensitiveError = new Error("FATAL: password authentication failed for user 'postgres' at connection.ts:42");

    // Suppress console.error during test
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      errorHandler(sensitiveError, req, res, () => {});
    } finally {
      console.error = originalConsoleError;
    }

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Something went wrong on our end. Try again." });
    
    // Explicitly verify sensitive details are not leaked in the client response
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("FATAL");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("postgres");
    expect(serialized).not.toContain("connection.ts");
  });

  it("returns status and message for application ApiError without leaking internal state", () => {
    const res = createMockRes();
    const req = { method: "GET", originalUrl: "/api/reports" } as Request;
    const apiError = new ApiError(403, "You can only view your own reports.", [
      { field: "citizen_id", message: "Mismatch" },
    ]);

    errorHandler(apiError, req, res, () => {});

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: "You can only view your own reports.",
      details: [{ field: "citizen_id", message: "Mismatch" }],
    });
  });

  it("handles MulterError with 400 and user-friendly upload message", () => {
    const res = createMockRes();
    const req = { method: "POST", originalUrl: "/api/reports" } as Request;
    const multerError = new MulterError("LIMIT_FILE_SIZE");

    errorHandler(multerError, req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "That file could not be uploaded.",
      details: multerError.message,
    });
  });

  it("notFoundHandler forwards clean 404 ApiError with method and URL", () => {
    const req = { method: "POST", originalUrl: "/api/unknown-route" } as Request;
    const res = createMockRes();
    let forwardedError: unknown;

    notFoundHandler(req, res, (err) => {
      forwardedError = err;
    });

    expect(forwardedError).toBeInstanceOf(ApiError);
    expect((forwardedError as ApiError).status).toBe(404);
    expect((forwardedError as ApiError).message).toBe("No route for POST /api/unknown-route.");
  });
});

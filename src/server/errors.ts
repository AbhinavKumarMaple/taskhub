export type ErrorCode = "not_found" | "invalid" | "conflict" | "unauthorized" | "forbidden" | "config" | "internal";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Missing, or outside the caller's Spaces (never reveals existence). HTTP 404. */
export class NotFound extends AppError {
  constructor(message = "Not found") {
    super("not_found", 404, message);
  }
}

/** Bad input or a rule violation. HTTP 400. */
export class Invalid extends AppError {
  constructor(message: string) {
    super("invalid", 400, message);
  }
}

/** Clashes with existing state (duplicate name, value still in use, children exist). HTTP 409. */
export class Conflict extends AppError {
  constructor(message: string) {
    super("conflict", 409, message);
  }
}

/** Missing or wrong credentials. HTTP 401. */
export class Unauthorized extends AppError {
  constructor(message = "Unauthorized") {
    super("unauthorized", 401, message);
  }
}

/** Owner-only operation attempted by a chat (settings). HTTP 403. */
export class Forbidden extends AppError {
  constructor(message = "Only the owner can do this") {
    super("forbidden", 403, message);
  }
}

/** Server misconfiguration (e.g. missing env vars in production). HTTP 500. */
export class ConfigError extends AppError {
  constructor(message: string) {
    super("config", 500, message);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** `{ error: { code, message } }` JSON body + status for any thrown value. */
export function errorBody(err: unknown): { status: number; body: { error: { code: ErrorCode; message: string } } } {
  if (isAppError(err)) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  console.error(err);
  return { status: 500, body: { error: { code: "internal", message: "Internal error" } } };
}

export function errorResponse(err: unknown): Response {
  const { status, body } = errorBody(err);
  return Response.json(body, { status });
}

/** Human message for UI (server actions). */
export function errorMessage(err: unknown): string {
  if (isAppError(err)) return err.message;
  console.error(err);
  return "Something went wrong";
}

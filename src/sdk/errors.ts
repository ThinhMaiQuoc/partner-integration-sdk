import type { ApiErrorResponse } from "../shared/types";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends ApiError {
  readonly fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string>, statusCode = 400, code = "VALIDATION_ERROR") {
    super(message, statusCode, code);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export class AuthError extends ApiError {
  constructor(message: string, statusCode = 401, code = "AUTH_ERROR") {
    super(message, statusCode, code);
    this.name = "AuthError";
  }
}

export class NetworkError extends Error {
  readonly statusCode?: number;
  readonly code?: string;

  constructor(message: string, options: { statusCode?: number; code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "NetworkError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function mapResponseToError(response: Response): Promise<Error> {
  const apiError = await readApiErrorResponse(response);
  const code = apiError?.error.code ?? `HTTP_${response.status}`;
  const message = apiError?.error.message ?? response.statusText;

  if (response.status === 400 && apiError?.error.fields !== undefined) {
    return new ValidationError(message, apiError.error.fields, response.status, code);
  }

  if (response.status === 401) {
    return new AuthError(message, response.status, code);
  }

  if (response.status === 503) {
    return new NetworkError(message, { statusCode: response.status, code });
  }

  return new ApiError(message, response.status, code);
}

async function readApiErrorResponse(response: Response): Promise<ApiErrorResponse | undefined> {
  try {
    const body = (await response.json()) as unknown;
    return isApiErrorResponse(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }

  const { code, message, fields } = value.error;
  return (
    typeof code === "string" &&
    typeof message === "string" &&
    (fields === undefined || isStringRecord(fields))
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

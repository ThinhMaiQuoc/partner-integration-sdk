import type { Response } from "express";

export type FieldErrors = Record<string, string>;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: FieldErrors;
  };
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  fields?: FieldErrors
): void {
  const error: ApiErrorBody["error"] = { code, message };

  if (fields !== undefined) {
    error.fields = fields;
  }

  res.status(statusCode).json({ error });
}

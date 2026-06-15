import type { RequestHandler } from "express";
import { sendError } from "../http";

export interface TransientFailureMiddlewareOptions {
  rate: number;
  random?: () => number;
}

export function createTransientFailureMiddleware(options: TransientFailureMiddlewareOptions): RequestHandler {
  const random = options.random ?? Math.random;
  const rate = Math.min(1, Math.max(0, options.rate));

  return (_req, res, next) => {
    if (rate > 0 && random() < rate) {
      sendError(res, 503, "SERVICE_UNAVAILABLE", "Temporary service unavailable. Please retry later.");
      return;
    }

    next();
  };
}

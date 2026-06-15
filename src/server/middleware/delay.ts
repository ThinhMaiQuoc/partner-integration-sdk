import type { RequestHandler } from "express";

export interface DelayMiddlewareOptions {
  minMs: number;
  maxMs: number;
  random?: () => number;
}

export function createDelayMiddleware(options: DelayMiddlewareOptions): RequestHandler {
  const random = options.random ?? Math.random;

  return (_req, _res, next) => {
    const delayMs = calculateDelay(options.minMs, options.maxMs, random);

    if (delayMs <= 0) {
      next();
      return;
    }

    setTimeout(next, delayMs);
  };
}

function calculateDelay(minMs: number, maxMs: number, random: () => number): number {
  if (maxMs <= minMs) {
    return Math.max(0, minMs);
  }

  return Math.floor(minMs + random() * (maxMs - minMs));
}

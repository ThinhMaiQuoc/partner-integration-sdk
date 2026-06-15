import express, { type ErrorRequestHandler } from "express";
import { createAuthMiddleware, createTokenHandler } from "./auth";
import { loadServerConfig, type ServerConfig } from "./config";
import { sendError } from "./http";
import { createDelayMiddleware } from "./middleware/delay";
import { createTransientFailureMiddleware } from "./middleware/transient-failure";
import { createClaimsRouter } from "./routes/claims";
import { createInMemoryStore, type InMemoryStore } from "./store";

export interface CreateServerAppOptions {
  config?: ServerConfig;
  store?: InMemoryStore;
  random?: () => number;
}

export function createServerApp(options: CreateServerAppOptions = {}): express.Express {
  const config = options.config ?? loadServerConfig();
  const store = options.store ?? createInMemoryStore();
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "partner-integration-sdk-mock",
      uptimeSeconds: Math.round(process.uptime())
    });
  });

  const apiRouter = express.Router();

  apiRouter.use(
    createDelayMiddleware({
      minMs: config.delayMinMs,
      maxMs: config.delayMaxMs,
      random: options.random
    })
  );
  apiRouter.post("/auth/token", createTokenHandler({ config, store }));
  apiRouter.use(createAuthMiddleware({ config, store }));
  apiRouter.use(createTransientFailureMiddleware({ rate: config.transientFailureRate, random: options.random }));
  apiRouter.use("/claims", createClaimsRouter(store));
  apiRouter.use((_req, res) => {
    sendError(res, 404, "NOT_FOUND", "Endpoint was not found.");
  });

  app.use("/api/v1", apiRouter);
  app.use(jsonErrorHandler);

  return app;
}

const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (isJsonParseError(error)) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
    return;
  }

  next(error);
};

function isJsonParseError(error: unknown): error is SyntaxError & { status: number } {
  return error instanceof SyntaxError && typeof (error as { status?: unknown }).status === "number";
}

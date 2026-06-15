import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { ServerConfig } from "./config";
import { sendError, type FieldErrors } from "./http";
import type { InMemoryStore } from "./store";
import "./types";

const API_KEY_PATTERN = /^pk_(test|live)_[A-Za-z0-9_-]{3,}$/;
const JWT_ISSUER = "partner-integration-sdk-mock";
const JWT_AUDIENCE = "insurance-partners";

interface AuthDependencies {
  config: ServerConfig;
  store: InMemoryStore;
}

interface PartnerTokenPayload extends JwtPayload {
  apiKey: string;
  jti: string;
}

export function createTokenHandler({ config, store }: AuthDependencies): RequestHandler {
  return (req, res) => {
    const validation = validateTokenRequest(req.body);

    if (!validation.ok) {
      sendError(res, 400, "VALIDATION_ERROR", "Request body contains invalid fields.", validation.fields);
      return;
    }

    const nowMs = Date.now();
    const tokenId = randomUUID();
    const expiresAt = new Date(nowMs + config.tokenExpiresInSeconds * 1000);
    const token = jwt.sign(
      {
        apiKey: validation.apiKey
      },
      config.jwtSecret,
      {
        audience: JWT_AUDIENCE,
        expiresIn: config.tokenExpiresInSeconds,
        issuer: JWT_ISSUER,
        jwtid: tokenId,
        subject: validation.apiKey
      }
    );

    store.recordIssuedToken({
      tokenId,
      apiKey: validation.apiKey,
      issuedAt: new Date(nowMs).toISOString(),
      expiresAt: expiresAt.toISOString()
    });

    res.status(200).json({
      token,
      tokenType: "Bearer",
      expiresIn: config.tokenExpiresInSeconds,
      expiresAt: expiresAt.toISOString()
    });
  };
}

export function createAuthMiddleware({ config, store }: AuthDependencies): RequestHandler {
  return (req, res, next) => {
    const authorization = req.header("authorization");

    if (authorization === undefined || authorization.trim() === "") {
      sendError(res, 401, "AUTH_REQUIRED", "Bearer token is required.");
      return;
    }

    const token = parseBearerToken(authorization);
    if (token === undefined) {
      sendError(res, 401, "INVALID_AUTH_HEADER", "Authorization header must use the Bearer scheme.");
      return;
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret, {
        audience: JWT_AUDIENCE,
        issuer: JWT_ISSUER
      });

      if (!isPartnerTokenPayload(payload)) {
        sendError(res, 401, "INVALID_TOKEN", "Token payload is invalid.");
        return;
      }

      const tokenRecord = store.getIssuedToken(payload.jti);
      if (tokenRecord === undefined) {
        sendError(res, 401, "INVALID_TOKEN", "Token was not issued by this mock server.");
        return;
      }

      req.auth = {
        apiKey: payload.apiKey,
        tokenId: payload.jti
      };

      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        sendError(res, 401, "TOKEN_EXPIRED", "Bearer token has expired.");
        return;
      }

      sendError(res, 401, "INVALID_TOKEN", "Bearer token is invalid.");
    }
  };
}

function validateTokenRequest(body: unknown): { ok: true; apiKey: string } | { ok: false; fields: FieldErrors } {
  const fields: FieldErrors = {};
  let apiKey: string | undefined;

  if (!isRecord(body)) {
    fields.apiKey = "required";
    return { ok: false, fields };
  }

  const candidateApiKey = body.apiKey;

  if (typeof candidateApiKey !== "string" || candidateApiKey.trim() === "") {
    fields.apiKey = "required";
  } else if (!API_KEY_PATTERN.test(candidateApiKey)) {
    fields.apiKey = "must start with pk_test_ or pk_live_ and contain only URL-safe characters";
  } else {
    apiKey = candidateApiKey;
  }

  if (apiKey === undefined) {
    return { ok: false, fields };
  }

  return { ok: true, apiKey };
}

function parseBearerToken(authorization: string): string | undefined {
  const [scheme, token, extra] = authorization.split(/\s+/);

  if (extra !== undefined || scheme?.toLowerCase() !== "bearer" || token === undefined || token.trim() === "") {
    return undefined;
  }

  return token;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPartnerTokenPayload(payload: string | JwtPayload): payload is PartnerTokenPayload {
  return typeof payload !== "string" && typeof payload.apiKey === "string" && typeof payload.jti === "string";
}

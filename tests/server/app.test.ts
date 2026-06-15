import request from "supertest";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../src/server/app";
import type { ServerConfig } from "../../src/server/config";

const baseConfig: ServerConfig = {
  port: 0,
  host: "127.0.0.1",
  jwtSecret: "test-secret",
  tokenExpiresInSeconds: 60 * 60,
  transientFailureRate: 0,
  delayMinMs: 0,
  delayMaxMs: 0
};

describe("mock API server foundation", () => {
  it("returns health status", async () => {
    const app = createServerApp({ config: baseConfig });

    const response = await request(app).get("/health").expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      service: "partner-integration-sdk-mock"
    });
  });

  it("exchanges a valid API key for a bearer token", async () => {
    const app = createServerApp({ config: baseConfig });

    const response = await request(app).post("/api/v1/auth/token").send({ apiKey: "pk_test_xxx" }).expect(200);

    expect(response.body).toMatchObject({
      tokenType: "Bearer",
      expiresIn: 3600
    });
    expect(typeof response.body.token).toBe("string");
    expect(typeof response.body.expiresAt).toBe("string");
  });

  it("returns field-level validation errors for invalid auth requests", async () => {
    const app = createServerApp({ config: baseConfig });

    const response = await request(app).post("/api/v1/auth/token").send({ apiKey: "invalid" }).expect(400);

    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body contains invalid fields.",
        fields: {
          apiKey: "must start with pk_test_ or pk_live_ and contain only URL-safe characters"
        }
      }
    });
  });

  it("rejects protected API routes without a bearer token", async () => {
    const app = createServerApp({ config: baseConfig });

    const response = await request(app).get("/api/v1/claims").expect(401);

    expect(response.body).toMatchObject({
      error: {
        code: "AUTH_REQUIRED"
      }
    });
  });

  it("rejects expired bearer tokens", async () => {
    const config: ServerConfig = {
      ...baseConfig,
      tokenExpiresInSeconds: -1
    };
    const app = createServerApp({ config });

    const tokenResponse = await request(app).post("/api/v1/auth/token").send({ apiKey: "pk_test_xxx" }).expect(200);
    const response = await request(app)
      .get("/api/v1/claims")
      .set("Authorization", `Bearer ${tokenResponse.body.token}`)
      .expect(401);

    expect(response.body).toMatchObject({
      error: {
        code: "TOKEN_EXPIRED"
      }
    });
  });

  it("can force transient failures for protected API routes", async () => {
    const config: ServerConfig = {
      ...baseConfig,
      transientFailureRate: 1
    };
    const app = createServerApp({ config, random: () => 0 });

    const tokenResponse = await request(app).post("/api/v1/auth/token").send({ apiKey: "pk_test_xxx" }).expect(200);
    const response = await request(app)
      .get("/api/v1/claims")
      .set("Authorization", `Bearer ${tokenResponse.body.token}`)
      .expect(503);

    expect(response.body).toMatchObject({
      error: {
        code: "SERVICE_UNAVAILABLE"
      }
    });
  });
});

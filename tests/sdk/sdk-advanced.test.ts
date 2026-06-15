import { createServer, type Server } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createServerApp, type CreateServerAppOptions } from "../../src/server/app";
import type { ServerConfig } from "../../src/server/config";
import { AuthError, InsuranceSDK, NetworkError, ValidationError } from "../../src/sdk";
import type { Claim, CreateClaimRequest } from "../../src/shared/types";

const baseConfig: ServerConfig = {
  port: 0,
  host: "127.0.0.1",
  jwtSecret: "test-secret",
  tokenExpiresInSeconds: 60 * 60,
  transientFailureRate: 0,
  delayMinMs: 0,
  delayMaxMs: 0
};

const validClaimRequest: CreateClaimRequest = {
  policyId: "POL-123",
  claimType: "OUTPATIENT",
  diagnosisCode: "J06.9",
  treatmentDate: "2024-03-15",
  amount: 15000,
  currency: "THB"
};

describe("InsuranceSDK advanced behavior", () => {
  it("rejects invalid claim submissions before making an API call", async () => {
    const sdk = new InsuranceSDK({
      apiKey: "pk_test_xxx",
      environment: "sandbox",
      baseUrl: "http://127.0.0.1:1/api/v1",
      retry: {
        maxAttempts: 1
      }
    });

    await expect(sdk.claims.create({ ...validClaimRequest, amount: -1 })).rejects.toMatchObject({
      name: "ValidationError",
      fields: {
        amount: "must be positive"
      }
    });
    await expect(sdk.claims.create({ ...validClaimRequest, amount: -1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects missing claim fields before making an API call", async () => {
    const sdk = new InsuranceSDK({
      apiKey: "pk_test_xxx",
      environment: "sandbox",
      baseUrl: "http://127.0.0.1:1/api/v1"
    });

    await expect(sdk.claims.create({} as CreateClaimRequest)).rejects.toMatchObject({
      name: "ValidationError",
      fields: {
        policyId: "required",
        claimType: "required",
        diagnosisCode: "required",
        treatmentDate: "required",
        amount: "required",
        currency: "required"
      }
    });
  });

  it("rejects invalid claim type before making an API call", async () => {
    const sdk = new InsuranceSDK({
      apiKey: "pk_test_xxx",
      environment: "sandbox",
      baseUrl: "http://127.0.0.1:1/api/v1"
    });

    await expect(
      sdk.claims.create({
        ...validClaimRequest,
        claimType: "INVALID" as CreateClaimRequest["claimType"]
      })
    ).rejects.toMatchObject({
      name: "ValidationError",
      fields: {
        claimType: "must be one of: OUTPATIENT, INPATIENT, EMERGENCY, DENTAL, OTHER"
      }
    });
  });

  it("refreshes the cached token after it expires", async () => {
    await withSdk({ ...baseConfig, tokenExpiresInSeconds: 1 }, async (sdk) => {
      await sdk.claims.create(validClaimRequest);
      await sleep(1_100);

      const claims = await sdk.claims.list();

      expect(claims.pagination.total).toBe(1);
    });
  });

  it("retries a transient 503 and succeeds", async () => {
    const randomValues = [0, 0.99];

    await withSdk(
      {
        ...baseConfig,
        transientFailureRate: 0.5
      },
      async (sdk) => {
        const claims = await sdk.claims.list();

        expect(claims.data).toEqual([]);
      },
      {
        random: () => randomValues.shift() ?? 0.99,
        sdkConfig: {
          retry: {
            maxAttempts: 2,
            baseDelayMs: 1,
            maxDelayMs: 1
          }
        }
      }
    );
  });

  it("maps network failures to NetworkError", async () => {
    const sdk = new InsuranceSDK({
      apiKey: "pk_test_xxx",
      environment: "sandbox",
      baseUrl: "http://127.0.0.1:1/api/v1",
      retry: {
        maxAttempts: 1
      }
    });

    await expect(sdk.claims.list()).rejects.toBeInstanceOf(NetworkError);
  });

  it("maps request timeouts to NetworkError", async () => {
    await withSdk(
      {
        ...baseConfig,
        delayMinMs: 50,
        delayMaxMs: 50
      },
      async (sdk) => {
        await expect(sdk.claims.list()).rejects.toBeInstanceOf(NetworkError);
      },
      {
        sdkConfig: {
          timeout: 5,
          retry: {
            maxAttempts: 1
          }
        }
      }
    );
  });

  it("does not retry non-refreshable auth errors", async () => {
    await withSdk({ ...baseConfig, tokenExpiresInSeconds: -1 }, async (sdk) => {
      await expect(sdk.claims.list()).rejects.toBeInstanceOf(AuthError);
    });
  });

  it("does not retry server-side validation errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse(createTokenResponse(), 200))
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Request body contains invalid fields.",
              fields: {
                type: "required"
              }
            }
          },
          400
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const sdk = new InsuranceSDK({
        apiKey: "pk_test_xxx",
        environment: "sandbox",
        baseUrl: "http://mock.local/api/v1"
      });

      await expect(
        sdk.documents.upload("CLM-001", "receipt", {
          type: "",
          fileName: "receipt.txt"
        })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not retry non-refreshable 401 auth errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse(createTokenResponse(), 200))
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            error: {
              code: "INVALID_TOKEN",
              message: "Bearer token is invalid."
            }
          },
          401
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const sdk = new InsuranceSDK({
        apiKey: "pk_test_xxx",
        environment: "sandbox",
        baseUrl: "http://mock.local/api/v1"
      });

      await expect(sdk.claims.list()).rejects.toBeInstanceOf(AuthError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("emits upload progress ending at 100", async () => {
    await withSdk(baseConfig, async (sdk) => {
      const progress: number[] = [];
      const claim = await sdk.claims.create(validClaimRequest);

      await sdk.documents.upload(claim.id, "receipt", {
        type: "medical_receipt",
        fileName: "receipt.txt",
        contentType: "text/plain",
        onProgress: (percent) => {
          progress.push(percent);
        }
      });

      expect(progress).toEqual([0, 50, 100]);
    });
  });

  it("detects claim status changes through polling", async () => {
    await withSdk(baseConfig, async (sdk) => {
      const claim = await sdk.claims.create(validClaimRequest);
      const changedClaim = await waitForStatusChange(sdk, claim);

      expect(changedClaim.status).toBe("NEEDS_REVIEW");
    });
  });

  it("unsubscribe stops status polling callbacks", async () => {
    await withSdk(baseConfig, async (sdk) => {
      const claim = await sdk.claims.create(validClaimRequest);
      const callback = vi.fn();
      const unsubscribe = sdk.claims.onStatusChange(claim.id, callback, { intervalMs: 100 });

      unsubscribe();
      await sleep(1_200);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});

async function withSdk(
  config: ServerConfig,
  testCase: (sdk: InsuranceSDK) => Promise<void>,
  options: {
    random?: CreateServerAppOptions["random"];
    sdkConfig?: Partial<ConstructorParameters<typeof InsuranceSDK>[0]>;
  } = {}
): Promise<void> {
  const { baseUrl, close } = await startServer(config, options.random);

  try {
    await testCase(
      new InsuranceSDK({
        apiKey: "pk_test_xxx",
        environment: "sandbox",
        baseUrl,
        retry: {
          baseDelayMs: 1,
          maxDelayMs: 1,
          ...options.sdkConfig?.retry
        },
        ...options.sdkConfig
      })
    );
  } finally {
    await close();
  }
}

async function waitForStatusChange(sdk: InsuranceSDK, claim: Claim): Promise<Claim> {
  return await new Promise<Claim>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for status change."));
    }, 3_000);

    const unsubscribe = sdk.claims.onStatusChange(
      claim.id,
      (_newStatus, updatedClaim) => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(updatedClaim);
      },
      {
        intervalMs: 100,
        onError: reject
      }
    );
  });
}

async function startServer(
  config: ServerConfig,
  random?: CreateServerAppOptions["random"]
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(createServerApp({ config, random }));

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected test server to listen on a TCP address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    close: () => closeServer(server)
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createTokenResponse(): Record<string, string | number> {
  return {
    token: "mock-token",
    tokenType: "Bearer",
    expiresIn: 3600,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
}

function createJsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

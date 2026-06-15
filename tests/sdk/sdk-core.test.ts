import { createServer, type Server } from "node:http";
import { Blob } from "node:buffer";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../src/server/app";
import type { ServerConfig } from "../../src/server/config";
import { ApiError, AuthError, InsuranceSDK, NetworkError, ValidationError } from "../../src/sdk";
import type { CreateClaimRequest } from "../../src/shared/types";

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

describe("InsuranceSDK core", () => {
  it("authenticates and performs claim operations", async () => {
    await withSdk(baseConfig, async (sdk) => {
      const created = await sdk.claims.create(validClaimRequest);
      const fetched = await sdk.claims.get(created.id);
      const claims = await sdk.claims.list({ status: "PENDING", page: 1, pageSize: 20 });

      expect(created).toMatchObject({
        id: "CLM-001",
        status: "PENDING",
        ...validClaimRequest
      });
      expect(fetched).toEqual(created);
      expect(claims.data).toEqual([created]);
      expect(claims.pagination).toMatchObject({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1
      });
    });
  });

  it("uploads and lists documents", async () => {
    await withSdk(baseConfig, async (sdk) => {
      const claim = await sdk.claims.create(validClaimRequest);
      const document = await sdk.documents.upload(claim.id, new Blob(["receipt"], { type: "text/plain" }), {
        type: "medical_receipt",
        fileName: "receipt.txt",
        contentType: "text/plain"
      });
      const documents = await sdk.documents.list(claim.id);

      expect(document).toMatchObject({
        id: "DOC-001",
        claimId: claim.id,
        type: "medical_receipt",
        fileName: "receipt.txt",
        mimeType: "text/plain",
        size: 7
      });
      expect(documents).toEqual([document]);
    });
  });

  it("maps server validation errors to ValidationError", async () => {
    await withSdk(baseConfig, async (sdk) => {
      await expect(sdk.claims.create({} as CreateClaimRequest)).rejects.toMatchObject({
        name: "ValidationError",
        fields: {
          policyId: "required"
        }
      });
      await expect(sdk.claims.create({} as CreateClaimRequest)).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("maps expired-token responses to AuthError", async () => {
    await withSdk({ ...baseConfig, tokenExpiresInSeconds: -1 }, async (sdk) => {
      await expect(sdk.claims.list()).rejects.toBeInstanceOf(AuthError);
    });
  });

  it("maps transient 503 responses to NetworkError", async () => {
    await withSdk({ ...baseConfig, transientFailureRate: 1 }, async (sdk) => {
      await expect(sdk.claims.list()).rejects.toBeInstanceOf(NetworkError);
    });
  });

  it("maps other non-2xx API responses to ApiError", async () => {
    await withSdk(baseConfig, async (sdk) => {
      await expect(sdk.claims.get("CLM-999")).rejects.toBeInstanceOf(ApiError);
    });
  });
});

async function withSdk(config: ServerConfig, testCase: (sdk: InsuranceSDK) => Promise<void>): Promise<void> {
  const { baseUrl, close } = await startServer(config);

  try {
    await testCase(
      new InsuranceSDK({
        apiKey: "pk_test_xxx",
        environment: "sandbox",
        baseUrl
      })
    );
  } finally {
    await close();
  }
}

async function startServer(config: ServerConfig): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(createServerApp({ config }));

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

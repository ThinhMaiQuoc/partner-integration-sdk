import request from "supertest";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../src/server/app";
import type { ServerConfig } from "../../src/server/config";
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

async function getToken(app: ReturnType<typeof createServerApp>): Promise<string> {
  const response = await request(app).post("/api/v1/auth/token").send({ apiKey: "pk_test_xxx" }).expect(200);
  return response.body.token as string;
}

describe("claims and documents API", () => {
  it("creates and retrieves a claim with valid auth", async () => {
    const app = createServerApp({ config: baseConfig });
    const token = await getToken(app);

    const createResponse = await request(app)
      .post("/api/v1/claims")
      .set("Authorization", `Bearer ${token}`)
      .send(validClaimRequest)
      .expect(201);

    expect(createResponse.body).toMatchObject({
      id: "CLM-001",
      status: "PENDING",
      ...validClaimRequest
    });

    const getResponse = await request(app)
      .get(`/api/v1/claims/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(getResponse.body).toEqual(createResponse.body);
  });

  it("returns field-level errors for invalid claim creation", async () => {
    const app = createServerApp({ config: baseConfig });
    const token = await getToken(app);

    const response = await request(app)
      .post("/api/v1/claims")
      .set("Authorization", `Bearer ${token}`)
      .send({
        policyId: "",
        claimType: "INVALID",
        diagnosisCode: "bad",
        treatmentDate: "2024-02-31",
        amount: -10,
        currency: "thb"
      })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: {
        policyId: "required",
        claimType: "must be one of: OUTPATIENT, INPATIENT, EMERGENCY, DENTAL, OTHER",
        diagnosisCode: "must be a valid diagnosis code",
        treatmentDate: "must be a valid YYYY-MM-DD date",
        amount: "must be positive",
        currency: "must be a 3-letter uppercase ISO currency code"
      }
    });
  });

  it("returns not found for an unknown claim", async () => {
    const app = createServerApp({ config: baseConfig });
    const token = await getToken(app);

    const response = await request(app)
      .get("/api/v1/claims/CLM-999")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    expect(response.body.error).toMatchObject({
      code: "CLAIM_NOT_FOUND"
    });
  });

  it("lists claims with pagination and status filtering", async () => {
    const app = createServerApp({ config: baseConfig });
    const token = await getToken(app);

    await request(app).post("/api/v1/claims").set("Authorization", `Bearer ${token}`).send(validClaimRequest).expect(201);
    await request(app)
      .post("/api/v1/claims")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validClaimRequest, policyId: "POL-456", amount: 2000 })
      .expect(201);

    const response = await request(app)
      .get("/api/v1/claims?status=PENDING&page=1&pageSize=1")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ id: "CLM-001", status: "PENDING" });
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2
    });
  });

  it("uploads and lists documents for a claim", async () => {
    const app = createServerApp({ config: baseConfig });
    const token = await getToken(app);
    const createResponse = await request(app)
      .post("/api/v1/claims")
      .set("Authorization", `Bearer ${token}`)
      .send(validClaimRequest)
      .expect(201);
    const claim = createResponse.body as Claim;

    const uploadResponse = await request(app)
      .post(`/api/v1/claims/${claim.id}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .field("type", "medical_receipt")
      .attach("file", Buffer.from("receipt"), "receipt.txt")
      .expect(201);

    expect(uploadResponse.body).toMatchObject({
      id: "DOC-001",
      claimId: claim.id,
      type: "medical_receipt",
      fileName: "receipt.txt",
      size: 7
    });

    const listResponse = await request(app)
      .get(`/api/v1/claims/${claim.id}/documents`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body.data).toEqual([uploadResponse.body]);
  });

  it("returns not found when uploading a document to an unknown claim", async () => {
    const app = createServerApp({ config: baseConfig });
    const token = await getToken(app);

    const response = await request(app)
      .post("/api/v1/claims/CLM-999/documents")
      .set("Authorization", `Bearer ${token}`)
      .field("type", "medical_receipt")
      .attach("file", Buffer.from("receipt"), "receipt.txt")
      .expect(404);

    expect(response.body.error).toMatchObject({
      code: "CLAIM_NOT_FOUND"
    });
  });
});

import { InsuranceSDK } from "../src/sdk";
import type { CreateClaimRequest } from "../src/shared/types";

void main();

async function main(): Promise<void> {
  const sdk = new InsuranceSDK({
    apiKey: process.env.SDK_API_KEY ?? "pk_test_xxx",
    environment: "sandbox",
    baseUrl: process.env.SDK_BASE_URL ?? "http://localhost:3000/api/v1",
    timeout: 30_000
  });

  const claimRequest: CreateClaimRequest = {
    policyId: "POL-123",
    claimType: "OUTPATIENT",
    diagnosisCode: "J06.9",
    treatmentDate: "2024-03-15",
    amount: 15000,
    currency: "THB"
  };

  const claim = await sdk.claims.create(claimRequest);

  console.log("Created claim");
  console.log(JSON.stringify(claim, null, 2));
}

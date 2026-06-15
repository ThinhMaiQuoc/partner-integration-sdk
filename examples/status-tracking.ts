import { InsuranceSDK } from "../src/sdk";
import type { Claim, ClaimStatus, CreateClaimRequest } from "../src/shared/types";

void main();

async function main(): Promise<void> {
  const sdk = new InsuranceSDK({
    apiKey: process.env.SDK_API_KEY ?? "pk_test_xxx",
    environment: "sandbox",
    baseUrl: process.env.SDK_BASE_URL ?? "http://localhost:3000/api/v1",
    timeout: 30_000
  });

  const claimRequest: CreateClaimRequest = {
    policyId: "POL-789",
    claimType: "OUTPATIENT",
    diagnosisCode: "J06.9",
    treatmentDate: "2024-03-15",
    amount: 1800,
    currency: "THB"
  };

  const claim = await sdk.claims.create(claimRequest);

  console.log(`Tracking claim ${claim.id}; initial status is ${claim.status}`);
  await waitForStatusChange(sdk, claim.id);
}

async function waitForStatusChange(sdk: InsuranceSDK, claimId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for status change."));
    }, 6_000);

    const unsubscribe = sdk.claims.onStatusChange(
      claimId,
      (newStatus: ClaimStatus, updatedClaim: Claim) => {
        clearTimeout(timeout);
        unsubscribe();
        console.log(`Claim ${updatedClaim.id} is now ${newStatus}`);
        resolve();
      },
      {
        intervalMs: 500,
        onError: reject
      }
    );
  });
}

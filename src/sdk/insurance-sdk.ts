import type { InsuranceSDKConfig } from "../shared/types";
import { AuthManager } from "./auth-manager";
import { ClaimsClient } from "./claims-client";
import { DocumentsClient } from "./documents-client";
import { HttpClient } from "./http-client";

const DEFAULT_TIMEOUT_MS = 30_000;

export class InsuranceSDK {
  readonly claims: ClaimsClient;
  readonly documents: DocumentsClient;

  private readonly timeout: number;

  constructor(config: InsuranceSDKConfig) {
    const baseUrl = resolveBaseUrl(config);
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;

    const authManager = new AuthManager(baseUrl, config);
    const httpClient = new HttpClient({
      baseUrl,
      authManager
    });

    this.claims = new ClaimsClient(httpClient);
    this.documents = new DocumentsClient(httpClient);
  }
}

function resolveBaseUrl(config: InsuranceSDKConfig): string {
  const baseUrl =
    config.baseUrl ??
    (config.environment === "sandbox"
      ? "http://localhost:3000/api/v1"
      : "https://api.insurance.example.com/api/v1");

  return baseUrl.replace(/\/+$/, "");
}

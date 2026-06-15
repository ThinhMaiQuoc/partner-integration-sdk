import type { InsuranceSDKConfig } from "../shared/types";
import { mapResponseToError, NetworkError } from "./errors";

interface TokenResponse {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
  expiresAt: string;
}

export class AuthManager {
  private token: string | undefined;

  constructor(
    private readonly baseUrl: string,
    private readonly config: Pick<InsuranceSDKConfig, "apiKey">
  ) {}

  async getToken(): Promise<string> {
    if (this.token === undefined) {
      this.token = await this.fetchToken();
    }

    return this.token;
  }

  private async fetchToken(): Promise<string> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ apiKey: this.config.apiKey })
      });
    } catch (error) {
      throw new NetworkError("Network request failed.", { cause: error });
    }

    if (!response.ok) {
      throw await mapResponseToError(response);
    }

    const payload = (await response.json()) as TokenResponse;
    return payload.token;
  }
}

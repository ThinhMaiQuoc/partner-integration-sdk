import type { InsuranceSDKConfig } from "../shared/types";
import { mapResponseToError, NetworkError } from "./errors";

interface TokenResponse {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
  expiresAt: string;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

export class AuthManager {
  private token: CachedToken | undefined;

  constructor(
    private readonly baseUrl: string,
    private readonly config: Pick<InsuranceSDKConfig, "apiKey" | "timeout">
  ) {}

  async getToken(): Promise<string> {
    if (this.token === undefined || this.isTokenExpired(this.token)) {
      this.token = await this.fetchToken();
    }

    return this.token.token;
  }

  clearToken(): void {
    this.token = undefined;
  }

  private async fetchToken(): Promise<CachedToken> {
    let response: Response;

    try {
      response = await this.fetchWithTimeout(`${this.baseUrl}/auth/token`, {
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
    return {
      token: payload.token,
      expiresAtMs: Date.parse(payload.expiresAt)
    };
  }

  private isTokenExpired(token: CachedToken): boolean {
    return Date.now() >= token.expiresAtMs - 1000;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const timeoutMs = this.config.timeout ?? 30_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new NetworkError(`Request timed out after ${timeoutMs}ms.`, { cause: error });
      }

      throw new NetworkError("Network request failed.", { cause: error });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

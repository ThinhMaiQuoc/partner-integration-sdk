import type { AuthManager } from "./auth-manager";
import type { RetryOptions } from "../shared/types";
import { ApiError, AuthError, mapResponseToError, NetworkError } from "./errors";

interface HttpClientOptions {
  baseUrl: string;
  authManager: AuthManager;
  timeoutMs: number;
  retry: Required<RetryOptions>;
}

interface JsonRequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}

interface MultipartRequestOptions {
  method: "POST";
  path: string;
  formData: FormData;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async request<TResponse>(request: JsonRequestOptions): Promise<TResponse> {
    return this.sendWithRetry<TResponse>(request.path, async () => {
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${await this.options.authManager.getToken()}`);

      const init: RequestInit = {
        method: request.method,
        headers
      };

      if (request.body !== undefined) {
        headers.set("Content-Type", "application/json");
        init.body = JSON.stringify(request.body);
      }

      return init;
    });
  }

  async multipart<TResponse>(request: MultipartRequestOptions): Promise<TResponse> {
    return this.sendWithRetry<TResponse>(request.path, async () => {
      return {
        method: request.method,
        headers: {
          Authorization: `Bearer ${await this.options.authManager.getToken()}`
        },
        body: request.formData
      };
    });
  }

  private async sendWithRetry<TResponse>(path: string, initFactory: () => Promise<RequestInit>): Promise<TResponse> {
    let tokenWasRefreshedAfterAuthError = false;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.options.retry.maxAttempts; attempt++) {
      try {
        return await this.send<TResponse>(path, await initFactory());
      } catch (error) {
        const normalizedError = normalizeError(error);

        if (isRefreshableAuthError(normalizedError) && !tokenWasRefreshedAfterAuthError) {
          tokenWasRefreshedAfterAuthError = true;
          this.options.authManager.clearToken();
          continue;
        }

        lastError = normalizedError;

        if (!shouldRetry(normalizedError) || attempt >= this.options.retry.maxAttempts) {
          throw normalizedError;
        }

        await delay(calculateBackoffDelay(attempt, this.options.retry));
      }
    }

    throw lastError ?? new NetworkError("Network request failed.");
  }

  private async send<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    const response = await this.fetchWithTimeout(`${this.options.baseUrl}${path}`, init);

    if (!response.ok) {
      throw await mapResponseToError(response);
    }
    return (await response.json()) as TResponse;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new NetworkError(`Request timed out after ${this.options.timeoutMs}ms.`, { cause: error });
      }

      throw new NetworkError("Network request failed.", { cause: error });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new NetworkError("Network request failed.", { cause: error });
}

function shouldRetry(error: Error): boolean {
  if (error instanceof NetworkError) {
    return error.statusCode === undefined || error.statusCode === 503;
  }

  return false;
}

function isRefreshableAuthError(error: Error): boolean {
  return error instanceof AuthError && error.code === "TOKEN_EXPIRED";
}

function calculateBackoffDelay(attempt: number, retry: Required<RetryOptions>): number {
  return Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (attempt - 1));
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

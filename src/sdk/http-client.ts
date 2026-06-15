import { mapResponseToError, NetworkError } from "./errors";
import type { AuthManager } from "./auth-manager";

interface HttpClientOptions {
  baseUrl: string;
  authManager: AuthManager;
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

    return this.send<TResponse>(request.path, init);
  }

  async multipart<TResponse>(request: MultipartRequestOptions): Promise<TResponse> {
    return this.send<TResponse>(request.path, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${await this.options.authManager.getToken()}`
      },
      body: request.formData
    });
  }

  private async send<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    let response: Response;

    try {
      response = await fetch(`${this.options.baseUrl}${path}`, init);
    } catch (error) {
      throw new NetworkError("Network request failed.", { cause: error });
    }

    if (!response.ok) {
      throw await mapResponseToError(response);
    }

    return (await response.json()) as TResponse;
  }
}

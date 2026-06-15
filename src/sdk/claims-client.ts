import type {
  Claim,
  CreateClaimRequest,
  ListClaimsParams,
  ListClaimsResponse,
  StatusChangeHandler,
  StatusChangeOptions,
  Unsubscribe
} from "../shared/types";
import type { HttpClient } from "./http-client";
import { assertValidCreateClaimRequest } from "./validation";

export class ClaimsClient {
  constructor(private readonly httpClient: HttpClient) {}

  async create(request: CreateClaimRequest): Promise<Claim> {
    assertValidCreateClaimRequest(request);

    return await this.httpClient.request<Claim>({
      method: "POST",
      path: "/claims",
      body: request
    });
  }

  get(claimId: string): Promise<Claim> {
    return this.httpClient.request<Claim>({
      method: "GET",
      path: `/claims/${encodeURIComponent(claimId)}`
    });
  }

  list(params: ListClaimsParams = {}): Promise<ListClaimsResponse> {
    const searchParams = new URLSearchParams();

    if (params.status !== undefined) {
      searchParams.set("status", params.status);
    }

    if (params.page !== undefined) {
      searchParams.set("page", params.page.toString());
    }

    if (params.pageSize !== undefined) {
      searchParams.set("pageSize", params.pageSize.toString());
    }

    const queryString = searchParams.toString();

    return this.httpClient.request<ListClaimsResponse>({
      method: "GET",
      path: queryString === "" ? "/claims" : `/claims?${queryString}`
    });
  }

  onStatusChange(claimId: string, handler: StatusChangeHandler, options: StatusChangeOptions = {}): Unsubscribe {
    const intervalMs = options.intervalMs ?? 2_000;
    let isStopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let previousStatus: Claim["status"] | undefined;

    const poll = async (): Promise<void> => {
      if (isStopped) {
        return;
      }

      try {
        const claim = await this.get(claimId);

        if (previousStatus === undefined) {
          previousStatus = claim.status;
        } else if (claim.status !== previousStatus) {
          previousStatus = claim.status;
          handler(claim.status, claim);
        }
      } catch (error) {
        options.onError?.(error);
      }

      if (!isStopped) {
        timeout = setTimeout(() => {
          void poll();
        }, intervalMs);
      }
    };

    void poll();

    return () => {
      isStopped = true;

      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    };
  }
}

import type { Claim, CreateClaimRequest, ListClaimsParams, ListClaimsResponse } from "../shared/types";
import type { HttpClient } from "./http-client";

export class ClaimsClient {
  constructor(private readonly httpClient: HttpClient) {}

  create(request: CreateClaimRequest): Promise<Claim> {
    return this.httpClient.request<Claim>({
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
}

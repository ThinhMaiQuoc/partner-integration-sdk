export const CLAIM_TYPES = ["OUTPATIENT", "INPATIENT", "EMERGENCY", "DENTAL", "OTHER"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_STATUSES = ["PENDING", "APPROVED", "REJECTED", "NEEDS_REVIEW"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface CreateClaimRequest {
  policyId: string;
  claimType: ClaimType;
  diagnosisCode: string;
  treatmentDate: string;
  amount: number;
  currency: string;
}

export interface Claim extends CreateClaimRequest {
  id: string;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListClaimsParams {
  status?: ClaimStatus;
  page?: number;
  pageSize?: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export type ListClaimsResponse = PaginatedResponse<Claim>;

export interface DocumentRecord {
  id: string;
  claimId: string;
  type: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface UploadDocumentOptions {
  type: string;
  fileName?: string;
  contentType?: string;
  onProgress?: (percent: number) => void;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export type Environment = "sandbox" | "production";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface StatusChangeOptions {
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

export type StatusChangeHandler = (newStatus: ClaimStatus, claim: Claim) => void;
export type Unsubscribe = () => void;

export interface InsuranceSDKConfig {
  apiKey: string;
  environment: Environment;
  timeout?: number;
  baseUrl?: string;
  retry?: RetryOptions;
}

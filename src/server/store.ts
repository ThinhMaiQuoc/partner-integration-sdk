import type {
  Claim,
  ClaimStatus,
  CreateClaimRequest,
  DocumentRecord,
  ListClaimsParams,
  ListClaimsResponse
} from "../shared/types";

export interface IssuedTokenRecord {
  tokenId: string;
  apiKey: string;
  issuedAt: string;
  expiresAt: string;
}

export interface CreateDocumentInput {
  claimId: string;
  type: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export class InMemoryStore {
  private readonly issuedTokens = new Map<string, IssuedTokenRecord>();
  private readonly claims = new Map<string, Claim>();
  private readonly documentsByClaimId = new Map<string, DocumentRecord[]>();
  private claimSequence = 0;
  private documentSequence = 0;

  recordIssuedToken(record: IssuedTokenRecord): void {
    this.issuedTokens.set(record.tokenId, record);
  }

  getIssuedToken(tokenId: string): IssuedTokenRecord | undefined {
    return this.issuedTokens.get(tokenId);
  }

  createClaim(input: CreateClaimRequest): Claim {
    const now = new Date().toISOString();
    const claim: Claim = {
      id: formatId("CLM", ++this.claimSequence),
      status: "PENDING",
      ...input,
      createdAt: now,
      updatedAt: now
    };

    this.claims.set(claim.id, claim);
    return claim;
  }

  getClaim(id: string): Claim | undefined {
    const claim = this.claims.get(id);

    if (claim === undefined) {
      return undefined;
    }

    return this.applyStatusProgression(claim);
  }

  listClaims(params: Required<Pick<ListClaimsParams, "page" | "pageSize">> & Pick<ListClaimsParams, "status">): ListClaimsResponse {
    const allClaims = Array.from(this.claims.values()).map((claim) => this.applyStatusProgression(claim));
    const filteredClaims =
      params.status === undefined ? allClaims : allClaims.filter((claim) => claim.status === params.status);
    const total = filteredClaims.length;
    const start = (params.page - 1) * params.pageSize;
    const data = filteredClaims.slice(start, start + params.pageSize);

    return {
      data,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / params.pageSize)
      }
    };
  }

  createDocument(input: CreateDocumentInput): DocumentRecord {
    const document: DocumentRecord = {
      id: formatId("DOC", ++this.documentSequence),
      claimId: input.claimId,
      type: input.type,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
      uploadedAt: new Date().toISOString()
    };

    const documents = this.documentsByClaimId.get(input.claimId) ?? [];
    documents.push(document);
    this.documentsByClaimId.set(input.claimId, documents);

    return document;
  }

  listDocuments(claimId: string): DocumentRecord[] {
    return this.documentsByClaimId.get(claimId) ?? [];
  }

  clear(): void {
    this.issuedTokens.clear();
    this.claims.clear();
    this.documentsByClaimId.clear();
    this.claimSequence = 0;
    this.documentSequence = 0;
  }

  private applyStatusProgression(claim: Claim): Claim {
    const elapsedMs = Date.now() - Date.parse(claim.createdAt);
    const nextStatus = elapsedMs >= 2_000 ? "APPROVED" : elapsedMs >= 1_000 ? "NEEDS_REVIEW" : "PENDING";

    if (claim.status !== nextStatus) {
      const updatedClaim: Claim = {
        ...claim,
        status: nextStatus,
        updatedAt: new Date().toISOString()
      };

      this.claims.set(claim.id, updatedClaim);
      return updatedClaim;
    }

    return claim;
  }
}

export function createInMemoryStore(): InMemoryStore {
  return new InMemoryStore();
}

function formatId(prefix: string, sequence: number): string {
  return `${prefix}-${sequence.toString().padStart(3, "0")}`;
}

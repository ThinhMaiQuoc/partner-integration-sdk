export interface IssuedTokenRecord {
  tokenId: string;
  apiKey: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ClaimRecord {
  id: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  claimId: string;
  type: string;
  fileName: string;
  size: number;
  uploadedAt: string;
}

export class InMemoryStore {
  private readonly issuedTokens = new Map<string, IssuedTokenRecord>();
  private readonly claims = new Map<string, ClaimRecord>();
  private readonly documentsByClaimId = new Map<string, DocumentRecord[]>();

  recordIssuedToken(record: IssuedTokenRecord): void {
    this.issuedTokens.set(record.tokenId, record);
  }

  getIssuedToken(tokenId: string): IssuedTokenRecord | undefined {
    return this.issuedTokens.get(tokenId);
  }

  clear(): void {
    this.issuedTokens.clear();
    this.claims.clear();
    this.documentsByClaimId.clear();
  }
}

export function createInMemoryStore(): InMemoryStore {
  return new InMemoryStore();
}

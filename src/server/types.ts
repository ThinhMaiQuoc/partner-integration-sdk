export interface AuthContext {
  apiKey: string;
  tokenId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

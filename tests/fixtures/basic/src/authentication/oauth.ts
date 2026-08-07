import { OAuthProvider, authorize } from "../oauth/provider";

export function issueToken(clientId: string, secret: string): string {
  const provider = new OAuthProvider(clientId);
  return authorize(provider, secret);
}

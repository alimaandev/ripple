export class OAuthProvider {
  constructor(
    public readonly clientId: string,
    public scopes: string[] = ["read", "write"],
  ) {}

  hasScope(scope: string): boolean {
    return this.scopes.includes(scope);
  }
}

export function authorize(provider: OAuthProvider, secret: string): string {
  return `${provider.clientId}.${secret}.${provider.scopes.join("+")}`;
}

export enum GrantType {
  AuthorizationCode = "authorization_code",
  RefreshToken = "refresh_token",
}

export type OAuthClient = {
  clientId: string;
  redirectUris: string[];
};

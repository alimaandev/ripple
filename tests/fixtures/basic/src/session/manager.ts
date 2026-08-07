export interface Session {
  id: string;
  createdAt: Date;
}

export function createSession(username: string): Session {
  return { id: `${username}-${Date.now()}`, createdAt: new Date() };
}

export function revokeSession(session: Session): void {
  session.id = "";
}

export const USER_ROLES = {
  user: "user",
  admin: "admin",
  guest: "guest",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const SESSION_TTL_MS = 30 * 60 * 1000;

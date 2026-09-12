import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import type { AuthSessionSnapshot } from "./principal.ts";

export interface SessionRuntime {
  getSession(headers: IncomingHttpHeaders): Promise<AuthSessionSnapshot | null>;
}

type BetterAuthLike = Readonly<{
  api: Readonly<{
    getSession(input: { headers: Headers }): Promise<unknown>;
  }>;
}>;

export function createSessionRuntime(auth: BetterAuthLike): SessionRuntime {
  return {
    async getSession(headers) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      if (!session || typeof session !== "object") return null;
      const user = (session as { user?: unknown }).user;
      if (!user || typeof user !== "object") return null;
      const authUserId = (user as { id?: unknown }).id;
      if (typeof authUserId !== "string" || authUserId.length === 0) return null;
      return Object.freeze({
        authUserId,
        twoFactorEnabled: (user as { twoFactorEnabled?: unknown }).twoFactorEnabled === true,
      });
    },
  };
}

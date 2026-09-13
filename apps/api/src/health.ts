import type { Response } from "express";

export interface ReadinessDependency {
  query(text: string): Promise<unknown>;
}

export function createReadinessHandler(
  applicationDb: ReadinessDependency,
  authDb: ReadinessDependency,
) {
  return async (_request: unknown, response: Response): Promise<void> => {
    try {
      await Promise.all([
        applicationDb.query("SELECT 1"),
        authDb.query("SELECT 1"),
      ]);
      response.status(200).json({ status: "ready" });
    } catch {
      // Deliberately avoid dependency details, URLs, credentials, or raw errors.
      response.status(503).json({ status: "unavailable" });
    }
  };
}

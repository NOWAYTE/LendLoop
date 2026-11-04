import { ConvexError } from "convex/values";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT";

const GENERIC: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in.",
  FORBIDDEN: "You can't do that.",
  NOT_FOUND: "That item doesn't exist.",
  INVALID_INPUT: "Please check your input.",
  CONFLICT: "That can't be done right now.",
};

/**
 * Throw an error the client can show. Messages are deliberately generic: they
 * describe what the caller did wrong, never internal state or other users' data.
 * FORBIDDEN and NOT_FOUND read the same way whether or not a record exists.
 */
export function fail(code: ErrorCode, message: string = GENERIC[code]): never {
  throw new ConvexError({ code, message });
}

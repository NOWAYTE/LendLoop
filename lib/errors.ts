import { ConvexError } from "convex/values";
import { toast } from "sonner";

/** The safe, user-facing message from a Convex error; anything unexpected gets a generic one. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null) {
    const message = (error.data as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong. Please try again.";
}

/** Run a mutation and toast the outcome. Resolves to whether it succeeded. */
export async function withToast(promise: Promise<unknown>, success: string): Promise<boolean> {
  try {
    await promise;
    toast.success(success);
    return true;
  } catch (error) {
    toast.error(errorMessage(error));
    return false;
  }
}

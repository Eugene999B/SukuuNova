import type { ZodType } from "zod";
import { AppError } from "./errors";

export const DEFAULT_JSON_BODY_LIMIT = 256 * 1024;

export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes: number = DEFAULT_JSON_BODY_LIMIT
): Promise<T> {
  // Reject oversized bodies BEFORE parsing: request.json() would otherwise
  // buffer attacker-controlled payloads (tens of MB) into memory.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError("Request body is too large.", 413, "BODY_TOO_LARGE");
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new AppError("Request body is too large.", 413, "BODY_TOO_LARGE");
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new AppError("Request body must be valid JSON.", 400, "INVALID_JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      parsed.error.issues.map((issue) => issue.message).join("; "),
      400,
      "VALIDATION_ERROR"
    );
  }
  return parsed.data;
}

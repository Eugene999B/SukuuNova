import type { ZodType } from "zod";
import { AppError } from "./errors";

export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
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

import { AppError } from "../errors";
import type { ArcadeSessionEnvelope } from "./contracts";

export class ArcadeSessionConflictError extends AppError {
  constructor(
    code: "SESSION_OUT_OF_DATE" | "SESSION_COMPLETED" | "IDEMPOTENCY_KEY_REUSED" | "ARCADE_SCHEMA_MISMATCH",
    message: string,
    readonly authoritative: ArcadeSessionEnvelope,
  ) {
    super(message, 409, code);
  }
}

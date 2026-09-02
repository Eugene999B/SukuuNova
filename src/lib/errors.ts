import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class TenantScopeError extends AppError {
  constructor(message = "The requested record is outside the authenticated tenant.") {
    super(message, 403, "TENANT_SCOPE_VIOLATION");
  }
}

export class RateLimitError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many attempts. Try again later.", 429, "RATE_LIMITED");
  }
}

export function routeError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const response = NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status }
    );
    if (error instanceof RateLimitError) {
      response.headers.set("Retry-After", String(error.retryAfterSeconds));
    }
    return response;
  }

  const errorCode = (error as { code?: string }).code;
  if (errorCode === "P2002") {
    return NextResponse.json(
      { error: "DUPLICATE_RECORD", message: "A record with the same unique identifiers already exists." },
      { status: 409 }
    );
  }

  console.error("Unhandled SukuuNova route error", error);
  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    { status: 500 }
  );
}

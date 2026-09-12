import type {
  ArcadeActionRequest,
  ArcadeArtifactRequest,
  ArcadeFinishRequest,
  ArcadeMutationResult,
  ArcadeSessionEnvelope,
  ArcadeSessionStartInput,
} from "./contracts";

export class ArcadeVNextHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export class ArcadeSessionOutOfDateError extends ArcadeVNextHttpError {
  constructor(readonly authoritative: ArcadeSessionEnvelope) {
    super("The Arcade session changed in another tab or request.", 409, "SESSION_OUT_OF_DATE", { authoritative });
  }
}

type FetchLike = typeof fetch;

type MutationOptions = {
  idempotencyKey?: string;
  clientSequence?: number;
};

function makeIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `arcade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Thin transport SDK only. It deliberately has no GameQuestion model, scoring
 * logic, mastery logic, timer policy or game-specific state machine.
 */
export class ArcadeVNextClient {
  private current: ArcadeSessionEnvelope | null = null;
  private clientSequence = 0;

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = "/api/guardian/arcade/vnext/sessions",
  ) {}

  get session() {
    return this.current;
  }

  async start(input: ArcadeSessionStartInput) {
    const session = await this.request<ArcadeSessionEnvelope>(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    this.current = session;
    this.clientSequence = 0;
    return session;
  }

  async refresh() {
    const session = this.requireSession();
    const fresh = await this.request<ArcadeSessionEnvelope>(`${this.baseUrl}/${encodeURIComponent(session.id)}`, {
      method: "GET",
    });
    this.current = fresh;
    return fresh;
  }

  async dispatch(actionType: string, payload: unknown, options: MutationOptions = {}) {
    const session = this.requireSession();
    const body: ArcadeActionRequest = {
      gameSchema: session.gameSchema,
      clientSequence: options.clientSequence ?? ++this.clientSequence,
      expectedSessionSequence: session.sessionSequence,
      idempotencyKey: options.idempotencyKey ?? makeIdempotencyKey(),
      actionType,
      payload,
    };
    return this.mutate(`${this.baseUrl}/${encodeURIComponent(session.id)}/actions`, body);
  }

  async submitArtifact(artifactType: string, payload: unknown, options: MutationOptions = {}) {
    const session = this.requireSession();
    const body: ArcadeArtifactRequest = {
      gameSchema: session.gameSchema,
      clientSequence: options.clientSequence ?? ++this.clientSequence,
      expectedSessionSequence: session.sessionSequence,
      idempotencyKey: options.idempotencyKey ?? makeIdempotencyKey(),
      artifactType,
      payload,
    };
    return this.mutate(`${this.baseUrl}/${encodeURIComponent(session.id)}/artifacts`, body);
  }

  async finish(options: MutationOptions = {}) {
    const session = this.requireSession();
    const body: ArcadeFinishRequest = {
      gameSchema: session.gameSchema,
      clientSequence: options.clientSequence ?? ++this.clientSequence,
      expectedSessionSequence: session.sessionSequence,
      idempotencyKey: options.idempotencyKey ?? makeIdempotencyKey(),
    };
    return this.mutate(`${this.baseUrl}/${encodeURIComponent(session.id)}/finish`, body);
  }

  private async mutate(url: string, body: ArcadeActionRequest | ArcadeArtifactRequest | ArcadeFinishRequest) {
    const result = await this.request<ArcadeMutationResult>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    this.current = result.session;
    return result;
  }

  private requireSession() {
    if (!this.current) throw new Error("Start or hydrate an Arcade vNext session before dispatching actions.");
    return this.current;
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let networkError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetchImpl(url, init);
        const body = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (response.status === 409 && body?.error === "SESSION_OUT_OF_DATE" && body.authoritative) {
          const authoritative = body.authoritative as ArcadeSessionEnvelope;
          this.current = authoritative;
          throw new ArcadeSessionOutOfDateError(authoritative);
        }
        if (!response.ok) {
          throw new ArcadeVNextHttpError(
            typeof body?.message === "string" ? body.message : "Arcade request failed.",
            response.status,
            typeof body?.error === "string" ? body.error : "ARCADE_REQUEST_FAILED",
            body,
          );
        }
        return body as T;
      } catch (error) {
        if (error instanceof ArcadeVNextHttpError) throw error;
        networkError = error;
        if (attempt === 1) break;
      }
    }
    throw new ArcadeVNextHttpError(
      networkError instanceof Error ? networkError.message : "Arcade network request failed.",
      0,
      "ARCADE_NETWORK_ERROR",
    );
  }
}

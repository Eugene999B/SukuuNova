import { AppError } from "../errors";
import type { ArcadeGameAdapter } from "./adapter";

export function arcadeAdapterKey(game: string, schema: string) {
  return `${game}::${schema}`;
}

export class ArcadeAdapterRegistry {
  private readonly adapters = new Map<string, ArcadeGameAdapter>();

  constructor(adapters: readonly ArcadeGameAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: ArcadeGameAdapter) {
    const key = arcadeAdapterKey(adapter.game, adapter.schema);
    if (this.adapters.has(key)) throw new Error(`Duplicate Arcade adapter registration: ${key}`);
    this.adapters.set(key, adapter);
    return this;
  }

  get(game: string, schema: string) {
    return this.adapters.get(arcadeAdapterKey(game, schema));
  }

  require(game: string, schema: string) {
    const adapter = this.get(game, schema);
    if (!adapter) {
      throw new AppError(
        "This Arcade game version is not available on the vNext runtime.",
        409,
        "ARCADE_SCHEMA_UNAVAILABLE"
      );
    }
    return adapter;
  }

  keys() {
    return [...this.adapters.keys()];
  }
}

/**
 * Deliberately empty until a greybox has passed the studio gates. Test fixtures
 * are registered only by tests and can never become learner-accessible by import accident.
 */
export const arcadeAdapterRegistry = new ArcadeAdapterRegistry();

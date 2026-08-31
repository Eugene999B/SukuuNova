import { unstable_cache } from "next/cache";

/**
 * Cache a tenant-scoped read without allowing the cache key to cross schools.
 * Callers are still responsible for authentication/permission checks before
 * invoking this helper. Keep the loader read-only.
 */
export function cachedSchoolRead<T>(
  schoolId: string,
  key: string,
  loader: () => Promise<T>,
  revalidateSeconds = 30,
) {
  return unstable_cache(loader, ["sukuunova", key, schoolId], {
    revalidate: revalidateSeconds,
  })();
}

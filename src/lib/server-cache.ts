import { unstable_cache } from "next/cache";

export function cacheTenantRead<T>(
  keyParts: string[],
  loader: () => Promise<T>,
  revalidate = 30,
  tags: string[] = []
) {
  return unstable_cache(loader, keyParts, { revalidate, tags });
}

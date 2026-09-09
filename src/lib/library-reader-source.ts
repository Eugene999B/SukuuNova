import { AppError } from "./errors";
import { safeResourceUrl } from "./resource-url";

function configuredHosts() {
  return (process.env.LIBRARY_READER_ALLOWED_HOSTS ?? "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}
function configuredPathPrefixes() {
  const configured = (process.env.LIBRARY_READER_ALLOWED_PATH_PREFIXES ?? "/uploads/,/library-files/,/files/")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => value.startsWith("/") ? value : `/${value}`);
  return configured.length ? configured : ["/library-files/"];
}
function hostMatches(hostname: string, rule: string) {
  const host = hostname.toLowerCase();
  const normalized = rule.toLowerCase();
  if (normalized.startsWith("*.")) {
    const suffix = normalized.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === normalized;
}
function safeFileName(title: string) {
  const value = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return value || "library-resource";
}

export function resolveLibraryReaderUrl(raw: string, requestOrigin: string) {
  const safe = safeResourceUrl(raw);
  if (!safe) throw new AppError("The digital source URL is invalid.", 409, "DIGITAL_SOURCE_INVALID");
  let url: URL;
  try { url = new URL(safe, requestOrigin); } catch { throw new AppError("The digital source URL is invalid.", 409, "DIGITAL_SOURCE_INVALID"); }
  if (url.username || url.password) throw new AppError("Authenticated URLs cannot be used as library reader sources.", 409, "DIGITAL_SOURCE_INVALID");
  const origin = new URL(requestOrigin);
  const sameOrigin = url.origin === origin.origin;
  if (sameOrigin) {
    const prefixes = configuredPathPrefixes();
    if (!prefixes.some(prefix => url.pathname.startsWith(prefix))) throw new AppError("This same-site path is not configured as a library storage location.", 409, "LIBRARY_STORAGE_PATH_NOT_ALLOWED");
    return url;
  }
  if (url.protocol !== "https:") throw new AppError("External library reader sources must use HTTPS.", 409, "LIBRARY_SOURCE_NOT_ALLOWED");
  const hosts = configuredHosts();
  if (!hosts.some(rule => hostMatches(url.hostname, rule))) throw new AppError("This digital storage host is not approved for protected library reading.", 409, "LIBRARY_SOURCE_NOT_ALLOWED");
  return url;
}

async function fetchApproved(url: URL, requestOrigin: string, range: string | null, hops = 0): Promise<Response> {
  if (hops > 3) throw new AppError("The library source redirected too many times.", 502, "LIBRARY_SOURCE_REDIRECT");
  const response = await fetch(url, {
    method: "GET",
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
    redirect: "manual",
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) throw new AppError("The library source returned an invalid redirect.", 502, "LIBRARY_SOURCE_REDIRECT");
    const next = resolveLibraryReaderUrl(new URL(location, url).toString(), requestOrigin);
    return fetchApproved(next, requestOrigin, range, hops + 1);
  }
  if (!response.ok && response.status !== 206) throw new AppError(`The protected library source could not be opened (${response.status}).`, 502, "LIBRARY_SOURCE_UNAVAILABLE");
  return response;
}

export async function streamLibraryResource(input: {
  sourceUrl: string;
  title: string;
  requestOrigin: string;
  range?: string | null;
  mode: "read" | "download";
}) {
  const url = resolveLibraryReaderUrl(input.sourceUrl, input.requestOrigin);
  const source = await fetchApproved(url, input.requestOrigin, input.range ?? null);
  const contentLength = Number(source.headers.get("content-length") ?? 0);
  const maxBytes = Number(process.env.LIBRARY_READER_MAX_BYTES ?? 209715200);
  if (Number.isFinite(contentLength) && contentLength > 0 && Number.isFinite(maxBytes) && maxBytes > 0 && contentLength > maxBytes) {
    await source.body?.cancel();
    throw new AppError("This resource is larger than the configured online-reader limit.", 413, "LIBRARY_RESOURCE_TOO_LARGE");
  }
  const headers = new Headers();
  const passthrough = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];
  for (const name of passthrough) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  const filename = safeFileName(input.title);
  headers.set("Content-Disposition", `${input.mode === "download" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  if (input.mode === "read") {
    headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'");
    headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  return new Response(source.body, { status: source.status, headers });
}

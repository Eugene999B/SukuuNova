import { AppError } from "./errors";

type OriginEnvironment = {
  NODE_ENV?: string;
  APP_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  RAILWAY_PUBLIC_DOMAIN?: string;
};

function parsedOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function railwayOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  const candidate = value.includes("://") ? value : `https://${value.trim()}`;
  return parsedOrigin(candidate);
}

function unsafePublicHost(url: URL) {
  const host = url.hostname.toLowerCase();
  return host === "localhost"
    || host === "0.0.0.0"
    || host === "::1"
    || host === "[::1]"
    || host.startsWith("127.")
    || host.endsWith(".internal")
    || host.endsWith(".local");
}

/**
 * Returns the externally reachable origin that must be encoded into printed
 * identity-card QR codes. Request.url is only a fallback because reverse
 * proxies can expose an internal host/port to the application process.
 */
export function identityCardPublicOrigin(
  requestUrl: string | URL,
  environment: OriginEnvironment = process.env,
) {
  const configured = [
    parsedOrigin(environment.APP_URL),
    parsedOrigin(environment.NEXT_PUBLIC_APP_URL),
    railwayOrigin(environment.RAILWAY_PUBLIC_DOMAIN),
  ].find((candidate): candidate is URL => Boolean(candidate));

  if (configured) {
    if (environment.NODE_ENV === "production" && (configured.protocol !== "https:" || unsafePublicHost(configured))) {
      throw new AppError(
        "The public ID-card verification URL is not configured safely.",
        500,
        "ID_CARD_PUBLIC_ORIGIN_INVALID",
      );
    }
    return configured.origin;
  }

  const fallback = parsedOrigin(requestUrl instanceof URL ? requestUrl.toString() : requestUrl);
  if (!fallback) {
    throw new AppError(
      "The public ID-card verification URL could not be determined.",
      500,
      "ID_CARD_PUBLIC_ORIGIN_MISSING",
    );
  }

  if (environment.NODE_ENV === "production" && (fallback.protocol !== "https:" || unsafePublicHost(fallback))) {
    throw new AppError(
      "A public APP_URL or NEXT_PUBLIC_APP_URL is required before identity cards can be printed.",
      500,
      "ID_CARD_PUBLIC_ORIGIN_MISSING",
    );
  }

  return fallback.origin;
}

import { AppError } from "./errors";

export async function readBoundedJson(request: Request, maxBytes = 64 * 1024, label = "Request"): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) throw new AppError(`${label} body is too large.`, 413, "BODY_TOO_LARGE");
  }
  if (!request.body) throw new AppError(`${label} body is required.`, 400, "INVALID_INPUT");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError(`${label} body is too large.`, 413, "BODY_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(`${label} body must be valid JSON.`, 400, "INVALID_INPUT");
  }
}

import { renderDemoLibraryPdf } from "@/lib/demo-library-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  const rendered = await renderDemoLibraryPdf(filename);

  if (!rendered) {
    return new Response("Synthetic library resource not found.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  const bytes = new Uint8Array(rendered.bytes.byteLength);
  bytes.set(rendered.bytes);

  return new Response(bytes.buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(rendered.filename)}`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

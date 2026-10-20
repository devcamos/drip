// Static, public build identity only. Service-worker update checks include the
// bytes of imported scripts, so every build refreshes the offline app shell.
export const dynamic = "force-static";
export function GET() {
  return new Response(`self.DRIP_BUILD_ID = ${JSON.stringify(process.env.NEXT_PUBLIC_DRIP_BUILD_ID ?? "development")};\n`, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
}

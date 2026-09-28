import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminConfigured, adminOpenInDev, isCronRequest, verifyAdminToken } from "@/lib/admin-auth";

/** Guards the admin UI, the admin API and the cron endpoint. */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  if (pathname.startsWith("/api/cron") && (await isCronRequest(req.headers.get("authorization")))) {
    return NextResponse.next();
  }
  if (adminOpenInDev()) return NextResponse.next();
  if (await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    const error = adminConfigured() ? "Ikke innlogget som admin" : "ADMIN_PASSWORD er ikke satt på serveren";
    return NextResponse.json({ ok: false, error }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/cron/:path*"],
};

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_DAYS,
  adminConfigured,
  createAdminToken,
  safeEqual,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function safeNext(next: unknown): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/admin") && !s.startsWith("//") ? s : "/admin/import";
}

async function login(formData: FormData) {
  "use server";
  const next = safeNext(formData.get("next"));
  const password = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !(await safeEqual(password, expected))) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, await createAdminToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_DAYS * 86_400,
  });
  redirect(next);
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const configured = adminConfigured();

  return (
    <div className="adm-root">
      <div className="adm-topbar">
        <div className="adm-topbar-left">
          <span className="adm-logo">Admin</span>
          <span className="adm-logo-sep">/</span>
          <span className="adm-logo-page">Logg inn</span>
        </div>
      </div>
      <div style={{ maxWidth: 380, margin: "64px auto", padding: "0 16px" }}>
        {!configured ? (
          <div className="adm-reimport-result err">
            <div className="adm-reimport-result-title">Admin er ikke konfigurert</div>
            <div className="adm-reimport-result-line">
              Sett miljøvariabelen <code>ADMIN_PASSWORD</code> på serveren for å aktivere admin-innlogging.
            </div>
          </div>
        ) : (
          <form action={login} className="adm-field" style={{ gap: 12, display: "flex", flexDirection: "column" }}>
            <input type="hidden" name="next" value={safeNext(sp.next)} />
            <label className="adm-label" htmlFor="password">
              Passord
            </label>
            <input id="password" name="password" type="password" className="adm-input" autoFocus required />
            {sp.error && <div className="adm-warn">Feil passord</div>}
            <button className="adm-btn adm-btn--primary" type="submit">
              Logg inn
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

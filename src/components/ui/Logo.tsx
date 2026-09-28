import Link from "next/link";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 68 32" fill="none" aria-hidden="true">
      <path d="M2 30 8 12 34 2l26 10 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M12 28l3-12 19-8 19 8 3 12" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" opacity=".55" />
      <path d="M22 26v-7l12-5 12 5v7" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" opacity=".3" />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link href="/" className="ss-logo" aria-label="Startstreken – forside">
      <LogoMark className="ss-logo-mark" />
      <span className="ss-logo-text">Startstreken</span>
    </Link>
  );
}

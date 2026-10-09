import Link from "next/link";

/** The Startstreken mark (public/startstreken2.png), tinted via CSS mask so it can take any colour. */
export function LogoMark({ className }: { className?: string }) {
  return <span className={`ss-logo-mark${className ? ` ${className}` : ""}`} aria-hidden="true" />;
}

export default function Logo() {
  return (
    <Link href="/" className="ss-logo" aria-label="Startstreken – forside">
      <LogoMark />
      <span className="ss-logo-text">Startstreken</span>
    </Link>
  );
}

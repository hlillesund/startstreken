export function toast(msg: string, type: "ok" | "err" = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  Object.assign(el.style, {
    position: "fixed", bottom: "24px", right: "24px", zIndex: "9999",
    background: type === "ok" ? "#1a1a1a" : "#dc2626",
    color: "#fff", padding: "10px 18px",
    fontFamily: "var(--font-mono)", fontSize: "12px",
    letterSpacing: "0.06em", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
    transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 400); }, 2400);
}

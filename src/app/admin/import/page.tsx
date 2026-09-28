"use client";

import { useState } from "react";
import ImportPanel from "./ImportPanel";
import LogPanel from "./LogPanel";
import PresetsPanel from "./PresetsPanel";
import QueuePanel from "./QueuePanel";

const TABS = [
  { key: "import", label: "Importer" },
  { key: "queue", label: "Crawler & kø" },
  { key: "log", label: "Logg" },
  { key: "presets", label: "Presets" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function AdminImportPage() {
  const [tab, setTab] = useState<Tab>("import");
  const [todo, setTodo] = useState<number | null>(null);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="adm-root">
      <div className="adm-topbar">
        <div className="adm-topbar-left">
          <span className="adm-logo">Admin</span>
          <span className="adm-logo-sep">/</span>
          <span className="adm-logo-page">Import</span>
          <a className="adm-logo-page imp-toplink" href="/admin/lop">
            Løp &amp; serier →
          </a>
        </div>
        <div className="adm-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`adm-tab${tab === t.key ? " act" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
              {t.key === "queue" && todo ? <span className="adm-tab-count">{todo}</span> : null}
            </button>
          ))}
          <button className="adm-tab" onClick={logout} title="Logg ut">
            ⎋
          </button>
        </div>
      </div>

      <div className="imp-body">
        {tab === "import" && <ImportPanel />}
        {tab === "queue" && <QueuePanel onCountsChange={setTodo} />}
        {tab === "log" && <LogPanel />}
        {tab === "presets" && <PresetsPanel />}
      </div>
    </div>
  );
}

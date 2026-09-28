"use client";

import { Gauge, Flag, Heart } from "lucide-react";

type Tool = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
};

export default function ToolsQuickActions() {
  const tools: Tool[] = [
    {
      key: "pace",
      label: "Pace",
      icon: <Gauge className="h-7 w-7" />,
    },
    {
      key: "times",
      label: "Tider",
      icon: <Flag className="h-7 w-7" />,
    },
    {
      key: "zones",
      label: "Soner",
      icon: <Heart className="h-7 w-7" />,
    },
  ];

  return (
    <section className="bg-[#728c69]">
      <div className="mx-auto max-w-6xl px-5 py-10">
        {/* Header */}
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-white">
            Verktøy for løpere
          </h2>
          <p className="mt-2 text-sm text-white/80">
            Kjappe verktøy du faktisk bruker
          </p>
        </div>

        {/* Horizontal actions */}
        <div className="flex justify-between gap-6">
          {tools.map((tool) => (
            <button
              key={tool.key}
              onClick={tool.onClick}
              className="flex flex-1 flex-col items-center gap-2 text-white
                         transition active:opacity-70"
              aria-label={tool.label}
            >
              {tool.icon}
              <span className="text-sm font-medium">
                {tool.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
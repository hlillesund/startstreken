// src/components/ToolCard.tsx
"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

type ToolCardProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
};

export default function ToolCard({
  title,
  description,
  icon,
  href,
  onClick,
}: ToolCardProps) {
  const content = (
    <div
      className="glass-card flex items-center gap-4 p-6 text-left
                 transition hover:scale-[1.01] active:scale-[0.99]"
    >
      <div className="flex h-10 w-10 items-center justify-center">
        {icon}
      </div>

      <div className="flex-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm opacity-80">
          {description}
        </p>
      </div>

      <ChevronRight className="h-5 w-5 opacity-60" />
    </div>
  );

  // Navigation card
  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  // Action card (fallback)
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left"
    >
      {content}
    </button>
  );
}
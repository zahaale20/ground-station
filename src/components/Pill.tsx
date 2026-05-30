import type { ReactNode } from "react";

type Tone = "default" | "ok" | "warn" | "bad";

const toneClasses: Record<Tone, string> = {
  default: "bg-slate-800 text-slate-400",
  ok: "bg-emerald-950 text-emerald-400",
  warn: "bg-amber-950 text-amber-300",
  bad: "bg-rose-950 text-rose-400",
};

// Status pill used in the header strip and the map info chip. Mirrors the
// `.pill` element from the legacy HTML so the visual rhythm stays consistent.
export function Pill({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

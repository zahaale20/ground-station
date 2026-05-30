import { useEffect } from "react";
import type { Hotkey } from "../hooks/useHotkeys";

interface ShortcutsOverlayProps {
  hotkeys: Hotkey[];
  open: boolean;
  onClose: () => void;
}

// Full-screen translucent overlay listing every keyboard shortcut, grouped
// by category. Toggled by "?" and dismissed by Esc or click-outside. Modeled
// after the F1 / TAB cheat-sheets games like Apex and Squad use.
export function ShortcutsOverlay({ hotkeys, open, onClose }: ShortcutsOverlayProps) {
  // Esc closes the overlay even when the focus is inside the overlay's own
  // backdrop button. Bound directly so it doesn't have to compete with the
  // global hotkey list.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Group by the hotkey's `group` field; ungrouped entries fall into "general".
  const groups = new Map<string, Hotkey[]>();
  for (const hk of hotkeys) {
    const g = hk.group ?? "general";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(hk);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-[min(640px,90vw)] overflow-y-auto rounded-xl border border-sky-900/60 bg-slate-900/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-lg font-semibold tracking-wide text-sky-300">
            Keyboard Shortcuts
          </h2>
          <span className="text-xs text-slate-500">press <Key>Esc</Key> to close</span>
        </div>
        <div className="space-y-5">
          {[...groups.entries()].map(([group, items]) => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {group}
              </h3>
              <ul className="space-y-1.5">
                {items.map((hk) => (
                  <li
                    key={`${group}:${hk.label}:${hk.description}`}
                    className="flex items-center justify-between gap-4 rounded-md border border-slate-800/60 bg-slate-950/60 px-3 py-1.5"
                  >
                    <span className="text-sm text-slate-200">{hk.description}</span>
                    <Key>{hk.label}</Key>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// Inline kbd-styled badge. Kept local because nothing else needs it and the
// styling is just a thin wrapper around <kbd>.
function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-xs text-sky-200 shadow-inner">
      {children}
    </kbd>
  );
}

import { useEffect, useMemo } from "react";

// A binding is a single keyboard shortcut: the human label ("A", "Shift+D",
// "Space"), the modifiers, and the handler. We deliberately keep the shape
// flat so the shortcut overlay can render the same array the hook consumes.
export interface Hotkey {
  // The label shown in the UI badge ("A", "Shift+D", "Space", "?").
  label: string;
  // What the operator is doing -- shown in the overlay legend.
  description: string;
  // The KeyboardEvent.key value (case-insensitive for letters).
  key: string;
  // Modifiers; default false. Shift is used as the "destructive" safety.
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  // Optional category for grouping in the overlay (e.g. "flight", "mission").
  group?: string;
  // Handler. The hook calls it after preventing the browser default.
  run: () => void;
}

// True when the keypress should be ignored because the operator is typing
// into a form field. Without this guard, pressing "A" inside the takeoff-
// altitude input would arm the drone -- exactly the wrong outcome.
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function matches(event: KeyboardEvent, hk: Hotkey): boolean {
  // Letter keys are matched case-insensitively so CapsLock doesn't break
  // muscle memory. Non-letter keys (Space, ?, Escape) match literally.
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const wantKey = hk.key.length === 1 ? hk.key.toLowerCase() : hk.key;
  if (eventKey !== wantKey) return false;
  if (!!hk.shift !== event.shiftKey) return false;
  if (!!hk.ctrl !== event.ctrlKey) return false;
  if (!!hk.meta !== event.metaKey) return false;
  if (!!hk.alt !== event.altKey) return false;
  return true;
}

// Registers a list of keyboard shortcuts on `window` for the lifetime of the
// component. Returns the same list back, memoized, so the caller can feed it
// straight into the shortcuts overlay without duplicating the source of truth.
export function useHotkeys(hotkeys: Hotkey[], enabled = true): Hotkey[] {
  // The hook intentionally re-binds when the hotkeys array identity changes;
  // callers should pass a stable reference (e.g. via useMemo) to avoid that.
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      for (const hk of hotkeys) {
        if (matches(event, hk)) {
          event.preventDefault();
          hk.run();
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeys, enabled]);

  return useMemo(() => hotkeys, [hotkeys]);
}

// Exported for unit tests so the matching rules can be verified directly
// without spinning up a DOM listener.
export const __internal = { isTypingTarget, matches };

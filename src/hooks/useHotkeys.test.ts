// Unit tests for the global hotkey matcher.
//
// Risks defended against:
// - A hotkey fires while the operator is typing into the takeoff-altitude
//   input -- specifically, pressing "A" inside the input must not arm.
// - Letter shortcuts become CapsLock-sensitive after a refactor.
// - The Shift safety on destructive commands gets dropped silently, so
//   Shift+R fires the RTL handler but plain R also does (one-key RTL would
//   be a disaster while typing notes).
// - Modifier-only differences (Shift+D vs D) collide.

import { describe, expect, it } from "vitest";
import { __internal } from "./useHotkeys";

const { isTypingTarget, matches } = __internal;

// Helper: build a KeyboardEvent-shaped object the matcher accepts. We only
// touch the four properties matches() inspects so a plain object is enough.
function keyEvent(opts: {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
}): KeyboardEvent {
  return {
    key: opts.key,
    shiftKey: !!opts.shift,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    altKey: !!opts.alt,
  } as KeyboardEvent;
}

const NOOP = () => {};

describe("isTypingTarget", () => {
  it("treats <input> as a typing target", () => {
    // Pressing keys while the takeoff-altitude input has focus must NEVER
    // fire global hotkeys -- this is the single biggest footgun.
    const input = document.createElement("input");
    expect(isTypingTarget(input)).toBe(true);
  });

  it("treats <textarea> as a typing target", () => {
    // The mission JSON editor is a textarea; typing "[[" must not trigger
    // any hotkey.
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
  });

  it("treats contenteditable elements as a typing target", () => {
    // Future panels may use contenteditable for tags / labels; we must
    // already guard against it.
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    // jsdom honors the attribute via the IDL property below.
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  it("does NOT treat a plain <div> as a typing target", () => {
    // Focusing the page body or any non-form element is the normal cockpit
    // state -- hotkeys must work there.
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
  });

  it("returns false for null / non-element targets", () => {
    // KeyboardEvent.target can be null on some synthetic dispatches.
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("matches", () => {
  it("matches a plain letter key regardless of case", () => {
    // CapsLock or Shift+letter still produces the lowercase "a" key value
    // depending on the layout, so the matcher must compare case-insensitively
    // for letter shortcuts.
    const hk = { label: "A", key: "a", description: "arm", run: NOOP };
    expect(matches(keyEvent({ key: "a" }), hk)).toBe(true);
    expect(matches(keyEvent({ key: "A" }), hk)).toBe(true);
  });

  it("requires Shift when the hotkey declares Shift", () => {
    // The safety pattern: a destructive command is Shift+letter; a bare
    // letter must NOT trigger it.
    const hk = { label: "Shift+D", key: "d", shift: true, description: "disarm", run: NOOP };
    expect(matches(keyEvent({ key: "d", shift: true }), hk)).toBe(true);
    expect(matches(keyEvent({ key: "d" }), hk)).toBe(false);
  });

  it("rejects Shift when the hotkey does NOT declare Shift", () => {
    // Symmetrically: a bare-letter hotkey must not fire when the operator
    // is holding Shift (that gesture is reserved for the safety variants).
    const hk = { label: "A", key: "a", description: "arm", run: NOOP };
    expect(matches(keyEvent({ key: "a", shift: true }), hk)).toBe(false);
  });

  it("matches non-letter keys literally", () => {
    // Space, "?" and Escape are not lowercased; they must match the literal
    // string the matcher receives.
    const space = { label: "Space", key: " ", description: "start", run: NOOP };
    const esc = { label: "Esc", key: "Escape", description: "close", run: NOOP };
    expect(matches(keyEvent({ key: " " }), space)).toBe(true);
    expect(matches(keyEvent({ key: "Escape" }), esc)).toBe(true);
  });

  it("requires every declared modifier to be pressed", () => {
    // A future shortcut might bind Ctrl+Shift+X. The matcher must require
    // BOTH modifiers and reject a press that only holds one.
    const hk = {
      label: "Ctrl+Shift+X",
      key: "x",
      shift: true,
      ctrl: true,
      description: "test",
      run: NOOP,
    };
    expect(matches(keyEvent({ key: "x", shift: true, ctrl: true }), hk)).toBe(true);
    expect(matches(keyEvent({ key: "x", ctrl: true }), hk)).toBe(false);
    expect(matches(keyEvent({ key: "x", shift: true }), hk)).toBe(false);
  });

  it("rejects an undeclared modifier being held", () => {
    // Holding Meta (Cmd) while pressing "A" should NOT fire the bare-A
    // hotkey, because Cmd+A is the browser's "select all" gesture.
    const hk = { label: "A", key: "a", description: "arm", run: NOOP };
    expect(matches(keyEvent({ key: "a", meta: true }), hk)).toBe(false);
  });
});

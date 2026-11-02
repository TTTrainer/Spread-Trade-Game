import { useEffect, useRef } from 'react';
import type { HotkeyAction } from '../shared/settings';
import { useApp } from './store/app';

/** Normalize a keyboard event into a binding string like "Ctrl+Shift+Tab" or "Alt+S". */
export function eventToBinding(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  // Shift+digit is part of the binding ("Shift+3"); for other printable keys the shifted char carries it.
  const code = e.code;
  let key: string;
  if (code.startsWith('Digit')) key = code.slice(5);
  else if (code.startsWith('Key')) key = code.slice(3);
  else if (code === 'Space') key = 'Space';
  else if (code === 'Backquote') key = '`';
  else if (code === 'BracketLeft') key = '[';
  else if (code === 'BracketRight') key = ']';
  else if (code === 'Backslash') key = '\\';
  else if (code === 'Equal' || code === 'NumpadAdd') key = '=';
  else if (code === 'Minus' || code === 'NumpadSubtract') key = '-';
  else if (code === 'Enter' || code === 'NumpadEnter') key = 'Enter';
  else if (code === 'Tab') key = 'Tab';
  else if (code === 'Escape') key = 'Escape';
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (e.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

type Handlers = Partial<Record<HotkeyAction, (e: KeyboardEvent) => void>>;

const stack: { handlers: () => Handlers }[] = [];

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  // Arrow keys belong to a focused slider or dropdown, not to the game.
  const arrow = e.key.startsWith('Arrow');
  return (
    (tag === 'INPUT' &&
      (((t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox') || arrow)) ||
    tag === 'TEXTAREA' ||
    (tag === 'SELECT' && arrow) ||
    (t.getAttribute('role') === 'slider' && arrow) ||
    t.isContentEditable
  );
}

let installed = false;

function install(): void {
  if (installed) return;
  installed = true;
  window.addEventListener(
    'keydown',
    (e) => {
      // A full-screen moment (a trade's payout, a trophy) takes Enter and Space for itself.
      if ((e.key === 'Enter' || e.key === ' ') && document.querySelector('[data-owns-keys]')) return;
      const binding = eventToBinding(e);
      const map = useApp.getState().settings.hotkeys;
      const actions = (Object.keys(map) as HotkeyAction[]).filter((a) => map[a] === binding);
      if (actions.length === 0) return;
      // Plain keys (digits, letters, space) should still type into text fields.
      if (isTyping(e) && !binding.includes('Ctrl') && !binding.includes('Alt')) return;
      for (let i = stack.length - 1; i >= 0; i--) {
        const h = stack[i].handlers();
        const hit = actions.find((a) => h[a]);
        if (hit) {
          e.preventDefault();
          e.stopPropagation();
          h[hit]?.(e);
          return;
        }
      }
    },
    true,
  );
}

/** Register hotkey handlers while a component is mounted. Later mounts take priority. */
export function useHotkeys(handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    install();
    const entry = { handlers: () => ref.current };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
}

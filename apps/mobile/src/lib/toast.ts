import { useSyncExternalStore } from "react";

const SHOW_MS = 2200;

let message: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const publish = (next: string | null) => {
  message = next;
  listeners.forEach((listener) => listener());
};

/** A short confirmation that outlives the sheet it came from. */
export function toast(text: string) {
  clearTimeout(timer);
  publish(text);
  timer = setTimeout(() => publish(null), SHOW_MS);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useToast = () => useSyncExternalStore(subscribe, () => message);

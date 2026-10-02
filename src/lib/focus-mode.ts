import { useSyncExternalStore } from "react";

/** Focus mode hides the app sidebar and top bar so the Simulate canvas gets the whole viewport. */
let focus = false;
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const focusMode = {
  get: () => focus,
  set: (value: boolean) => {
    if (value === focus) return;
    focus = value;
    listeners.forEach((l) => l());
  },
};

export function useFocusMode() {
  return useSyncExternalStore(subscribe, () => focus, () => false);
}

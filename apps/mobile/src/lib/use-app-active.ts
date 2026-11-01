import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/** Runs when the app comes back to the screen, which is also how the app learns a call has ended. */
export function useAppActive(fn: () => void) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    let previous = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && previous !== "active") latest.current();
      previous = next;
    });
    return () => sub.remove();
  }, []);
}

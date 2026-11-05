"use client";

import { Download, Share, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../components/alert";
import { Button } from "../components/button";

/** Chrome's install event; not in TypeScript's DOM types. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "edge:install-hint-dismissed";
type Env = "hidden" | "ios" | "android";

// Chrome fires beforeinstallprompt once per page load, often before React hydrates, so it is caught when this module loads.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function environment(): Env {
  const installed =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // Phones and tablets only: on a computer the browser's own install button is enough.
  if (installed || wasDismissed() || !window.matchMedia("(pointer: coarse)").matches) return "hidden";
  // iPadOS Safari says "Macintosh"; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "android";
}

function subscribe(onChange: () => void) {
  const standalone = window.matchMedia("(display-mode: standalone)");
  standalone.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  listeners.add(onChange);
  return () => {
    standalone.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    listeners.delete(onChange);
  };
}

/**
 * Suggests adding the app to the phone's home screen. Renders nothing on the server, on computers, once installed, after
 * "Dismiss", and on Android until Chrome says the app can be installed. iPhones get the Share → Add to Home Screen steps,
 * because Safari has no install button a page can trigger.
 */
export function InstallAppHint({ appName, className }: { appName: string; className?: string }) {
  const env = useSyncExternalStore(subscribe, environment, (): Env => "hidden");
  const prompt = useSyncExternalStore(
    subscribe,
    () => deferred,
    () => null,
  );
  const [closed, setClosed] = useState(false);

  if (closed || env === "hidden" || (env === "android" && !prompt)) return null;

  function dismiss() {
    setClosed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode or blocked storage: it stays hidden for this visit only.
    }
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    deferred = null; // a prompt can be shown only once
    notify();
    if (outcome === "accepted") setClosed(true);
  }

  return (
    <Alert variant="info" className={className}>
      {env === "ios" ? <Share /> : <Download />}
      <AlertTitle>Add {appName} to your home screen</AlertTitle>
      <AlertDescription>
        {env === "ios" ? (
          <>
            Tap <span className="font-medium">Share</span>, then <span className="font-medium">Add to Home Screen</span>. It opens like an
            app, without the browser bar. Sign in once inside it.
          </>
        ) : (
          "It opens like an app, without the browser bar."
        )}
      </AlertDescription>
      {env === "android" && (
        <div className="col-start-2 mt-2">
          <Button size="sm" onClick={install}>
            <Download /> Install app
          </Button>
        </div>
      )}
      <AlertAction>
        <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={dismiss}>
          <X />
        </Button>
      </AlertAction>
    </Alert>
  );
}

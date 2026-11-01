import { requireNativeModule } from "expo";

export interface DeviceCall {
  number: string;
  countryIso: string | null;
  startedAt: number;
  durationSec: number;
  direction: "IN" | "OUT" | "MISSED" | "REJECTED";
  account: string | null;
}

export interface TrackerRun {
  at: number;
  source: "change" | "periodic" | "manual";
  rows?: number;
  newestAt?: number | null;
  error?: string;
}

interface CallTrackerNative {
  token(): string | null;
  signIn(apiUrl: string, token: string): void;
  signOut(): void;
  sync(): void;
  hasCallLogAccess(): boolean;
  recentCalls(limit: number): DeviceCall[];
  placeCall(number: string, leadId: string): void;
  dismissPrompt(startedAt: number): void;
  batteryRestricted(): boolean;
  askToRunInBackground(): void;
  installUpdate(url: string, sha256: string): Promise<void>;
  runsJson(): string;
}

export const CallTracker = requireNativeModule<CallTrackerNative>("CallTracker");

export const trackerRuns = () => JSON.parse(CallTracker.runsJson()) as TrackerRun[];

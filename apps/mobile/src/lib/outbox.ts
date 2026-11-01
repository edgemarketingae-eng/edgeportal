import { ApiError, crmRoutes, mobileRoutes, type CallSheetInput } from "@edge/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const KEY = "outbox";

type ActivityBody = { type: "WHATSAPP"; body: string; nextFollowUpAt?: string; nextFollowUpTitle?: string };

export type OutboxJob =
  | { kind: "sheet"; body: CallSheetInput }
  | { kind: "activity"; leadId: string; body: ActivityBody }
  | { kind: "completeTask"; taskId: string; body: { note: string; nextFollowUpAt?: string } }
  | { kind: "stage"; leadId: string; stage: "CONTACTED" | "QUALIFIED" | "CONSULTATION" | "NEGOTIATION" };

const read = async () => JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]") as OutboxJob[];
const write = (jobs: OutboxJob[]) => AsyncStorage.setItem(KEY, JSON.stringify(jobs));

function send(job: OutboxJob) {
  if (job.kind === "sheet") return api(mobileRoutes.saveCallSheet, { body: job.body });
  if (job.kind === "activity") return api(crmRoutes.activity, { params: { id: job.leadId }, body: job.body });
  if (job.kind === "completeTask") return api(crmRoutes.completeTask, { params: { id: job.taskId }, body: job.body });
  return api(crmRoutes.stage, { params: { id: job.leadId }, body: { stage: job.stage } });
}

/** A rejection that retrying can't fix: the server read it and said no, rather than never receiving it. */
const isFinal = (e: unknown) => e instanceof ApiError && e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status);

let flushing: Promise<number> | null = null;

/** Sends what's waiting, oldest first, stopping at the first failure so order holds. Returns how many are left. */
export function flushOutbox() {
  flushing ??= (async () => {
    let jobs = await read();
    while (jobs.length) {
      try {
        await send(jobs[0]!);
      } catch (e) {
        if (!isFinal(e)) break;
      }
      jobs = jobs.slice(1);
      await write(jobs);
    }
    return jobs.length;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Saved to the phone first, so nothing typed after a call is lost to a bad signal. */
export async function enqueue(jobs: OutboxJob[]) {
  await flushing?.catch(() => {});
  await write([...(await read()), ...jobs]);
  return flushOutbox();
}

export const waitingCount = async () => (await read()).length;

export async function clearLocalData() {
  await AsyncStorage.clear();
}

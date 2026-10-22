/** Students may join from `windowMinutes` before the start until the scheduled end. */
export function joinWindowOpen(session: { startsAt: Date; endsAt: Date; status: string }, at: Date, windowMinutes: number) {
  return session.status === "SCHEDULED" && at.getTime() >= session.startsAt.getTime() - windowMinutes * 60_000 && at.getTime() <= session.endsAt.getTime();
}

/** Dubai (UTC+4, no DST) wall-clock date + time to an instant. */
export function dubaiInstant(date: string, time: string) {
  return new Date(`${date}T${time}:00+04:00`);
}

/** Dubai wall-clock parts of an instant, for edit forms. */
export function dubaiParts(d: Date) {
  const local = new Date(d.getTime() + 4 * 3600_000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

import { formatDateTime } from "@edge/domain/dates";
import Link from "next/link";
import { Card } from "../components/card";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  if (!items.length) return <Card className="text-muted-foreground py-10 text-center text-sm">You are all caught up.</Card>;
  return (
    <ul className="bg-card divide-y rounded-xl border">
      {items.map((n) => (
        <li key={n.id} className="flex gap-3 px-4 py-3">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-edge-green"}`} />
          <div className="flex-1 text-sm">
            <p className="font-semibold">
              {n.href ? (
                <Link href={n.href} className="hover:underline">
                  {n.title}
                </Link>
              ) : (
                n.title
              )}
            </p>
            <p className="text-muted-foreground">{n.body}</p>
            <p className="text-muted-foreground mt-1 text-xs">{formatDateTime(n.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

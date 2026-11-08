import type { ClaudeConnectionDto } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { disconnectClaudeAction } from "@/lib/actions/claude";

const KIND = { CLAUDE_APP: "Claude apps", LOCAL_APP: "On a computer", OTHER: "Other app" } as const;

/** Live Claude connections with Disconnect: a person's own (Connect Claude page), or everyone's (`withUser`, Settings). */
export function ClaudeConnections({ rows, withUser = false }: { rows: ClaudeConnectionDto[]; withUser?: boolean }) {
  const cols = withUser ? 5 : 4;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {withUser ? <TableHead>Person</TableHead> : null}
          <TableHead>App</TableHead>
          <TableHead>Access</TableHead>
          <TableHead className={withUser ? "hidden xl:table-cell" : "hidden sm:table-cell"}>Last used</TableHead>
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={cols} title={withUser ? "Nobody has connected Claude yet." : "Claude isn't connected."} />
        ) : null}
        {rows.map((c) => (
          <TableRow key={c.id}>
            {withUser ? (
              <TableCell>
                <span className="font-medium">{c.user?.name}</span>
                <span className="text-muted-foreground block text-xs">{c.user?.email}</span>
              </TableCell>
            ) : null}
            <TableCell>
              <span className="font-medium">{c.app}</span>
              <span className="text-muted-foreground block text-xs">
                {KIND[c.kind]} · connected {formatDateTime(c.connectedAt)}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{c.readOnly ? "Read only" : "Can make changes"}</Badge>
            </TableCell>
            <TableCell className={`text-muted-foreground hidden whitespace-nowrap ${withUser ? "xl:table-cell" : "sm:table-cell"}`}>
              {c.lastUsedAt ? formatDateTime(c.lastUsedAt) : "Never"}
            </TableCell>
            <TableCell>
              <ActionDialog
                action={disconnectClaudeAction}
                hidden={{ connectionId: c.id }}
                title={withUser ? `Disconnect ${c.user?.name ?? "this person"}'s Claude?` : "Disconnect Claude?"}
                description="It stops working straight away. Connecting again means signing in from Claude once more."
                trigger={
                  <Button size="sm" variant="ghost">
                    Disconnect
                  </Button>
                }
                submitLabel="Disconnect"
                destructive
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

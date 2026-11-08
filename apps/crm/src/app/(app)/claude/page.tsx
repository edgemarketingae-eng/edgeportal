import { claudeRoutes } from "@edge/contracts";
import { CopyButton } from "@edge/ui/blocks/copy-button";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@edge/ui/components/tabs";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Check, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClaudeConnections } from "@/components/crm/claude-connections";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Connect Claude" };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="bg-edge-mint text-edge-emerald grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

export default async function ConnectClaudePage() {
  const v = await requireCrm("crm.access");
  const d = await load(() => api(claudeRoutes.connections));
  const command = `claude mcp add --transport http edge-crm ${d.connectorUrl}`;
  return (
    <>
      <PageHeader
        help="/docs/claude"
        title="Connect Claude"
        description="Work in the CRM from Claude: search leads, log calls and notes, plan follow-ups and check the numbers, as yourself."
      />
      <div className="grid gap-6">
        {!d.enabled ? (
          <Alert variant="warning">
            <AlertDescription>
              Claude access is turned off for the CRM.{" "}
              {can(v, "crm.manage") ? (
                <>
                  Turn it on in{" "}
                  <Link href="/settings#claude" className="underline">
                    Settings
                  </Link>
                  .
                </>
              ) : (
                "Ask a CRM admin to turn it on."
              )}
            </AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Connector address</CardTitle>
            <CardDescription>Everyone uses the same address. Claude then asks you to sign in to the CRM and allow it.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="flex flex-wrap items-center gap-2">
              <code className="bg-muted rounded px-2 py-1 text-sm break-all">{d.connectorUrl}</code>
              <CopyButton value={d.connectorUrl} label="Copy connector address" />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How to connect</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="claude">
              <TabsList>
                <TabsTrigger value="claude">Claude app or claude.ai</TabsTrigger>
                <TabsTrigger value="code">Claude Code</TabsTrigger>
              </TabsList>
              <TabsContent value="claude" className="pt-3">
                <ol className="grid gap-3 text-sm">
                  <Step n={1}>
                    In Claude (claude.ai, or the desktop app), open <strong>Settings</strong> → <strong>Connectors</strong> and choose{" "}
                    <strong>Add custom connector</strong>.
                  </Step>
                  <Step n={2}>
                    Name it <strong>Edge CRM</strong> and paste the connector address above. Leave the advanced settings empty.
                  </Step>
                  <Step n={3}>
                    Choose <strong>Connect</strong>. Sign in to the CRM if asked, check the page, and choose <strong>Allow</strong>.
                  </Step>
                  <Step n={4}>
                    In a chat, make sure Edge CRM is switched on in the tools menu, then ask, for example, &ldquo;What are my overdue
                    follow-ups?&rdquo;
                  </Step>
                </ol>
                <p className="text-muted-foreground mt-3 text-sm">
                  Once added, the connector also works in the Claude app on your phone. On a Claude Team or Enterprise plan, an owner of
                  your Claude organization may need to add the connector first.
                </p>
              </TabsContent>
              <TabsContent value="code" className="grid gap-3 pt-3 text-sm">
                <p>Run this in a terminal, then type /mcp in Claude Code, pick edge-crm and choose Authenticate:</p>
                <p className="flex flex-wrap items-center gap-2">
                  <code className="bg-muted rounded px-2 py-1 text-xs break-all">{command}</code>
                  <CopyButton value={command} label="Copy command" />
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What Claude can do</CardTitle>
            <CardDescription>
              Exactly what you can do in the CRM, as you. Every change it makes shows as yours, marked &ldquo;via Claude&rdquo;. Claude asks
              before deleting anything; you can also allow it read-only access when you connect.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <ul className="grid content-start gap-1.5">
              {d.canDo.map((x) => (
                <li key={x} className="flex gap-2">
                  <Check aria-hidden className="text-edge-emerald mt-0.5 size-4 shrink-0" /> {x}
                </li>
              ))}
            </ul>
            <ul className="grid content-start gap-1.5">
              {d.cannotDo.map((x) => (
                <li key={x} className="text-muted-foreground flex gap-2">
                  <X aria-hidden className="mt-0.5 size-4 shrink-0" /> {x}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="p-0">
          <CardHeader className="pt-6">
            <CardTitle>Your connections</CardTitle>
            <CardDescription>Changing your password disconnects them all.</CardDescription>
          </CardHeader>
          <ClaudeConnections rows={d.connections} />
        </Card>
      </div>
    </>
  );
}

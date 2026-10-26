"use client";

import type { CrmOptions } from "@edge/contracts";
import { EXPERIENCE_LEVELS, LEAD_CHANNELS, LEAD_SOURCES, LEAD_TEMPERATURES } from "@edge/domain/crm/enums";
import { EXPERIENCE_LABELS, LEAD_CHANNEL_LABELS, LEAD_SOURCE_LABELS, LEAD_TEMPERATURE_LABELS } from "@edge/domain/crm/labels";
import { dialogLayout } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Checkbox } from "@edge/ui/components/checkbox";
import { DialogClose, DialogFooter } from "@edge/ui/components/dialog";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { NativeSelect } from "@edge/ui/components/native-select";
import { CountrySelect } from "@edge/ui/forms/phone-input";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveLeadAction } from "@/lib/actions/leads";

export interface LeadFormValues {
  id?: string;
  projectId: string;
  name: string;
  phone: string;
  email: string;
  country: string;
  source: string;
  sourceDetail: string;
  courseInterestId: string;
  batchInterestId: string;
  experienceLevel: string;
  temperature: string;
  preferredChannel: string;
  language: string;
  tags: string;
  notes: string;
  marketingConsent: boolean;
  whatsappConsent: boolean;
  nextFollowUpAt: string;
  ownerId: string;
}

export const EMPTY_LEAD: LeadFormValues = {
  projectId: "",
  name: "",
  phone: "",
  email: "",
  country: "",
  source: "INSTAGRAM",
  sourceDetail: "",
  courseInterestId: "",
  batchInterestId: "",
  experienceLevel: "",
  temperature: "WARM",
  preferredChannel: "WHATSAPP",
  language: "",
  tags: "",
  notes: "",
  marketingConsent: false,
  whatsappConsent: true,
  nextFollowUpAt: "",
  ownerId: "",
};

/** The submitted values after a failed save (React resets the form after every action). */
function restore(values: LeadFormValues, s?: Record<string, string>): LeadFormValues {
  if (!s) return values;
  return { ...values, ...s, marketingConsent: s.marketingConsent === "on", whatsappConsent: s.whatsappConsent === "on" };
}

function Select({
  id,
  name,
  value,
  children,
  error,
}: {
  id: string;
  name: string;
  value: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <>
      <NativeSelect id={id} name={name} defaultValue={value} aria-invalid={!!error || undefined}>
        {children}
      </NativeSelect>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </>
  );
}

/** A titled block of the form: a card on the page, a plain section inside the edit dialog. Each is its own size container. */
function Section({ title, dialog, className, children }: { title: string; dialog: boolean; className?: string; children: ReactNode }) {
  if (dialog)
    return (
      <section className={`@container grid content-start gap-4 ${className ?? ""}`}>
        <h3 className="text-muted-foreground border-b pb-2 text-xs font-bold tracking-[0.12em] uppercase">{title}</h3>
        {children}
      </section>
    );
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="@container grid gap-4">{children}</CardContent>
    </Card>
  );
}

/** Two fields side by side once their section is wide enough (a container query, so it works in the page and the dialog). */
const pair = "grid items-start gap-4 @sm:grid-cols-2";

export function LeadForm({
  values,
  options,
  meId,
  projectName,
  variant = "page",
  onSaved,
}: {
  values: LeadFormValues;
  options: CrmOptions;
  meId: string;
  projectName?: string;
  /** "dialog": plain sections, a scrolling body and a pinned Cancel / Save footer (the lead page's Edit dialog). */
  variant?: "page" | "dialog";
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(saveLeadAction, {} as ActionState);
  useEffect(() => {
    if (!state.ok) return;
    toast.success(state.message ?? "Saved");
    onSaved?.();
  }, [state, onSaved]);
  const dialog = variant === "dialog";
  const fe = state.fieldErrors ?? {};
  const v = restore(values, state.values);
  const creating = !values.id;
  const [projectId, setProjectId] = useState(v.projectId || options.projects.find((p) => p.isDefault)?.id || options.projects[0]?.id || "");
  const [courseId, setCourseId] = useState(v.courseInterestId);
  const project = options.projects.find((p) => p.id === projectId);
  const team = options.teams[projectId] ?? [];
  const batches = courseId ? options.batches.filter((b) => b.courseId === courseId) : options.batches;
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className={dialog ? dialogLayout.form : "grid gap-4"}>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {!creating ? <input type="hidden" name="projectId" value={values.projectId} /> : null}
      <div className={dialog ? `${dialogLayout.body} @container` : "@container grid gap-4"}>
        <FormError state={state} />
        <div className={`grid items-start gap-6 @3xl:grid-cols-2 ${dialog ? "" : "@3xl:gap-4"}`}>
          <Section title="Contact" dialog={dialog}>
            <Field label="Name" name="name" defaultValue={v.name} error={fe.name} required />
            {/* The phone gets its own row: the country picker plus a usable number box need ~16rem. */}
            <Field label="Mobile (WhatsApp)" name="phone" type="tel" defaultValue={v.phone} error={fe.phone} />
            <Field label="Email" name="email" type="email" defaultValue={v.email} error={fe.email} />
            <div className={pair}>
              <Field label="Country" name="country" error={fe.country}>
                <CountrySelect
                  id="country"
                  name="country"
                  defaultValue={v.country}
                  emptyLabel="Detect from mobile"
                  aria-invalid={!!fe.country || undefined}
                />
              </Field>
              <div className="grid content-start gap-2">
                <Label htmlFor="preferredChannel">Preferred channel</Label>
                <Select id="preferredChannel" name="preferredChannel" value={v.preferredChannel} error={fe.preferredChannel}>
                  <option value="">Not set</option>
                  {LEAD_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {LEAD_CHANNEL_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Field label="Language" name="language" defaultValue={v.language} error={fe.language} placeholder="English, Arabic, Hindi…" />
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="whatsappConsent" defaultChecked={v.whatsappConsent} /> OK to message on WhatsApp
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="marketingConsent" defaultChecked={v.marketingConsent} /> Agreed to marketing emails (MailerLite)
              </label>
              {creating ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="allowDuplicate" /> Create even if a lead with this contact already exists
                </label>
              ) : null}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={dialog ? 4 : 5} defaultValue={v.notes} />
              {fe.notes ? <p className="text-destructive text-xs">{fe.notes}</p> : null}
            </div>
          </Section>
          <Section title="Sales" dialog={dialog} className="h-fit">
            <div className="grid content-start gap-2">
              <Label htmlFor="projectId">Project</Label>
              {creating ? (
                <NativeSelect id="projectId" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                  {options.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <p className="text-sm font-medium">{projectName ?? "—"}</p>
              )}
              {fe.projectId ? <p className="text-destructive text-xs">{fe.projectId}</p> : null}
            </div>
            <div className={pair}>
              <div className="grid content-start gap-2">
                <Label htmlFor="source">Source</Label>
                <Select id="source" name="source" value={v.source} error={fe.source}>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <Field
                label="Source detail"
                name="sourceDetail"
                defaultValue={v.sourceDetail}
                error={fe.sourceDetail}
                placeholder="Campaign, post, referrer…"
              />
            </div>
            <div className={pair}>
              <div className="grid content-start gap-2">
                <Label htmlFor="courseInterestId">Course of interest</Label>
                <NativeSelect id="courseInterestId" name="courseInterestId" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  <option value="">Not set</option>
                  {options.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="batchInterestId">Batch of interest</Label>
                <Select id="batchInterestId" name="batchInterestId" value={v.batchInterestId} error={fe.batchInterestId}>
                  <option value="">Not set</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className={pair}>
              <div className="grid content-start gap-2">
                <Label htmlFor="experienceLevel">Trading experience</Label>
                <Select id="experienceLevel" name="experienceLevel" value={v.experienceLevel} error={fe.experienceLevel}>
                  <option value="">Unknown</option>
                  {EXPERIENCE_LEVELS.map((x) => (
                    <option key={x} value={x}>
                      {EXPERIENCE_LABELS[x]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="temperature">Temperature</Label>
                <Select id="temperature" name="temperature" value={v.temperature} error={fe.temperature}>
                  {LEAD_TEMPERATURES.map((t) => (
                    <option key={t} value={t}>
                      {LEAD_TEMPERATURE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {creating && project?.canAssign && team.length > 1 ? (
              <div className="grid content-start gap-2">
                <Label htmlFor="ownerId">Owner</Label>
                <Select id="ownerId" name="ownerId" value={v.ownerId || (team.some((t) => t.id === meId) ? meId : "")} error={fe.ownerId}>
                  <option value="">Unassigned (pool)</option>
                  {team.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.available === false ? " (Off)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <Field label="Tags" name="tags" defaultValue={v.tags} error={fe.tags} hint="Comma separated, e.g. webinar-oct, vip" />
            {creating ? (
              <Field
                label="First follow-up (optional)"
                name="nextFollowUpAt"
                type="datetime-local"
                defaultValue={v.nextFollowUpAt}
                error={fe.nextFollowUpAt}
              />
            ) : null}
          </Section>
        </div>
      </div>
      {dialog ? (
        <DialogFooter className={dialogLayout.footer}>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save lead"}
          </Button>
        </DialogFooter>
      ) : (
        <Button type="submit" size="lg" className="w-fit" disabled={pending}>
          {pending ? "Saving…" : creating ? "Create lead" : "Save lead"}
        </Button>
      )}
    </form>
  );
}

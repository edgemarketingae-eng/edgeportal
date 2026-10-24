"use client";

import type { CrmOptions } from "@edge/contracts";
import { EXPERIENCE_LEVELS, LEAD_CHANNELS, LEAD_SOURCES, LEAD_TEMPERATURES } from "@edge/domain/crm/enums";
import { EXPERIENCE_LABELS, LEAD_CHANNEL_LABELS, LEAD_SOURCE_LABELS, LEAD_TEMPERATURE_LABELS } from "@edge/domain/crm/labels";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { NativeSelect } from "@edge/ui/components/native-select";
import { CountrySelect } from "@edge/ui/forms/phone-input";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect, useState } from "react";
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

export function LeadForm({
  values,
  options,
  meId,
  projectName,
}: {
  values: LeadFormValues;
  options: CrmOptions;
  meId: string;
  projectName?: string;
}) {
  const [state, action, pending] = useActionState(saveLeadAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
  }, [state]);
  const fe = state.fieldErrors ?? {};
  const v = restore(values, state.values);
  const creating = !values.id;
  const [projectId, setProjectId] = useState(v.projectId || options.projects.find((p) => p.isDefault)?.id || options.projects[0]?.id || "");
  const [courseId, setCourseId] = useState(v.courseInterestId);
  const project = options.projects.find((p) => p.id === projectId);
  const team = options.teams[projectId] ?? [];
  const batches = courseId ? options.batches.filter((b) => b.courseId === courseId) : options.batches;
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {!creating ? <input type="hidden" name="projectId" value={values.projectId} /> : null}
      <FormError state={state} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Name" name="name" defaultValue={v.name} error={fe.name} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile (WhatsApp)" name="phone" type="tel" defaultValue={v.phone} error={fe.phone} />
              <Field label="Email" name="email" type="email" defaultValue={v.email} error={fe.email} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Country" name="country" error={fe.country} hint="Detect uses the mobile number">
                <CountrySelect
                  id="country"
                  name="country"
                  defaultValue={v.country}
                  emptyLabel="Detect from mobile"
                  aria-invalid={!!fe.country || undefined}
                />
              </Field>
              <Field label="Language" name="language" defaultValue={v.language} error={fe.language} placeholder="English, Arabic, Hindi…" />
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
              <Textarea id="notes" name="notes" rows={5} defaultValue={v.notes} />
              {fe.notes ? <p className="text-destructive text-xs">{fe.notes}</p> : null}
            </div>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Sales</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
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
            <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="grid gap-4 sm:grid-cols-2">
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
          </CardContent>
        </Card>
      </div>
      <Button type="submit" size="lg" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : creating ? "Create lead" : "Save lead"}
      </Button>
    </form>
  );
}

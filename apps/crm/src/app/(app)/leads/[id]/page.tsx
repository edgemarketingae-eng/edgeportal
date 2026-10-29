import { countryName } from "@edge/domain/countries";
import { crmRoutes } from "@edge/contracts";
import { fractionToPercent } from "@edge/domain/crm/commission";
import type { DepositSequence } from "@edge/domain/crm/enums";
import {
  DEPOSIT_SEQUENCE_LABELS,
  EXPERIENCE_LABELS,
  FOLLOWUP_TYPE_LABELS,
  LANGUAGE_LABELS,
  LEAD_CHANNEL_LABELS,
  LEAD_SOURCE_LABELS,
  QUALIFICATION_QUESTIONS,
  TASK_STATUS_LABELS,
} from "@edge/domain/crm/labels";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import {
  DepositStatusBadge,
  EnrollmentBadge,
  LeadStageBadge,
  PaymentStateBadge,
  ProductBadge,
  TemperatureBadge,
} from "@edge/ui/blocks/status-badges";
import { Badge } from "@edge/ui/components/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { Button } from "@edge/ui/components/button";
import Link from "next/link";
import { ActivityComposer } from "@/components/crm/activity-composer";
import { describeActivity } from "@/components/crm/activity-text";
import { MarkConversionDialog, RemoveConversionDialog } from "@/components/crm/conversion-actions";
import { DeleteDepositButton, LogDepositDialog, RejectDepositDialog, VerifyDepositDialog } from "@/components/crm/deposit-actions";
import { FollowUpDue, TimeAgo } from "@/components/crm/due";
import { LeadControls } from "@/components/crm/lead-controls";
import { EditLeadDialog } from "@/components/crm/edit-lead-dialog";
import { QualificationForm } from "@/components/crm/qualification-form";
import { AddTaskDialog, CancelTaskButton, CompleteTaskDialog, RescheduleTaskDialog } from "@/components/crm/task-actions";
import { can, CONSOLE_URL, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Lead" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export default async function LeadDetailPage(props: PageProps<"/leads/[id]">) {
  const v = await requireCrm("crm.read");
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const activityWindow = Math.min(1000, Math.max(50, Number(sp.activity) || 50));
  const {
    lead: l,
    activities,
    activityTotal,
    tasks,
    student,
    matchingStudent,
    duplicates,
    conversions,
    deposits,
    can: leadCan,
    options,
  } = await load(() => api(crmRoutes.lead, { params: { id }, query: { activity: activityWindow } }));
  const canWrite = can(v, "crm.write");
  const isAdmin = can(v, "admin.access");
  const open = tasks.filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS" || t.status === "WAITING");
  const closed = tasks.filter((t) => !open.includes(t));
  const editable = canWrite && !l.mergedIntoId;
  const converted = new Set(conversions.map((c) => c.product.id));
  const markable = options.products.filter((p) => !converted.has(p.id));
  const live = deposits.filter((d) => d.status !== "REJECTED");
  const nextSequence: DepositSequence = live.some((d) => d.sequence === "FIRST") ? "LATER" : "FIRST";
  const verifiedMinor = deposits.filter((d) => d.status === "VERIFIED").reduce((n, d) => n + d.amountMinor, 0);
  const answered = Object.values(l.qualification).some(Boolean);
  const utm = [l.utm.source, l.utm.medium, l.utm.campaign, l.utm.content, l.utm.term].filter(Boolean).join(" / ");

  return (
    <>
      <PageHeader
        help="/docs/working-a-lead"
        title={l.name}
        description={
          <>
            {l.phone ?? "no mobile"} · {l.email ?? "no email"} · {LEAD_SOURCE_LABELS[l.source]}
            {l.sourceDetail ? ` (${l.sourceDetail})` : ""} ·{" "}
            <Link href={`/projects/${l.project.id}`} className="hover:underline">
              {l.project.name}
            </Link>{" "}
            · {l.owner ? `Owner ${l.owner.name}` : "Unassigned"}
          </>
        }
        actions={
          <LeadControls
            lead={{
              id: l.id,
              name: l.name,
              phone: l.phone,
              email: l.email,
              stage: l.stage,
              ownerId: l.ownerId,
              studentId: l.studentId,
              mergedIntoId: l.mergedIntoId,
              project: l.project,
            }}
            options={options}
            matchingStudent={matchingStudent}
            duplicates={duplicates}
            can={{
              write: canWrite,
              assign: canWrite && leadCan.assign,
              claim: leadCan.claim,
              moveProject: canWrite && leadCan.moveProject,
              convert: can(v, "crm.convert"),
              manage: can(v, "crm.manage"),
              delete: leadCan.delete,
            }}
          />
        }
      />
      {sp.created ? (
        <p className="border-edge-emerald/30 bg-edge-mint/40 text-edge-emerald mb-4 rounded-md border px-3 py-2 text-sm">Lead created.</p>
      ) : null}
      {l.mergedIntoId ? (
        <p className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm">
          This lead was merged into{" "}
          <Link href={`/leads/${l.mergedIntoId}`} className="font-semibold underline">
            another lead
          </Link>
          .
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            {canWrite && !l.mergedIntoId ? (
              <CardAction>
                <EditLeadDialog
                  values={{
                    id: l.id,
                    projectId: l.project.id,
                    name: l.name,
                    phone: l.phone ?? "",
                    email: l.email ?? "",
                    country: l.country ?? "",
                    source: l.source,
                    sourceDetail: l.sourceDetail ?? "",
                    courseInterestId: l.courseInterestId ?? "",
                    batchInterestId: l.batchInterestId ?? "",
                    experienceLevel: l.experienceLevel ?? "",
                    temperature: l.temperature,
                    preferredChannel: l.preferredChannel ?? "",
                    language: l.language ?? "",
                    jetaFxClientId: l.jetaFxClientId ?? "",
                    qualificationExperience: l.qualification.experience ?? "",
                    qualificationOccupation: l.qualification.occupation ?? "",
                    qualificationPurpose: l.qualification.purpose ?? "",
                    tags: l.tags.join(", "),
                    notes: l.notes ?? "",
                    marketingConsent: l.consent.marketing,
                    whatsappConsent: l.consent.whatsapp,
                    nextFollowUpAt: "",
                    ownerId: l.ownerId ?? "",
                  }}
                  options={options}
                  meId={v.user.id}
                  projectName={l.project.name}
                />
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Row label="Stage">
                <span className="flex flex-wrap gap-1.5">
                  <LeadStageBadge stage={l.stage} />
                  {l.stage !== "CONVERTED" && l.stage !== "LOST" ? <TemperatureBadge temperature={l.temperature} /> : null}
                  {l.products.map((p) => (
                    <ProductBadge key={p.id} name={p.name} />
                  ))}
                </span>
                {l.lostReason ? <span className="text-muted-foreground block text-xs">Reason: {l.lostReason}</span> : null}
              </Row>
              <Row label="Next follow-up">
                {l.nextFollowUpAt ? (
                  <FollowUpDue at={l.nextFollowUpAt} />
                ) : (
                  <span className="text-muted-foreground font-normal">None scheduled</span>
                )}
              </Row>
              <Row label="Course / batch of interest">
                {l.courseTitle ?? <span className="text-muted-foreground font-normal">Not set</span>}
                {l.batchName ? <span className="text-muted-foreground font-normal"> · {l.batchName}</span> : null}
              </Row>
              <Row label="Trading experience">
                {l.experienceLevel ? (
                  EXPERIENCE_LABELS[l.experienceLevel]
                ) : (
                  <span className="text-muted-foreground font-normal">Unknown</span>
                )}
              </Row>
              <Row label="Preferred channel / language">
                {l.preferredChannel ? LEAD_CHANNEL_LABELS[l.preferredChannel] : "–"}
                {l.language ? ` · ${LANGUAGE_LABELS[l.language]}` : ""}
                {l.country ? ` · ${countryName(l.country)}` : ""}
              </Row>
              <Row label="JetaFX client ID">{l.jetaFxClientId ?? <span className="text-muted-foreground font-normal">Not set</span>}</Row>
              <Row label="Consent">
                {l.consent.whatsapp ? "WhatsApp OK" : "No WhatsApp consent"} ·{" "}
                {l.consent.marketing ? `Marketing (${l.consent.marketingAt ? formatDate(l.consent.marketingAt) : "yes"})` : "No marketing"}
              </Row>
              <Row label="First contact / last contact">
                {l.firstContactedAt ? (
                  formatDateTime(l.firstContactedAt)
                ) : (
                  <span className="text-muted-foreground font-normal">Not yet</span>
                )}
                {l.lastContactedAt ? (
                  <span className="text-muted-foreground font-normal"> · last {formatDateTime(l.lastContactedAt)}</span>
                ) : null}
              </Row>
              <Row label="Created">
                {formatDateTime(l.createdAt)}
                {utm ? <span className="text-muted-foreground block text-xs">UTM: {utm}</span> : null}
              </Row>
              {l.tags.length ? (
                <Row label="Tags">
                  <span className="flex flex-wrap gap-1">
                    {l.tags.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </span>
                </Row>
              ) : null}
              {l.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-wrap">{l.notes}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <div className="grid h-fit gap-4">
          {student ? (
            <Card>
              <CardHeader>
                <CardTitle>Student account</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {isAdmin ? (
                  <a href={`${CONSOLE_URL()}/admin/students/${student.id}`} className="text-edge-emerald font-semibold hover:underline">
                    {student.name}
                  </a>
                ) : (
                  <span className="font-semibold">{student.name}</span>
                )}
                <span className="text-muted-foreground">{student.email}</span>
                {student.enrollment ? (
                  <span className="flex flex-wrap gap-1.5">
                    <EnrollmentBadge status={student.enrollment.status} />
                    <PaymentStateBadge state={student.enrollment.paymentState} />
                    <span className="text-muted-foreground">{student.enrollment.batchName}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not in a batch yet.</span>
                )}
                {l.convertedAt ? <span className="text-muted-foreground text-xs">Converted {formatDateTime(l.convertedAt)}</span> : null}
              </CardContent>
            </Card>
          ) : matchingStudent ? (
            <Card className="border-amber-400/60">
              <CardHeader>
                <CardTitle>Already a student?</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <span className="font-semibold">{matchingStudent.name}</span> has a portal account with this mobile or email. Use “Link to
                student” above.
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Tasks</CardTitle>
              {canWrite && !l.mergedIntoId ? (
                <AddTaskDialog leadId={l.id} projectId={l.project.id} options={options} meId={v.user.id} label="Follow-up" />
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {open.length === 0 ? <p className="text-muted-foreground">No open tasks.</p> : null}
              {open.map((t) => (
                <div key={t.id} className="rounded-lg border p-3">
                  <p className="font-medium">
                    <Link href={`/tasks/${t.id}`} className="hover:underline">
                      {t.title}
                    </Link>
                    <span className="text-muted-foreground font-normal"> · {FOLLOWUP_TYPE_LABELS[t.type]}</span>
                  </p>
                  <p className="text-xs">
                    {t.dueAt ? <FollowUpDue at={t.dueAt} /> : <span className="text-muted-foreground">no due date</span>}
                    <span className="text-muted-foreground"> · {TASK_STATUS_LABELS[t.status]}</span>
                    {t.assignee ? <span className="text-muted-foreground"> · {t.assignee.name}</span> : null}
                  </p>
                  {t.description ? <p className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">{t.description}</p> : null}
                  {canWrite ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <CompleteTaskDialog taskId={t.id} type={t.type} title={t.title} lead />
                      <RescheduleTaskDialog taskId={t.id} dueAt={t.dueAt} />
                      <CancelTaskButton taskId={t.id} />
                    </div>
                  ) : null}
                </div>
              ))}
              {closed.length ? (
                <details>
                  <summary className="text-muted-foreground cursor-pointer text-xs">{closed.length} closed</summary>
                  <ul className="text-muted-foreground mt-2 grid gap-1 text-xs">
                    {closed.map((t) => (
                      <li key={t.id}>
                        {t.status === "DONE" ? "✓" : "✕"} {t.title} · {t.completedAt ? formatDateTime(t.completedAt) : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </CardContent>
          </Card>

          {options.products.length || conversions.length ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Conversions</CardTitle>
                {editable && markable.length ? <MarkConversionDialog leadId={l.id} products={markable} /> : null}
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {conversions.length === 0 ? <p className="text-muted-foreground">Not converted to any product yet.</p> : null}
                {conversions.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {c.product.name}
                        {c.source === "STUDENT" ? <span className="text-muted-foreground font-normal"> · as a student</span> : null}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(c.convertedAt)} · counts for {c.creditedTo?.name ?? "nobody"}
                        {c.convertedBy && c.convertedBy.id !== c.creditedTo?.id ? ` · marked by ${c.convertedBy.name}` : ""}
                      </p>
                      {c.note ? <p className="text-muted-foreground text-xs whitespace-pre-wrap">{c.note}</p> : null}
                    </div>
                    {leadCan.removeConversion ? <RemoveConversionDialog id={c.id} product={c.product.name} /> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {editable || deposits.length ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Deposits</CardTitle>
                {editable ? <LogDepositDialog leadId={l.id} nextSequence={nextSequence} clientId={l.jetaFxClientId} /> : null}
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {deposits.length === 0 ? <p className="text-muted-foreground">No JetaFX deposits logged.</p> : null}
                {deposits.map((d) => (
                  <div key={d.id} className="rounded-lg border p-3">
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {formatMoney(d.amountMinor, d.currency)}
                        <span className="text-muted-foreground font-normal"> · {DEPOSIT_SEQUENCE_LABELS[d.sequence]}</span>
                      </span>
                      <DepositStatusBadge status={d.status} />
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(d.depositedAt)} · counts for {d.creditedTo?.name ?? "Unknown"}
                      {d.reference ? ` · ref ${d.reference}` : ""}
                    </p>
                    {d.commissionMinor != null ? (
                      <p className="text-xs">
                        Commission {formatMoney(d.commissionMinor, d.currency)}
                        {d.commissionPct ? <span className="text-muted-foreground"> ({fractionToPercent(d.commissionPct)}%)</span> : null}
                      </p>
                    ) : null}
                    {d.status === "REJECTED" && d.rejectReason ? (
                      <p className="text-destructive text-xs">Rejected: {d.rejectReason}</p>
                    ) : null}
                    {d.note ? <p className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">{d.note}</p> : null}
                    {(leadCan.reviewDeposits && d.status !== "REJECTED") || d.canDelete ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {leadCan.reviewDeposits && d.status === "PENDING" ? (
                          <VerifyDepositDialog
                            id={d.id}
                            leadName={l.name}
                            amountMinor={d.amountMinor}
                            sequence={d.sequence}
                            depositedAt={d.depositedAt}
                            clientId={d.jetaFxClientId}
                          />
                        ) : null}
                        {leadCan.reviewDeposits && d.status !== "REJECTED" ? (
                          <RejectDepositDialog id={d.id} verified={d.status === "VERIFIED"} />
                        ) : null}
                        {d.canDelete ? <DeleteDepositButton id={d.id} /> : null}
                      </div>
                    ) : null}
                  </div>
                ))}
                {verifiedMinor ? (
                  <p className="text-muted-foreground text-xs">Verified total: {formatMoney(verifiedMinor, "USD")}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {duplicates.length ? (
            <Card className="border-amber-400/60">
              <CardHeader>
                <CardTitle>Possible duplicates</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                {duplicates.map((d) => (
                  <Link key={d.id} href={`/leads/${d.id}`} className="text-edge-emerald hover:underline">
                    {d.name} <span className="text-muted-foreground">· {d.phone ?? d.email}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Qualification</CardTitle>
        </CardHeader>
        <CardContent>
          {editable ? (
            <QualificationForm leadId={l.id} answers={l.qualification} />
          ) : answered ? (
            <dl className="grid gap-4 text-sm md:grid-cols-3">
              {(Object.keys(QUALIFICATION_QUESTIONS) as (keyof typeof QUALIFICATION_QUESTIONS)[]).map((k) => (
                <div key={k}>
                  <dt className="text-muted-foreground">{QUALIFICATION_QUESTIONS[k]}</dt>
                  <dd className="whitespace-pre-wrap">{l.qualification[k] ?? "–"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">Not asked yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          {editable ? <ActivityComposer leadId={l.id} /> : null}
          {activities.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity yet.</p>
          ) : (
            <ol className="grid gap-3 border-l pl-4 text-sm">
              {activities.map((a) => {
                const { title, detail } = describeActivity(a);
                const touch = [
                  "NOTE",
                  "CALL",
                  "WHATSAPP",
                  "EMAIL",
                  "MEETING",
                  "INBOUND",
                  "TASK_DONE",
                  "PRODUCT_CONVERTED",
                  "DEPOSIT_LOGGED",
                  "DEPOSIT_VERIFIED",
                ].includes(a.type);
                return (
                  <li key={a.id} className="relative">
                    <span
                      className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full ${touch ? "bg-edge-emerald" : "bg-muted-foreground/40"}`}
                    />
                    <p className="font-medium">{title}</p>
                    {a.body ? <p className="mt-0.5 whitespace-pre-wrap">{a.body}</p> : null}
                    {detail ? <p className="text-muted-foreground text-xs">{detail}</p> : null}
                    <p className="text-muted-foreground text-xs">
                      <TimeAgo at={a.createdAt} /> ·{" "}
                      {a.actorType === "USER" ? (a.actorName ?? "Staff") : a.actorType === "WEBHOOK" ? "Website" : "System"}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
          {activityTotal > activities.length ? (
            <div className="flex items-center gap-3 text-sm">
              <Button asChild variant="outline" size="sm">
                <Link href={`/leads/${l.id}?activity=${activityWindow + 50}`} scroll={false}>
                  Show older activity
                </Link>
              </Button>
              <span className="text-muted-foreground">
                Showing {activities.length} of {activityTotal}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

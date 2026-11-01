import { ApiError, crmRoutes, type CrmOptions, type LeadDto, type LeadUpdateInput } from "@edge/contracts";
import { COUNTRIES } from "@edge/domain/countries";
import { EXPERIENCE_LEVELS, LEAD_CHANNELS, LEAD_LANGUAGES, LEAD_SOURCES, LEAD_TEMPERATURES } from "@edge/domain/crm/enums";
import {
  EXPERIENCE_LABELS,
  LANGUAGE_LABELS,
  LEAD_CHANNEL_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_TEMPERATURE_LABELS,
  QUALIFICATION_QUESTIONS,
} from "@edge/domain/crm/labels";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { Button, EmptyState, Field, Notice, SelectField, Segmented, Sheet, SkeletonRows, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useLead, useSaved } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

const choices = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

const SOURCES = choices(LEAD_SOURCES, LEAD_SOURCE_LABELS);
const CHANNELS = choices(LEAD_CHANNELS, LEAD_CHANNEL_LABELS);
const LANGUAGES = choices(LEAD_LANGUAGES, LANGUAGE_LABELS);
const LEVELS = choices(EXPERIENCE_LEVELS, EXPERIENCE_LABELS);
const TEMPERATURES = choices(LEAD_TEMPERATURES, LEAD_TEMPERATURE_LABELS);
const COUNTRY_CHOICES = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));

function Heading({ children }: { children: string }) {
  return (
    <Text variant="overline" style={styles.heading}>
      {children}
    </Text>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={styles.toggle}>
      <Text variant="label" style={{ flex: 1 }}>
        {label}
      </Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: t.primary, false: t.border }}
        thumbColor={t.card}
      />
    </View>
  );
}

function Form({ lead, options }: { lead: LeadDto; options: CrmOptions }) {
  const saved = useSaved();
  const [v, setV] = useState({
    name: lead.name,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    country: lead.country ?? "",
    preferredChannel: lead.preferredChannel ?? "",
    language: lead.language ?? "",
    whatsappConsent: lead.consent.whatsapp,
    marketingConsent: lead.consent.marketing,
    notes: lead.notes ?? "",
    source: lead.source,
    sourceDetail: lead.sourceDetail ?? "",
    courseInterestId: lead.courseInterestId ?? "",
    batchInterestId: lead.batchInterestId ?? "",
    experienceLevel: lead.experienceLevel ?? "",
    temperature: lead.temperature,
    jetaFxClientId: lead.jetaFxClientId ?? "",
    tags: lead.tags.join(", "),
    experience: lead.qualification.experience ?? "",
    occupation: lead.qualification.occupation ?? "",
    purpose: lead.qualification.purpose ?? "",
  });
  const set =
    <K extends keyof typeof v>(key: K) =>
    (value: (typeof v)[K]) =>
      setV((now) => ({ ...now, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const { experience, occupation, purpose, ...fields } = v;
      return api(crmRoutes.update, {
        params: { id: lead.id },
        body: { ...fields, qualification: { experience, occupation, purpose } } as LeadUpdateInput,
      });
    },
    onSuccess: () => saved("Lead saved"),
  });
  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : undefined;
  const batches = options.batches.filter((b) => !v.courseInterestId || b.courseId === v.courseInterestId);

  return (
    <Sheet
      actions={
        <Button label="Save" style={{ flex: 1 }} onPress={() => save.mutate()} busy={save.isPending} disabled={v.name.trim().length < 2} />
      }
    >
      <Text variant="title">Edit lead</Text>

      <Heading>Contact</Heading>
      <Field label="Name" value={v.name} onChangeText={set("name")} autoCapitalize="words" error={fieldErrors?.name} />
      <Field
        label="Mobile, with country code"
        value={v.phone}
        onChangeText={set("phone")}
        keyboardType="phone-pad"
        error={fieldErrors?.phone}
      />
      <Field
        label="Email"
        value={v.email}
        onChangeText={set("email")}
        keyboardType="email-address"
        autoCapitalize="none"
        error={fieldErrors?.email}
      />
      <SelectField label="Country" value={v.country} options={COUNTRY_CHOICES} onChange={set("country")} blank="Not set" />
      <SelectField
        label="Preferred channel"
        value={v.preferredChannel}
        options={CHANNELS}
        onChange={set("preferredChannel")}
        blank="Not set"
      />
      <SelectField label="Language" value={v.language} options={LANGUAGES} onChange={set("language")} blank="Not set" />
      <Toggle label="OK to contact on WhatsApp" value={v.whatsappConsent} onChange={set("whatsappConsent")} />
      <Toggle label="OK to send marketing" value={v.marketingConsent} onChange={set("marketingConsent")} />
      <Field label="Notes" value={v.notes} onChangeText={set("notes")} multiline style={styles.multiline} />

      <Heading>Sales</Heading>
      <View style={{ gap: 6 }}>
        <Text variant="label">Temperature</Text>
        <Segmented options={TEMPERATURES} value={v.temperature} onChange={set("temperature")} />
      </View>
      <SelectField label="Source" value={v.source} options={SOURCES} onChange={(s) => set("source")(s as typeof v.source)} />
      <Field label="Source detail" value={v.sourceDetail} onChangeText={set("sourceDetail")} />
      <SelectField
        label="Course of interest"
        value={v.courseInterestId}
        options={options.courses.map((c) => ({ value: c.id, label: c.title }))}
        onChange={(courseInterestId) => setV((now) => ({ ...now, courseInterestId, batchInterestId: "" }))}
        blank="Not set"
      />
      <SelectField
        label="Batch of interest"
        value={v.batchInterestId}
        options={batches.map((b) => ({ value: b.id, label: b.label }))}
        onChange={set("batchInterestId")}
        blank="Not set"
      />
      <SelectField
        label="Trading experience"
        value={v.experienceLevel}
        options={LEVELS}
        onChange={set("experienceLevel")}
        blank="Unknown"
      />
      <Field label="JetaFX client ID" value={v.jetaFxClientId} onChangeText={set("jetaFxClientId")} error={fieldErrors?.jetaFxClientId} />
      <Field label="Tags, separated by commas" value={v.tags} onChangeText={set("tags")} autoCapitalize="none" />

      <Heading>Qualification</Heading>
      <Field
        label={QUALIFICATION_QUESTIONS.experience}
        value={v.experience}
        onChangeText={set("experience")}
        multiline
        style={styles.multiline}
      />
      <Field
        label={QUALIFICATION_QUESTIONS.occupation}
        value={v.occupation}
        onChangeText={set("occupation")}
        multiline
        style={styles.multiline}
      />
      <Field label={QUALIFICATION_QUESTIONS.purpose} value={v.purpose} onChangeText={set("purpose")} multiline style={styles.multiline} />

      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}

export default function EditLead() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useLead(id);
  if (detail.data) return <Form lead={detail.data.lead} options={detail.data.options} />;
  if (detail.error) return <EmptyState icon="cloud-offline-outline" title="Couldn't load this lead" text={errorText(detail.error)} />;
  return (
    <View style={{ padding: 20 }}>
      <SkeletonRows count={5} />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: 10 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  multiline: { minHeight: 72, textAlignVertical: "top" },
});

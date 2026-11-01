import { crmRoutes } from "@edge/contracts";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Switch, View } from "react-native";
import { Button, Notice, SelectField, Sheet, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useLead, useSaved } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

/** Creates a real student account, or links an existing one when this person already has an account. */
export default function ConvertLead() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useLead(id);
  const saved = useSaved();
  const [batchId, setBatchId] = useState("");
  const [sendSetPassword, setSendSetPassword] = useState(true);
  const student = detail.data?.matchingStudent;

  const save = useMutation({
    mutationFn: () =>
      student
        ? api(crmRoutes.link, { params: { id }, body: { studentId: student.id } })
        : api(crmRoutes.convert, { params: { id }, body: { batchId: batchId || undefined, sendSetPassword } }),
    onSuccess: () => saved(student ? "Linked to student" : "Student account created"),
  });

  return (
    <Sheet
      actions={
        <Button
          label={student ? "Link" : "Create student account"}
          style={{ flex: 1 }}
          onPress={() => save.mutate()}
          busy={save.isPending}
          disabled={!detail.data}
        />
      }
    >
      <Text variant="title">{student ? "Link to student" : "Convert to student"}</Text>
      {student ? (
        <Text>
          {student.name} ({student.email}) already has a portal account with this mobile or email. Linking connects this lead to that
          account.
        </Text>
      ) : (
        <>
          <Text variant="caption">Creates the student portal account with this lead's name, email and mobile.</Text>
          <SelectField
            label="Enroll in batch"
            value={batchId}
            options={detail.data?.options.batches.map((b) => ({ value: b.id, label: b.label })) ?? []}
            onChange={setBatchId}
            blank="No batch yet"
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
            <Text variant="label" style={{ flex: 1 }}>
              Email the set-password link now
            </Text>
            <Switch
              accessibilityLabel="Email the set-password link now"
              value={sendSetPassword}
              onValueChange={setSendSetPassword}
              trackColor={{ true: t.primary, false: t.border }}
              thumbColor={t.card}
            />
          </View>
        </>
      )}
      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}

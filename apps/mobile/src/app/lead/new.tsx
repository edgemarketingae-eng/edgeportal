import { ApiError, crmRoutes } from "@edge/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, buzz, Chip, Field, Notice, Sheet, Text, Wrap } from "@/components/ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";

export default function NewLead() {
  const router = useRouter();
  const client = useQueryClient();
  const options = useQuery({ queryKey: ["options"], queryFn: () => api(crmRoutes.options) });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+");
  const [picked, setPicked] = useState<string | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const projects = options.data?.projects ?? [];
  const projectId = picked ?? projects.find((p) => p.isDefault)?.id ?? projects[0]?.id;

  const save = async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await api(crmRoutes.create, {
        body: { projectId, name: name.trim(), phone: phone.trim(), source: "PHONE_IN", allowDuplicate },
      });
      void client.invalidateQueries();
      buzz.success();
      toast("Lead added");
      router.replace(`/lead/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "INTERNAL", "No connection. Check your signal and try again."));
    } finally {
      setBusy(false);
    }
  };

  const duplicate = !!error?.fieldErrors?.phone?.startsWith("Already exists");

  return (
    <Sheet
      actions={
        <Button
          label="Save lead"
          style={{ flex: 1 }}
          onPress={() => void save()}
          busy={busy}
          disabled={!name.trim() || phone.trim().length < 6 || !projectId || (duplicate && !allowDuplicate)}
        />
      }
    >
      <Text variant="title">New lead</Text>
      <Field label="Name" value={name} onChangeText={setName} autoFocus autoCapitalize="words" error={error?.fieldErrors?.name} />
      <Field
        label="Mobile, with country code"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        error={error?.fieldErrors?.phone}
      />
      {projects.length > 1 ? (
        <View style={{ gap: 8 }}>
          <Text variant="label">Project</Text>
          <Wrap>
            {projects.map((p) => (
              <Chip key={p.id} label={p.name} selected={p.id === projectId} onPress={() => setPicked(p.id)} />
            ))}
          </Wrap>
        </View>
      ) : null}
      {error && !error.fieldErrors ? <Notice tone="danger" text={error.message} /> : null}
      {duplicate ? <Chip label="Add anyway" selected={allowDuplicate} onPress={() => setAllowDuplicate(!allowDuplicate)} /> : null}
    </Sheet>
  );
}

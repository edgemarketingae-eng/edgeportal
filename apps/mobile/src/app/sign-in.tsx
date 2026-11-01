import { ApiError, mobileRoutes, type MobileAuthResult } from "@edge/contracts";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import logo from "../../assets/logo.png";
import { Button, Field, Notice, PasswordField, Text } from "@/components/ui";
import { api, CRM_URL } from "@/lib/api";
import { useSession } from "@/lib/session";
import { INK_GLOW, OnDark, useTheme } from "@/lib/theme";

function device() {
  const c = Platform.constants as unknown as { Brand?: string; Model?: string; Release?: string };
  return {
    model: [c.Brand, c.Model].filter(Boolean).join(" ").slice(0, 80) || undefined,
    androidVersion: c.Release ? String(c.Release) : undefined,
    appVersion: Constants.expoConfig?.version,
  };
}

type Step = "password" | "totp" | "change" | "authenticator";

const HEADINGS: Record<Step, { title: string; text: string }> = {
  password: { title: "Welcome back", text: "Sign in with your CRM email and password." },
  totp: { title: "Enter your code", text: "It's in your authenticator app." },
  change: { title: "Choose a new password", text: "Yours is temporary, so pick one only you know." },
  authenticator: {
    title: "Set up your authenticator app",
    text: "Your account needs a code from an authenticator app. Set it up once in the CRM, then come back and sign in here.",
  },
};

function Form() {
  const t = useTheme();
  const { signIn } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = (result: MobileAuthResult) => {
    if (result.status === "ok") {
      signIn(result.token);
      router.replace("/setup");
    } else setStep(result.status === "totp_required" ? "totp" : "change");
  };

  const ready = email.trim() && password && (step !== "totp" || totp.trim()) && (step !== "change" || newPassword.length >= 8);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const credentials = { email: email.trim(), password, totp: totp.trim() || undefined, device: device() };
    try {
      handle(
        step === "change"
          ? await api(mobileRoutes.changePassword, { body: { ...credentials, newPassword } })
          : await api(mobileRoutes.signIn, { body: credentials }),
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === "TWO_FACTOR_REQUIRED") setStep("authenticator");
      else setError(e instanceof ApiError ? e.message : "No connection. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  };

  const backToStart = () => {
    setStep("password");
    setTotp("");
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: t.background }]} behavior="padding">
      <StatusBar style="light" />
      <View style={styles.glow} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={logo} resizeMode="contain" style={styles.logo} accessibilityLabel="Edge Trading Academy" />
        <Animated.View key={step} entering={FadeIn.duration(240)} style={{ gap: 18 }}>
          <View style={{ gap: 4 }}>
            <Text variant="display" style={step === "authenticator" ? { fontSize: 26, lineHeight: 32 } : undefined}>
              {HEADINGS[step].title}
            </Text>
            <Text tone="muted">{HEADINGS[step].text}</Text>
          </View>

          {step === "password" ? (
            <>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />
              <PasswordField
                label="Password"
                value={password}
                onChangeText={setPassword}
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />
            </>
          ) : null}
          {step === "totp" ? (
            <Field
              label="6-digit code"
              value={totp}
              onChangeText={setTotp}
              keyboardType="number-pad"
              autoFocus
              autoComplete="one-time-code"
            />
          ) : null}
          {step === "change" ? <PasswordField label="New password" value={newPassword} onChangeText={setNewPassword} autoFocus /> : null}

          {error ? <Notice tone="danger" text={error} /> : null}

          {step === "authenticator" ? (
            <Button label="Open CRM" icon="open-outline" onPress={() => void Linking.openURL(`${CRM_URL}/security?required=1`)} />
          ) : (
            <Button
              label={step === "change" ? "Save and continue" : step === "totp" ? "Verify" : "Sign in"}
              onPress={() => void submit()}
              busy={busy}
              disabled={!ready}
            />
          )}

          <Pressable
            accessibilityRole="link"
            onPress={step === "password" ? () => void Linking.openURL(`${CRM_URL}/forgot-password`) : backToStart}
            style={styles.link}
          >
            <Text variant="label" tone="muted">
              {step === "password" ? "Forgot password?" : "Back to sign in"}
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function SignIn() {
  return (
    <OnDark>
      <Form />
    </OnDark>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  glow: { ...StyleSheet.absoluteFill, experimental_backgroundImage: INK_GLOW },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 36 },
  logo: { width: 176, height: 52 },
  link: { alignSelf: "center", padding: 8 },
});

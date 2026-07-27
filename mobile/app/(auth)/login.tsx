import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { loginSchema, type LoginFormData } from "@/lib/validation";
import { useAuthStore } from "@/store/auth";
import { colors, spacing } from "@/theme/tokens";

const demoEmail = process.env.EXPO_PUBLIC_DEMO_EMAIL || "ops@example.com";
const demoPassword = process.env.EXPO_PUBLIC_DEMO_PASSWORD || "";

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: demoEmail, password: demoPassword }
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.email, data.password);
      router.replace("/");
    } catch (error) {
      setError("password", { message: error instanceof Error ? error.message : "Giriş yapılamadı" });
    }
  };

  return (
    <Screen scroll={false} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={styles.hero}>
          <View style={styles.logo}>
            <AppText variant="headlineMd" color={colors.surface}>
              UT
            </AppText>
          </View>
          <AppText variant="headlineLg">UETDS Mobile</AppText>
          <AppText variant="bodyLg" color={colors.textMuted}>
            Operasyon seferlerini hızlı ve kontrollü gönder.
          </AppText>
        </View>
        <Card>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <TextField label="E-posta" autoCapitalize="none" keyboardType="email-address" value={value} onChangeText={onChange} error={errors.email?.message} />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <TextField label="Şifre" secureTextEntry value={value} onChangeText={onChange} error={errors.password?.message} />
            )}
          />
          <Button label="Giriş Yap" icon="log-in" loading={isSubmitting} onPress={handleSubmit(onSubmit)} />
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: "center"
  },
  keyboard: {
    gap: spacing.lg
  },
  hero: {
    gap: spacing.sm
  },
  logo: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 64,
    justifyContent: "center",
    width: 64
  }
});

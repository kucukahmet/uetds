import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { colors, spacing } from "@/theme/tokens";

export function LoadingState({ label = "Yükleniyor" }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <AppText color={colors.textMuted}>{label}</AppText>
    </View>
  );
}

export function EmptyState({ title, message, actionLabel, onAction }: { title: string; message?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.center}>
      <AppText variant="titleLg">{title}</AppText>
      {message ? <AppText color={colors.textMuted}>{message}</AppText> : null}
      {actionLabel ? <Button label={actionLabel} onPress={onAction} variant="ghost" /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <AppText variant="titleLg" color={colors.error}>
        İşlem tamamlanamadı
      </AppText>
      <AppText color={colors.textMuted}>{message}</AppText>
      {onRetry ? <Button label="Tekrar Dene" onPress={onRetry} variant="ghost" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    padding: spacing.lg
  }
});

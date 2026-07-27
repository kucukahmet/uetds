import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/theme/tokens";
import type { TripStatus } from "@/types/api";

const statusMap: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Taslak", bg: colors.surfaceMuted, fg: colors.textMuted },
  ready: { label: "Gönderilmedi", bg: colors.warningSoft, fg: "#604100" },
  submitting: { label: "UETDS'ye Gidiyor", bg: colors.primary, fg: colors.surface },
  submitted: { label: "UETDS'de", bg: colors.secondarySoft, fg: colors.secondary },
  partial_failed: { label: "Kontrol Gerekli", bg: colors.errorSoft, fg: colors.error },
  failed: { label: "Gönderilemedi", bg: colors.errorSoft, fg: colors.error },
  cancel_requested: { label: "İptal Ediliyor", bg: colors.warningSoft, fg: "#604100" },
  cancelled: { label: "İptal Edildi", bg: colors.surfaceStrong, fg: colors.textMuted },
  active: { label: "Aktif", bg: colors.secondarySoft, fg: colors.secondary },
  passive: { label: "Pasif", bg: colors.surfaceStrong, fg: colors.textMuted },
  test: { label: "TEST", bg: "#EDE7F6", fg: colors.uetdsTest },
  live: { label: "GERÇEK", bg: colors.warningSoft, fg: "#604100" }
};

export function Badge({ status, label }: { status?: TripStatus | string; label?: string }) {
  const config = statusMap[status || "draft"] || statusMap.draft;
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <AppText variant="labelMd" color={config.fg} style={styles.text}>
        {label || config.label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  text: {
    fontWeight: "700"
  }
});

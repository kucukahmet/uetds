import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { getActiveCompany, useAuthStore } from "@/store/auth";
import { getActiveBackendProfile, useBackendStore } from "@/store/backend";
import { colors, radius, spacing } from "@/theme/tokens";

const toneStyle = {
  local: { bg: colors.surfaceMuted, fg: colors.textMuted },
  server: { bg: "#EDE7F6", fg: colors.uetdsTest },
};

export function BackendIndicator() {
  const activeKey = useBackendStore((state) => state.activeKey);
  const user = useAuthStore((state) => state.user);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const me = useQuery({ queryKey: queryKeys.me(), queryFn: endpoints.me, enabled: isAuthenticated, staleTime: 15_000 });
  const profile = getActiveBackendProfile(activeKey);
  const tone = toneStyle[profile.tone];
  const company = getActiveCompany(me.data || user, activeCompanyId);
  const uetdsEnvironment = company?.settings?.default_uetds_environment || "test";
  const uetdsTone = uetdsEnvironment === "live" ? { bg: colors.warningSoft, fg: "#604100" } : toneStyle.server;

  return (
    <View style={styles.row}>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <AppText variant="labelMd" color={tone.fg} style={styles.label}>
          {profile.shortLabel}
        </AppText>
      </View>
      <AppText variant="labelMd" color={colors.textSubtle} numberOfLines={1} style={styles.host}>
        {profile.host}
      </AppText>
      <View style={[styles.pill, { backgroundColor: uetdsTone.bg }]}>
        <AppText variant="labelMd" color={uetdsTone.fg} style={styles.label}>
          {uetdsEnvironment === "live" ? "UETDS GERCEK" : "UETDS TEST"}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    minHeight: 24,
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  label: {
    fontWeight: "700",
  },
  host: {
    flexShrink: 1,
    maxWidth: 180,
  },
});

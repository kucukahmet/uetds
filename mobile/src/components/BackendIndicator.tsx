import { useQuery } from "@tanstack/react-query";
import { StyleSheet, View } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { getActiveUetdsStatus, uetdsConnectionLabel } from "@/lib/uetdsStatus";
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
  const uetds = useQuery({ queryKey: queryKeys.uetdsStatus(), queryFn: endpoints.uetdsStatus, enabled: isAuthenticated && Boolean(activeCompanyId), staleTime: 15_000 });
  const profile = getActiveBackendProfile(activeKey);
  const tone = toneStyle[profile.tone];
  const company = getActiveCompany(me.data || user, activeCompanyId);
  const selectedStatus = getActiveUetdsStatus(uetds.data, company);
  const uetdsTone = connectionTone(selectedStatus?.severity);

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
          UETDS {uetdsConnectionLabel(selectedStatus).toLocaleUpperCase("tr-TR")}
        </AppText>
      </View>
    </View>
  );
}

function connectionTone(severity?: "success" | "warning" | "error") {
  if (severity === "success") {
    return { bg: colors.secondarySoft, fg: colors.secondary };
  }
  if (severity === "warning") {
    return { bg: colors.warningSoft, fg: "#604100" };
  }
  return { bg: colors.errorSoft, fg: colors.error };
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

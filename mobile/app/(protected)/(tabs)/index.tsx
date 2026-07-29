import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { EmptyState, LoadingState } from "@/components/StateViews";
import { formatDateTime } from "@/lib/format";
import { getActiveUetdsStatus, uetdsConnectionBadgeStatus, uetdsConnectionLabel, uetdsConnectionMessage } from "@/lib/uetdsStatus";
import { getActiveCompany, useAuthStore } from "@/store/auth";
import { colors, spacing } from "@/theme/tokens";
import type { UetdsStatus } from "@/types/api";

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const company = getActiveCompany(user, activeCompanyId);
  const trips = useQuery({ queryKey: queryKeys.trips("?ordering=-departure_at"), queryFn: () => endpoints.trips("?ordering=-departure_at") });
  const uetds = useQuery({ queryKey: queryKeys.uetdsStatus(), queryFn: endpoints.uetdsStatus });
  const recentTrips = trips.data?.results.slice(0, 3) ?? [];
  const selectedStatus = getActiveUetdsStatus(uetds.data, company);
  const selectedTone = statusTone(selectedStatus?.severity);

  return (
    <Screen refreshing={trips.isFetching || uetds.isFetching} onRefresh={() => void Promise.all([trips.refetch(), uetds.refetch()])}>
      <View style={styles.header}>
        <View>
          <AppText variant="headlineMd">Ana Sayfa</AppText>
          <AppText color={colors.textMuted}>{company?.name || "Firma seçilmedi"}</AppText>
        </View>
        <Badge status={uetdsConnectionBadgeStatus(selectedStatus)} label={uetdsConnectionLabel(selectedStatus)} />
      </View>

      <View style={styles.actions}>
        <Button label="Hızlı Sefer" icon="add-circle" onPress={() => router.push("/quick-trip")} />
        <Button label="Kayıtlar" icon="albums" variant="ghost" onPress={() => router.push("/records")} />
      </View>

      <View style={styles.grid}>
        <Card style={styles.stat}>
          <AppText variant="headlineMd">{trips.data?.count ?? 0}</AppText>
          <AppText color={colors.textMuted}>Sefer</AppText>
        </Card>
        <Card style={[styles.stat, selectedTone.card]}>
          <AppText variant="headlineMd" color={selectedTone.text}>
            {uetdsConnectionLabel(selectedStatus)}
          </AppText>
          <AppText color={colors.textMuted}>UETDS Bağlantısı</AppText>
          <AppText color={selectedTone.text}>{uetdsConnectionMessage(selectedStatus)}</AppText>
        </Card>
      </View>

      <AppText variant="titleLg">Son Seferler</AppText>
      {trips.isLoading ? <LoadingState /> : null}
      {!trips.isLoading && recentTrips.length === 0 ? <EmptyState title="Sefer yok" /> : null}
      {recentTrips.map((trip) => (
        <ListRow
          key={trip.id}
          title={`${trip.departure_city} -> ${trip.arrival_city}`}
          subtitle={`${trip.vehicle_detail?.plate || "Plaka yok"} - ${formatDateTime(trip.departure_at)}`}
          meta={<Badge status={trip.status} />}
          onPress={() => router.push(`/trips/${trip.id}`)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  grid: {
    flexDirection: "row",
    gap: spacing.sm
  },
  stat: {
    flex: 1
  },
  successCard: {
    backgroundColor: colors.secondarySoft,
    borderColor: colors.secondary
  },
  warningCard: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning
  },
  errorCard: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error
  }
});

function statusTone(severity?: UetdsStatus["test"]["severity"]) {
  if (severity === "success") {
    return { card: styles.successCard, text: colors.secondary };
  }
  if (severity === "warning") {
    return { card: styles.warningCard, text: colors.text };
  }
  return { card: styles.errorCard, text: colors.error };
}

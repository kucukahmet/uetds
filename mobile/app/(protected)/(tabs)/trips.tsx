import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { EmptyState, LoadingState } from "@/components/StateViews";
import { formatDateTime } from "@/lib/format";
import { colors, radius, spacing } from "@/theme/tokens";

const filters = [
  { label: "Tümü", query: "?time_scope=upcoming" },
  { label: "Gönderilmedi", query: "?status=ready&time_scope=upcoming" },
  { label: "Gönderildi", query: "?status=submitted" },
  { label: "Hatalı", query: "?status=failed" },
  { label: "İptal", query: "?status=cancelled" }
];

export default function TripsScreen() {
  const [filter, setFilter] = useState(filters[0]);
  const [showExpiredUnsent, setShowExpiredUnsent] = useState(false);
  const activeQuery = showExpiredUnsent ? "?time_scope=expired_unsent" : filter.query;
  const trips = useQuery({ queryKey: queryKeys.trips(activeQuery), queryFn: () => endpoints.trips(activeQuery) });
  const emptyTitle = showExpiredUnsent ? "Tarihi geçmiş gönderilmemiş sefer yok" : "Sefer bulunamadı";

  return (
    <Screen refreshing={trips.isFetching} onRefresh={() => void trips.refetch()}>
      <View style={styles.header}>
        <AppText variant="headlineMd">Seferler</AppText>
        <Button label="Yeni" icon="add" onPress={() => router.push("/quick-trip")} />
      </View>
      <View style={styles.filters}>
        {filters.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => {
              setShowExpiredUnsent(false);
              setFilter(item);
            }}
            style={[styles.filter, !showExpiredUnsent && filter.label === item.label && styles.activeFilter]}
          >
            <AppText variant="labelMd" color={!showExpiredUnsent && filter.label === item.label ? colors.surface : colors.primary}>
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Pressable style={[styles.switchRow, showExpiredUnsent && styles.switchRowActive]} onPress={() => setShowExpiredUnsent((value) => !value)}>
        <View style={styles.switchText}>
          <AppText variant="labelMd">Geçmiş gönderilmemişler</AppText>
          <AppText variant="labelMd" color={colors.textSubtle}>
            Zamanı geçmiş ve UETDS'ye gitmemiş seferleri göster.
          </AppText>
        </View>
        <Switch
          value={showExpiredUnsent}
          onValueChange={setShowExpiredUnsent}
          trackColor={{ false: colors.surfaceStrong, true: colors.primarySoft }}
          thumbColor={showExpiredUnsent ? colors.primary : colors.textMuted}
        />
      </Pressable>
      {trips.isLoading ? <LoadingState /> : null}
      {!trips.isLoading && trips.data?.results.length === 0 ? <EmptyState title={emptyTitle} /> : null}
      {trips.data?.results.map((trip) => {
        const expiredUnsent = isExpiredUnsentTrip(trip);
        return (
          <Card key={trip.id} style={expiredUnsent ? styles.expiredCard : null}>
            <View style={styles.row}>
              <View style={styles.tripBody}>
                <AppText variant="titleLg">{trip.vehicle_detail?.plate || "Plaka yok"}</AppText>
                <AppText color={colors.textMuted}>{`${trip.departure_city} -> ${trip.arrival_city}`}</AppText>
                <AppText variant="labelMd" color={colors.textSubtle}>
                  {formatDateTime(trip.departure_at)} - {trip.passenger_count} yolcu
                </AppText>
                {trip.uetds_has_unsent_changes ? (
                  <AppText variant="labelMd" color="#604100">
                    UETDS güncellemesi bekliyor
                  </AppText>
                ) : null}
                {trip.uetds_last_error ? (
                  <AppText variant="labelMd" color={colors.error}>
                    {trip.uetds_last_error.operation_label}: {trip.uetds_last_error.message}
                  </AppText>
                ) : null}
              </View>
              <View style={styles.badgeColumn}>
                {expiredUnsent ? (
                  <View style={styles.expiredChip}>
                    <AppText variant="labelMd" color="#8C1D18">
                      Tarihi Geçti
                    </AppText>
                  </View>
                ) : null}
                <Badge status={trip.status} />
              </View>
            </View>
            <Button label="Detay" icon="open" variant="ghost" onPress={() => router.push(`/trips/${trip.id}`)} />
          </Card>
        );
      })}
    </Screen>
  );
}

function isExpiredUnsentTrip(trip: { departure_at: string; status: string; uetds_reference_no?: string | null }) {
  return (
    new Date(trip.departure_at).getTime() < Date.now() &&
    ["draft", "ready", "failed"].includes(trip.status) &&
    !trip.uetds_reference_no
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  filter: {
    alignItems: "center",
    borderColor: colors.primary,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  activeFilter: {
    backgroundColor: colors.primary
  },
  switchRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  switchRowActive: {
    backgroundColor: "#FFF8F7",
    borderColor: "#E7B4AF"
  },
  switchText: {
    flex: 1,
    gap: 2
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  badgeColumn: {
    alignItems: "flex-end",
    gap: spacing.xs
  },
  expiredCard: {
    backgroundColor: "#FFF8F7",
    borderColor: "#E7B4AF"
  },
  expiredChip: {
    alignSelf: "flex-end",
    backgroundColor: "#FCEAE7",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  tripBody: {
    flex: 1,
    gap: 3
  }
});

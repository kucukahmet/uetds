import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

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
  { label: "Tümü", query: "" },
  { label: "Gönderilmedi", query: "?status=ready" },
  { label: "Gönderildi", query: "?status=submitted" },
  { label: "Hatalı", query: "?status=failed" },
  { label: "İptal", query: "?status=cancelled" }
];

export default function TripsScreen() {
  const [filter, setFilter] = useState(filters[0]);
  const trips = useQuery({ queryKey: queryKeys.trips(filter.query), queryFn: () => endpoints.trips(filter.query) });

  return (
    <Screen refreshing={trips.isFetching} onRefresh={() => void trips.refetch()}>
      <View style={styles.header}>
        <AppText variant="headlineMd">Seferler</AppText>
        <Button label="Yeni" icon="add" onPress={() => router.push("/quick-trip")} />
      </View>
      <View style={styles.filters}>
        {filters.map((item) => (
          <Pressable key={item.label} onPress={() => setFilter(item)} style={[styles.filter, filter.label === item.label && styles.activeFilter]}>
            <AppText variant="labelMd" color={filter.label === item.label ? colors.surface : colors.primary}>
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      {trips.isLoading ? <LoadingState /> : null}
      {!trips.isLoading && trips.data?.results.length === 0 ? <EmptyState title="Sefer bulunamadı" /> : null}
      {trips.data?.results.map((trip) => (
        <Card key={trip.id}>
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
            </View>
            <Badge status={trip.status} />
          </View>
          <Button label="Detay" icon="open" variant="ghost" onPress={() => router.push(`/trips/${trip.id}`)} />
        </Card>
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
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm
  },
  tripBody: {
    flex: 1,
    gap: 3
  }
});

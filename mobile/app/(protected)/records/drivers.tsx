import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Button, IconButton } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { EmptyState, LoadingState } from "@/components/StateViews";
import { showErrorPopup, showPopup } from "@/lib/feedback";
import { fullName } from "@/lib/format";
import { colors, spacing } from "@/theme/tokens";
import type { Personnel } from "@/types/api";

export default function DriversScreen() {
  const queryClient = useQueryClient();
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const query = useQuery({ queryKey: queryKeys.personnel("?type=driver"), queryFn: () => endpoints.personnel("?type=driver") });
  const checkMutation = useMutation({
    mutationFn: (id: string) => endpoints.personnelUetdsCheck(id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.personnelRoot() });
      showPopup("UETDS kontrolü tamamlandı", result.valid ? "Şoför UETDS sorgusundan geçti." : result.message || "Şoför kontrolünde hata döndü.");
    },
    onError: (error) => {
      showErrorPopup("UETDS kontrolü tamamlanamadı", error, "UETDS sorgusu çalıştırılamadı.");
    },
    onSettled: () => {
      setCheckingId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.uetdsStatus() });
    }
  });

  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <PageHeader title="Şoförler" fallbackHref="/records" />
      <Button label="Yeni Şoför" icon="add" onPress={() => router.push("/records/add-driver")} />
      {query.isLoading ? <LoadingState /> : null}
      {!query.isLoading && query.data?.results.length === 0 ? <EmptyState title="Şoför yok" /> : null}
      {query.data?.results.map((item) => (
        <Card key={item.id} style={styles.driverCard}>
          <View style={styles.cardHeader}>
            <View style={styles.driverInfo}>
              <AppText variant="titleLg">{fullName(item.first_name, item.last_name)}</AppText>
              <AppText>{item.identity_no}</AppText>
              <AppText color={colors.textMuted}>{item.phone || "-"}</AppText>
            </View>
            <IconButton icon="create-outline" label="Şoförü düzenle" onPress={() => router.push({ pathname: "/records/add-driver", params: { id: item.id } })} />
          </View>
          <View style={styles.metaRow}>
            <DriverUetdsBadge driver={item} />
            {item.src_codes ? <AppText color={colors.textMuted}>{item.src_codes}</AppText> : null}
          </View>
          <Button
            label="Kontrol Et"
            icon="shield-checkmark"
            variant="ghost"
            loading={checkMutation.isPending && checkingId === item.id}
            disabled={checkMutation.isPending && checkingId !== item.id}
            style={styles.checkButton}
            onPress={() => {
              setCheckingId(item.id);
              checkMutation.mutate(item.id);
            }}
          />
        </Card>
      ))}
    </Screen>
  );
}

function DriverUetdsBadge({ driver }: { driver: Personnel }) {
  if (driver.uetds_last_checked_at && driver.status === "active") {
    return <Badge status="active" label="UETDS Onaylı" />;
  }
  if (driver.uetds_last_checked_at) {
    return <Badge status="failed" label="UETDS Hatalı" />;
  }
  return <Badge status="passive" label="Kontrol Bekliyor" />;
}

const styles = StyleSheet.create({
  driverCard: {
    gap: spacing.md
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  driverInfo: {
    flex: 1,
    gap: 2
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  checkButton: {
    alignSelf: "flex-start",
    minHeight: 40,
    paddingHorizontal: spacing.sm
  }
});

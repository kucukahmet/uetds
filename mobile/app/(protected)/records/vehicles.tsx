import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { EmptyState, LoadingState } from "@/components/StateViews";
import { showErrorPopup, showPopup } from "@/lib/feedback";

export default function VehiclesScreen() {
  const queryClient = useQueryClient();
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const query = useQuery({ queryKey: queryKeys.vehicles(), queryFn: () => endpoints.vehicles() });
  const checkMutation = useMutation({
    mutationFn: (id: string) => endpoints.vehicleUetdsCheck(id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.vehiclesRoot() });
      const message = result.message || result.checks?.find((item) => !item.success)?.message || "Araç kontrolünde hata döndü.";
      showPopup("UETDS kontrolü tamamlandı", result.valid ? "Araç UETDS sorgularından geçti." : message);
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
      <PageHeader title="Araçlar" fallbackHref="/records" />
      <Button label="Yeni Araç" icon="add" onPress={() => router.push("/records/add-vehicle")} />
      {query.isLoading ? <LoadingState /> : null}
      {!query.isLoading && query.data?.results.length === 0 ? <EmptyState title="Araç yok" /> : null}
      {query.data?.results.map((item) => (
        <Card key={item.id}>
          <AppText variant="titleLg">{item.plate}</AppText>
          <AppText>{[item.brand, item.model].filter(Boolean).join(" ") || "Araç"}</AppText>
          <AppText>{item.seat_capacity} koltuk</AppText>
          {item.uetds_authorization_document_no ? <AppText>Belge: {item.uetds_authorization_document_no}</AppText> : null}
          <Badge status={item.status} />
          <Button
            label="UETDS Kontrol"
            icon="sync"
            variant="secondary"
            loading={checkMutation.isPending && checkingId === item.id}
            disabled={checkMutation.isPending && checkingId !== item.id}
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

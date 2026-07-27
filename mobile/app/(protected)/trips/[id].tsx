import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingState } from "@/components/StateViews";
import { StickyActionBar } from "@/components/StickyActionBar";
import { formatDateTime, fullName } from "@/lib/format";
import { getActiveCompany, useAuthStore } from "@/store/auth";
import { colors, spacing } from "@/theme/tokens";
import type { SubmitUetdsResponse } from "@/types/api";

type ConfirmAction = "delete" | "cancel-uetds";

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const company = getActiveCompany(user, activeCompanyId);
  const uetdsEnvironment = company?.settings?.default_uetds_environment || "test";
  const query = useQuery({ queryKey: queryKeys.trip(id), queryFn: () => endpoints.trip(id), enabled: Boolean(id) });
  const duplicate = useMutation({
    mutationFn: () => endpoints.duplicateTrip(id),
    onSuccess: async (trip) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tripsRoot() });
      router.push(`/trips/${trip.id}`);
    }
  });
  const returnTrip = useMutation({
    mutationFn: () => endpoints.createReturnTrip(id, new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()),
    onSuccess: async (trip) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tripsRoot() });
      router.push(`/trips/${trip.id}`);
    }
  });
  const downloadPdf = useMutation({
    mutationFn: () => endpoints.tripDetailPdf(id),
    onSuccess: async (file) => {
      await openPdf(file.bytes, file.filename, file.contentType);
    },
    onError: (error) => {
      Alert.alert("PDF alınamadı", error instanceof Error ? error.message : "Çıktı oluşturulamadı.");
    }
  });
  const submit = useMutation({
    mutationFn: () => endpoints.submitUetds(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trip(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripsRoot() });
      const resultEnvironment = result.environment || uetdsEnvironment;
      if (!isSubmitted(result)) {
        router.push({ pathname: "/trips/failure", params: { tripId: id, environment: resultEnvironment, message: submitFailureMessage(result) } });
        return;
      }
      router.push({ pathname: "/trips/success", params: { tripId: id, environment: resultEnvironment, ref: result.uetds_reference_no || "" } });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trip(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tripsRoot() });
      router.push({ pathname: "/trips/failure", params: { tripId: id, environment: uetdsEnvironment, message: error instanceof Error ? error.message : "Gönderim başarısız" } });
    }
  });
  const cancelUetds = useMutation({
    mutationFn: () => endpoints.cancelUetds(id),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.trip(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tripsRoot() })
      ]);
      if (result.success) {
        Alert.alert("Sefer iptal edildi", result.sonuc_mesaji || "UETDS seferi iptal edildi. Kayıt sistemde iptal olarak kalacak.");
      } else {
        Alert.alert("İptal başarısız", result.sonuc_mesaji || "UETDS sefer iptali tamamlanamadı.");
      }
    },
    onError: (error) => {
      Alert.alert("İptal başarısız", error instanceof Error ? error.message : "UETDS sefer iptali tamamlanamadı.");
    },
    onSettled: () => {
      setConfirmAction(null);
    }
  });
  const syncSummary = useMutation({
    mutationFn: () => endpoints.syncSummary(id),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.trip(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tripsRoot() })
      ]);
      if (!result.success) {
        Alert.alert("Sync başarısız", result.message || result.sonuc_mesaji || "UETDS özeti alınamadı.");
        return;
      }
      Alert.alert(result.updated ? "UETDS'den güncellendi" : "Sync tamamlandı", result.message || "UETDS özeti alındı.");
    },
    onError: (error) => {
      Alert.alert("Sync başarısız", error instanceof Error ? error.message : "UETDS özeti alınamadı.");
    }
  });
  const deleteTrip = useMutation({
    mutationFn: () => endpoints.deleteTrip(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tripsRoot() });
      router.replace("/trips");
    },
    onError: (error) => {
      Alert.alert("Sefer silinemedi", error instanceof Error ? error.message : "Sefer silinemedi.");
    },
    onSettled: () => {
      setConfirmAction(null);
    }
  });

  if (query.isLoading) return <Screen><PageHeader title="Sefer Özeti" fallbackHref="/trips" /><LoadingState /></Screen>;
  if (query.isError) return <Screen><PageHeader title="Sefer Özeti" fallbackHref="/trips" /><ErrorState message={query.error.message} onRetry={() => void query.refetch()} /></Screen>;
  if (!query.data) return <Screen><PageHeader title="Sefer Özeti" fallbackHref="/trips" /><EmptyState title="Sefer bulunamadı" /></Screen>;

  const trip = query.data;
  const hasUetdsSubmission = Boolean(trip.uetds_reference_no) || ["submitted", "partial_failed", "cancelled"].includes(trip.status);
  const isLocked = ["cancel_requested", "cancelled"].includes(trip.status);
  const canEdit = !isLocked;
  const canSubmit = !isLocked && (trip.status !== "submitted" || trip.uetds_sync_status !== "synced");
  const canDeleteLocal = !trip.uetds_reference_no && ["draft", "ready", "failed"].includes(trip.status);
  const canCancelUetds = Boolean(trip.uetds_reference_no) && !isLocked;
  const submitLabel = submitButtonLabel(trip.status, trip.uetds_sync_status, hasUetdsSubmission);
  const confirmDialog =
    confirmAction === "delete"
      ? {
          title: "Sefer silinsin mi?",
          message: "Bu lokal sefer kaydı uygulamadan silinecek. UETDS'ye gönderilmiş seferler bu yolla silinmez.",
          confirmLabel: "Seferi Sil",
          confirmIcon: "trash" as const,
          loading: deleteTrip.isPending,
          onConfirm: () => deleteTrip.mutate()
        }
      : confirmAction === "cancel-uetds"
        ? {
            title: "UETDS seferi iptal edilsin mi?",
            message: "Bu işlem UETDS'ye iptal isteği gönderir. Başarılı olursa sefer uygulamada iptal olarak kalır ve silinmez.",
            confirmLabel: "UETDS'de İptal Et",
            confirmIcon: "close-circle" as const,
            loading: cancelUetds.isPending,
            onConfirm: () => cancelUetds.mutate()
          }
        : null;

  return (
    <Screen
      footer={
        canSubmit ? (
          <StickyActionBar>
            <Button label={submitLabel} icon="cloud-upload" loading={submit.isPending} onPress={() => submit.mutate()} />
          </StickyActionBar>
        ) : null
      }
    >
      <PageHeader title="Sefer Özeti" subtitle={formatDateTime(trip.departure_at)} right={<Badge status={trip.status} />} fallbackHref="/trips" />
      <Card>
        <AppText variant="titleLg">{`${trip.departure_city} -> ${trip.arrival_city}`}</AppText>
        <AppText>{trip.departure_address}</AppText>
        <AppText color={colors.textMuted}>{trip.arrival_address}</AppText>
        {trip.arrival_estimated_at ? <AppText color={colors.textMuted}>Bitiş: {formatDateTime(trip.arrival_estimated_at)}</AppText> : null}
        {trip.firm_trip_no ? <AppText color={colors.textMuted}>Firma sefer no: {trip.firm_trip_no}</AppText> : null}
        <View style={styles.systemIdBlock}>
          <AppText variant="labelMd" color={colors.textSubtle}>
            Sistem ID
          </AppText>
          <AppText selectable variant="labelMd" color={colors.textMuted} style={styles.systemIdValue}>
            {trip.id}
          </AppText>
        </View>
      </Card>
      <Card style={syncCardStyle(trip.uetds_sync_status)}>
        <View style={styles.syncHeader}>
          <AppText variant="titleLg">UETDS Durumu</AppText>
          <Badge status={syncBadgeStatus(trip.uetds_sync_status)} label={syncBadgeLabel(trip.uetds_sync_status)} />
        </View>
        <AppText color={syncTextColor(trip.uetds_sync_status)}>{trip.uetds_sync_message || syncFallbackMessage(trip.uetds_sync_status)}</AppText>
        {trip.uetds_reference_no ? <AppText color={colors.textMuted}>Referans no: {trip.uetds_reference_no}</AppText> : null}
        {trip.uetds_last_submitted_at ? <AppText color={colors.textMuted}>Son gönderim: {formatDateTime(trip.uetds_last_submitted_at)}</AppText> : null}
        {trip.uetds_reference_no ? (
          <View style={styles.lookupBlock}>
            <AppText variant="labelMd" color={colors.textSubtle}>
              Bakanlık panelinde arama
            </AppText>
            <AppText selectable variant="labelMd" color={colors.textMuted}>
              UETDS referans no: {trip.uetds_reference_no}
            </AppText>
            <AppText selectable variant="labelMd" color={colors.textMuted}>
              Firma sefer no: {trip.firm_trip_no || trip.id}
            </AppText>
            <AppText variant="labelMd" color={colors.textMuted}>
              Sefer tarihi: {formatDateTime(trip.departure_at)}
            </AppText>
          </View>
        ) : null}
        {hasUetdsSubmission ? (
          <Button
            label="UETDS'den Senkronize Et"
            icon="refresh"
            variant="ghost"
            loading={syncSummary.isPending}
            onPress={() => syncSummary.mutate()}
          />
        ) : null}
      </Card>
      {trip.uetds_last_error ? (
        <Card style={styles.failedCard}>
          <View style={styles.syncHeader}>
            <AppText variant="titleLg" color={colors.error}>
              UETDS Hatası
            </AppText>
            <Badge status="failed" label={trip.uetds_last_error.operation_label} />
          </View>
          <AppText color={colors.error}>{trip.uetds_last_error.message}</AppText>
          {trip.uetds_last_error.sonuc_kodu ? (
            <AppText variant="labelMd" color={colors.textMuted}>
              Hata kodu: {trip.uetds_last_error.sonuc_kodu}
            </AppText>
          ) : null}
          <AppText color={colors.text}>Ne yapmalı: {trip.uetds_last_error.action}</AppText>
        </Card>
      ) : null}
      {isLocked ? (
        <Card style={styles.lockedCard}>
          <AppText variant="titleLg" color={colors.error}>
            Sefer kilitli
          </AppText>
          <AppText color={colors.error}>İptal sürecindeki UETDS seferi düzenlenemez.</AppText>
        </Card>
      ) : null}
      {trip.status === "failed" && !trip.uetds_last_error ? (
        <Card style={styles.failedCard}>
          <AppText variant="titleLg" color={colors.error}>
            UETDS gönderimi başarısız
          </AppText>
          <AppText color={colors.error}>Son gönderim UETDS tarafından reddedildi. Loglardan hata mesajını kontrol edip tekrar gönderebilirsin.</AppText>
        </Card>
      ) : null}
      <Card>
        <AppText variant="titleLg">{trip.vehicle_detail?.plate || "Araç"}</AppText>
        <AppText color={colors.textMuted}>{trip.vehicle_detail ? `${trip.vehicle_detail.seat_capacity} koltuk` : "-"}</AppText>
        <AppText>{trip.driver_detail ? fullName(trip.driver_detail.first_name, trip.driver_detail.last_name) : "Şoför"}</AppText>
        {trip.driver_detail?.phone ? <AppText color={colors.textMuted}>Şoför tel: {trip.driver_detail.phone}</AppText> : null}
        {trip.driver_detail?.src_codes ? <AppText color={colors.textMuted}>SRC: {trip.driver_detail.src_codes}</AppText> : null}
      </Card>
      {trip.groups.map((group) => (
        <Card key={group.id}>
          <AppText variant="titleLg">{group.name}</AppText>
          <AppText color={colors.textMuted}>{`${group.departure_place || trip.departure_address} -> ${group.arrival_place || trip.arrival_address}`}</AppText>
          {group.description ? <AppText>{group.description}</AppText> : null}
          {group.price ? <AppText color={colors.textMuted}>Ücret: {group.price} {group.currency}</AppText> : null}
        </Card>
      ))}
      <Card>
        <AppText variant="titleLg">Yolcular</AppText>
        {trip.passengers.map((item) => (
          <View key={item.id} style={styles.passengerRow}>
            <AppText>{fullName(item.passenger.first_name, item.passenger.last_name)}</AppText>
            <AppText variant="labelMd" color={colors.textMuted}>
              {[item.passenger.country_name || item.passenger.nationality, item.passenger.gender, item.seat_no ? `Koltuk ${item.seat_no}` : ""]
                .filter(Boolean)
                .join(" - ")}
            </AppText>
          </View>
        ))}
      </Card>
      <View style={styles.actions}>
        {canEdit ? <Button label="Düzenle" icon="create" variant="secondary" onPress={() => router.push(`/trips/${id}/edit`)} /> : null}
          <Button label="Kopyala" icon="copy" variant="ghost" loading={duplicate.isPending} onPress={() => duplicate.mutate()} />
          <Button label="Dönüş" icon="swap-vertical" variant="ghost" loading={returnTrip.isPending} onPress={() => returnTrip.mutate()} />
        {hasUetdsSubmission ? (
          <Button label="PDF Çıktı" icon="document-text" variant="ghost" loading={downloadPdf.isPending} onPress={() => downloadPdf.mutate()} />
        ) : null}
        {canDeleteLocal ? (
          <Button label="Seferi Sil" icon="trash" variant="danger" loading={deleteTrip.isPending} onPress={() => setConfirmAction("delete")} />
        ) : null}
        {canCancelUetds ? (
          <Button
            label="UETDS'de İptal Et"
            icon="close-circle"
            variant="danger"
            loading={cancelUetds.isPending}
            onPress={() => setConfirmAction("cancel-uetds")}
          />
        ) : null}
      </View>
      <ConfirmDialog
        visible={Boolean(confirmDialog)}
        title={confirmDialog?.title || ""}
        message={confirmDialog?.message || ""}
        confirmLabel={confirmDialog?.confirmLabel || ""}
        confirmIcon={confirmDialog?.confirmIcon || "trash"}
        loading={confirmDialog?.loading || false}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => confirmDialog?.onConfirm()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.xs
  },
  lockedCard: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error
  },
  failedCard: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error
  },
  syncedCard: {
    backgroundColor: colors.secondarySoft,
    borderColor: colors.secondary
  },
  updateCard: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning
  },
  pendingCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.divider
  },
  syncHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  lookupBlock: {
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    gap: 3,
    paddingTop: spacing.sm
  },
  systemIdBlock: {
    gap: 2
  },
  systemIdValue: {
    flexShrink: 1
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(18, 20, 28, 0.46)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg
  },
  modalPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: 16,
    borderWidth: 1,
    gap: spacing.md,
    maxWidth: 430,
    padding: spacing.lg,
    width: "100%",
    ...Platform.select({
      web: { boxShadow: "0px 18px 48px rgba(0,0,0,0.20)" } as object,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.2,
        shadowRadius: 26,
        elevation: 8
      }
    })
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  modalButton: {
    flex: 1
  },
  passengerRow: {
    gap: 2
  }
});

function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  confirmIcon,
  loading,
  onCancel,
  onConfirm
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmIcon: "trash" | "close-circle";
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={loading ? undefined : onCancel}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={loading} onPress={onCancel} />
        <View accessibilityRole="alert" style={styles.modalPanel}>
          <AppText variant="titleLg">{title}</AppText>
          <AppText color={colors.textMuted}>{message}</AppText>
          <View style={styles.modalActions}>
            <Button label="Vazgeç" icon="close" variant="ghost" disabled={loading} style={styles.modalButton} onPress={onCancel} />
            <Button label={confirmLabel} icon={confirmIcon} variant="danger" loading={loading} style={styles.modalButton} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

async function openPdf(bytes: ArrayBuffer, filename: string, contentType: string) {
  if (Platform.OS === "web") {
    const blob = new Blob([bytes], { type: contentType || "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    return;
  }

  const target = `${FileSystem.documentDirectory || ""}${filename}`;
  await FileSystem.writeAsStringAsync(target, arrayBufferToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, { mimeType: contentType || "application/pdf", UTI: "com.adobe.pdf" });
  } else {
    Alert.alert("PDF hazır", target);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function isSubmitted(result: SubmitUetdsResponse) {
  return result.success === true && result.status === "submitted" && Boolean(result.uetds_reference_no);
}

function submitFailureMessage(result: SubmitUetdsResponse) {
  const failedOperation = result.operations.find((operation) => !operation.success);
  return failedOperation?.sonuc_mesaji || result.message || "UETDS gönderimi başarısız.";
}

function submitButtonLabel(status: string, syncStatus: string, hasUetdsSubmission: boolean) {
  if (hasUetdsSubmission && ["update_required", "local_draft", "unknown"].includes(syncStatus)) {
    return "Güncelle ve Tekrar Gönder";
  }
  if (["failed", "partial_failed"].includes(status)) {
    return "Tekrar UETDS'ye Gönder";
  }
  return "UETDS'ye Gönder";
}

function syncBadgeLabel(status: string) {
  if (status === "cancelled") return "İptal";
  if (status === "synced") return "Güncel";
  if (status === "update_required") return "Güncelleme Bekliyor";
  if (status === "local_draft") return "Yerel Taslak";
  if (status === "unknown") return "Kontrol Gerek";
  return "Gönderilmedi";
}

function syncBadgeStatus(status: string) {
  if (status === "cancelled") return "cancelled";
  if (status === "synced") return "active";
  if (["update_required", "local_draft", "unknown"].includes(status)) return "live";
  return "draft";
}

function syncCardStyle(status: string) {
  if (status === "synced") return styles.syncedCard;
  if (["update_required", "local_draft", "unknown"].includes(status)) return styles.updateCard;
  return styles.pendingCard;
}

function syncTextColor(status: string) {
  if (status === "synced") return colors.secondary;
  if (["update_required", "local_draft", "unknown"].includes(status)) return "#604100";
  return colors.textMuted;
}

function syncFallbackMessage(status: string) {
  if (status === "cancelled") return "Sefer UETDS'de iptal edildi.";
  if (status === "synced") return "UETDS kaydı son değişikliklerle güncel.";
  if (status === "local_draft") return "Önceki gönderim UETDS'ye gitti; son değişiklikler taslakta kaldı ve henüz gönderilmedi.";
  if (status === "update_required") return "Önceki gönderim UETDS'ye gitti; son değişiklikler için güncelle ve tekrar gönder.";
  if (status === "unknown") return "Önceki gönderim var; UETDS ile güncellik durumu doğrulanmalı.";
  return "Bu sefer henüz UETDS'ye gönderilmedi.";
}

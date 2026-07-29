import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { formatDateTime } from "@/lib/format";
import { getActiveUetdsStatus, getCompanyUetdsEnvironment, uetdsConnectionBadgeStatus, uetdsConnectionLabel, uetdsConnectionMessage } from "@/lib/uetdsStatus";
import { getActiveCompany, useAuthStore } from "@/store/auth";
import { colors } from "@/theme/tokens";
import type { UetdsStatus } from "@/types/api";

export default function UetdsSettingsScreen() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const company = getActiveCompany(user, activeCompanyId);
  const environment = getCompanyUetdsEnvironment(company);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const status = useQuery({ queryKey: queryKeys.uetdsStatus(), queryFn: endpoints.uetdsStatus });
  const selectedStatus = getActiveUetdsStatus(status.data, company);
  const tone = statusTone(selectedStatus?.severity);
  const save = useMutation({
    mutationFn: () => endpoints.saveUetdsCredentials(environment, username.trim(), password),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.uetdsStatus() })
  });
  const verify = useMutation({
    mutationFn: () => endpoints.verifyUetds(environment),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.uetdsStatus() })
  });
  const ipList = useMutation({
    mutationFn: () => endpoints.ipList(environment),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.uetdsStatus() })
  });

  return (
    <Screen refreshing={status.isFetching} onRefresh={() => void status.refetch()}>
      <PageHeader
        title="UETDS Ayarları"
        right={<Badge status={uetdsConnectionBadgeStatus(selectedStatus)} label={uetdsConnectionLabel(selectedStatus)} />}
        fallbackHref="/settings"
      />
      <Card style={[styles.statusCard, tone.card]}>
        <Badge status={uetdsConnectionBadgeStatus(selectedStatus)} label={uetdsConnectionLabel(selectedStatus)} />
        <AppText variant="titleLg" color={tone.text}>
          {statusTitle(selectedStatus, status.data)}
        </AppText>
        <AppText color={tone.text}>{uetdsConnectionMessage(selectedStatus)}</AppText>
        <AppText color={colors.textMuted}>Son doğrulama: {formatNullableDate(selectedStatus?.last_verified_at)}</AppText>
        {selectedStatus?.last_error_at ? <AppText color={colors.textMuted}>Son hata: {formatDateTime(selectedStatus.last_error_at)}</AppText> : null}
        {selectedStatus?.last_log_id ? <AppText color={colors.textMuted}>Log ID: {selectedStatus.last_log_id}</AppText> : null}
      </Card>
      <Card>
        <AppText variant="titleLg">UETDS Bilgileri</AppText>
        <TextField label="Kullanıcı adı" value={username} onChangeText={setUsername} autoCapitalize="none" />
        <TextField label="Şifre" value={password} onChangeText={setPassword} secureTextEntry />
        <Button label="Kaydet" icon="save" loading={save.isPending} disabled={!username.trim() || !password} onPress={() => save.mutate()} />
      </Card>
      <Button
        label="Kullanıcı Kontrol"
        icon="checkmark-circle"
        variant="secondary"
        loading={verify.isPending}
        disabled={!selectedStatus?.configured}
        onPress={() => verify.mutate()}
      />
      <Button label="IP Listele" icon="list" variant="ghost" loading={ipList.isPending} disabled={!selectedStatus?.configured} onPress={() => ipList.mutate()} />
      {mutationError(verify.error || ipList.error || save.error) ? (
        <Card style={styles.errorCard}>
          <AppText variant="titleLg" color={colors.error}>
            İşlem tamamlanamadı
          </AppText>
          <AppText color={colors.error}>{mutationError(verify.error || ipList.error || save.error)}</AppText>
        </Card>
      ) : null}
      {verify.data ? (
        <Card>
          <AppText variant="titleLg">Verify</AppText>
          <AppText>{JSON.stringify(verify.data, null, 2)}</AppText>
        </Card>
      ) : null}
      {ipList.data ? (
        <Card>
          <AppText variant="titleLg">IP List</AppText>
          <AppText>{JSON.stringify(ipList.data, null, 2)}</AppText>
        </Card>
      ) : null}
    </Screen>
  );
}

function statusTitle(status: Partial<UetdsStatus["test"]> | undefined, data?: Partial<UetdsStatus>) {
  if (data && !status) {
    return "Bağlantı durumu alınamadı";
  }
  if (!status) {
    return "Durum yükleniyor";
  }
  if (status.status === "verified") {
    return "Bağlantı hazır";
  }
  if (status.status === "pending") {
    return "Doğrulama bekliyor";
  }
  if (status.status === "failed") {
    return "Bağlantı hatalı";
  }
  return "Bağlı değil";
}

function statusTone(severity?: UetdsStatus["test"]["severity"]) {
  if (severity === "success") {
    return { card: styles.successCard, text: colors.secondary };
  }
  if (severity === "warning") {
    return { card: styles.warningCard, text: colors.text };
  }
  return { card: styles.errorCard, text: colors.error };
}

function formatNullableDate(value?: string | null) {
  return value ? formatDateTime(value) : "-";
}

function mutationError(error: unknown) {
  return error instanceof Error ? error.message : "";
}

const styles = StyleSheet.create({
  statusCard: {
    borderWidth: 1
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

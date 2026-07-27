import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

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
import { getActiveCompany, useAuthStore } from "@/store/auth";
import { colors } from "@/theme/tokens";
import type { CompanySettings, UetdsStatus, User } from "@/types/api";

type UetdsEnvironment = keyof UetdsStatus;

export default function UetdsSettingsScreen() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const setSession = useAuthStore((state) => state.setSession);
  const company = getActiveCompany(user, activeCompanyId);
  const defaultEnvironment = company?.settings?.default_uetds_environment || "test";
  const [environment, setEnvironment] = useState<UetdsEnvironment>("test");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const status = useQuery({ queryKey: queryKeys.uetdsStatus(), queryFn: endpoints.uetdsStatus });
  const selectedStatus = status.data?.[environment];
  const tone = statusTone(selectedStatus?.severity);
  const isLive = environment === "live";
  useEffect(() => {
    setEnvironment(defaultEnvironment);
  }, [defaultEnvironment]);
  const saveEnvironment = useMutation({
    mutationFn: (nextEnvironment: UetdsEnvironment) => {
      if (!company) {
        throw new Error("Aktif firma bulunamadı.");
      }
      return endpoints.updateCompanySettings(company.id, {
        default_uetds_environment: nextEnvironment,
        ...(nextEnvironment === "live" ? { live_uetds_enabled: true } : {})
      });
    },
    onSuccess: async (settings) => {
      if (user && company && settings) {
        await setSession({ user: withUpdatedCompanySettings(user, company.id, settings) });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.uetdsStatus() });
    }
  });
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
  const selectEnvironment = (nextEnvironment: UetdsEnvironment) => {
    setEnvironment(nextEnvironment);
    setUsername("");
    setPassword("");
    save.reset();
    verify.reset();
    ipList.reset();
    if (nextEnvironment !== defaultEnvironment) {
      saveEnvironment.mutate(nextEnvironment);
    }
  };

  return (
    <Screen refreshing={status.isFetching} onRefresh={() => void status.refetch()}>
      <PageHeader title="UETDS Ayarları" right={<Badge status={environment} />} fallbackHref="/settings" />
      <View style={styles.segmented}>
        {(["test", "live"] as const).map((item) => {
          const active = item === environment;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => selectEnvironment(item)}
              style={[styles.segment, active ? styles.segmentActive : null]}
            >
              <AppText variant="labelLg" color={active ? colors.surface : colors.textMuted}>
                {environmentLabel(item)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <Card style={[styles.statusCard, tone.card]}>
        <Badge status={environment} />
        <AppText variant="titleLg" color={tone.text}>
          {statusTitle(selectedStatus, environment, status.data)}
        </AppText>
        <AppText color={tone.text}>{selectedStatus?.message || statusMessage(environment, status.data)}</AppText>
        <AppText color={colors.textMuted}>Son doğrulama: {formatNullableDate(selectedStatus?.last_verified_at)}</AppText>
        {selectedStatus?.last_error_at ? <AppText color={colors.textMuted}>Son hata: {formatDateTime(selectedStatus.last_error_at)}</AppText> : null}
        {selectedStatus?.last_log_id ? <AppText color={colors.textMuted}>Log ID: {selectedStatus.last_log_id}</AppText> : null}
        {saveEnvironment.isPending ? <AppText color={colors.textMuted}>Ortam seçimi kaydediliyor...</AppText> : null}
      </Card>
      <Card>
        <AppText variant="titleLg">{isLive ? "Gerçek UETDS Bilgileri" : "Test UETDS Bilgileri"}</AppText>
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
      {mutationError(verify.error || ipList.error || save.error || saveEnvironment.error) ? (
        <Card style={styles.errorCard}>
          <AppText variant="titleLg" color={colors.error}>
            İşlem tamamlanamadı
          </AppText>
          <AppText color={colors.error}>{mutationError(verify.error || ipList.error || save.error || saveEnvironment.error)}</AppText>
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

function statusTitle(status: Partial<UetdsStatus["test"]> | undefined, environment: UetdsEnvironment, data?: Partial<UetdsStatus>) {
  const label = environmentLabel(environment);
  if (data && !status) {
    return `${label} ortam kapalı`;
  }
  if (!status) {
    return "Durum yükleniyor";
  }
  if (status.status === "verified") {
    return `${label} bağlantısı hazır`;
  }
  if (status.status === "pending") {
    return "Doğrulama bekliyor";
  }
  if (status.status === "failed") {
    return "UETDS doğrulama hatalı";
  }
  return "Credential eksik";
}

function statusMessage(environment: UetdsEnvironment, data?: Partial<UetdsStatus>) {
  if (data && !data[environment]) {
    return environment === "live" ? "Gerçek UETDS ortamı backend'de kapalı." : "Test ortam durumu alınamadı.";
  }
  return environment === "live" ? "Gerçek UETDS durumu yükleniyor." : "UETDS test durumu yükleniyor.";
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

function environmentLabel(environment: UetdsEnvironment) {
  return environment === "live" ? "Gerçek UETDS" : "Test";
}

function withUpdatedCompanySettings(user: User, companyId: string, settings: CompanySettings): User {
  return {
    ...user,
    memberships: user.memberships.map((membership) =>
      membership.company.id === companyId
        ? { ...membership, company: { ...membership.company, settings } }
        : membership
    )
  };
}

const styles = StyleSheet.create({
  segmented: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 12,
    flexDirection: "row",
    padding: 4
  },
  segment: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    minHeight: 44,
    justifyContent: "center"
  },
  segmentActive: {
    backgroundColor: colors.primary
  },
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

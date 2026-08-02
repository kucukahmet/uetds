import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

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
import { colors, spacing } from "@/theme/tokens";
import type { CompanySettings, UetdsStatus, User } from "@/types/api";

export default function UetdsSettingsScreen() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const setSession = useAuthStore((state) => state.setSession);
  const company = getActiveCompany(user, activeCompanyId);
  const environment = getCompanyUetdsEnvironment(company);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [aiEnabled, setAiEnabled] = useState(Boolean(company?.settings?.ai_passenger_parse_enabled));
  const [aiLimit, setAiLimit] = useState(String(company?.settings?.ai_passenger_parse_monthly_token_limit || ""));
  const status = useQuery({ queryKey: queryKeys.uetdsStatus(), queryFn: endpoints.uetdsStatus });
  const photoOcrStatus = useQuery({ queryKey: queryKeys.passengerPhotoOcrStatus(), queryFn: endpoints.passengerPhotoOcrStatus });
  const selectedStatus = getActiveUetdsStatus(status.data, company);
  const tone = statusTone(selectedStatus?.severity);

  useEffect(() => {
    setAiEnabled(Boolean(company?.settings?.ai_passenger_parse_enabled));
    setAiLimit(String(company?.settings?.ai_passenger_parse_monthly_token_limit || ""));
  }, [company?.id, company?.settings?.ai_passenger_parse_enabled, company?.settings?.ai_passenger_parse_monthly_token_limit]);

  const save = useMutation({
    mutationFn: () => endpoints.saveUetdsCredentials(environment, username.trim(), password),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.uetdsStatus() })
  });
  const saveAiSettings = useMutation({
    mutationFn: () =>
      endpoints.updateCompanySettings(company?.id || "", {
        ai_passenger_parse_enabled: aiEnabled,
        ai_passenger_parse_monthly_token_limit: normalizeAiLimit(aiLimit)
      }),
    onSuccess: async (settings) => {
      if (user && company) {
        await setSession({ user: mergeCompanySettings(user, company.id, settings) });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.companies() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.passengerPhotoOcrStatus() })
      ]);
    }
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
    <Screen
      refreshing={status.isFetching || photoOcrStatus.isFetching}
      onRefresh={() => {
        void status.refetch();
        void photoOcrStatus.refetch();
      }}
    >
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
      <Card>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitle}>
            <AppText variant="titleLg">AI Yolcu Parse</AppText>
            <AppText color={colors.textMuted}>Fotoğraftan yolcu listesi okuma</AppText>
          </View>
          <Badge status={photoOcrStatus.data?.available ? "active" : "passive"} label={photoOcrStatus.data?.available ? "Açık" : "Kapalı"} />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <AppText variant="labelLg">AI parse aktif</AppText>
            <AppText variant="labelMd" color={colors.textMuted}>
              Kapalıyken Galeri/Kamera butonları devre dışı kalır.
            </AppText>
          </View>
          <Switch
            value={aiEnabled}
            onValueChange={setAiEnabled}
            trackColor={{ false: colors.surfaceStrong, true: colors.primarySoft }}
            thumbColor={aiEnabled ? colors.primary : colors.textMuted}
          />
        </View>
        <TextField
          label="Aylık token limiti"
          value={aiLimit}
          onChangeText={(value) => setAiLimit(value.replace(/\D/g, "").slice(0, 8))}
          keyboardType="number-pad"
          placeholder="50000"
        />
        <AppText variant="labelMd" color={colors.textMuted}>
          {formatAiUsage(photoOcrStatus.data)}
        </AppText>
        {photoOcrStatus.data?.message ? <AppText color={colors.textMuted}>{photoOcrStatus.data.message}</AppText> : null}
        <Button
          label="AI Ayarlarını Kaydet"
          icon="save"
          variant="secondary"
          loading={saveAiSettings.isPending}
          disabled={!company || saveAiSettings.isPending}
          onPress={() => saveAiSettings.mutate()}
        />
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
      {mutationError(verify.error || ipList.error || save.error || saveAiSettings.error) ? (
        <Card style={styles.errorCard}>
          <AppText variant="titleLg" color={colors.error}>
            İşlem tamamlanamadı
          </AppText>
          <AppText color={colors.error}>{mutationError(verify.error || ipList.error || save.error || saveAiSettings.error)}</AppText>
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

function normalizeAiLimit(value: string) {
  const parsed = Number(value.replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAiUsage(status?: { token_limit: number; tokens_used: number; tokens_remaining: number | null; usage_month: string }) {
  if (!status) {
    return "AI kullanım bilgisi yükleniyor.";
  }
  const used = formatTokenCount(status.tokens_used);
  if (!status.token_limit) {
    return `Bu ay: ${used} token / limitsiz`;
  }
  return `Bu ay: ${used} / ${formatTokenCount(status.token_limit)} token, kalan ${formatTokenCount(status.tokens_remaining || 0)}`;
}

function formatTokenCount(value: number) {
  return value.toLocaleString("tr-TR");
}

function mergeCompanySettings(user: User, companyId: string, settings: CompanySettings): User {
  return {
    ...user,
    memberships: user.memberships.map((membership) =>
      membership.company.id === companyId ? { ...membership, company: { ...membership.company, settings } } : membership
    )
  };
}

const styles = StyleSheet.create({
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  sectionTitle: {
    flex: 1,
    gap: 2
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  switchText: {
    flex: 1,
    gap: 2
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

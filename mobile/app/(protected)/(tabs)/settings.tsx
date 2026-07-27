import { router } from "expo-router";

import { AppText } from "@/components/AppText";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { getActiveCompany, useAuthStore } from "@/store/auth";

export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const logout = useAuthStore((state) => state.logout);
  const company = getActiveCompany(user, activeCompanyId);

  return (
    <Screen>
      <AppText variant="headlineMd">Ayarlar</AppText>
      <ListRow title="Firma" subtitle={company?.name || "-"} icon="business" onPress={() => router.push("/settings/company")} />
      <ListRow title="UETDS Ortamları" subtitle="Test/gerçek credential, verify, IP list" icon="shield-checkmark" onPress={() => router.push("/settings/uetds")} />
      <ListRow title="UETDS Logları" subtitle="SOAP işlem geçmişi" icon="receipt" onPress={() => router.push("/settings/logs")} />
      <ListRow title="Çıkış Yap" subtitle={user?.email} icon="log-out" onPress={() => void logout().then(() => router.replace("/(auth)/login"))} />
    </Screen>
  );
}

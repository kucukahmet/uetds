import { router, useLocalSearchParams } from "expo-router";

import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { StickyActionBar } from "@/components/StickyActionBar";
import { colors } from "@/theme/tokens";

export default function SubmitFailureScreen() {
  const { tripId, message, environment } = useLocalSearchParams<{ tripId?: string; message?: string; environment?: string }>();
  const isLive = environment === "live";
  return (
    <Screen
      footer={
        <StickyActionBar>
          <Button label="Detaya Dön" icon="arrow-back" onPress={() => router.replace(tripId ? `/trips/${tripId}` : "/trips")} />
        </StickyActionBar>
      }
    >
      <PageHeader title="Gönderim Başarısız" right={<Badge status={isLive ? "live" : "failed"} />} fallbackHref={tripId ? `/trips/${tripId}` : "/trips"} />
      <Card>
        <AppText variant="titleLg">{isLive ? "Gerçek UETDS" : "UETDS Test"}</AppText>
        <AppText color={colors.error}>{message || "İşlem tamamlanamadı"}</AppText>
      </Card>
    </Screen>
  );
}

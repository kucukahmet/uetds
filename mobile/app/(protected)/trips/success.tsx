import { router, useLocalSearchParams } from "expo-router";

import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { StickyActionBar } from "@/components/StickyActionBar";
import { colors } from "@/theme/tokens";

export default function SubmitSuccessScreen() {
  const { tripId, ref } = useLocalSearchParams<{ tripId?: string; ref?: string; environment?: string }>();
  return (
    <Screen
      footer={
        <StickyActionBar>
          <Button label="Sefer Detayına Dön" icon="arrow-back" onPress={() => router.replace(tripId ? `/trips/${tripId}` : "/trips")} />
        </StickyActionBar>
      }
    >
      <PageHeader title="Gönderim Başarılı" right={<Badge status="submitted" />} fallbackHref={tripId ? `/trips/${tripId}` : "/trips"} />
      <Card>
        <AppText variant="titleLg">UETDS Kaydı Oluşturuldu</AppText>
        <AppText color={colors.textMuted}>Referans: {ref || "-"}</AppText>
      </Card>
    </Screen>
  );
}

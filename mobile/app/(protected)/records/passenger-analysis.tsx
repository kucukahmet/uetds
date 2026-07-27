import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { colors } from "@/theme/tokens";

export default function PassengerAnalysisScreen() {
  return (
    <Screen>
      <PageHeader title="AI Yolcu Analizi" fallbackHref="/records" />
      <Card>
        <AppText variant="titleLg">Analiz sonucu hazır değil</AppText>
        <AppText color={colors.textMuted}>Bu ekran Stitch akışına uyum için eklendi. Backend veri kaynağı geldiğinde gerçek analiz sonucu burada gösterilecek.</AppText>
      </Card>
    </Screen>
  );
}

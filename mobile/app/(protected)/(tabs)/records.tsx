import { router } from "expo-router";

import { AppText } from "@/components/AppText";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";

export default function RecordsScreen() {
  return (
    <Screen>
      <AppText variant="headlineMd">Kayıtlar</AppText>
      <ListRow title="Araçlar" subtitle="Plaka, koltuk, UETDS kontrol durumu" icon="car" onPress={() => router.push("/records/vehicles")} />
      <ListRow title="Şoförler" subtitle="Personel ve yeterlilik bilgileri" icon="people" onPress={() => router.push("/records/drivers")} />
      <ListRow title="Yolcular" subtitle="Kimlik, pasaport ve iletişim" icon="person" onPress={() => router.push("/records/passengers")} />
      <ListRow title="Rotalar" subtitle="Kalkış, varış, ücret ve grup varsayılanları" icon="map" onPress={() => router.push("/records/routes")} />
      <ListRow title="Lokasyonlar" subtitle="Sık kullanılan biniş ve iniş noktaları" icon="location" onPress={() => router.push("/records/locations")} />
      <ListRow title="AI Yolcu Analizi" subtitle="Stitch ekranı için hazır route" icon="sparkles" onPress={() => router.push("/records/passenger-analysis")} />
    </Screen>
  );
}

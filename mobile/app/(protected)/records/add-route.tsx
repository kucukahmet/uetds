import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { LocationReferenceSearch } from "@/components/LocationReferenceSearch";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { showErrorPopup } from "@/lib/feedback";
import { goBackOrReplace } from "@/lib/navigation";
import { spacing } from "@/theme/tokens";
import type { LocationReference, SavedRoute } from "@/types/api";

type RouteDraft = Omit<SavedRoute, "id" | "usage_count">;

const initialRoute: RouteDraft = {
  name: "",
  departure_country: "TR",
  departure_city: "",
  departure_district: "",
  departure_city_code: "",
  departure_district_code: "",
  departure_place: "",
  departure_address: "",
  arrival_country: "TR",
  arrival_city: "",
  arrival_district: "",
  arrival_city_code: "",
  arrival_district_code: "",
  arrival_place: "",
  arrival_address: "",
  default_group_name: "TRANSFER",
  default_group_description: "",
  default_price: "",
  currency: "TRY"
};

export default function AddRouteScreen() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RouteDraft>(initialRoute);
  const update = (patch: Partial<RouteDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const canSave = Boolean(
    draft.name.trim() &&
      draft.departure_city_code &&
      draft.departure_district_code &&
      draft.departure_place.trim() &&
      draft.arrival_city_code &&
      draft.arrival_district_code &&
      draft.arrival_place.trim()
  );
  const applyReference = (side: "departure" | "arrival", location: LocationReference) => {
    const addressDetail = referenceAddressDetail(location);
    update({
      [`${side}_country`]: location.country,
      [`${side}_city`]: location.city,
      [`${side}_district`]: location.district,
      [`${side}_city_code`]: location.city_code,
      [`${side}_district_code`]: location.district_code,
      [`${side}_place`]: addressDetail,
      [`${side}_address`]: addressDetail
    } as Partial<RouteDraft>);
  };
  const mutation = useMutation({
    mutationFn: () =>
      endpoints.createRoute({
        ...draft,
        departure_address: draft.departure_address || draft.departure_place,
        arrival_address: draft.arrival_address || draft.arrival_place,
        default_group_description: draft.default_group_description || draft.name,
        default_price: draft.default_price || null
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.routesRoot() });
      goBackOrReplace("/records/routes");
    },
    onError: (error) => {
      showErrorPopup("Rota kaydedilemedi", error, "Bilgileri kontrol edip tekrar deneyin.");
    }
  });

  return (
    <Screen
      footer={
        <StickyActionBar>
          <Button label="Rotayı Kaydet" icon="save" loading={mutation.isPending} disabled={!canSave} onPress={() => mutation.mutate()} />
        </StickyActionBar>
      }
    >
      <PageHeader title="Yeni Rota" fallbackHref="/records/routes" />
      <Card>
        <TextField label="Rota Adı" value={draft.name} onChangeText={(name) => update({ name })} />
        <View style={styles.columns}>
          <TextField label="Grup" value={draft.default_group_name} onChangeText={(default_group_name) => update({ default_group_name })} containerStyle={styles.columnField} />
          <TextField label="Ücret" value={String(draft.default_price || "")} onChangeText={(default_price) => update({ default_price })} keyboardType="decimal-pad" containerStyle={styles.columnField} />
        </View>
        <TextField label="Açıklama" value={draft.default_group_description} onChangeText={(default_group_description) => update({ default_group_description })} multiline />
      </Card>
      <Card>
        <AppText variant="titleLg">Biniş</AppText>
        <LocationReferenceSearch
          label="Biniş Yeri"
          selected={{
            place: draft.departure_district || draft.departure_city,
            city: draft.departure_city,
            district: draft.departure_district,
            city_code: draft.departure_city_code,
            district_code: draft.departure_district_code
          }}
          onSelect={(location) => applyReference("departure", location)}
          canUseTextAsPlace={Boolean(draft.departure_city_code && draft.departure_district_code)}
          onUseTextAsPlace={(departure_place) => update({ departure_place, departure_address: departure_place })}
        />
        <TextField label="Biniş adres detayı" value={draft.departure_place} onChangeText={(departure_place) => update({ departure_place, departure_address: departure_place })} />
      </Card>
      <Card>
        <AppText variant="titleLg">İniş</AppText>
        <LocationReferenceSearch
          label="İniş Yeri"
          selected={{
            place: draft.arrival_district || draft.arrival_city,
            city: draft.arrival_city,
            district: draft.arrival_district,
            city_code: draft.arrival_city_code,
            district_code: draft.arrival_district_code
          }}
          onSelect={(location) => applyReference("arrival", location)}
          canUseTextAsPlace={Boolean(draft.arrival_city_code && draft.arrival_district_code)}
          onUseTextAsPlace={(arrival_place) => update({ arrival_place, arrival_address: arrival_place })}
        />
        <TextField label="İniş adres detayı" value={draft.arrival_place} onChangeText={(arrival_place) => update({ arrival_place, arrival_address: arrival_place })} />
      </Card>
    </Screen>
  );
}

function referenceAddressDetail(location: LocationReference) {
  return location.kind === "district" ? "" : location.address || location.place;
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: "row",
    gap: spacing.sm
  },
  columnField: {
    flex: 1
  }
});

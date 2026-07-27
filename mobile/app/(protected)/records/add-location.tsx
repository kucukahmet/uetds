import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { LocationReferenceSearch } from "@/components/LocationReferenceSearch";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { showErrorPopup } from "@/lib/feedback";
import { goBackOrReplace } from "@/lib/navigation";
import type { LocationReference } from "@/types/api";

export default function AddLocationScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("TR");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [place, setPlace] = useState("");
  const [address, setAddress] = useState("");
  const canSave = Boolean(name.trim() && cityCode && districtCode && (place.trim() || address.trim()));
  const mutation = useMutation({
    mutationFn: () =>
      endpoints.createLocation({
        name,
        country,
        city,
        district,
        city_code: cityCode,
        district_code: districtCode,
        place: place || name,
        address: address || place || name
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsRoot() });
      goBackOrReplace("/records/locations");
    },
    onError: (error) => {
      showErrorPopup("Lokasyon kaydedilemedi", error, "Bilgileri kontrol edip tekrar deneyin.");
    }
  });
  const applyReference = (location: LocationReference) => {
    const addressDetail = referenceAddressDetail(location);
    setName(addressDetail);
    setCountry(location.country);
    setCity(location.city);
    setDistrict(location.district);
    setCityCode(location.city_code);
    setDistrictCode(location.district_code);
    setPlace(addressDetail);
    setAddress(addressDetail);
  };

  return (
    <Screen
      footer={
        <StickyActionBar>
          <Button label="Lokasyonu Kaydet" icon="save" loading={mutation.isPending} disabled={!canSave} onPress={() => mutation.mutate()} />
        </StickyActionBar>
      }
    >
      <PageHeader title="Yeni Lokasyon" fallbackHref="/records/locations" />
      <Card>
        <LocationReferenceSearch
          label="Yer Ara"
          selected={cityCode || districtCode ? { place: district || city, city, district, city_code: cityCode, district_code: districtCode } : undefined}
          onSelect={applyReference}
          canUseTextAsPlace={Boolean(cityCode && districtCode)}
          onUseTextAsPlace={(value) => {
            setName(value);
            setPlace(value);
            setAddress(value);
          }}
        />
        <TextField label="Kayıt adı" value={name} onChangeText={setName} />
        <TextField label="Adres detayı" value={place} onChangeText={(value) => { setPlace(value); setAddress(value); }} />
        <TextField label="Adres açıklaması" value={address} onChangeText={setAddress} multiline />
      </Card>
    </Screen>
  );
}

function referenceAddressDetail(location: LocationReference) {
  return location.kind === "district" ? "" : location.address || location.place;
}

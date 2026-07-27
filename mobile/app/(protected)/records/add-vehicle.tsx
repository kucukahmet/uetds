import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { sanitizeDigits } from "@/lib/driverValidation";
import { showErrorPopup } from "@/lib/feedback";
import { normalizePlate } from "@/lib/format";
import { goBackOrReplace } from "@/lib/navigation";

export default function AddVehicleScreen() {
  const queryClient = useQueryClient();
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [seatCapacity, setSeatCapacity] = useState("16");
  const mutation = useMutation({
    mutationFn: () =>
      endpoints.createVehicle({
        plate: normalizePlate(plate),
        brand,
        model,
        seat_capacity: Number(seatCapacity || 1),
        status: "active"
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.vehiclesRoot() });
      goBackOrReplace("/records/vehicles");
    },
    onError: (error) => {
      showErrorPopup("Araç kaydedilemedi", error, "Bilgileri kontrol edip tekrar deneyin.");
    }
  });

  return (
    <Screen
      footer={
        <StickyActionBar>
          <Button label="Aracı Kaydet" icon="save" loading={mutation.isPending} onPress={() => mutation.mutate()} />
        </StickyActionBar>
      }
    >
      <PageHeader title="Yeni Araç" fallbackHref="/records/vehicles" />
      <Card>
        <TextField label="Plaka" value={plate} onChangeText={setPlate} autoCapitalize="characters" />
        <TextField label="Marka" value={brand} onChangeText={setBrand} />
        <TextField label="Model" value={model} onChangeText={setModel} />
        <TextField label="Koltuk" value={seatCapacity} onChangeText={(value) => setSeatCapacity(sanitizeDigits(value, 3))} keyboardType="number-pad" maxLength={3} />
      </Card>
    </Screen>
  );
}

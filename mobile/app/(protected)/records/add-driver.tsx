import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SelectField } from "@/components/SelectField";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { showErrorPopup, showPopup } from "@/lib/feedback";
import {
  firstDriverError,
  normalizeGenderCode,
  sanitizeCountryCode,
  sanitizeDigits,
  sanitizePersonName,
  validateDriverDraft,
  type DriverErrors
} from "@/lib/driverValidation";
import { goBackOrReplace } from "@/lib/navigation";
import { genderOptions } from "@/lib/options";

export default function AddDriverScreen() {
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const driverId = typeof params.id === "string" ? params.id : "";
  const isEditing = Boolean(driverId);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [identityNo, setIdentityNo] = useState("");
  const [nationality, setNationality] = useState("TR");
  const [gender, setGender] = useState("");
  const [uetdsRoleCode, setUetdsRoleCode] = useState("0");
  const [srcCodes, setSrcCodes] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<DriverErrors>({});
  const driverQuery = useQuery({
    queryKey: queryKeys.personnelDetail(driverId || "new"),
    queryFn: () => endpoints.personnelDetail(driverId),
    enabled: isEditing
  });

  useEffect(() => {
    if (!driverQuery.data) {
      return;
    }
    setFirstName(driverQuery.data.first_name || "");
    setLastName(driverQuery.data.last_name || "");
    setIdentityNo(driverQuery.data.identity_no || "");
    setNationality(driverQuery.data.nationality || "TR");
    setGender(driverQuery.data.gender || "");
    setUetdsRoleCode(String(driverQuery.data.uetds_role_code ?? 0));
    setSrcCodes(driverQuery.data.src_codes || "");
    setPhone(driverQuery.data.phone || "");
  }, [driverQuery.data]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        type: "driver",
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        identity_no: identityNo,
        nationality,
        gender: normalizeGenderCode(gender),
        uetds_role_code: Number(uetdsRoleCode || 0),
        src_codes: srcCodes,
        phone
      } as const;
      return isEditing ? endpoints.updatePersonnel(driverId, payload) : endpoints.createPersonnel({ ...payload, status: "passive" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.personnelRoot() });
      if (isEditing) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.personnelDetail(driverId) });
      }
      goBackOrReplace("/records/drivers");
    },
    onError: (error) => {
      showErrorPopup(isEditing ? "Şoför güncellenemedi" : "Şoför kaydedilemedi", error, "Bilgileri kontrol edip tekrar deneyin.");
    }
  });
  const handleSubmit = () => {
    const nextErrors = validateDriverDraft({ firstName, lastName, identityNo, nationality, gender, uetdsRoleCode, phone });
    setErrors(nextErrors);
    const firstError = firstDriverError(nextErrors);
    if (firstError) {
      showPopup("Eksik veya hatalı bilgi", firstError);
      return;
    }
    mutation.mutate();
  };

  return (
    <Screen
      footer={
        <StickyActionBar>
          <Button label={isEditing ? "Şoförü Güncelle" : "Şoförü Kaydet"} icon="save" loading={mutation.isPending} onPress={handleSubmit} />
        </StickyActionBar>
      }
    >
      <PageHeader title={isEditing ? "Şoför Düzenle" : "Yeni Şoför"} fallbackHref="/records/drivers" />
      <Card>
        {driverQuery.isFetching ? <AppText>Şoför bilgileri yükleniyor</AppText> : null}
        <TextField label="Ad" value={firstName} onChangeText={(value) => setFirstName(sanitizePersonName(value))} error={errors.firstName} />
        <TextField label="Soyad" value={lastName} onChangeText={(value) => setLastName(sanitizePersonName(value))} error={errors.lastName} />
        <TextField label="T.C. Kimlik" value={identityNo} onChangeText={(value) => setIdentityNo(sanitizeDigits(value, 11))} keyboardType="number-pad" maxLength={11} error={errors.identityNo} />
        <TextField label="Uyruk" value={nationality} onChangeText={(value) => setNationality(sanitizeCountryCode(value))} autoCapitalize="characters" maxLength={3} error={errors.nationality} />
        <SelectField label="Cinsiyet" value={gender} options={genderOptions} onChange={setGender} error={errors.gender} />
        <TextField label="Görev Kodu" value={uetdsRoleCode} onChangeText={(value) => setUetdsRoleCode(sanitizeDigits(value, 2))} keyboardType="number-pad" error={errors.uetdsRoleCode} />
        <TextField label="SRC" value={srcCodes} onChangeText={setSrcCodes} />
        <TextField label="Telefon" value={phone} onChangeText={(value) => setPhone(sanitizeDigits(value, 15))} keyboardType="phone-pad" maxLength={15} error={errors.phone} />
      </Card>
    </Screen>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CountrySelectField } from "@/components/CountrySelectField";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SelectField } from "@/components/SelectField";
import { SegmentedControl } from "@/components/SegmentedControl";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { showErrorPopup, showPopup } from "@/lib/feedback";
import { goBackOrReplace } from "@/lib/navigation";
import { genderOptions, identityOptions } from "@/lib/options";
import {
  firstPassengerError,
  normalizeGenderCode,
  sanitizeDigits,
  sanitizePassengerIdentity,
  sanitizePersonName,
  validatePassengerDraft,
  type PassengerErrors
} from "@/lib/passengerValidation";
import { resolveCountry, TURKEY_COUNTRY, type CountryOption } from "@/lib/countries";
import { colors } from "@/theme/tokens";
import type { Passenger } from "@/types/api";

export default function AddPassengerScreen() {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [identityType, setIdentityType] = useState<Passenger["identity_type"]>("unknown");
  const [identityNo, setIdentityNo] = useState("");
  const [nationality, setNationality] = useState("");
  const [countryName, setCountryName] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<PassengerErrors>({});
  const selectedCountry = identityType === "tc" ? TURKEY_COUNTRY : resolveCountry(nationality, countryName);
  const mutation = useMutation({
    mutationFn: () =>
      endpoints.createPassenger({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        identity_type: identityType,
        identity_no: identityNo,
        nationality: selectedCountry?.code || nationality,
        country_name: selectedCountry?.name || countryName,
        gender: normalizeGenderCode(gender),
        phone
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.passengersRoot() });
      goBackOrReplace("/records/passengers");
    },
    onError: (error) => {
      showErrorPopup("Yolcu kaydedilemedi", error, "Bilgileri kontrol edip tekrar deneyin.");
    }
  });
  const handleIdentityTypeChange = (nextType: Passenger["identity_type"]) => {
    setIdentityType(nextType);
    setIdentityNo((current) => sanitizePassengerIdentity(current, nextType));
    if (nextType === "tc") {
      setNationality(TURKEY_COUNTRY.code);
      setCountryName(TURKEY_COUNTRY.name);
    } else if (identityType === "tc") {
      setNationality("");
      setCountryName("");
    }
  };
  const handleCountrySelect = (country: CountryOption) => {
    setNationality(country.code);
    setCountryName(country.name);
  };
  const handleSubmit = () => {
    const effectiveCountry = identityType === "tc" ? TURKEY_COUNTRY : resolveCountry(nationality, countryName);
    const nextErrors = validatePassengerDraft({
      firstName,
      lastName,
      identityType,
      identityNo,
      nationality: effectiveCountry?.code || nationality,
      countryName: effectiveCountry?.name || countryName,
      gender,
      phone
    });
    setErrors(nextErrors);
    const firstError = firstPassengerError(nextErrors);
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
          <Button label="Yolcuyu Kaydet" icon="save" loading={mutation.isPending} onPress={handleSubmit} />
        </StickyActionBar>
      }
    >
      <PageHeader title="Yeni Yolcu" fallbackHref="/records/passengers" />
      <Card>
        <TextField label="Ad" value={firstName} onChangeText={(value) => setFirstName(sanitizePersonName(value))} error={errors.firstName} />
        <TextField label="Soyad" value={lastName} onChangeText={(value) => setLastName(sanitizePersonName(value))} error={errors.lastName} />
        <SegmentedControl options={identityOptions} value={identityType} onChange={handleIdentityTypeChange} />
        {errors.identityType ? (
          <AppText variant="labelMd" color={colors.error}>
            {errors.identityType}
          </AppText>
        ) : null}
        <TextField
          label="Kimlik/Pasaport"
          value={identityNo}
          onChangeText={(value) => setIdentityNo(sanitizePassengerIdentity(value, identityType))}
          autoCapitalize="characters"
          keyboardType={identityType === "tc" ? "number-pad" : "default"}
          maxLength={identityType === "tc" ? 11 : 32}
          error={errors.identityNo}
        />
        <CountrySelectField
          countryCode={identityType === "tc" ? TURKEY_COUNTRY.code : nationality}
          countryName={identityType === "tc" ? TURKEY_COUNTRY.name : countryName}
          disabled={identityType === "tc"}
          error={errors.nationality}
          onSelect={handleCountrySelect}
        />
        <SelectField label="Cinsiyet" value={gender} options={genderOptions} onChange={setGender} error={errors.gender} />
        <TextField label="Telefon" value={phone} onChangeText={(value) => setPhone(sanitizeDigits(value, 15))} keyboardType="phone-pad" maxLength={15} error={errors.phone} />
      </Card>
    </Screen>
  );
}

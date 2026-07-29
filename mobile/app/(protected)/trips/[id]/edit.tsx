import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Button, IconButton } from "@/components/Button";
import { Card } from "@/components/Card";
import { CountrySelectField } from "@/components/CountrySelectField";
import { LocationReferenceSearch } from "@/components/LocationReferenceSearch";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SelectField } from "@/components/SelectField";
import { EmptyState, ErrorState, LoadingState } from "@/components/StateViews";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { resolveCountry, TURKEY_COUNTRY, type CountryOption } from "@/lib/countries";
import { isValidTurkishIdentityNo, normalizeGenderCode } from "@/lib/driverValidation";
import { goBackOrReplace } from "@/lib/navigation";
import { genderOptions, identityOptions } from "@/lib/options";
import { sanitizePassengerIdentity } from "@/lib/passengerValidation";
import { colors, radius, spacing } from "@/theme/tokens";
import type { LocationReference, Passenger, Trip, TripUpdatePayload } from "@/types/api";

type IdentityType = Passenger["identity_type"];

type PassengerEditDraft = {
  id: string;
  passenger_id: string;
  first_name: string;
  last_name: string;
  identity_type: IdentityType;
  identity_no: string;
  nationality: string;
  country_name: string;
  gender: string;
  seat_no: string;
  phone: string;
  group_id: string;
  status: string;
};

type EditDraft = {
  description: string;
  vehicle: string;
  driver_ids: string[];
  departure_at: string;
  arrival_estimated_at: string;
  departure_city: string;
  departure_district: string;
  departure_address: string;
  arrival_city: string;
  arrival_district: string;
  arrival_address: string;
  route_note: string;
  group_id: string;
  group_name: string;
  group_description: string;
  group_price: string;
  group_currency: string;
  departure_city_code: string;
  departure_district_code: string;
  departure_place: string;
  arrival_city_code: string;
  arrival_district_code: string;
  arrival_place: string;
  passengers: PassengerEditDraft[];
};

export default function TripEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const tripQuery = useQuery({ queryKey: queryKeys.trip(id), queryFn: () => endpoints.trip(id), enabled: Boolean(id) });
  const vehicles = useQuery({ queryKey: queryKeys.vehicles("?status=active"), queryFn: () => endpoints.vehicles("?status=active") });
  const drivers = useQuery({ queryKey: queryKeys.personnel("?type=driver&status=active"), queryFn: () => endpoints.personnel("?type=driver&status=active") });
  const [draft, setDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    if (tripQuery.data && !draft) {
      setDraft(draftFromTrip(tripQuery.data));
    }
  }, [draft, tripQuery.data]);

  const save = useMutation({
    mutationFn: (payload: TripUpdatePayload) => endpoints.updateTrip(id, payload),
    onSuccess: async (trip) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.trip(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tripsRoot() })
      ]);
      router.replace(`/trips/${trip.id}`);
    },
    onError: (error) => {
      Alert.alert("Sefer düzenlenemedi", error instanceof Error ? error.message : "Bilgileri kontrol edip tekrar deneyin.");
    }
  });

  if (tripQuery.isLoading) return <Screen><PageHeader title="Sefer Düzenle" fallbackHref={`/trips/${id}`} /><LoadingState /></Screen>;
  if (tripQuery.isError) return <Screen><PageHeader title="Sefer Düzenle" fallbackHref={`/trips/${id}`} /><ErrorState message={tripQuery.error.message} onRetry={() => void tripQuery.refetch()} /></Screen>;
  if (!tripQuery.data || !draft) return <Screen><PageHeader title="Sefer Düzenle" fallbackHref="/trips" /><EmptyState title="Sefer bulunamadı" /></Screen>;

  const trip = tripQuery.data;
  const locked = isUetdsLocked(trip);
  const hasUetdsSubmission = Boolean(trip.uetds_reference_no);
  const patchDraft = (patch: Partial<EditDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const updatePassenger = (passengerId: string, patch: Partial<PassengerEditDraft>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            passengers: current.passengers.map((passenger) => (passenger.id === passengerId ? { ...passenger, ...patch } : passenger))
          }
        : current
    );
  const addPassenger = () =>
    setDraft((current) => (current ? { ...current, passengers: [...current.passengers, newPassengerDraft(current.group_id)] } : current));
  const removePassenger = (passengerId: string) =>
    setDraft((current) => {
      if (!current) {
        return current;
      }
      if (current.passengers.length <= 1) {
        Alert.alert("Yolcu silinemedi", "Seferde en az bir yolcu kalmalı.");
        return current;
      }
      return { ...current, passengers: current.passengers.filter((passenger) => passenger.id !== passengerId) };
    });
  const handleSave = () => {
    const validationError = firstDraftError(draft);
    if (validationError) {
      Alert.alert("Eksik veya hatalı bilgi", validationError);
      return;
    }
    save.mutate(payloadFromDraft(draft));
  };

  if (locked) {
    return (
      <Screen>
        <PageHeader title="Sefer Düzenle" fallbackHref={`/trips/${id}`} />
        <Card style={styles.lockedCard}>
          <Badge status={trip.status} />
          <AppText variant="titleLg" color={colors.error}>
            Düzenleme kilitli
          </AppText>
          <AppText color={colors.error}>İptal sürecindeki UETDS seferi düzenlenemez.</AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <StickyActionBar>
          <View style={styles.footerRow}>
            <Button label="Vazgeç" icon="close" variant="ghost" onPress={() => goBackOrReplace(`/trips/${id}`)} style={styles.footerButton} />
            <Button label="Kaydet" icon="save" loading={save.isPending} onPress={handleSave} style={styles.footerButton} />
          </View>
        </StickyActionBar>
      }
    >
      <PageHeader
        title="Sefer Düzenle"
        subtitle={hasUetdsSubmission ? "Kaydedilen değişiklikler UETDS güncellemesi bekler" : "UETDS gönderimine kadar değiştirilebilir"}
        right={<Badge status={trip.status} />}
        fallbackHref={`/trips/${id}`}
      />

      <Card>
        <AppText variant="titleLg">Sefer</AppText>
        <DateTimeControl label="Hareket" value={draft.departure_at} onChange={(departure_at) => patchDraft({ departure_at })} />
        <DateTimeControl label="Bitiş" value={draft.arrival_estimated_at} onChange={(arrival_estimated_at) => patchDraft({ arrival_estimated_at })} />
        <TextField label="Açıklama" value={draft.description} onChangeText={(description) => patchDraft({ description })} multiline />
      </Card>

      <Card>
        <AppText variant="titleLg">Araç</AppText>
        {vehicles.isLoading ? <AppText color={colors.textMuted}>Araçlar yükleniyor</AppText> : null}
        {vehicles.data?.results.map((vehicle) => (
          <SelectionRow
            key={vehicle.id}
            title={vehicle.plate}
            subtitle={`${vehicle.seat_capacity} koltuk`}
            active={draft.vehicle === vehicle.id}
            onPress={() => patchDraft({ vehicle: vehicle.id })}
          />
        ))}
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <View>
            <AppText variant="titleLg">Şoförler</AppText>
            <AppText variant="labelMd" color={colors.textMuted}>
              {draft.driver_ids.length ? `${draft.driver_ids.length} şoför seçildi` : "En az bir şoför seçilmeli"}
            </AppText>
          </View>
        </View>
        {drivers.isLoading ? <AppText color={colors.textMuted}>Şoförler yükleniyor</AppText> : null}
        {drivers.data?.results.map((driver) => (
          <SelectionRow
            key={driver.id}
            title={`${driver.first_name} ${driver.last_name}`}
            subtitle={driver.identity_no}
            active={draft.driver_ids.includes(driver.id)}
            onPress={() => patchDraft({ driver_ids: toggleId(draft.driver_ids, driver.id) })}
          />
        ))}
      </Card>

      <Card>
        <AppText variant="titleLg">Rota</AppText>
        <LocationFields
          title="Biniş"
          city={draft.departure_city}
          district={draft.departure_district}
          address={draft.departure_address}
          place={draft.departure_place}
          cityCode={draft.departure_city_code}
          districtCode={draft.departure_district_code}
          onChange={patchDraft}
          prefix="departure"
        />
        <LocationFields
          title="İniş"
          city={draft.arrival_city}
          district={draft.arrival_district}
          address={draft.arrival_address}
          place={draft.arrival_place}
          cityCode={draft.arrival_city_code}
          districtCode={draft.arrival_district_code}
          onChange={patchDraft}
          prefix="arrival"
        />
      </Card>

      <Card>
        <AppText variant="titleLg">Grup</AppText>
        <View style={styles.columns}>
          <TextField label="Grup" value={draft.group_name} onChangeText={(group_name) => patchDraft({ group_name })} containerStyle={styles.columnField} />
          <TextField label="Ücret" value={draft.group_price} onChangeText={(group_price) => patchDraft({ group_price })} keyboardType="decimal-pad" containerStyle={styles.columnField} />
        </View>
        <TextField label="Grup Açıklaması" value={draft.group_description} onChangeText={(group_description) => patchDraft({ group_description, route_note: group_description })} multiline />
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <AppText variant="titleLg">Yolcular</AppText>
          <Button label="Yolcu Ekle" icon="add" variant="ghost" onPress={addPassenger} style={styles.inlineButton} />
        </View>
        {draft.passengers.map((passenger, index) => (
          <PassengerEditCard
            key={passenger.id}
            passenger={passenger}
            index={index}
            updatePassenger={updatePassenger}
            removePassenger={removePassenger}
          />
        ))}
      </Card>
    </Screen>
  );
}

function LocationFields({
  title,
  city,
  district,
  address,
  place,
  cityCode,
  districtCode,
  onChange,
  prefix
}: {
  title: string;
  city: string;
  district: string;
  address: string;
  place: string;
  cityCode: string;
  districtCode: string;
  onChange: (patch: Partial<EditDraft>) => void;
  prefix: "departure" | "arrival";
}) {
  const patch = (field: "city" | "district" | "address" | "city_code" | "district_code", value: string) => {
    const key = `${prefix}_${field}` as keyof EditDraft;
    onChange({ [key]: value } as Partial<EditDraft>);
    if (field === "address") {
      const placeKey = `${prefix}_place` as keyof EditDraft;
      onChange({ [placeKey]: value } as Partial<EditDraft>);
    }
  };
  const selectLocation = (option: LocationReference) => {
    const addressDetail = referenceAddressDetail(option);
    onChange({
      [`${prefix}_city`]: option.city,
      [`${prefix}_district`]: option.district,
      [`${prefix}_address`]: addressDetail,
      [`${prefix}_city_code`]: option.city_code,
      [`${prefix}_district_code`]: option.district_code,
      [`${prefix}_place`]: addressDetail
    } as Partial<EditDraft>);
  };
  const selectedLocation = cityCode || districtCode ? { place: district || city, city, district, city_code: cityCode, district_code: districtCode } : undefined;

  return (
    <View style={styles.locationBlock}>
      <AppText variant="labelLg">{title}</AppText>
      <LocationReferenceSearch
        label={`${title} Yeri`}
        selected={selectedLocation}
        onSelect={selectLocation}
        canUseTextAsPlace={Boolean(cityCode && districtCode)}
        onUseTextAsPlace={(value) => patch("address", value)}
      />
      <TextField label={title === "Biniş" ? "Biniş adres detayı" : "İniş adres detayı"} value={address} onChangeText={(value) => patch("address", value)} />
    </View>
  );
}

function PassengerEditCard({
  passenger,
  index,
  updatePassenger,
  removePassenger
}: {
  passenger: PassengerEditDraft;
  index: number;
  updatePassenger: (id: string, patch: Partial<PassengerEditDraft>) => void;
  removePassenger: (id: string) => void;
}) {
  const selectedCountry = passenger.identity_type === "tc" ? TURKEY_COUNTRY : resolveCountry(passenger.nationality, passenger.country_name);
  const changeIdentityType = (identity_type: IdentityType) => {
    const patch: Partial<PassengerEditDraft> = {
      identity_type,
      identity_no: sanitizePassengerIdentity(passenger.identity_no, identity_type)
    };
    if (identity_type === "tc") {
      patch.nationality = TURKEY_COUNTRY.code;
      patch.country_name = TURKEY_COUNTRY.name;
    } else if (passenger.identity_type === "tc") {
      patch.nationality = "";
      patch.country_name = "";
    }
    updatePassenger(passenger.id, patch);
  };
  const changeCountry = (country: CountryOption) => {
    updatePassenger(passenger.id, { nationality: country.code, country_name: country.name });
  };

  return (
    <View style={styles.passengerBox}>
      <View style={styles.sectionHeader}>
        <AppText variant="labelLg">{`${index + 1}. Yolcu`}</AppText>
        <IconButton icon="trash" label="Yolcuyu sil" onPress={() => removePassenger(passenger.id)} />
      </View>
      <View style={styles.columns}>
        <TextField label="Ad" value={passenger.first_name} onChangeText={(first_name) => updatePassenger(passenger.id, { first_name })} containerStyle={styles.columnField} />
        <TextField label="Soyad" value={passenger.last_name} onChangeText={(last_name) => updatePassenger(passenger.id, { last_name })} containerStyle={styles.columnField} />
      </View>
      <SegmentedControl options={identityOptions} value={passenger.identity_type} onChange={changeIdentityType} />
      <TextField
        label="Kimlik/Pasaport"
        value={passenger.identity_no}
        onChangeText={(identity_no) => updatePassenger(passenger.id, { identity_no: sanitizePassengerIdentity(identity_no, passenger.identity_type) })}
        autoCapitalize="characters"
        keyboardType={passenger.identity_type === "tc" ? "number-pad" : "default"}
        maxLength={passenger.identity_type === "tc" ? 11 : 32}
      />
      <CountrySelectField
        countryCode={selectedCountry?.code || passenger.nationality}
        countryName={selectedCountry?.name || passenger.country_name}
        disabled={passenger.identity_type === "tc"}
        onSelect={changeCountry}
      />
      <View style={styles.columns}>
        <SelectField label="Cinsiyet" options={genderOptions} value={passenger.gender} onChange={(gender) => updatePassenger(passenger.id, { gender })} containerStyle={styles.columnField} />
        <TextField label="Koltuk" value={passenger.seat_no} onChangeText={(seat_no) => updatePassenger(passenger.id, { seat_no })} keyboardType="number-pad" containerStyle={styles.columnField} />
      </View>
      <TextField label="Telefon (opsiyonel)" value={passenger.phone} onChangeText={(phone) => updatePassenger(passenger.id, { phone })} keyboardType="phone-pad" />
    </View>
  );
}

function referenceAddressDetail(option: LocationReference) {
  return option.kind === "district" ? "" : option.address || option.place;
}

function DateTimeControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const date = parseIso(value);
  const [manualTime, setManualTime] = useState(formatTime(date));

  useEffect(() => {
    setManualTime(formatTime(date));
  }, [value]);

  const setDayOffset = (offset: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + offset);
    onChange(toLocalIso(next));
  };
  const setManualClock = (text: string) => {
    const normalized = normalizeClockInput(text);
    setManualTime(normalized);
    const parsed = parseClockInput(normalized);
    if (!parsed) return;
    const next = new Date(date);
    next.setHours(parsed.hours, parsed.minutes, 0, 0);
    onChange(toLocalIso(next));
  };

  return (
    <View style={styles.dateBox}>
      <AppText variant="labelLg" color={colors.textMuted}>
        {label}
      </AppText>
      <View style={styles.dateRow}>
        <IconButton icon="chevron-back" label="Önceki gün" onPress={() => setDayOffset(-1)} />
        <View style={styles.dateValue}>
          <AppText variant="titleLg">{formatDate(date)}</AppText>
          <AppText color={colors.textMuted}>{formatTime(date)}</AppText>
        </View>
        <IconButton icon="chevron-forward" label="Sonraki gün" onPress={() => setDayOffset(1)} />
      </View>
      <TextField label="Saat" value={manualTime} onChangeText={setManualClock} keyboardType="numbers-and-punctuation" placeholder="09:45" />
    </View>
  );
}

function SelectionRow({ title, subtitle, active, onPress }: { title: string; subtitle?: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.selectionRow, active && styles.selectionRowActive]}>
      <View style={styles.selectionBody}>
        <AppText variant="labelLg">{title}</AppText>
        {subtitle ? <AppText color={colors.textMuted}>{subtitle}</AppText> : null}
      </View>
    </Pressable>
  );
}

function draftFromTrip(trip: Trip): EditDraft {
  const group = trip.groups[0];
  const driverIds = (trip.personnel || []).filter((item) => item.role === "driver").map((item) => item.personnel.id);
  return {
    description: trip.description || "",
    vehicle: trip.vehicle,
    driver_ids: driverIds.length ? driverIds : [trip.driver],
    departure_at: trip.departure_at,
    arrival_estimated_at: trip.arrival_estimated_at || trip.departure_at,
    departure_city: trip.departure_city || "",
    departure_district: trip.departure_district || "",
    departure_address: trip.departure_address || "",
    arrival_city: trip.arrival_city || "",
    arrival_district: trip.arrival_district || "",
    arrival_address: trip.arrival_address || "",
    route_note: trip.route_note || group?.description || "",
    group_id: group?.id || "",
    group_name: group?.name || "TRANSFER",
    group_description: group?.description || trip.route_note || "",
    group_price: group?.price || "",
    group_currency: group?.currency || "TRY",
    departure_city_code: group?.departure_city_code || "",
    departure_district_code: group?.departure_district_code || "",
    departure_place: group?.departure_place || trip.departure_address || "",
    arrival_city_code: group?.arrival_city_code || "",
    arrival_district_code: group?.arrival_district_code || "",
    arrival_place: group?.arrival_place || trip.arrival_address || "",
    passengers: trip.passengers.length ? trip.passengers.map(passengerDraftFromTripLink) : [newPassengerDraft(group?.id || "")]
  };
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function payloadFromDraft(draft: EditDraft): TripUpdatePayload {
  return {
    description: draft.description,
    vehicle: draft.vehicle,
    driver: draft.driver_ids[0],
    driver_ids: draft.driver_ids,
    departure_at: draft.departure_at,
    arrival_estimated_at: draft.arrival_estimated_at || null,
    departure_city: draft.departure_city,
    departure_district: draft.departure_district,
    departure_address: draft.departure_address,
    arrival_city: draft.arrival_city,
    arrival_district: draft.arrival_district,
    arrival_address: draft.arrival_address,
    route_note: draft.route_note,
    groups: [
      {
        id: draft.group_id || undefined,
        name: draft.group_name,
        description: draft.group_description,
        price: draft.group_price || null,
        currency: draft.group_currency || "TRY",
        departure_country: "TR",
        departure_city: draft.departure_city,
        departure_district: draft.departure_district,
        departure_city_code: draft.departure_city_code,
        departure_district_code: draft.departure_district_code,
        departure_place: draft.departure_place || draft.departure_address,
        arrival_country: "TR",
        arrival_city: draft.arrival_city,
        arrival_district: draft.arrival_district,
        arrival_city_code: draft.arrival_city_code,
        arrival_district_code: draft.arrival_district_code,
        arrival_place: draft.arrival_place || draft.arrival_address
      }
    ],
    passengers: draft.passengers.map((passenger) => {
      const country = passenger.identity_type === "tc" ? TURKEY_COUNTRY : resolveCountry(passenger.nationality, passenger.country_name);
      return {
        id: passenger.id.startsWith("new-") ? undefined : passenger.id,
        passenger_id: passenger.passenger_id || undefined,
        group_id: passenger.group_id || draft.group_id || undefined,
        first_name: passenger.first_name.trim(),
        last_name: passenger.last_name.trim(),
        identity_type: passenger.identity_type,
        identity_no: passenger.identity_no || null,
        nationality: country?.code || passenger.nationality,
        country_name: country?.name || passenger.country_name,
        gender: normalizeGenderCode(passenger.gender),
        seat_no: passenger.seat_no,
        phone: passenger.phone,
        status: passenger.status || "active"
      };
    })
  };
}

function passengerDraftFromTripLink(link: Trip["passengers"][number]): PassengerEditDraft {
  const passenger = link.passenger;
  return {
    id: link.id,
    passenger_id: passenger.id,
    first_name: passenger.first_name || "",
    last_name: passenger.last_name || "",
    identity_type: passenger.identity_type || "unknown",
    identity_no: passenger.identity_no || "",
    nationality: passenger.nationality || "",
    country_name: passenger.country_name || "",
    gender: passenger.gender || "",
    seat_no: link.seat_no || "",
    phone: passenger.phone || "",
    group_id: link.group_id || "",
    status: link.status || "active"
  };
}

function newPassengerDraft(groupId: string): PassengerEditDraft {
  return {
    id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    passenger_id: "",
    first_name: "",
    last_name: "",
    identity_type: "unknown",
    identity_no: "",
    nationality: "",
    country_name: "",
    gender: "",
    seat_no: "",
    phone: "",
    group_id: groupId,
    status: "active"
  };
}

function firstDraftError(draft: EditDraft) {
  if (!draft.driver_ids.length) {
    return "En az bir şoför seçilmeli.";
  }
  if (!draft.passengers.length) {
    return "En az bir yolcu eklenmeli.";
  }
  for (let index = 0; index < draft.passengers.length; index += 1) {
    const passenger = draft.passengers[index];
    const prefix = `Yolcu ${index + 1}`;
    if (!passenger.first_name.trim() || !passenger.last_name.trim()) {
      return `${prefix}: ad soyad zorunlu.`;
    }
    if (!["tc", "passport"].includes(passenger.identity_type)) {
      return `${prefix}: kimlik tipi seçilmeli.`;
    }
    if (!passenger.identity_no) {
      return `${prefix}: kimlik/pasaport zorunlu.`;
    }
    if (passenger.identity_type === "tc" && !isValidTurkishIdentityNo(passenger.identity_no)) {
      return `${prefix}: T.C. Kimlik numarası geçersiz.`;
    }
    if (passenger.identity_type === "passport" && !resolveCountry(passenger.nationality, passenger.country_name)) {
      return `${prefix}: ülke seçilmeli.`;
    }
    if (!normalizeGenderCode(passenger.gender)) {
      return `${prefix}: cinsiyet seçilmeli.`;
    }
  }
  return "";
}

function isUetdsLocked(trip: Trip) {
  return ["cancel_requested", "cancelled"].includes(trip.status);
}

function parseIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toLocalIso(date: Date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function normalizeClockInput(value: string) {
  return value.replace(/[^\d:]/g, "").slice(0, 5);
}

function parseClockInput(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return { hours, minutes };
  }
  if (/^\d{3,4}$/.test(trimmed)) {
    const padded = trimmed.padStart(4, "0");
    const hours = Number(padded.slice(0, 2));
    const minutes = Number(padded.slice(2, 4));
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return { hours, minutes };
  }
  return null;
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  footerButton: {
    flex: 1
  },
  columns: {
    flexDirection: "row",
    gap: spacing.sm
  },
  columnField: {
    flex: 1
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  inlineButton: {
    minHeight: 40,
    paddingHorizontal: spacing.sm
  },
  locationBlock: {
    gap: spacing.xs
  },
  passengerBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  choiceChip: {
    alignItems: "center",
    borderColor: colors.primarySoft,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.sm
  },
  choiceChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  selectionRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
    padding: spacing.sm
  },
  selectionRowActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  selectionBody: {
    flex: 1,
    gap: 2
  },
  dateBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.sm
  },
  dateRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  dateValue: {
    alignItems: "center",
    flex: 1,
    gap: 2
  },
  lockedCard: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error
  }
});

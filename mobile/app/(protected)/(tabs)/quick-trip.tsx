import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Animated, Platform, Pressable, StyleSheet, View, type TextInputProps, type ViewStyle } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Button, IconButton } from "@/components/Button";
import { Card } from "@/components/Card";
import { CountrySelectField } from "@/components/CountrySelectField";
import { LocationReferenceSearch } from "@/components/LocationReferenceSearch";
import { Screen } from "@/components/Screen";
import { SelectField } from "@/components/SelectField";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { resolveCountry, TURKEY_COUNTRY, type CountryOption } from "@/lib/countries";
import { isValidTurkishIdentityNo, normalizeGenderCode } from "@/lib/driverValidation";
import { getFeedbackMessage } from "@/lib/errors";
import { normalizePlate } from "@/lib/format";
import { genderOptions } from "@/lib/options";
import { pickPassengerExcel } from "@/lib/passengerExcel";
import { pickPassengerPhotoForOcr } from "@/lib/passengerPhotoOcr";
import { parsePassengerText } from "@/lib/passengerImport";
import { sanitizePassengerIdentity } from "@/lib/passengerValidation";
import { quickTripSchema } from "@/lib/validation";
import { colors, radius, spacing } from "@/theme/tokens";
import type { LocationReference, Passenger, Personnel, QuickCreatePayload, SavedRoute, Vehicle } from "@/types/api";

type IdentityType = Passenger["identity_type"];

type LocationDraft = {
  country: string;
  city: string;
  district: string;
  city_code: string;
  district_code: string;
  address: string;
  place: string;
};

type PassengerDraft = {
  id: string;
  first_name: string;
  last_name: string;
  identity_type: IdentityType;
  identity_no: string;
  nationality: string;
  country_name: string;
  gender: string;
  seat_no: string;
  phone: string;
};

type WizardState = {
  departure_at: string;
  arrival_estimated_at: string;
  selected_vehicle_id: string;
  selected_driver_ids: string[];
  vehicle: {
    plate: string;
    seat_capacity: string;
  };
  driver: {
    identity_no: string;
    first_name: string;
    last_name: string;
    nationality: string;
    gender: string;
    phone: string;
    src_codes: string;
    uetds_role_code: number;
  };
  route: {
    preset_id: string;
    from: LocationDraft;
    to: LocationDraft;
  };
  group: {
    name: string;
    description: string;
    price: string;
    currency: string;
  };
  passengers: PassengerDraft[];
  passenger_import_text: string;
};

type RouteFieldErrors = Partial<Record<"departureLocation" | "departureDetail" | "arrivalLocation" | "arrivalDetail" | "groupName" | "groupPrice" | "groupDescription", string>>;

const steps = ["Sefer", "Araç", "Rota", "Yolcu", "Kontrol"];
const useNativeAnimationDriver = Platform.OS !== "web";

const identityOptions: Array<{ label: string; value: IdentityType }> = [
  { label: "Pasaport", value: "passport" },
  { label: "T.C.", value: "tc" }
];

const routePresets = [
  {
    id: "gocek-dalaman",
    label: "Göcek -> DLM",
    description: "GÖCEK / DLM HAVALİMANI SEFER LİSTESİDİR.",
    price: "900",
    from: {
      country: "TR",
      city: "Muğla",
      district: "Fethiye",
      city_code: "48",
      district_code: "1331",
      address: "Göcek",
      place: "Göcek"
    },
    to: {
      country: "TR",
      city: "Muğla",
      district: "Dalaman Havalimanı",
      city_code: "48",
      district_code: "99125",
      address: "Dalaman Havalimanı",
      place: "Dalaman Havalimanı"
    }
  },
  {
    id: "dalaman-gocek",
    label: "DLM -> Göcek",
    description: "DLM HAVALİMANI / GÖCEK SEFER LİSTESİDİR.",
    price: "900",
    from: {
      country: "TR",
      city: "Muğla",
      district: "Dalaman Havalimanı",
      city_code: "48",
      district_code: "99125",
      address: "Dalaman Havalimanı",
      place: "Dalaman Havalimanı"
    },
    to: {
      country: "TR",
      city: "Muğla",
      district: "Fethiye",
      city_code: "48",
      district_code: "1331",
      address: "Göcek",
      place: "Göcek"
    }
  }
];

function emptyLocation(): LocationDraft {
  return {
    country: "TR",
    city: "",
    district: "",
    city_code: "",
    district_code: "",
    address: "",
    place: ""
  };
}

function emptyDriverDraft(): WizardState["driver"] {
  return {
    identity_no: "",
    first_name: "",
    last_name: "",
    nationality: "TR",
    gender: "E",
    phone: "",
    src_codes: "",
    uetds_role_code: 0
  };
}

function driverToDraft(driver: Personnel): WizardState["driver"] {
  return {
    identity_no: driver.identity_no,
    first_name: driver.first_name,
    last_name: driver.last_name,
    nationality: driver.nationality || "TR",
    gender: driver.gender || "E",
    phone: driver.phone || "",
    src_codes: driver.src_codes || "",
    uetds_role_code: driver.uetds_role_code ?? 0
  };
}

function initialState(): WizardState {
  const departure = roundToNextQuarter(new Date(Date.now() + 60 * 60 * 1000));
  const arrival = addMinutes(departure, 150);
  return {
    departure_at: toLocalIso(departure),
    arrival_estimated_at: toLocalIso(arrival),
    selected_vehicle_id: "",
    selected_driver_ids: [],
    vehicle: {
      plate: "",
      seat_capacity: "16"
    },
    driver: emptyDriverDraft(),
    route: {
      preset_id: "",
      from: emptyLocation(),
      to: emptyLocation()
    },
    group: {
      name: "TRANSFER",
      description: "",
      price: "",
      currency: "TRY"
    },
    passengers: [newPassenger()],
    passenger_import_text: ""
  };
}

export default function QuickTripScreen() {
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<WizardState>(() => initialState());
  const [validationStep, setValidationStep] = useState<number | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [isPhotoImporting, setIsPhotoImporting] = useState(false);
  const vehicles = useQuery({ queryKey: queryKeys.vehicles("?status=active"), queryFn: () => endpoints.vehicles("?status=active") });
  const drivers = useQuery({ queryKey: queryKeys.personnel("?type=driver&status=active"), queryFn: () => endpoints.personnel("?type=driver&status=active") });
  const routes = useQuery({ queryKey: queryKeys.routes("?ordering=-usage_count"), queryFn: () => endpoints.routes("?ordering=-usage_count") });
  const photoOcrStatus = useQuery({
    queryKey: queryKeys.passengerPhotoOcrStatus(),
    queryFn: endpoints.passengerPhotoOcrStatus,
    staleTime: 60_000
  });

  const payload = useMemo(() => buildPayload(state), [state]);
  const currentErrors = useMemo(() => validateStep(state, stepIndex), [state, stepIndex]);

  const mutation = useMutation({
    mutationFn: (data: QuickCreatePayload) => endpoints.quickCreateTrip(data),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tripsRoot() });
      router.push(`/trips/${result.trip_id}`);
    },
    onError: (error) => {
      Alert.alert("Sefer oluşturulamadı", error instanceof Error ? error.message : "Bilgileri kontrol edip tekrar deneyin.");
    }
  });

  const setPartial = (patch: Partial<WizardState>) => setState((current) => ({ ...current, ...patch }));
  const setVehicle = (patch: Partial<WizardState["vehicle"]>) => setState((current) => ({ ...current, vehicle: { ...current.vehicle, ...patch } }));
  const setDriver = (patch: Partial<WizardState["driver"]>) => setState((current) => ({ ...current, driver: { ...current.driver, ...patch } }));
  const setGroup = (patch: Partial<WizardState["group"]>) => setState((current) => ({ ...current, group: { ...current.group, ...patch } }));
  const setRouteLocation = (side: "from" | "to", patch: Partial<LocationDraft>) =>
    setState((current) => ({ ...current, route: { ...current.route, [side]: { ...current.route[side], ...patch } } }));

  const applyRoutePreset = (id: string) => {
    const preset = routePresets.find((item) => item.id === id);
    if (!preset) {
      return;
    }
    setState((current) => ({
      ...current,
      route: { preset_id: preset.id, from: preset.from, to: preset.to },
      group: { ...current.group, description: preset.description, price: preset.price }
    }));
  };

  const appendParsedPassengers = (parsed: Omit<PassengerDraft, "id">[]) => {
    const parsedPassengers = parsed.map((item) => ({ ...newPassenger(), ...item }));
    setState((current) => ({
      ...current,
      passengers: current.passengers.length === 1 && isEmptyPassenger(current.passengers[0]) ? parsedPassengers : [...current.passengers, ...parsedPassengers],
      passenger_import_text: ""
    }));
  };

  const addParsedPassengers = () => {
    const parsed = parsePassengerText(state.passenger_import_text);
    if (!parsed.length) {
      Alert.alert("Yolcu bulunamadı", "Her satıra ad soyad ve kimlik/pasaport bilgisi gelecek şekilde tekrar deneyin.");
      return;
    }
    appendParsedPassengers(parsed);
  };

  const addExcelPassengers = async () => {
    try {
      const parsed = await pickPassengerExcel();
      if (!parsed.length) {
        Alert.alert("Yolcu bulunamadı", "Excel dosyasında ad, soyad ve kimlik/pasaport satırı bulunamadı.");
        return;
      }
      appendParsedPassengers(parsed);
    } catch (error) {
      Alert.alert("Excel okunamadı", error instanceof Error ? error.message : "Dosyayı kontrol edip tekrar deneyin.");
    }
  };

  const addPhotoPassengers = async () => {
    const ready = await isPhotoOcrReady();
    if (!ready) {
      return;
    }
    try {
      setIsPhotoImporting(true);
      const parsed = await pickPassengerPhotoForOcr();
      if (!parsed.length) {
        Alert.alert("Yolcu bulunamadı", "Fotoğraftan yolcu satırı okunamadı. Daha net bir fotoğrafla tekrar deneyin.");
        return;
      }
      appendParsedPassengers(parsed);
    } catch (error) {
      Alert.alert("Foto/OCR başarısız", error instanceof Error ? error.message : "Fotoğrafı kontrol edip tekrar deneyin.");
    } finally {
      setIsPhotoImporting(false);
    }
  };

  const isPhotoOcrReady = async () => {
    try {
      const status = photoOcrStatus.data ?? (await photoOcrStatus.refetch()).data;
      if (status && !status.available) {
        Alert.alert("Foto/OCR hazır değil", status.message || "Foto/OCR anahtarı eklendiğinde aktif olacak.");
        return false;
      }
      return true;
    } catch (error) {
      Alert.alert("Foto/OCR durumu alınamadı", getFeedbackMessage(error, "Backend bağlantısını kontrol edip tekrar deneyin."));
      return false;
    }
  };

  const updatePassenger = (id: string, patch: Partial<PassengerDraft>) => {
    setState((current) => ({
      ...current,
      passengers: current.passengers.map((passenger) => (passenger.id === id ? { ...passenger, ...patch } : passenger))
    }));
  };

  const removePassenger = (id: string) => {
    setState((current) => {
      const passengers = current.passengers.filter((passenger) => passenger.id !== id);
      return { ...current, passengers: passengers.length ? passengers : [newPassenger()] };
    });
  };

  const next = () => {
    if (currentErrors.length) {
      setValidationStep(stepIndex);
      setShakeKey((value) => value + 1);
      if (stepIndex === 2) {
        return;
      }
      Alert.alert("Eksik bilgi", currentErrors[0]);
      return;
    }
    if (stepIndex < steps.length - 1) {
      setStepIndex((value) => value + 1);
      return;
    }
    const parsed = quickTripSchema.safeParse(payload);
    if (!parsed.success) {
      Alert.alert("Eksik bilgi", "Kontrol adımındaki zorunlu alanları tamamlayın.");
      return;
    }
    mutation.mutate(parsed.data as QuickCreatePayload);
  };

  return (
    <Screen
      footer={
        <StickyActionBar>
          <View style={styles.footerRow}>
            {stepIndex > 0 ? (
              <Button label="Geri" icon="chevron-back" variant="ghost" onPress={() => setStepIndex((value) => value - 1)} style={styles.footerButton} />
            ) : null}
            <Button
              label={stepIndex === steps.length - 1 ? "Seferi Oluştur" : "Devam"}
              icon={stepIndex === steps.length - 1 ? "checkmark-circle" : "chevron-forward"}
              loading={mutation.isPending}
              onPress={next}
              style={styles.footerButton}
            />
          </View>
        </StickyActionBar>
      }
    >
      <View style={styles.header}>
        <View>
          <AppText variant="headlineMd">Hızlı Sefer</AppText>
          <AppText color={colors.textMuted}>{steps[stepIndex]}</AppText>
        </View>
      </View>
      <StepIndicator current={stepIndex} />

      {stepIndex === 0 ? (
        <TripStep state={state} setPartial={setPartial} />
      ) : stepIndex === 1 ? (
        <VehicleStep
          state={state}
          vehicles={vehicles.data?.results ?? []}
          drivers={drivers.data?.results ?? []}
          isLoading={vehicles.isLoading || drivers.isLoading}
          showErrors={validationStep === 1}
          shakeKey={shakeKey}
          setPartial={setPartial}
          setVehicle={setVehicle}
          setDriver={setDriver}
        />
      ) : stepIndex === 2 ? (
        <RouteStep
          state={state}
          routes={routes.data?.results ?? []}
          errors={validationStep === 2 ? getRouteFieldErrors(state) : {}}
          shakeKey={shakeKey}
          setPartial={setPartial}
          applyRoutePreset={applyRoutePreset}
          setRouteLocation={setRouteLocation}
          setGroup={setGroup}
        />
      ) : stepIndex === 3 ? (
        <PassengerStep
          state={state}
          setPartial={setPartial}
          updatePassenger={updatePassenger}
          removePassenger={removePassenger}
          addPassenger={() => setState((current) => ({ ...current, passengers: [...current.passengers, newPassenger()] }))}
          addParsedPassengers={addParsedPassengers}
          addExcelPassengers={() => void addExcelPassengers()}
          addPhotoPassengers={() => void addPhotoPassengers()}
          isPhotoImporting={isPhotoImporting}
          photoOcrUnavailableMessage={photoOcrStatus.data?.available === false ? photoOcrStatus.data.message : ""}
        />
      ) : (
        <ReviewStep state={state} payload={payload} errors={validateAll(state)} />
      )}
    </Screen>
  );
}

function TripStep({ state, setPartial }: { state: WizardState; setPartial: (patch: Partial<WizardState>) => void }) {
  return (
    <Card>
      <AppText variant="titleLg">Sefer</AppText>
      <DateTimeControl label="Hareket" value={state.departure_at} onChange={(departure_at) => setPartial({ departure_at })} />
      <DurationControl
        departureAt={state.departure_at}
        arrivalAt={state.arrival_estimated_at}
        onChange={(arrival_estimated_at) => setPartial({ arrival_estimated_at })}
      />
      <DateTimeControl label="Bitiş" value={state.arrival_estimated_at} onChange={(arrival_estimated_at) => setPartial({ arrival_estimated_at })} />
    </Card>
  );
}

function VehicleStep({
  state,
  vehicles,
  drivers,
  isLoading,
  showErrors,
  shakeKey,
  setPartial,
  setVehicle,
  setDriver
}: {
  state: WizardState;
  vehicles: Vehicle[];
  drivers: Personnel[];
  isLoading: boolean;
  showErrors: boolean;
  shakeKey: number;
  setPartial: (patch: Partial<WizardState>) => void;
  setVehicle: (patch: Partial<WizardState["vehicle"]>) => void;
  setDriver: (patch: Partial<WizardState["driver"]>) => void;
}) {
  const chooseVehicle = (vehicle: Vehicle) => {
    setPartial({ selected_vehicle_id: vehicle.id });
    setVehicle({ plate: vehicle.plate, seat_capacity: String(vehicle.seat_capacity || 1) });
  };
  const chooseDriver = (driver: Personnel) => {
    const selected = state.selected_driver_ids.includes(driver.id);
    if (selected) {
      const nextIds = state.selected_driver_ids.filter((id) => id !== driver.id);
      setPartial({ selected_driver_ids: nextIds });
      if (state.driver.identity_no === driver.identity_no) {
        const nextPrimary = drivers.find((item) => item.id === nextIds[0]);
        setDriver(nextPrimary ? driverToDraft(nextPrimary) : emptyDriverDraft());
      }
      return;
    }
    const nextIds = [...state.selected_driver_ids, driver.id];
    setPartial({ selected_driver_ids: nextIds });
    if (!state.selected_driver_ids.length) {
      setDriver(driverToDraft(driver));
    }
  };

  const vehicleError = showErrors && !state.selected_vehicle_id;
  const driverError = showErrors && !state.selected_driver_ids.length;

  return (
    <>
      <Card style={vehicleError ? styles.selectionErrorCard : undefined}>
        <View style={styles.sectionHeader}>
          <AppText variant="titleLg">Araç Seç</AppText>
          <Button label="Yeni Araç" icon="add" variant="ghost" onPress={() => router.push("/records/add-vehicle")} />
        </View>
        {vehicleError ? <SelectionWarning message="Devam etmek için bir araç seçmelisin." shakeKey={shakeKey} /> : null}
        {isLoading ? <AppText color={colors.textMuted}>Kayıtlar yükleniyor</AppText> : null}
        {!isLoading && vehicles.length === 0 ? <EmptySelection label="Kayıtlı aktif araç yok" /> : null}
        {vehicles.map((vehicle) => (
          <SelectionRow
            key={vehicle.id}
            title={vehicle.plate}
            subtitle={`${vehicle.seat_capacity} koltuk`}
            meta={vehicle.uetds_status === "valid" ? "UETDS OK" : vehicle.uetds_status === "invalid" ? "UETDS Hatalı" : "Kontrol Yok"}
            active={state.selected_vehicle_id === vehicle.id}
            onPress={() => chooseVehicle(vehicle)}
          />
        ))}
      </Card>
      <Card style={driverError ? styles.selectionErrorCard : undefined}>
        <View style={styles.sectionHeader}>
          <View>
            <AppText variant="titleLg">Şoförleri Seç</AppText>
            <AppText variant="labelMd" color={colors.textMuted}>
              {state.selected_driver_ids.length ? `${state.selected_driver_ids.length} şoför seçildi` : "En az bir şoför seçilmeli"}
            </AppText>
          </View>
          <Button label="Yeni Şoför" icon="add" variant="ghost" onPress={() => router.push("/records/add-driver")} />
        </View>
        {driverError ? <SelectionWarning message="Devam etmek için en az bir şoför seçmelisin." shakeKey={shakeKey} /> : null}
        {!isLoading && drivers.length === 0 ? <EmptySelection label="Kayıtlı aktif şoför yok" /> : null}
        {drivers.map((driver) => (
          <SelectionRow
            key={driver.id}
            title={`${driver.first_name} ${driver.last_name}`}
            subtitle={`${driver.identity_no}${driver.src_codes ? ` - ${driver.src_codes}` : ""}`}
            meta={state.selected_driver_ids.includes(driver.id) ? "Seçili" : driver.uetds_last_checked_at ? "UETDS Onaylı" : undefined}
            active={state.selected_driver_ids.includes(driver.id)}
            onPress={() => chooseDriver(driver)}
          />
        ))}
      </Card>
    </>
  );
}

function SelectionWarning({ message, shakeKey }: { message: string; shakeKey: number }) {
  return (
    <ShakeView hasError shakeKey={shakeKey} style={styles.selectionWarning}>
      <AppText variant="labelMd" color={colors.error}>
        {message}
      </AppText>
    </ShakeView>
  );
}

function RouteStep({
  state,
  routes,
  errors,
  shakeKey,
  setPartial,
  applyRoutePreset,
  setRouteLocation,
  setGroup
}: {
  state: WizardState;
  routes: SavedRoute[];
  errors: RouteFieldErrors;
  shakeKey: number;
  setPartial: (patch: Partial<WizardState>) => void;
  applyRoutePreset: (id: string) => void;
  setRouteLocation: (side: "from" | "to", patch: Partial<LocationDraft>) => void;
  setGroup: (patch: Partial<WizardState["group"]>) => void;
}) {
  const applySavedRoute = (route: SavedRoute) => {
    setPartial({
      route: {
        preset_id: `saved:${route.id}`,
        from: savedRouteLocation(route, "departure"),
        to: savedRouteLocation(route, "arrival")
      }
    });
    setGroup({
      name: route.default_group_name || "TRANSFER",
      description: route.default_group_description || route.name,
      price: route.default_price ? String(route.default_price) : "",
      currency: route.currency || "TRY"
    });
  };

  return (
    <>
      <Card>
        <AppText variant="titleLg">Rota</AppText>
        {routes.length ? (
          <View style={styles.locationPicker}>
            <AppText variant="labelLg" color={colors.textMuted}>
              Kayıtlı Rotalar
            </AppText>
            {routes.slice(0, 6).map((route) => (
              <SelectionRow
                key={route.id}
                title={route.name}
                subtitle={`${route.departure_place || route.departure_city} -> ${route.arrival_place || route.arrival_city}`}
                meta={route.default_price ? `${route.default_price} ${route.currency}` : undefined}
                active={state.route.preset_id === `saved:${route.id}`}
                onPress={() => applySavedRoute(route)}
              />
            ))}
          </View>
        ) : null}
        <AppText variant="labelLg" color={colors.textMuted}>
          Hızlı Başlangıç
        </AppText>
        <View style={styles.chipRow}>
          {routePresets.map((preset) => (
            <ChoiceChip key={preset.id} label={preset.label} active={state.route.preset_id === preset.id} onPress={() => applyRoutePreset(preset.id)} />
          ))}
        </View>
        <LocationFields
          title="Biniş"
          value={state.route.from}
          locationError={errors.departureLocation}
          detailError={errors.departureDetail}
          shakeKey={shakeKey}
          onChange={(patch) => setRouteLocation("from", patch)}
        />
        <LocationFields
          title="İniş"
          value={state.route.to}
          locationError={errors.arrivalLocation}
          detailError={errors.arrivalDetail}
          shakeKey={shakeKey}
          onChange={(patch) => setRouteLocation("to", patch)}
        />
      </Card>
      <Card>
        <AppText variant="titleLg">Grup</AppText>
        <View style={styles.columns}>
          <Field label="Grup Adı" value={state.group.name} onChangeText={(name) => setGroup({ name })} error={errors.groupName} shakeKey={shakeKey} containerStyle={styles.columnField} />
          <Field label="Ücret" value={state.group.price} onChangeText={(price) => setGroup({ price })} error={errors.groupPrice} shakeKey={shakeKey} keyboardType="decimal-pad" containerStyle={styles.columnField} />
        </View>
        <Field label="Grup Açıklaması" value={state.group.description} onChangeText={(description) => setGroup({ description })} error={errors.groupDescription} shakeKey={shakeKey} />
      </Card>
    </>
  );
}

function LocationFields({
  title,
  value,
  locationError,
  detailError,
  shakeKey,
  onChange
}: {
  title: string;
  value: LocationDraft;
  locationError?: string;
  detailError?: string;
  shakeKey: number;
  onChange: (patch: Partial<LocationDraft>) => void;
}) {
  const selectLocation = (option: LocationReference) => {
    const addressDetail = referenceAddressDetail(option);
    onChange({
      country: option.country,
      city: option.city,
      district: option.district,
      city_code: option.city_code,
      district_code: option.district_code,
      address: addressDetail,
      place: addressDetail
    });
  };
  const selectedLocation = value.city_code || value.district_code ? { ...value, place: value.district || value.city } : undefined;
  return (
    <View style={styles.locationBlock}>
      <AppText variant="labelLg">{title}</AppText>
      <ShakeView hasError={Boolean(locationError)} shakeKey={shakeKey}>
        <LocationReferenceSearch
          label={`${title} Yeri`}
          selected={selectedLocation}
          onSelect={selectLocation}
          canUseTextAsPlace={Boolean(value.city_code && value.district_code)}
          onUseTextAsPlace={(place) => onChange({ place, address: place })}
          error={locationError}
        />
      </ShakeView>
      <Field
        label={title === "Biniş" ? "Biniş adres detayı" : "İniş adres detayı"}
        value={value.address || value.place}
        onChangeText={(place) => onChange({ place, address: place })}
        error={detailError}
        shakeKey={shakeKey}
      />
    </View>
  );
}

function referenceAddressDetail(option: LocationReference) {
  return option.kind === "district" ? "" : option.address || option.place;
}

function PassengerStep({
  state,
  setPartial,
  updatePassenger,
  removePassenger,
  addPassenger,
  addParsedPassengers,
  addExcelPassengers,
  addPhotoPassengers,
  isPhotoImporting,
  photoOcrUnavailableMessage
}: {
  state: WizardState;
  setPartial: (patch: Partial<WizardState>) => void;
  updatePassenger: (id: string, patch: Partial<PassengerDraft>) => void;
  removePassenger: (id: string) => void;
  addPassenger: () => void;
  addParsedPassengers: () => void;
  addExcelPassengers: () => void;
  addPhotoPassengers: () => void;
  isPhotoImporting: boolean;
  photoOcrUnavailableMessage: string;
}) {
  return (
    <>
      <Card>
        <View style={styles.sectionHeader}>
          <AppText variant="titleLg">Yolcu Girişi</AppText>
          <View style={styles.inlineActions}>
            <Button label="Excel" icon="document-text" variant="ghost" onPress={addExcelPassengers} />
            <Button label="Foto/OCR" icon="camera" variant="ghost" loading={isPhotoImporting} onPress={addPhotoPassengers} />
          </View>
        </View>
        {photoOcrUnavailableMessage ? (
          <View style={styles.notice}>
            <AppText variant="bodyMd" color={colors.textMuted}>
              {photoOcrUnavailableMessage}
            </AppText>
          </View>
        ) : null}
        <Field
          label="Kopyala Yapıştır"
          value={state.passenger_import_text}
          onChangeText={(passenger_import_text) => setPartial({ passenger_import_text })}
          multiline
          placeholder="1 İngiltere NRF00000974 GERRAD FERGUSON E"
        />
        <Button label="Metni Ayrıştır" icon="sparkles" variant="secondary" onPress={addParsedPassengers} />
      </Card>
      {state.passengers.map((passenger, index) => (
        <PassengerCard
          key={passenger.id}
          passenger={passenger}
          index={index}
          updatePassenger={updatePassenger}
          removePassenger={removePassenger}
        />
      ))}
      <Button label="Yolcu Ekle" icon="add-circle" variant="ghost" onPress={addPassenger} />
    </>
  );
}

function PassengerCard({
  passenger,
  index,
  updatePassenger,
  removePassenger
}: {
  passenger: PassengerDraft;
  index: number;
  updatePassenger: (id: string, patch: Partial<PassengerDraft>) => void;
  removePassenger: (id: string) => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [isDeleting, setIsDeleting] = useState(false);
  const selectedCountry = passenger.identity_type === "tc" ? TURKEY_COUNTRY : resolveCountry(passenger.nationality, passenger.country_name);

  const deletePassenger = () => {
    if (isDeleting) {
      return;
    }
    setIsDeleting(true);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0.12, duration: 220, useNativeDriver: useNativeAnimationDriver }),
      Animated.timing(translateX, { toValue: -28, duration: 220, useNativeDriver: useNativeAnimationDriver }),
      Animated.timing(scale, { toValue: 0.98, duration: 220, useNativeDriver: useNativeAnimationDriver })
    ]).start(() => removePassenger(passenger.id));
  };
  const changeIdentityType = (identity_type: IdentityType) => {
    const patch: Partial<PassengerDraft> = {
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
    <Animated.View style={{ opacity, transform: [{ translateX }, { scale }] }}>
      <Card style={isDeleting ? styles.deletingCard : undefined}>
        <View style={styles.sectionHeader}>
          <AppText variant="titleLg">{`${index + 1}. Yolcu`}</AppText>
          <IconButton icon="trash" label="Yolcuyu sil" onPress={deletePassenger} />
        </View>
        <View style={styles.columns}>
          <Field label="Ad" value={passenger.first_name} onChangeText={(first_name) => updatePassenger(passenger.id, { first_name })} containerStyle={styles.columnField} />
          <Field label="Soyad" value={passenger.last_name} onChangeText={(last_name) => updatePassenger(passenger.id, { last_name })} containerStyle={styles.columnField} />
        </View>
        <SegmentedControl options={identityOptions} value={passenger.identity_type} onChange={changeIdentityType} />
        <Field
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
          <Field label="Koltuk" value={passenger.seat_no} onChangeText={(seat_no) => updatePassenger(passenger.id, { seat_no })} keyboardType="number-pad" containerStyle={styles.columnField} />
        </View>
        <Field label="Telefon (opsiyonel)" value={passenger.phone} onChangeText={(phone) => updatePassenger(passenger.id, { phone })} keyboardType="phone-pad" />
      </Card>
    </Animated.View>
  );
}

function ReviewStep({ state, payload, errors }: { state: WizardState; payload: QuickCreatePayload; errors: string[] }) {
  const vehicle = payload.vehicle;
  const driver = payload.driver;
  const driverCount = state.selected_driver_ids.length;
  const driverLabel = driverCount > 1 ? `${driver?.first_name || "-"} ${driver?.last_name || ""} + ${driverCount - 1} şoför` : `${driver?.first_name || "-"} ${driver?.last_name || ""}`;
  return (
    <>
      <Card>
        <AppText variant="titleLg">Kontrol</AppText>
        <SummaryRow label="Sefer" value={`${formatDateTime(state.departure_at)} - ${formatDateTime(state.arrival_estimated_at)}`} />
        <SummaryRow label="Araç" value={`${vehicle?.plate || "-"} / ${vehicle?.seat_capacity || "-"} koltuk`} />
        <SummaryRow label="Şoförler" value={driverLabel} />
        <SummaryRow label="Rota" value={`${payload.route.from.place || payload.route.from.address} -> ${payload.route.to.place || payload.route.to.address}`} />
        <SummaryRow label="Grup" value={`${state.group.name} / ${state.group.price || "-"} ${state.group.currency}`} />
        <SummaryRow label="Yolcu" value={`${payload.passengers.length} kişi`} />
      </Card>
      {errors.length ? (
        <Card style={styles.warningCard}>
          <AppText variant="titleLg" color={colors.error}>
            Eksik Alanlar
          </AppText>
          {errors.map((error) => (
            <AppText key={error} color={colors.error}>
              {error}
            </AppText>
          ))}
        </Card>
      ) : (
        <Card style={styles.readyCard}>
          <AppText variant="titleLg" color={colors.secondary}>
            UETDS gönderimine hazır
          </AppText>
        </Card>
      )}
    </>
  );
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
  const setDatePreset = (offset: number) => {
    const now = new Date();
    const next = new Date(date);
    next.setFullYear(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    onChange(toLocalIso(next));
  };
  const setTimeOffset = (minutes: number) => onChange(toLocalIso(addMinutes(date, minutes)));
  const setManualClock = (text: string) => {
    const normalized = normalizeClockInput(text);
    setManualTime(normalized);
    const parsed = parseClockInput(normalized);
    if (!parsed) {
      return;
    }
    const next = new Date(date);
    next.setHours(parsed.hours, parsed.minutes, 0, 0);
    onChange(toLocalIso(next));
  };
  const commitManualClock = () => {
    const parsed = parseClockInput(manualTime);
    setManualTime(parsed ? `${pad(parsed.hours)}:${pad(parsed.minutes)}` : formatTime(date));
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
      <Field
        label="Saat"
        value={manualTime}
        onChangeText={setManualClock}
        onBlur={commitManualClock}
        keyboardType="numbers-and-punctuation"
        placeholder="09:45"
      />
      <View style={styles.chipRow}>
        <ChoiceChip label="Bugün" active={isSameDay(date, new Date())} onPress={() => setDatePreset(0)} />
        <ChoiceChip label="Yarın" active={isSameDay(date, addMinutes(new Date(), 24 * 60))} onPress={() => setDatePreset(1)} />
        <ChoiceChip label="-15 dk" onPress={() => setTimeOffset(-15)} />
        <ChoiceChip label="+15 dk" onPress={() => setTimeOffset(15)} />
      </View>
    </View>
  );
}

function DurationControl({
  departureAt,
  arrivalAt,
  onChange
}: {
  departureAt: string;
  arrivalAt: string;
  onChange: (value: string) => void;
}) {
  const departure = parseIso(departureAt);
  const arrival = parseIso(arrivalAt);
  const minutes = Math.max(0, Math.round((arrival.getTime() - departure.getTime()) / 60000));
  return (
    <View style={styles.durationBox}>
      <AppText variant="labelLg" color={colors.textMuted}>
        Süre
      </AppText>
      <View style={styles.chipRow}>
        {[60, 90, 120, 150, 180].map((value) => (
          <ChoiceChip key={value} label={`${value / 60} sa`} active={minutes === value} onPress={() => onChange(toLocalIso(addMinutes(departure, value)))} />
        ))}
      </View>
    </View>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={styles.stepRow}>
      {steps.map((step, index) => (
        <View key={step} style={[styles.stepPill, current === index && styles.stepPillActive]}>
          <AppText variant="labelMd" color={current === index ? colors.surface : colors.textMuted}>
            {`${index + 1}. ${step}`}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable key={String(option.value)} onPress={() => onChange(option.value)} style={[styles.segment, value === option.value && styles.segmentActive]}>
          <AppText variant="labelLg" color={value === option.value ? colors.surface : colors.textMuted} style={styles.segmentText}>
            {option.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

function ChoiceChip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choiceChip, active && styles.choiceChipActive]}>
      <AppText variant="labelMd" color={active ? colors.surface : colors.primary}>
        {label}
      </AppText>
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  shakeKey?: number;
  containerStyle?: ViewStyle;
};

function Field({ label, value, onChangeText, error, shakeKey = 0, containerStyle, ...props }: FieldProps) {
  return (
    <ShakeView hasError={Boolean(error)} shakeKey={shakeKey} style={containerStyle}>
      <TextField label={label} value={value} onChangeText={onChangeText} error={error} {...props} />
    </ShakeView>
  );
}

function ShakeView({ children, hasError, shakeKey, style }: { children: ReactNode; hasError: boolean; shakeKey: number; style?: ViewStyle }) {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasError || shakeKey <= 0) {
      return;
    }
    translateX.setValue(0);
    Animated.sequence([
      Animated.timing(translateX, { toValue: -6, duration: 45, useNativeDriver: useNativeAnimationDriver }),
      Animated.timing(translateX, { toValue: 6, duration: 45, useNativeDriver: useNativeAnimationDriver }),
      Animated.timing(translateX, { toValue: -4, duration: 45, useNativeDriver: useNativeAnimationDriver }),
      Animated.timing(translateX, { toValue: 4, duration: 45, useNativeDriver: useNativeAnimationDriver }),
      Animated.timing(translateX, { toValue: 0, duration: 45, useNativeDriver: useNativeAnimationDriver })
    ]).start();
  }, [hasError, shakeKey, translateX]);

  return <Animated.View style={[style, { transform: [{ translateX }] }]}>{children}</Animated.View>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <AppText variant="labelLg" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText style={styles.summaryValue}>{value}</AppText>
    </View>
  );
}

function SelectionRow({
  title,
  subtitle,
  meta,
  active,
  onPress
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.selectionRow, active && styles.selectionRowActive]}>
      <View style={styles.selectionBody}>
        <AppText variant="labelLg">{title}</AppText>
        {subtitle ? <AppText color={colors.textMuted}>{subtitle}</AppText> : null}
      </View>
      {meta ? (
        <AppText variant="labelMd" color={active ? colors.primary : colors.textSubtle} style={styles.selectionMeta}>
          {meta}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function EmptySelection({ label }: { label: string }) {
  return (
    <View style={styles.emptySelection}>
      <AppText color={colors.textMuted}>{label}</AppText>
    </View>
  );
}

function savedRouteLocation(route: SavedRoute, side: "departure" | "arrival"): LocationDraft {
  if (side === "departure") {
    return {
      country: route.departure_country || "TR",
      city: route.departure_city,
      district: route.departure_district,
      city_code: route.departure_city_code,
      district_code: route.departure_district_code,
      address: route.departure_address || route.departure_place,
      place: route.departure_place
    };
  }
  return {
    country: route.arrival_country || "TR",
    city: route.arrival_city,
    district: route.arrival_district,
    city_code: route.arrival_city_code,
    district_code: route.arrival_district_code,
    address: route.arrival_address || route.arrival_place,
    place: route.arrival_place
  };
}

function buildPayload(state: WizardState): QuickCreatePayload {
  return {
    departure_at: state.departure_at,
    arrival_estimated_at: state.arrival_estimated_at,
    description: state.group.description,
    vehicle_id: state.selected_vehicle_id || undefined,
    driver_id: state.selected_driver_ids[0] || undefined,
    driver_ids: state.selected_driver_ids.length ? state.selected_driver_ids : undefined,
    vehicle: {
      plate: normalizePlate(state.vehicle.plate),
      seat_capacity: Number(state.vehicle.seat_capacity || 1)
    },
    driver: {
      type: "driver",
      role: "driver",
      identity_no: state.driver.identity_no,
      first_name: state.driver.first_name,
      last_name: state.driver.last_name,
      nationality: state.driver.nationality || "TR",
      gender: normalizeGenderCode(state.driver.gender),
      phone: state.driver.phone,
      uetds_role_code: state.driver.uetds_role_code,
      src_codes: state.driver.src_codes
    },
    route: {
      from: state.route.from,
      to: state.route.to
    },
    groups: [
      {
        name: state.group.name,
        description: state.group.description,
        price: state.group.price,
        currency: state.group.currency
      }
    ],
    passengers: state.passengers
      .filter((passenger) => !isEmptyPassenger(passenger))
      .map((passenger) => {
        const country = passengerCountryForSubmit(passenger);
        return {
          first_name: passenger.first_name,
          last_name: passenger.last_name,
          identity_type: passenger.identity_type,
          identity_no: passenger.identity_no,
          nationality: country?.code || passenger.nationality,
          country_name: country?.name || passenger.country_name,
          gender: normalizeGenderCode(passenger.gender),
          seat_no: passenger.seat_no,
          phone: passenger.phone,
          group_index: 0
        };
      }),
    route_note: state.group.description,
    submit_to_uetds: false
  };
}

function validateStep(state: WizardState, step: number) {
  const errors = validateAll(state);
  if (step === 0) {
    return errors.filter((error) => ["Hareket", "Bitiş"].some((prefix) => error.startsWith(prefix)));
  }
  if (step === 1) {
    return errors.filter((error) => ["Araç", "Şoför"].some((prefix) => error.startsWith(prefix)));
  }
  if (step === 2) {
    return errors.filter((error) => ["Biniş", "İniş", "Grup"].some((prefix) => error.startsWith(prefix)));
  }
  if (step === 3) {
    return errors.filter((error) => error.startsWith("Yolcu"));
  }
  return errors;
}

function validateAll(state: WizardState) {
  const payload = buildPayload(state);
  const errors = [];
  if (!payload.departure_at) errors.push("Hareket zamanı zorunlu.");
  if (!payload.arrival_estimated_at) errors.push("Bitiş zamanı zorunlu.");
  if (payload.departure_at && payload.arrival_estimated_at && parseIso(payload.arrival_estimated_at).getTime() <= parseIso(payload.departure_at).getTime()) {
    errors.push("Bitiş zamanı hareketten sonra olmalı.");
  }
  if (!state.selected_vehicle_id) errors.push("Araç seçilmeli.");
  if (!state.selected_driver_ids.length) errors.push("Şoför seçilmeli.");
  if (!payload.route.from.city || !payload.route.from.district) errors.push("Biniş yeri seçilmeli.");
  if (!payload.route.from.place && !payload.route.from.address) errors.push("Biniş adres detayı zorunlu.");
  if (!payload.route.to.city || !payload.route.to.district) errors.push("İniş yeri seçilmeli.");
  if (!payload.route.to.place && !payload.route.to.address) errors.push("İniş adres detayı zorunlu.");
  if ((payload.route.from.country || "TR") === "TR" && (!payload.route.from.city_code || !payload.route.from.district_code)) {
    errors.push("Biniş il ve ilçe kodu zorunlu.");
  }
  if ((payload.route.to.country || "TR") === "TR" && (!payload.route.to.city_code || !payload.route.to.district_code)) {
    errors.push("İniş il ve ilçe kodu zorunlu.");
  }
  if (!state.group.name) errors.push("Grup adı zorunlu.");
  if (!state.group.description) errors.push("Grup açıklaması zorunlu.");
  if (!state.group.price) errors.push("Grup ücreti zorunlu.");
  if (!payload.passengers.length) errors.push("Yolcu eklenmeli.");
  payload.passengers.forEach((passenger, index) => {
    const prefix = `Yolcu ${index + 1}`;
    if (!passenger.first_name || !passenger.last_name) errors.push(`${prefix}: ad soyad zorunlu.`);
    const hasKnownIdentityType = ["passport", "tc"].includes(passenger.identity_type);
    if (!hasKnownIdentityType) {
      errors.push(`${prefix}: kimlik tipi seçilmeli.`);
    } else {
      if (!passenger.identity_no) errors.push(`${prefix}: kimlik/pasaport zorunlu.`);
      if (passenger.identity_type === "tc" && passenger.identity_no && !isValidTurkishIdentityNo(passenger.identity_no)) {
        errors.push(`${prefix}: T.C. Kimlik numarası geçersiz.`);
      }
      if (passenger.identity_type === "passport" && (!passenger.nationality || !passenger.country_name)) {
        errors.push(`${prefix}: ülke seçilmeli.`);
      }
    }
    if (!normalizeGenderCode(passenger.gender || "")) errors.push(`${prefix}: cinsiyet seçilmeli.`);
  });
  return errors;
}

function passengerCountryForSubmit(passenger: PassengerDraft) {
  if (passenger.identity_type === "tc") {
    return TURKEY_COUNTRY;
  }
  return resolveCountry(passenger.nationality, passenger.country_name);
}

function getRouteFieldErrors(state: WizardState): RouteFieldErrors {
  return {
    departureLocation: state.route.from.city && state.route.from.district && state.route.from.city_code && state.route.from.district_code ? undefined : "Boş bırakılamaz",
    departureDetail: state.route.from.address.trim() || state.route.from.place.trim() ? undefined : "Boş bırakılamaz",
    arrivalLocation: state.route.to.city && state.route.to.district && state.route.to.city_code && state.route.to.district_code ? undefined : "Boş bırakılamaz",
    arrivalDetail: state.route.to.address.trim() || state.route.to.place.trim() ? undefined : "Boş bırakılamaz",
    groupName: state.group.name.trim() ? undefined : "Boş bırakılamaz",
    groupPrice: state.group.price.trim() ? undefined : "Boş bırakılamaz",
    groupDescription: state.group.description.trim() ? undefined : "Boş bırakılamaz"
  };
}

function newPassenger(): PassengerDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    first_name: "",
    last_name: "",
    identity_type: "unknown",
    identity_no: "",
    nationality: "",
    country_name: "",
    gender: "",
    seat_no: "",
    phone: ""
  };
}

function isEmptyPassenger(passenger: PassengerDraft) {
  return !passenger.first_name && !passenger.last_name && !passenger.identity_no;
}

function parseIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function roundToNextQuarter(date: Date) {
  const next = new Date(date);
  const minutes = next.getMinutes();
  next.setMinutes(Math.ceil(minutes / 15) * 15, 0, 0);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
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

function formatDateTime(value: string) {
  const date = parseIso(value);
  return `${formatDate(date)} ${formatTime(date)}`;
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
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
    return null;
  }
  if (/^\d{3,4}$/.test(trimmed)) {
    const padded = trimmed.padStart(4, "0");
    const hours = Number(padded.slice(0, 2));
    const minutes = Number(padded.slice(2, 4));
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }
  return null;
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  stepRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  stepPill: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    justifyContent: "center"
  },
  stepPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
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
    justifyContent: "space-between",
    gap: spacing.sm
  },
  notice: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm
  },
  segmented: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xxs
  },
  segment: {
    alignItems: "center",
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.xs
  },
  segmentActive: {
    backgroundColor: colors.primary
  },
  segmentText: {
    textAlign: "center"
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
  durationBox: {
    gap: spacing.xs
  },
  locationBlock: {
    gap: spacing.xs
  },
  locationPicker: {
    gap: spacing.xs
  },
  savedLocationRow: {
    alignItems: "center",
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.sm
  },
  inlineActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "flex-end"
  },
  savedLocationText: {
    flex: 1,
    gap: 2
  },
  selectionRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
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
  selectionMeta: {
    textAlign: "right"
  },
  emptySelection: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm
  },
  selectionErrorCard: {
    backgroundColor: "#FFF8F7",
    borderColor: "#E7B4AF"
  },
  selectionWarning: {
    backgroundColor: "#FCEAE7",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  footerRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  footerButton: {
    flex: 1
  },
  summaryRow: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingVertical: spacing.sm
  },
  summaryValue: {
    flexShrink: 1
  },
  warningCard: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error
  },
  deletingCard: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error
  },
  readyCard: {
    backgroundColor: colors.secondarySoft,
    borderColor: colors.secondary
  }
});

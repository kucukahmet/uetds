import { apiBinaryRequest, apiRequest } from "@/lib/api";
import type {
  Company,
  CompanySettings,
  CancelUetdsResponse,
  LocationReference,
  Paginated,
  Passenger,
  PassengerPhotoOcrResponse,
  PassengerPhotoOcrStatus,
  Personnel,
  QuickCreatePayload,
  QuickCreateResponse,
  SavedLocation,
  SavedRoute,
  SubmitUetdsResponse,
  SyncSummaryResponse,
  Trip,
  TripUpdatePayload,
  UetdsOperationLog,
  UetdsStatus,
  User,
  Vehicle
} from "@/types/api";

export type UetdsEnvironment = "test" | "live";
type UetdsCheckResponse = {
  valid: boolean;
  environment: UetdsEnvironment;
  message?: string;
  checks?: Array<{ operation: string; success: boolean; sonuc_kodu: string; message: string }>;
};

export const endpoints = {
  me: () => apiRequest<User>("/me"),
  companies: () => apiRequest<Paginated<Company>>("/companies/", { skipCompany: true }),
  switchCompany: (id: string) => apiRequest(`/companies/${id}/switch/`, { method: "POST", skipCompany: true }),
  updateCompanySettings: (companyId: string, data: Partial<CompanySettings>) =>
    apiRequest<CompanySettings>(`/companies/${companyId}/settings/`, { method: "PATCH", skipCompany: true, body: JSON.stringify(data) }),

  vehicles: (query = "") => apiRequest<Paginated<Vehicle>>(`/vehicles/${formatListQuery(query)}`),
  createVehicle: (data: Partial<Vehicle>) => apiRequest<Vehicle>("/vehicles/", { method: "POST", body: JSON.stringify(data) }),
  vehicleUetdsCheck: (id: string, environment?: UetdsEnvironment) =>
    apiRequest<UetdsCheckResponse>(`/vehicles/${id}/uetds-check/`, {
      method: "POST",
      body: JSON.stringify(environment ? { environment } : {})
    }),

  personnel: (query = "") => apiRequest<Paginated<Personnel>>(`/personnel/${formatListQuery(query)}`),
  personnelDetail: (id: string) => apiRequest<Personnel>(`/personnel/${id}/`),
  createPersonnel: (data: Partial<Personnel>) => apiRequest<Personnel>("/personnel/", { method: "POST", body: JSON.stringify(data) }),
  updatePersonnel: (id: string, data: Partial<Personnel>) =>
    apiRequest<Personnel>(`/personnel/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  personnelUetdsCheck: (id: string, environment?: UetdsEnvironment) =>
    apiRequest<UetdsCheckResponse>(`/personnel/${id}/uetds-check/`, {
      method: "POST",
      body: JSON.stringify(environment ? { environment } : {})
    }),

  passengers: (search = "") => apiRequest<Paginated<Passenger>>(`/passengers/${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createPassenger: (data: Partial<Passenger>) => apiRequest<Passenger>("/passengers/", { method: "POST", body: JSON.stringify(data) }),
  passengerPhotoOcrStatus: () => apiRequest<PassengerPhotoOcrStatus>("/imports/passenger-photo-ocr/status/"),
  passengerPhotoOcr: (data: FormData) => apiRequest<PassengerPhotoOcrResponse>("/imports/passenger-photo-ocr/", { method: "POST", body: data }),

  locations: (query = "") => apiRequest<Paginated<SavedLocation>>(`/locations/${formatListQuery(query)}`),
  createLocation: (data: Partial<SavedLocation>) => apiRequest<SavedLocation>("/locations/", { method: "POST", body: JSON.stringify(data) }),
  locationReferences: (search = "") =>
    apiRequest<{ count: number; results: LocationReference[] }>(`/location-references/${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  routes: (query = "") => apiRequest<Paginated<SavedRoute>>(`/routes/${formatListQuery(query)}`),
  createRoute: (data: Partial<SavedRoute>) => apiRequest<SavedRoute>("/routes/", { method: "POST", body: JSON.stringify(data) }),

  trips: (query = "") => apiRequest<Paginated<Trip>>(`/trips/${appendQueryParam(formatListQuery(query), "sync_uetds=1")}`),
  trip: (id: string) => apiRequest<Trip>(`/trips/${id}/${appendQueryParam("", "sync_uetds=1")}`),
  updateTrip: (id: string, data: TripUpdatePayload) =>
    apiRequest<Trip>(`/trips/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTrip: (id: string) => apiRequest<void>(`/trips/${id}/`, { method: "DELETE" }),
  quickCreateTrip: (data: QuickCreatePayload) =>
    apiRequest<QuickCreateResponse>("/trips/quick-create/", { method: "POST", body: JSON.stringify(data) }),
  duplicateTrip: (id: string) => apiRequest<Trip>(`/trips/${id}/duplicate/`, { method: "POST" }),
  createReturnTrip: (id: string, departureAt: string) =>
    apiRequest<Trip>(`/trips/${id}/create-return-trip/`, {
      method: "POST",
      body: JSON.stringify({ departure_at: departureAt, route_note: "Mobil dönüş seferi" })
    }),
  tripDetailPdf: (id: string) => apiBinaryRequest(`/trips/${id}/detail-pdf/`),

  uetdsStatus: () => apiRequest<Partial<UetdsStatus>>("/uetds/status/"),
  saveUetdsCredentials: (environment: UetdsEnvironment, username: string, password: string) =>
    apiRequest("/uetds/credentials/", {
      method: "POST",
      body: JSON.stringify({ environment, username, password, is_active: true })
    }),
  verifyUetds: (environment: UetdsEnvironment) => apiRequest("/uetds/verify/", { method: "POST", body: JSON.stringify({ environment }) }),
  ipList: (environment: UetdsEnvironment) => apiRequest(`/uetds/ip-list/?environment=${environment}`),
  submitUetds: (tripId: string) =>
    apiRequest<SubmitUetdsResponse>(`/trips/${tripId}/submit-uetds/`, {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `mobile-${tripId}-${Date.now()}`,
        confirm_live_submission: true
      })
    }),
  cancelUetds: (tripId: string, reason = "Mobil uygulamadan iptal") =>
    apiRequest<CancelUetdsResponse>(`/trips/${tripId}/cancel-uetds/`, {
      method: "POST",
      body: JSON.stringify({ reason, confirm_live_submission: true })
    }),
  syncSummary: (tripId: string) =>
    apiRequest<SyncSummaryResponse>(`/trips/${tripId}/sync-summary/`, { method: "POST" }),
  logs: (failed = false) => apiRequest<Paginated<UetdsOperationLog>>(`/uetds/logs/${failed ? "?success=false" : ""}`)
};

function formatListQuery(query: string) {
  if (!query) {
    return "";
  }
  return query.startsWith("?") ? query : `?search=${encodeURIComponent(query)}`;
}

function appendQueryParam(query: string, param: string) {
  if (!query) {
    return `?${param}`;
  }
  return `${query}${query.includes("?") ? "&" : "?"}${param}`;
}

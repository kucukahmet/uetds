export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type CompanySettings = {
  live_uetds_enabled: boolean;
  default_uetds_environment: "test" | "live";
  session_days: number;
};

export type Company = {
  id: string;
  name: string;
  tax_no: string;
  unet_no: string;
  status: "active" | "passive";
  settings?: CompanySettings;
};

export type Membership = {
  id: string;
  company: Company;
  role: string;
  is_active: boolean;
};

export type User = {
  id: string;
  email: string;
  name: string;
  active_company_id: string | null;
  memberships: Membership[];
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  session_expires_in: number;
  user: User;
};

export type ImportedPassenger = {
  first_name: string;
  last_name: string;
  identity_type: Passenger["identity_type"];
  identity_no: string;
  nationality: string;
  country_name: string;
  gender: string;
  seat_no: string;
  phone: string;
};

export type PassengerPhotoOcrResponse = {
  passengers: ImportedPassenger[];
  raw_text: string;
  provider: string;
  model: string;
};

export type PassengerPhotoOcrStatus = {
  available: boolean;
  provider: string;
  model: string;
  message: string;
};

export type Vehicle = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  seat_capacity: number;
  phone: string;
  status: "active" | "passive";
  uetds_status: "unknown" | "valid" | "invalid";
  uetds_authorization_document_no: string;
  uetds_authorization_document_type: string;
  uetds_company_title: string;
  uetds_unet_no: string;
};

export type Personnel = {
  id: string;
  type: "driver" | "guide" | "assistant";
  first_name: string;
  last_name: string;
  identity_no: string;
  nationality: string;
  gender: string;
  phone: string;
  address: string;
  uetds_role_code: number;
  src_codes: string;
  status: "active" | "passive";
  uetds_last_checked_at: string | null;
};

export type Passenger = {
  id: string;
  first_name: string;
  last_name: string;
  identity_type: "tc" | "passport" | "foreign_id" | "unknown";
  identity_no: string | null;
  nationality: string;
  country_name: string;
  gender: string;
  phone: string;
};

export type SavedLocation = {
  id: string;
  name: string;
  country: string;
  city: string;
  district: string;
  city_code: string;
  district_code: string;
  place: string;
  address: string;
  usage_count: number;
};

export type LocationReference = {
  id: string;
  country: string;
  city: string;
  city_code: string;
  district: string;
  district_code: string;
  place: string;
  address: string;
  kind: "district" | "airport" | "saved";
  source: "uetds" | "mernis" | "saved";
};

export type SavedRoute = {
  id: string;
  name: string;
  departure_country: string;
  departure_city: string;
  departure_district: string;
  departure_city_code: string;
  departure_district_code: string;
  departure_place: string;
  departure_address: string;
  arrival_country: string;
  arrival_city: string;
  arrival_district: string;
  arrival_city_code: string;
  arrival_district_code: string;
  arrival_place: string;
  arrival_address: string;
  default_group_name: string;
  default_group_description: string;
  default_price: string | null;
  currency: string;
  usage_count: number;
};

export type TripStatus =
  | "draft"
  | "ready"
  | "submitting"
  | "submitted"
  | "partial_failed"
  | "failed"
  | "cancel_requested"
  | "cancelled";

export type TripUetdsSyncStatus = "not_submitted" | "synced" | "update_required" | "local_draft" | "unknown" | "cancelled";

export type Trip = {
  id: string;
  status: TripStatus;
  firm_trip_no: string;
  description: string;
  vehicle: string;
  vehicle_detail?: Vehicle;
  driver: string;
  driver_detail?: Personnel;
  departure_at: string;
  arrival_estimated_at: string | null;
  departure_city: string;
  departure_district: string;
  departure_address: string;
  arrival_city: string;
  arrival_district: string;
  arrival_address: string;
  route_note: string;
  passenger_count: number;
  uetds_reference_no: string | null;
  uetds_environment: "test" | "live";
  uetds_sync_status: TripUetdsSyncStatus;
  uetds_has_unsent_changes: boolean;
  uetds_last_submitted_at: string | null;
  uetds_sync_message: string;
  groups: TripGroup[];
  passengers: Array<{ id: string; passenger: Passenger; group_id: string | null; status: string; seat_no: string }>;
};

export type QuickCreatePayload = {
  departure_at: string;
  arrival_estimated_at?: string | null;
  firm_trip_no?: string;
  description?: string;
  vehicle_id?: string;
  driver_id?: string;
  vehicle?: { id?: string; plate: string; brand?: string; model?: string; seat_capacity?: number; phone?: string };
  driver?: {
    id?: string;
    type?: Personnel["type"];
    role?: string;
    identity_no: string;
    first_name?: string;
    last_name?: string;
    nationality?: string;
    gender?: string;
    phone?: string;
    address?: string;
    uetds_role_code?: number;
    src_codes?: string;
  };
  route: {
    from: { country?: string; city: string; district?: string; city_code?: string; district_code?: string; address: string; place?: string };
    to: { country?: string; city: string; district?: string; city_code?: string; district_code?: string; address: string; place?: string };
  };
  group?: {
    name: string;
    description?: string;
    price?: string | number | null;
    currency?: string;
  };
  groups?: Array<{
    name: string;
    description?: string;
    price?: string | number | null;
    currency?: string;
  }>;
  personnel?: Array<{
    type?: Personnel["type"];
    role?: string;
    identity_no: string;
    first_name?: string;
    last_name?: string;
    nationality?: string;
    gender?: string;
    phone?: string;
    address?: string;
    uetds_role_code?: number;
    src_codes?: string;
  }>;
  passengers: Array<{
    first_name: string;
    last_name: string;
    identity_type: Passenger["identity_type"];
    identity_no?: string | null;
    nationality?: string;
    country_name?: string;
    gender?: string;
    seat_no?: string;
    phone?: string;
    group_index?: number;
    group_name?: string;
  }>;
  route_note?: string;
  submit_to_uetds?: boolean;
};

export type TripGroup = {
  id: string;
  name: string;
  description: string;
  price: string | null;
  currency: string;
  departure_country: string;
  departure_city: string;
  departure_district: string;
  departure_city_code: string;
  departure_district_code: string;
  departure_place: string;
  arrival_country: string;
  arrival_city: string;
  arrival_district: string;
  arrival_city_code: string;
  arrival_district_code: string;
  arrival_place: string;
  uetds_group_ref_no: string | null;
};

export type QuickCreateResponse = {
  trip_id: string;
  status: TripStatus;
  validation: { ready_for_uetds: boolean; missing_fields: string[] };
};

export type UetdsSubmitOperation = {
  operation: string;
  success: boolean;
  sonuc_kodu: string;
  sonuc_mesaji: string;
};

export type SubmitUetdsResponse = {
  trip_id: string;
  status: TripStatus;
  environment: "test" | "live";
  uetds_reference_no: string | null;
  uetds_sync_status: TripUetdsSyncStatus;
  uetds_last_submitted_at: string | null;
  operations: UetdsSubmitOperation[];
  success: boolean;
  message: string;
};

export type SyncSummaryResponse = UetdsSubmitOperation & {
  environment: "test" | "live";
  remote_status: "submitted" | "cancelled" | "unknown";
  local_status_before: TripStatus;
  local_status_after: TripStatus;
  updated: boolean;
  applied_changes: Array<{ field: string; old: string; new: string }>;
  uetds_sync_status: TripUetdsSyncStatus;
  message: string;
};

export type TripUpdatePayload = Partial<{
  description: string;
  vehicle: string;
  driver: string;
  departure_at: string;
  arrival_estimated_at: string | null;
  departure_city: string;
  departure_district: string;
  departure_address: string;
  arrival_city: string;
  arrival_district: string;
  arrival_address: string;
  route_note: string;
  groups: Array<
    Partial<{
      id: string;
      name: string;
      description: string;
      price: string | null;
      currency: string;
      departure_country: string;
      departure_city: string;
      departure_district: string;
      departure_city_code: string;
      departure_district_code: string;
      departure_place: string;
      arrival_country: string;
      arrival_city: string;
      arrival_district: string;
      arrival_city_code: string;
      arrival_district_code: string;
      arrival_place: string;
    }>
  >;
  passengers: Array<
    Partial<{
      id: string;
      passenger_id: string;
      group_id: string;
      first_name: string;
      last_name: string;
      identity_type: Passenger["identity_type"];
      identity_no: string | null;
      nationality: string;
      country_name: string;
      gender: string;
      seat_no: string;
      phone: string;
      status: string;
    }>
  >;
}>;

export type UetdsStatus = Record<
  "test" | "live",
  {
    configured: boolean;
    status: "missing" | "pending" | "verified" | "failed";
    severity: "success" | "warning" | "error";
    message: string;
    last_verified_at: string | null;
    last_result: string | null;
    last_error_at: string | null;
    last_log_id: string | null;
  }
>;

export type UetdsOperationLog = {
  id: string;
  trip: string | null;
  operation: string;
  environment: "test" | "live";
  http_status: number | null;
  success: boolean;
  uetds_sonuc_kodu: string;
  uetds_sonuc_mesaji: string;
  created_at: string;
};

import { getSessionSnapshot } from "@/store/sessionRef";
import { getBackendProfileSnapshot } from "@/store/backendRef";

function companyScope() {
  return getSessionSnapshot().activeCompanyId || "no-company";
}

function backendScope() {
  return getBackendProfileSnapshot().key;
}

export const queryKeys = {
  me: () => ["backend", backendScope(), "me"] as const,
  companies: () => ["backend", backendScope(), "companies"] as const,
  vehiclesRoot: () => ["backend", backendScope(), "company", companyScope(), "vehicles"] as const,
  vehicles: (search = "") => [...queryKeys.vehiclesRoot(), search] as const,
  personnelRoot: () => ["backend", backendScope(), "company", companyScope(), "personnel"] as const,
  personnel: (search = "") => [...queryKeys.personnelRoot(), search] as const,
  personnelDetail: (id: string) => [...queryKeys.personnelRoot(), "detail", id] as const,
  passengersRoot: () => ["backend", backendScope(), "company", companyScope(), "passengers"] as const,
  passengers: (search = "") => [...queryKeys.passengersRoot(), search] as const,
  passengerPhotoOcrStatus: () => ["backend", backendScope(), "company", companyScope(), "passengerPhotoOcrStatus"] as const,
  locationsRoot: () => ["backend", backendScope(), "company", companyScope(), "locations"] as const,
  locations: (search = "") => [...queryKeys.locationsRoot(), search] as const,
  locationReferences: (search = "") => ["backend", backendScope(), "company", companyScope(), "locationReferences", search] as const,
  routesRoot: () => ["backend", backendScope(), "company", companyScope(), "routes"] as const,
  routes: (query = "") => [...queryKeys.routesRoot(), query] as const,
  tripsRoot: () => ["backend", backendScope(), "company", companyScope(), "trips"] as const,
  trips: (query = "") => [...queryKeys.tripsRoot(), query] as const,
  trip: (id: string) => ["backend", backendScope(), "company", companyScope(), "trip", id] as const,
  uetdsStatus: () => ["backend", backendScope(), "company", companyScope(), "uetdsStatus"] as const,
  logsRoot: () => ["backend", backendScope(), "company", companyScope(), "uetdsLogs"] as const,
  logs: (failed = false) => [...queryKeys.logsRoot(), failed] as const
};

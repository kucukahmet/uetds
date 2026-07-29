import type { UetdsEnvironment } from "@/api/endpoints";
import type { Company, UetdsStatus } from "@/types/api";

export type UetdsStatusItem = UetdsStatus[UetdsEnvironment];

export function getCompanyUetdsEnvironment(company?: Company | null): UetdsEnvironment {
  return company?.settings?.default_uetds_environment || "live";
}

export function getActiveUetdsStatus(data?: Partial<UetdsStatus>, company?: Company | null) {
  const environment = getCompanyUetdsEnvironment(company);
  return data?.[environment] || data?.live || data?.test;
}

export function uetdsConnectionLabel(status?: Partial<UetdsStatusItem>) {
  if (!status) {
    return "Kontrol";
  }
  if (status.status === "verified") {
    return "Bağlı";
  }
  if (status.status === "pending") {
    return "Doğrulanmadı";
  }
  return "Bağlı Değil";
}

export function uetdsConnectionMessage(status?: Partial<UetdsStatusItem>) {
  if (!status) {
    return "Bağlantı durumu alınamadı.";
  }
  if (status.status === "verified") {
    return "UETDS kullanıcı bilgileri doğrulandı.";
  }
  if (status.status === "pending") {
    return "Kullanıcı bilgileri kayıtlı, doğrulama bekliyor.";
  }
  if (status.status === "failed") {
    return "Son UETDS doğrulaması başarısız.";
  }
  return "UETDS kullanıcı bilgileri tanımlı değil.";
}

export function uetdsConnectionBadgeStatus(status?: Partial<UetdsStatusItem>) {
  if (status?.status === "verified") {
    return "active";
  }
  if (status?.status === "pending") {
    return "ready";
  }
  return "failed";
}

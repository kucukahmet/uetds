import { describe, expect, it } from "vitest";

import { queryKeys } from "@/api/queryKeys";
import { getBackendProfile } from "@/lib/backendProfiles";
import { getApiBaseUrl } from "@/lib/config";
import { findCountryByNameOrCode, searchCountries } from "@/lib/countries";
import { isValidTurkishIdentityNo, normalizeGenderCode, sanitizeDigits, sanitizePersonName, validateDriverDraft } from "@/lib/driverValidation";
import { getFeedbackMessage } from "@/lib/errors";
import { normalizePlate } from "@/lib/format";
import { identityOptions } from "@/lib/options";
import { parsePassengerMatrix, parsePassengerText } from "@/lib/passengerImport";
import { parsePassengerWorkbookData } from "@/lib/passengerWorkbook";
import { sanitizePassengerIdentity, validatePassengerDraft } from "@/lib/passengerValidation";
import { loginSchema, quickTripSchema } from "@/lib/validation";
import { setBackendProfileSnapshot } from "@/store/backendRef";
import { setSessionSnapshot } from "@/store/sessionRef";
import * as XLSX from "xlsx";

describe("validation", () => {
  it("accepts demo login values", () => {
    expect(loginSchema.parse({ email: "ops@example.com", password: "secret" })).toEqual({
      email: "ops@example.com",
      password: "secret"
    });
  });

  it("requires route fields for quick trip", () => {
    const result = quickTripSchema.safeParse({
      departure_at: "2026-06-13T10:30:00+03:00",
      arrival_estimated_at: "2026-06-13T12:30:00+03:00",
      vehicle: { plate: "34BRN001", seat_capacity: 16 },
      driver: { identity_no: "11111111110", first_name: "Ahmet", last_name: "Yilmaz", uetds_role_code: 0 },
      route: {
        from: { city: "Istanbul", address: "Havalimani" },
        to: { city: "Istanbul", address: "Otel" }
      },
      groups: [{ name: "TRANSFER", price: "900" }],
      passengers: [{ first_name: "Ayse", last_name: "Demir", identity_type: "tc", identity_no: "22222222220" }]
    });

    expect(result.success).toBe(true);
  });
});

describe("format helpers", () => {
  it("normalizes Turkish plates", () => {
    expect(normalizePlate("34 brn 001")).toBe("34BRN001");
  });

  it("shows only passport and TC identity options for now", () => {
    expect(identityOptions.map((option) => option.value)).toEqual(["passport", "tc"]);
  });
});

describe("country helpers", () => {
  it("searches by Turkish name, English alias and code", () => {
    expect(findCountryByNameOrCode("Turkey")).toMatchObject({ code: "TR", name: "Türkiye" });
    expect(findCountryByNameOrCode("GB")).toMatchObject({ code: "GB", name: "İngiltere" });
    expect(searchCountries("ing")[0]).toMatchObject({ code: "GB", name: "İngiltere" });
  });
});

describe("passenger import", () => {
  it("parses copied passenger rows", () => {
    expect(parsePassengerText("1 İngiltere NRF00000974 GERRAD FERGUSON E")[0]).toMatchObject({
      first_name: "Gerrad",
      last_name: "Ferguson",
      identity_type: "passport",
      identity_no: "NRF00000974",
      nationality: "GB",
      country_name: "İngiltere",
      gender: "E",
      seat_no: "1"
    });
  });

  it("parses headerless UETDS Excel passenger rows", () => {
    expect(parsePassengerMatrix([["TR", "İBRAHİM", "ERKAN", 10481878388, "E", "-"]])[0]).toMatchObject({
      first_name: "İbrahim",
      last_name: "Erkan",
      identity_type: "tc",
      identity_no: "10481878388",
      nationality: "TR",
      country_name: "Türkiye",
      gender: "E",
      phone: ""
    });
  });

  it("parses uploaded Excel bytes without corrupting Turkish names", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([["TR", "İBRAHİM", "ERKAN", 10481878388, "E", "-"]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Yolcular");

    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as Uint8Array;
    const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" }) as string;

    expect(parsePassengerWorkbookData(bytes, "array")[0]).toMatchObject({
      first_name: "İbrahim",
      last_name: "Erkan",
      identity_no: "10481878388"
    });
    expect(parsePassengerWorkbookData(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`, "base64")[0]).toMatchObject({
      first_name: "İbrahim",
      last_name: "Erkan",
      identity_no: "10481878388"
    });
  });
});

describe("query keys", () => {
  it("scopes tenant data by active company", () => {
    const backendKey = getBackendProfile(null).key;
    setBackendProfileSnapshot(getBackendProfile(null));
    setSessionSnapshot({ activeCompanyId: "company-a" });
    expect(queryKeys.trips("")).toEqual(["backend", backendKey, "company", "company-a", "trips", ""]);
    setSessionSnapshot({ activeCompanyId: "company-b" });
    expect(queryKeys.trips("")).toEqual(["backend", backendKey, "company", "company-b", "trips", ""]);
    expect(queryKeys.uetdsStatus()).toEqual(["backend", backendKey, "company", "company-b", "uetdsStatus"]);
    expect(queryKeys.passengerPhotoOcrStatus()).toEqual(["backend", backendKey, "company", "company-b", "passengerPhotoOcrStatus"]);
  });

  it("scopes tenant data by configured backend", () => {
    setSessionSnapshot({ activeCompanyId: "company-a" });
    const backendKey = getBackendProfile(null).key;
    setBackendProfileSnapshot(getBackendProfile(null));
    expect(queryKeys.companies()).toEqual(["backend", backendKey, "companies"]);
    expect(queryKeys.vehicles()).toEqual(["backend", backendKey, "company", "company-a", "vehicles", ""]);
  });
});

describe("backend profiles", () => {
  it("uses the single env configured API base URL", () => {
    setBackendProfileSnapshot(getBackendProfile(null));
    expect(getApiBaseUrl()).toBe(getBackendProfile(null).apiUrl);
  });
});

describe("feedback helpers", () => {
  it("extracts nested backend credential errors", () => {
    expect(
      getFeedbackMessage({
        success: false,
        error_code: "invalid",
        message: { credential: "test UETDS bilgisi tanımlı değil." }
      })
    ).toBe("test UETDS bilgisi tanımlı değil.");
  });

  it("extracts list field validation errors", () => {
    expect(
      getFeedbackMessage({
        success: false,
        error_code: "invalid",
        message: { identity_no: ["Bu kimlik/pasaport numarası bu firmada zaten kayıtlı."] }
      })
    ).toBe("Bu kimlik/pasaport numarası bu firmada zaten kayıtlı.");
  });

  it("extracts API exception detail errors", () => {
    expect(
      getFeedbackMessage({
        success: false,
        error_code: "photo_ocr_not_configured",
        message: { detail: "Foto/OCR henüz bağlı değil. OPENAI_API_KEY eklendiğinde aktif olacak." }
      })
    ).toBe("Foto/OCR henüz bağlı değil. OPENAI_API_KEY eklendiğinde aktif olacak.");
  });
});

describe("driver form validation", () => {
  it("filters text and digit-only fields", () => {
    expect(sanitizePersonName("Gizem123!")).toBe("Gizem");
    expect(sanitizeDigits("abc123456789502", 11)).toBe("12345678950");
  });

  it("accepts English gender codes and normalizes them to UETDS codes", () => {
    expect(normalizeGenderCode("M")).toBe("E");
    expect(normalizeGenderCode("male")).toBe("E");
    expect(normalizeGenderCode("F")).toBe("K");
    expect(normalizeGenderCode("female")).toBe("K");
    expect(validateDriverDraft({
      firstName: "John",
      lastName: "Driver",
      identityNo: "11111111110",
      nationality: "GB",
      gender: "M",
      uetdsRoleCode: "1",
      phone: ""
    })).not.toHaveProperty("gender");
    expect(validateDriverDraft({
      firstName: "John",
      lastName: "Driver",
      identityNo: "11111111110",
      nationality: "GB",
      gender: "M",
      uetdsRoleCode: "1",
      phone: ""
    })).not.toHaveProperty("identityNo");
  });

  it("rejects 11 digit but invalid Turkish identity numbers", () => {
    expect(isValidTurkishIdentityNo("57400000214")).toBe(false);
    expect(isValidTurkishIdentityNo("57400000208")).toBe(true);
    expect(
      validateDriverDraft({
        firstName: "Hüseyin",
        lastName: "Akbay",
        identityNo: "57400000214",
        nationality: "TR",
        gender: "E",
        uetdsRoleCode: "0",
        phone: "05435339454"
      })
    ).toMatchObject({ identityNo: "T.C. Kimlik numarası geçersiz." });
  });

  it("requires valid driver identity and name fields", () => {
    expect(
      validateDriverDraft({
        firstName: "Gizem1",
        lastName: "Akbay",
        identityNo: "84365938",
        nationality: "TR",
        gender: "",
        uetdsRoleCode: "1",
        phone: "05435339454"
      })
    ).toMatchObject({
      firstName: "Ad sadece harf içermeli.",
      identityNo: "T.C. Kimlik 11 haneli sayı olmalı.",
      gender: "Cinsiyet seçilmeli."
    });
  });
});

describe("passenger form validation", () => {
  it("sanitizes passenger identity by selected type", () => {
    expect(sanitizePassengerIdentity("abc123456789502", "tc")).toBe("12345678950");
    expect(sanitizePassengerIdentity(" nrf-00000974 ", "passport")).toBe("NRF00000974");
  });

  it("accepts English gender codes for passenger forms", () => {
    expect(validatePassengerDraft({
      firstName: "Mary",
      lastName: "Passenger",
      identityType: "passport",
      identityNo: "NRF00000974",
      nationality: "GB",
      countryName: "İngiltere",
      gender: "F",
      phone: ""
    })).not.toHaveProperty("gender");
  });

  it("requires valid passenger name, identity and phone fields", () => {
    expect(
      validatePassengerDraft({
        firstName: "Ayse1",
        lastName: "Demir",
        identityType: "tc",
        identityNo: "123",
        nationality: "T1",
        countryName: "Türkiye",
        gender: "",
        phone: "abc"
      })
    ).toMatchObject({
      firstName: "Ad sadece harf içermeli.",
      identityNo: "T.C. Kimlik 11 haneli sayı olmalı.",
      gender: "Cinsiyet seçilmeli.",
      phone: "Telefon 10-15 haneli sayı olmalı."
    });
  });

  it("requires country selection for passport passengers", () => {
    expect(
      validatePassengerDraft({
        firstName: "Mary",
        lastName: "Passenger",
        identityType: "passport",
        identityNo: "NRF00000974",
        nationality: "",
        countryName: "",
        gender: "F",
        phone: ""
      })
    ).toMatchObject({ nationality: "Ülke seçilmeli." });
  });

  it("rejects invalid TC passengers before UETDS submit", () => {
    expect(
      validatePassengerDraft({
        firstName: "Ayse",
        lastName: "Demir",
        identityType: "tc",
        identityNo: "57400000214",
        nationality: "TR",
        countryName: "Türkiye",
        gender: "K",
        phone: ""
      })
    ).toMatchObject({ identityNo: "T.C. Kimlik numarası geçersiz." });
  });
});

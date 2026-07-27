import type { Passenger } from "@/types/api";

import { resolveCountry, TURKEY_COUNTRY } from "@/lib/countries";
import { isValidTurkishIdentityNo, normalizeGenderCode, sanitizeCountryCode, sanitizeDigits, sanitizePersonName } from "@/lib/driverValidation";

export type PassengerDraft = {
  firstName: string;
  lastName: string;
  identityType: Passenger["identity_type"];
  identityNo: string;
  nationality: string;
  countryName: string;
  gender: string;
  phone: string;
};

export type PassengerErrors = Partial<Record<keyof PassengerDraft, string>>;

export function sanitizePassengerIdentity(value: string, identityType: Passenger["identity_type"]) {
  if (identityType === "tc") {
    return sanitizeDigits(value, 11);
  }
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 32);
}

export function validatePassengerDraft(draft: PassengerDraft) {
  const errors: PassengerErrors = {};
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();

  if (!firstName) {
    errors.firstName = "Ad zorunlu.";
  } else if (sanitizePersonName(firstName) !== firstName) {
    errors.firstName = "Ad sadece harf içermeli.";
  }

  if (!lastName) {
    errors.lastName = "Soyad zorunlu.";
  } else if (sanitizePersonName(lastName) !== lastName) {
    errors.lastName = "Soyad sadece harf içermeli.";
  }

  if (!["tc", "passport"].includes(draft.identityType)) {
    errors.identityType = "Kimlik tipi seçilmeli.";
  }

  if (draft.identityType === "tc") {
    if (!/^\d{11}$/.test(draft.identityNo)) {
      errors.identityNo = "T.C. Kimlik 11 haneli sayı olmalı.";
    } else if (!isValidTurkishIdentityNo(draft.identityNo)) {
      errors.identityNo = "T.C. Kimlik numarası geçersiz.";
    }
  }
  if (draft.identityType !== "tc" && !/^[A-Z0-9]{3,32}$/.test(draft.identityNo)) {
    errors.identityNo = "Kimlik/Pasaport 3-32 haneli harf ve sayı olmalı.";
  }

  const country = draft.identityType === "tc" ? TURKEY_COUNTRY : resolveCountry(draft.nationality, draft.countryName);
  if (draft.identityType !== "tc" && !country) {
    errors.nationality = "Ülke seçilmeli.";
  } else if (country && !/^[A-Z]{2,3}$/.test(country.code)) {
    errors.nationality = "Ülke kodu 2 veya 3 harf olmalı.";
  }

  if (!normalizeGenderCode(draft.gender)) {
    errors.gender = "Cinsiyet seçilmeli.";
  }

  if (draft.phone && !/^\d{10,15}$/.test(draft.phone)) {
    errors.phone = "Telefon 10-15 haneli sayı olmalı.";
  }

  return errors;
}

export function firstPassengerError(errors: PassengerErrors) {
  return Object.values(errors)[0] || "";
}

export { normalizeGenderCode, sanitizeCountryCode, sanitizeDigits, sanitizePersonName };

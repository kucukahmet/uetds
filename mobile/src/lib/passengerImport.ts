import type { Passenger } from "@/types/api";

import { findCountryByNameOrCode, TURKEY_COUNTRY, type CountryOption } from "@/lib/countries";

export type ParsedPassenger = {
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

export function parsePassengerText(raw: string): ParsedPassenger[] {
  return raw
    .split(/\r?\n/)
    .map((line) => parsePassengerLine(line))
    .filter((passenger): passenger is ParsedPassenger => Boolean(passenger));
}

export function parsePassengerMatrix(rows: unknown[][]): ParsedPassenger[] {
  const normalizedRows = rows.map((row) => row.map(cellToString)).filter((row) => row.some(Boolean));
  if (!normalizedRows.length) {
    return [];
  }
  if (looksLikeHeaderRow(normalizedRows[0])) {
    const headers = normalizedRows[0].map(normalizeHeader);
    return normalizedRows
      .slice(1)
      .map((row) => parsePassengerObjectRow(Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]))))
      .filter((passenger): passenger is ParsedPassenger => Boolean(passenger));
  }
  return normalizedRows.map((row) => parsePassengerArrayRow(row)).filter((passenger): passenger is ParsedPassenger => Boolean(passenger));
}

function parsePassengerLine(line: string): ParsedPassenger | null {
  const tokens = line
    .replace(/[;,|\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }

  let gender = "";
  let seat_no = "";
  let country: CountryOption | null = null;
  let identity_no = "";
  let phone = "";
  const nameTokens: string[] = [];

  for (const token of tokens) {
    const normalized = normalizeToken(token);
    const matchedCountry = findCountryByNameOrCode(normalized);
    if (matchedCountry) {
      country = matchedCountry;
      continue;
    }
    if (!gender && ["e", "erkek", "m", "male"].includes(normalized)) {
      gender = "E";
      continue;
    }
    if (!gender && ["k", "kadin", "kadın", "f", "female"].includes(normalized)) {
      gender = "K";
      continue;
    }
    if (!seat_no && /^\d{1,3}$/.test(token)) {
      seat_no = token;
      continue;
    }
    if (!identity_no && isIdentityLike(token)) {
      identity_no = token.toUpperCase();
      continue;
    }
    if (!phone && identity_no && isPhoneLike(token)) {
      phone = sanitizePhone(token);
      continue;
    }
    nameTokens.push(token);
  }

  if (nameTokens.length < 2) {
    return null;
  }
  const first_name = titleCaseName(nameTokens.slice(0, -1).join(" "));
  const last_name = titleCaseName(nameTokens[nameTokens.length - 1]);
  const identity_type = identityTypeFor(identity_no);
  const resolvedCountry = country || (identity_type === "tc" ? TURKEY_COUNTRY : null);
  return {
    first_name,
    last_name,
    identity_type,
    identity_no,
    nationality: resolvedCountry?.code || "",
    country_name: resolvedCountry?.name || "",
    gender,
    seat_no,
    phone
  };
}

function parsePassengerArrayRow(row: string[]): ParsedPassenger | null {
  const [countryCell, firstNameCell, lastNameCell, identityCell, genderCell, phoneCell, seatCell] = row;
  const identity_no = normalizeIdentity(identityCell);
  const identity_type = identityTypeFor(identity_no);
  const country = countryFromValue(countryCell) || (identity_type === "tc" ? TURKEY_COUNTRY : null);
  const first_name = titleCaseName(firstNameCell);
  const last_name = titleCaseName(lastNameCell);
  if (!first_name || !last_name || !identity_no) {
    return parsePassengerLine(row.join(" "));
  }
  return {
    first_name,
    last_name,
    identity_type,
    identity_no,
    nationality: country?.code || "",
    country_name: country?.name || "",
    gender: normalizeGender(genderCell),
    seat_no: normalizeSeat(seatCell),
    phone: sanitizePhone(phoneCell)
  };
}

function parsePassengerObjectRow(row: Record<string, string>): ParsedPassenger | null {
  const identity_no = normalizeIdentity(valueFor(row, ["identity", "identityno", "kimlik", "kimlikpasaport", "tckimlik", "pasaport", "passport"]));
  const first_name = titleCaseName(valueFor(row, ["first", "firstname", "ad", "adi", "adsoyad"]));
  const last_name = titleCaseName(valueFor(row, ["last", "lastname", "soyad", "soyadi", "surname"]));
  if (!first_name || !last_name || !identity_no) {
    return parsePassengerLine(Object.values(row).join(" "));
  }
  const identity_type = identityTypeFor(identity_no);
  const country = countryFromValue(valueFor(row, ["country", "countrycode", "ulke", "ulkekodu", "uyruk", "nationality"])) || (identity_type === "tc" ? TURKEY_COUNTRY : null);
  return {
    first_name,
    last_name,
    identity_type,
    identity_no,
    nationality: country?.code || "",
    country_name: country?.name || "",
    gender: normalizeGender(valueFor(row, ["gender", "cinsiyet"])),
    seat_no: normalizeSeat(valueFor(row, ["seat", "seatno", "koltuk", "koltukno"])),
    phone: sanitizePhone(valueFor(row, ["phone", "telefon", "tel", "gsm"]))
  };
}

function isIdentityLike(token: string) {
  const normalized = token.replace(/\s/g, "");
  return /^\d{11}$/.test(normalized) || /^(?=.*\d)[A-Z0-9]{7,16}$/i.test(normalized);
}

function identityTypeFor(identityNo: string): Passenger["identity_type"] {
  return identityNo.length === 11 && /^\d+$/.test(identityNo) ? "tc" : identityNo ? "passport" : "unknown";
}

function isPhoneLike(token: string) {
  const digits = token.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function sanitizePhone(value: unknown) {
  const text = cellToString(value);
  if (!text || text === "-") {
    return "";
  }
  const digits = text.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}

function normalizeIdentity(value: unknown) {
  const text = cellToString(value).replace(/\s/g, "");
  if (!text || text === "-") {
    return "";
  }
  if (/^\d+(\.0+)?$/.test(text)) {
    return text.replace(/\.0+$/, "");
  }
  return text.toLocaleUpperCase("tr-TR");
}

function normalizeGender(value: unknown) {
  const normalized = normalizeToken(cellToString(value));
  if (["e", "erkek", "m", "male"].includes(normalized)) {
    return "E";
  }
  if (["k", "kadin", "kadın", "f", "female"].includes(normalized)) {
    return "K";
  }
  return "";
}

function normalizeSeat(value: unknown) {
  const text = cellToString(value);
  return /^\d{1,3}$/.test(text) ? text : "";
}

function countryFromValue(value: unknown): CountryOption | null {
  const text = cellToString(value);
  const matched = findCountryByNameOrCode(text);
  if (matched) {
    return matched;
  }
  const code = text.replace(/[^A-Za-z]/g, "").toLocaleUpperCase("tr-TR");
  if (/^[A-Z]{2,3}$/.test(code)) {
    return { code, name: text };
  }
  return null;
}

function valueFor(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    if (row[normalized]) {
      return row[normalized];
    }
  }
  return "";
}

function looksLikeHeaderRow(row: string[]) {
  const normalized = row.map(normalizeHeader);
  return normalized.some((item) => ["ad", "adi", "firstname", "kimlik", "tckimlik", "pasaport", "uyruk", "country", "cinsiyet"].includes(item));
}

function normalizeHeader(value: string) {
  return normalizeToken(value).replace(/[^a-z0-9]/g, "");
}

function cellToString(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return String(value).trim();
}

function normalizeToken(token: string) {
  return token
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function titleCaseName(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toLocaleUpperCase("tr-TR") + part.slice(1).toLocaleLowerCase("tr-TR"))
    .join(" ");
}

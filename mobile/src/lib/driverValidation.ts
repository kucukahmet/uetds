export type DriverDraft = {
  firstName: string;
  lastName: string;
  identityNo: string;
  nationality: string;
  gender: string;
  uetdsRoleCode: string;
  phone: string;
};

export type DriverErrors = Partial<Record<keyof DriverDraft, string>>;

const namePattern = /^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû\s'-]+$/;

export function sanitizePersonName(value: string) {
  return value.replace(/[^A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû\s'-]/g, "");
}

export function sanitizeDigits(value: string, maxLength?: number) {
  const digits = value.replace(/\D/g, "");
  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

export function sanitizeCountryCode(value: string) {
  return value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);
}

export function isValidTurkishIdentityNo(value: string) {
  if (!/^[1-9]\d{10}$/.test(value)) {
    return false;
  }
  const digits = value.split("").map((item) => Number(item));
  const tenthDigit = ((sumAt(digits, [0, 2, 4, 6, 8]) * 7) - sumAt(digits, [1, 3, 5, 7])) % 10;
  const eleventhDigit = digits.slice(0, 10).reduce((total, digit) => total + digit, 0) % 10;
  return digits[9] === tenthDigit && digits[10] === eleventhDigit;
}

export function normalizeGenderCode(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["e", "erkek", "m", "male"].includes(normalized)) {
    return "E";
  }
  if (["k", "kadin", "kadın", "f", "female"].includes(normalized)) {
    return "K";
  }
  return "";
}

export function validateDriverDraft(draft: DriverDraft) {
  const errors: DriverErrors = {};
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();

  if (!firstName) {
    errors.firstName = "Ad zorunlu.";
  } else if (!namePattern.test(firstName)) {
    errors.firstName = "Ad sadece harf içermeli.";
  }

  if (!lastName) {
    errors.lastName = "Soyad zorunlu.";
  } else if (!namePattern.test(lastName)) {
    errors.lastName = "Soyad sadece harf içermeli.";
  }

  if (!/^\d{11}$/.test(draft.identityNo)) {
    errors.identityNo = "T.C. Kimlik 11 haneli sayı olmalı.";
  } else if (!isValidTurkishIdentityNo(draft.identityNo)) {
    errors.identityNo = "T.C. Kimlik numarası geçersiz.";
  }

  if (!/^[A-Z]{2,3}$/.test(draft.nationality)) {
    errors.nationality = "Uyruk 2 veya 3 harfli ülke kodu olmalı.";
  }

  if (!normalizeGenderCode(draft.gender)) {
    errors.gender = "Cinsiyet seçilmeli.";
  }

  if (!/^\d+$/.test(draft.uetdsRoleCode)) {
    errors.uetdsRoleCode = "Görev kodu sayı olmalı.";
  }

  if (draft.phone && !/^\d{10,15}$/.test(draft.phone)) {
    errors.phone = "Telefon 10-15 haneli sayı olmalı.";
  }

  return errors;
}

export function firstDriverError(errors: DriverErrors) {
  return Object.values(errors)[0] || "";
}

function sumAt(values: number[], indexes: number[]) {
  return indexes.reduce((total, index) => total + values[index], 0);
}

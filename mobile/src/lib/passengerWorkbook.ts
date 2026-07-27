import * as XLSX from "xlsx";

import { parsePassengerMatrix, type ParsedPassenger } from "@/lib/passengerImport";

export function parsePassengerWorkbookData(data: ArrayBuffer | Uint8Array | string, type: "array" | "base64"): ParsedPassenger[] {
  const workbook = XLSX.read(type === "base64" && typeof data === "string" ? normalizeBase64(data) : data, { type });
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!worksheet) {
    return [];
  }
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false }) as unknown[][];
  return parsePassengerMatrix(rows);
}

export function normalizeBase64(value: string) {
  const trimmed = value.trim();
  const marker = "base64,";
  const markerIndex = trimmed.indexOf(marker);
  return (markerIndex >= 0 ? trimmed.slice(markerIndex + marker.length) : trimmed).replace(/\s/g, "");
}

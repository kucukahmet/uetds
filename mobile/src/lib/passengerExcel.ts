import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import type { ParsedPassenger } from "@/lib/passengerImport";
import { parsePassengerWorkbookData } from "@/lib/passengerWorkbook";

const excelMimeTypes = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv"
];

export async function pickPassengerExcel(): Promise<ParsedPassenger[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: excelMimeTypes,
    copyToCacheDirectory: true,
    base64: true
  });
  if (result.canceled || !result.assets?.length) {
    return [];
  }
  const asset = result.assets[0];
  if (asset.file && typeof asset.file.arrayBuffer === "function") {
    return parsePassengerWorkbookData(await asset.file.arrayBuffer(), "array");
  }
  const base64 = asset.base64 || (await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
  return parsePassengerWorkbookData(base64, "base64");
}

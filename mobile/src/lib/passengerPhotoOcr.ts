import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import { endpoints } from "@/api/endpoints";
import type { ImportedPassenger } from "@/types/api";

export type PassengerPhotoOcrSource = "library" | "camera";

export async function pickPassengerPhotoForOcr(source: PassengerPhotoOcrSource = "library"): Promise<ImportedPassenger[]> {
  const result = source === "camera" ? await pickFromCamera() : await pickFromLibrary();
  if (result.canceled || !result.assets.length) {
    return [];
  }
  const formData = new FormData();
  formData.append("image", imageAssetToFormPart(result.assets[0]));
  const response = await endpoints.passengerPhotoOcr(formData);
  return response.passengers;
}

async function pickFromLibrary() {
  if (Platform.OS !== "web") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Fotoğraf seçmek için galeri izni gerekli.");
    }
  }
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.9,
    allowsEditing: false
  });
}

async function pickFromCamera() {
  if (Platform.OS !== "web") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Fotoğraf çekmek için kamera izni gerekli.");
    }
  }
  return ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.9,
    allowsEditing: false
  });
}

function imageAssetToFormPart(asset: ImagePicker.ImagePickerAsset): string | Blob {
  if (asset.file) {
    return asset.file;
  }
  return {
    uri: asset.uri,
    name: asset.fileName || `passengers-${Date.now()}.jpg`,
    type: asset.mimeType || "image/jpeg"
  } as unknown as Blob;
}

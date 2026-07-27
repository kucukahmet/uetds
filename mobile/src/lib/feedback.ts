import { Alert, Platform } from "react-native";

import { getFeedbackMessage } from "@/lib/errors";

export { getFeedbackMessage };

export function showPopup(title: string, message: string) {
  if (Platform.OS === "web" && typeof globalThis.alert === "function") {
    globalThis.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

export function showErrorPopup(title: string, error: unknown, fallback = "İşlem tamamlanamadı.") {
  showPopup(title, getFeedbackMessage(error, fallback));
}

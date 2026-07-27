export function getFeedbackMessage(error: unknown, fallback = "İşlem tamamlanamadı.") {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const value = error as { detail?: unknown; message?: unknown; credential?: unknown };
  if (typeof value.detail === "string") {
    return value.detail;
  }
  if (typeof value.credential === "string") {
    return value.credential;
  }
  if (typeof value.message === "string") {
    return value.message;
  }
  if (value.message && typeof value.message === "object") {
    const message = flattenMessages(value.message);
    return message || fallback;
  }

  return fallback;
}

function flattenMessages(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(flattenMessages).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(flattenMessages).filter(Boolean).join(" ");
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

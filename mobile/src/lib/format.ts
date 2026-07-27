export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function fullName(first?: string, last?: string) {
  return [first, last].filter(Boolean).join(" ");
}

export function normalizePlate(value: string) {
  return value.replace(/\s/g, "").toUpperCase();
}

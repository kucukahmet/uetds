export const colors = {
  background: "#F7F9FC",
  surface: "#FFFFFF",
  surfaceMuted: "#F2F4F7",
  surfaceStrong: "#E6E8EB",
  primary: "#1A237E",
  primaryDeep: "#000666",
  primarySoft: "#E0E0FF",
  secondary: "#006B5F",
  secondarySoft: "#DDF7F2",
  warning: "#FFB300",
  warningSoft: "#FFF4D6",
  error: "#BA1A1A",
  errorSoft: "#FFDAD6",
  text: "#1C1B1F",
  textMuted: "#49454F",
  textSubtle: "#767683",
  divider: "#E0E0E0",
  uetdsTest: "#673AB7"
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999
};

export const typography = {
  headlineLg: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const },
  headlineMd: { fontSize: 22, lineHeight: 28, fontWeight: "600" as const },
  titleLg: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  bodyMd: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  labelLg: { fontSize: 14, lineHeight: 20, fontWeight: "600" as const },
  labelMd: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const }
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  modal: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6
  }
};

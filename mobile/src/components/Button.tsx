import { Pressable, StyleSheet, View, ActivityIndicator, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/theme/tokens";

type Props = {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, icon, variant = "primary", loading, disabled, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[variant], style, pressed && styles.pressed, (disabled || loading) && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={variant === "ghost" ? colors.primary : colors.surface} /> : null}
      {!loading && icon ? <Ionicons name={icon} size={19} color={variant === "ghost" ? colors.primary : colors.surface} /> : null}
      <AppText variant="labelLg" color={variant === "ghost" ? colors.primary : colors.surface} style={styles.label}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label }: { icon: keyof typeof Ionicons.glyphMap; onPress?: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
      <Ionicons name={icon} size={21} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.lg,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.md
  },
  label: {
    flexShrink: 1,
    textAlign: "center"
  },
  primary: {
    backgroundColor: colors.primary
  },
  secondary: {
    backgroundColor: colors.secondary
  },
  danger: {
    backgroundColor: colors.error
  },
  ghost: {
    backgroundColor: "transparent"
  },
  pressed: {
    opacity: 0.82
  },
  disabled: {
    opacity: 0.45
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  }
});

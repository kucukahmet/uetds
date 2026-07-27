import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/theme/tokens";

type Props = {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
};

export function ListRow({ title, subtitle, meta, icon = "chevron-forward", onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.body}>
        <AppText variant="labelLg">{title}</AppText>
        {subtitle ? <AppText color={colors.textMuted}>{subtitle}</AppText> : null}
      </View>
      {typeof meta === "string" ? (
        <AppText variant="labelMd" color={colors.textSubtle}>
          {meta}
        </AppText>
      ) : (
        meta
      )}
      <Ionicons name={icon} size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    padding: spacing.md
  },
  body: {
    flex: 1,
    gap: 2
  },
  pressed: {
    opacity: 0.82
  }
});

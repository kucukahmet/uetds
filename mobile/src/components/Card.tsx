import { type ReactNode } from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";

import { colors, radius, shadow, spacing } from "@/theme/tokens";

type Props = ViewProps & {
  children: ReactNode;
};

export function Card({ children, style, ...props }: Props) {
  return (
    <View {...props} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    ...Platform.select({
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.05)" } as object,
      default: shadow.card
    })
  }
});

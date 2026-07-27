import { type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, shadow, spacing } from "@/theme/tokens";

export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={["bottom"]} style={styles.wrap}>
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    ...Platform.select({
      web: { boxShadow: "0px -2px 8px rgba(0,0,0,0.05)" } as object,
      default: shadow.card
    })
  },
  inner: {
    gap: spacing.sm,
    padding: spacing.md
  }
});

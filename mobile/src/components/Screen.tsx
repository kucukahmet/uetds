import { type ReactNode } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BackendIndicator } from "@/components/BackendIndicator";
import { colors, spacing } from "@/theme/tokens";

type Props = {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  style?: ViewStyle;
  showBackendIndicator?: boolean;
};

export function Screen({ children, scroll = true, refreshing = false, onRefresh, footer, style, showBackendIndicator = true }: Props) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, footer ? styles.withFooter : null, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {showBackendIndicator ? <BackendIndicator /> : null}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.flex, footer ? styles.withFooter : null, style]}>
      {showBackendIndicator ? <BackendIndicator /> : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {content}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background
  },
  flex: {
    flex: 1
  },
  content: {
    padding: spacing.md,
    gap: spacing.sm
  },
  withFooter: {
    paddingBottom: 112
  }
});

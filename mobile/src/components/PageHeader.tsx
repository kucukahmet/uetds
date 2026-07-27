import { type Href } from "expo-router";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { IconButton } from "@/components/Button";
import { goBackOrReplace } from "@/lib/navigation";
import { colors, spacing } from "@/theme/tokens";

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  showBack?: boolean;
  fallbackHref?: Href;
};

export function PageHeader({ title, subtitle, right, showBack = true, fallbackHref = "/" }: Props) {
  return (
    <View style={styles.container}>
      {showBack ? <IconButton icon="arrow-back" label="Geri" onPress={() => goBackOrReplace(fallbackHref)} /> : null}
      <View style={styles.copy}>
        <AppText variant="headlineMd" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText color={colors.textMuted} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  right: {
    alignItems: "flex-end"
  }
});

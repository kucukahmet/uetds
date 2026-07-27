import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/theme/tokens";

type Option<T extends string | number> = {
  label: string;
  value: T;
};

type Props<T extends string | number> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
};

export function SegmentedControl<T extends string | number>({ options, value, onChange, style }: Props<T>) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => (
        <Pressable key={String(option.value)} onPress={() => onChange(option.value)} style={[styles.segment, value === option.value && styles.segmentActive]}>
          <AppText variant="labelLg" color={value === option.value ? colors.surface : colors.textMuted} style={styles.segmentText}>
            {option.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xxs
  },
  segment: {
    alignItems: "center",
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.xs
  },
  segmentActive: {
    backgroundColor: colors.primary
  },
  segmentText: {
    textAlign: "center"
  }
});

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/theme/tokens";

type Option = {
  label: string;
  value: string;
};

type Props = {
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  containerStyle?: ViewStyle;
};

export function SelectField({ label, value, options, onChange, placeholder = "Seçiniz", error, containerStyle }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <AppText variant="labelLg" color={colors.textMuted}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.control, open && styles.controlOpen, error ? styles.controlError : null, pressed && styles.pressed]}
      >
        <AppText color={selected ? colors.text : colors.textSubtle} style={styles.value}>
          {selected?.label || placeholder}
        </AppText>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}
              >
                <AppText color={active ? colors.primary : colors.text}>{option.label}</AppText>
                {active ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {error ? (
        <AppText variant="labelMd" color={colors.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
    minWidth: 0
  },
  control: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md
  },
  controlOpen: {
    borderColor: colors.primary
  },
  controlError: {
    borderColor: colors.error
  },
  value: {
    flex: 1
  },
  menu: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden"
  },
  option: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  optionActive: {
    backgroundColor: colors.primarySoft
  },
  pressed: {
    opacity: 0.82
  }
});

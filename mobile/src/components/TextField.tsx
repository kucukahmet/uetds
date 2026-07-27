import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/theme/tokens";

type Props = TextInputProps & {
  label: string;
  error?: string;
  containerStyle?: ViewStyle;
};

export function TextField({ label, error, style, containerStyle, multiline, ...props }: Props) {
  return (
    <View style={[styles.wrap, containerStyle]}>
      <AppText variant="labelLg" color={colors.textMuted}>
        {label}
      </AppText>
      <TextInput
        placeholderTextColor={colors.textSubtle}
        multiline={multiline}
        {...props}
        style={[styles.input, multiline ? styles.multiline : null, error ? styles.inputError : null, style]}
      />
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
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontFamily: "Inter",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md
  },
  multiline: {
    minHeight: 96,
    paddingTop: spacing.sm,
    textAlignVertical: "top"
  },
  inputError: {
    borderColor: colors.error
  }
});

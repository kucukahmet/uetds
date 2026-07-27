import { Text, type TextProps, StyleSheet } from "react-native";

import { colors, typography } from "@/theme/tokens";

type Variant = keyof typeof typography;

type Props = TextProps & {
  variant?: Variant;
  color?: string;
};

export function AppText({ variant = "bodyMd", color = colors.text, style, ...props }: Props) {
  return <Text {...props} style={[styles.base, typography[variant], { color }, style]} />;
}

const styles = StyleSheet.create({
  base: {
    fontFamily: "Inter",
    letterSpacing: 0
  }
});

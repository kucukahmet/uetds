import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from "react-native";

import { AppText } from "@/components/AppText";
import { resolveCountry, searchCountries, type CountryOption } from "@/lib/countries";
import { colors, radius, spacing } from "@/theme/tokens";

type Props = {
  label?: string;
  countryCode: string;
  countryName: string;
  onSelect: (country: CountryOption) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  containerStyle?: ViewStyle;
};

export function CountrySelectField({
  label = "Ülke",
  countryCode,
  countryName,
  onSelect,
  disabled = false,
  placeholder = "Ülke adı veya kod ara",
  error,
  containerStyle
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => resolveCountry(countryCode, countryName), [countryCode, countryName]);
  const results = useMemo(() => searchCountries(query), [query]);
  const shouldSearch = !disabled && open;

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setQuery("");
    }
  }, [disabled]);

  const openSearch = () => {
    if (disabled) {
      return;
    }
    setQuery("");
    setOpen(true);
  };

  return (
    <View style={[styles.wrap, containerStyle]}>
      <AppText variant="labelLg" color={colors.textMuted}>
        {label}
      </AppText>
      {shouldSearch ? (
        <View style={[styles.searchBox, error ? styles.controlError : null]}>
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            placeholder={placeholder}
            placeholderTextColor={colors.textSubtle}
            style={styles.searchInput}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={openSearch}
          style={({ pressed }) => [
            styles.control,
            disabled && styles.controlDisabled,
            error ? styles.controlError : null,
            pressed && !disabled ? styles.pressed : null
          ]}
        >
          <View style={styles.selectedText}>
            <AppText color={selected ? colors.text : colors.textSubtle}>{selected ? selected.name : placeholder}</AppText>
            {selected ? (
              <AppText variant="labelMd" color={colors.textMuted}>
                {selected.code}
              </AppText>
            ) : null}
          </View>
          {!disabled ? <Ionicons name="chevron-down" size={20} color={colors.textMuted} /> : null}
        </Pressable>
      )}
      {shouldSearch ? (
        <View style={styles.menu}>
          {results.length ? (
            results.map((country) => {
              const active = selected?.code === country.code;
              return (
                <Pressable
                  key={country.code}
                  accessibilityRole="button"
                  onPress={() => {
                    onSelect(country);
                    setQuery("");
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}
                >
                  <View style={styles.selectedText}>
                    <AppText color={active ? colors.primary : colors.text}>{country.name}</AppText>
                    <AppText variant="labelMd" color={colors.textMuted}>
                      {country.code}
                    </AppText>
                  </View>
                  {active ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })
          ) : (
            <View style={styles.empty}>
              <AppText color={colors.textMuted}>Sonuç yok</AppText>
            </View>
          )}
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
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  controlDisabled: {
    backgroundColor: colors.surfaceMuted
  },
  controlError: {
    borderColor: colors.error
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontFamily: "Inter",
    fontSize: 16,
    minHeight: 48
  },
  menu: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    maxHeight: 280,
    overflow: "hidden"
  },
  option: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  optionActive: {
    backgroundColor: colors.primarySoft
  },
  selectedText: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  empty: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  pressed: {
    opacity: 0.82
  }
});

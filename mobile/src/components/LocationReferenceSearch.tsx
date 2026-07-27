import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { TextField } from "@/components/TextField";
import { colors, radius, spacing } from "@/theme/tokens";
import type { LocationReference } from "@/types/api";

type Props = {
  label: string;
  selected?: Partial<LocationReference>;
  onSelect: (location: LocationReference) => void;
  onUseTextAsPlace?: (text: string) => void;
  canUseTextAsPlace?: boolean;
  error?: string;
  containerStyle?: ViewStyle;
};

export function LocationReferenceSearch({ label, selected, onSelect, onUseTextAsPlace, canUseTextAsPlace = true, error, containerStyle }: Props) {
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const normalizedSearch = search.trim();
  const hasSelection = Boolean(selected?.place);
  const showSearch = !hasSelection || isEditing;
  const query = useQuery({
    queryKey: queryKeys.locationReferences(normalizedSearch),
    queryFn: () => endpoints.locationReferences(normalizedSearch),
    enabled: normalizedSearch.length >= 2
  });
  const results = query.data?.results ?? [];

  const choose = (location: LocationReference) => {
    onSelect(location);
    setSearch("");
    setMenuOpen(false);
    setIsEditing(false);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setMenuOpen(value.trim().length >= 2);
  };
  const useTextAsPlace = () => {
    if (!normalizedSearch || !onUseTextAsPlace || !canUseTextAsPlace) {
      return;
    }
    onUseTextAsPlace(normalizedSearch);
    setSearch("");
    setMenuOpen(false);
    setIsEditing(false);
  };

  return (
    <View style={[styles.wrap, containerStyle]}>
      {showSearch ? (
        <TextField label={label} value={search} onChangeText={changeSearch} placeholder="İl, ilçe, semt veya havalimanı ara" autoCapitalize="words" error={error} />
      ) : (
        <AppText variant="labelLg" color={colors.textMuted}>
          {label}
        </AppText>
      )}
      {selected?.place ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setIsEditing(true);
            setMenuOpen(false);
            setSearch("");
          }}
          style={({ pressed }) => [styles.selectedBox, error && styles.selectedBoxError, pressed && styles.pressed]}
        >
          <AppText variant="labelLg">{selected.place}</AppText>
          <AppText variant="labelMd" color={colors.textMuted}>
            {[selected.city, selected.district].filter(Boolean).join(" / ")}
          </AppText>
        </Pressable>
      ) : null}
      {hasSelection && error ? (
        <AppText variant="labelMd" color={colors.error}>
          {error}
        </AppText>
      ) : null}
      {showSearch && menuOpen && normalizedSearch.length >= 2 ? (
        <View style={styles.menu}>
          {query.isFetching ? <AppText color={colors.textMuted}>Aranıyor</AppText> : null}
          {!query.isFetching && !results.length ? (
            <View style={styles.noResult}>
              <AppText color={colors.textMuted}>İlçe veya havalimanı bulunamadı.</AppText>
              {onUseTextAsPlace ? (
                <Pressable
                  disabled={!canUseTextAsPlace}
                  onPress={useTextAsPlace}
                  style={({ pressed }) => [styles.useTextAction, pressed && styles.pressed, !canUseTextAsPlace && styles.disabled]}
                >
                  <AppText variant="labelLg" color={canUseTextAsPlace ? colors.primary : colors.textSubtle}>
                    {canUseTextAsPlace ? `"${normalizedSearch}" adres detayı olsun` : "Önce bağlı ilçe veya havalimanı seçin"}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {results.map((location) => (
            <Pressable key={location.id} onPress={() => choose(location)} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <View style={styles.optionBody}>
                <AppText variant="labelLg">{location.place}</AppText>
                <AppText variant="labelMd" color={colors.textMuted}>
                  {[location.city, location.district].filter(Boolean).join(" / ")}
                </AppText>
              </View>
              <View style={styles.meta}>
                <AppText variant="labelMd" color={colors.primary}>
                  {kindLabel(location.kind)}
                </AppText>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function kindLabel(kind: LocationReference["kind"]) {
  if (kind === "airport") {
    return "Havalimanı";
  }
  if (kind === "saved") {
    return "Kayıtlı";
  }
  return "İlçe";
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs
  },
  selectedBox: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 2,
    padding: spacing.sm
  },
  selectedBoxError: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error
  },
  menu: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.xs
  },
  noResult: {
    gap: spacing.xs,
    padding: spacing.xs
  },
  option: {
    alignItems: "center",
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
    padding: spacing.sm
  },
  optionBody: {
    flex: 1,
    gap: 2
  },
  meta: {
    alignItems: "flex-end",
    gap: 2
  },
  pressed: {
    backgroundColor: colors.surfaceMuted
  },
  useTextAction: {
    borderColor: colors.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm
  },
  disabled: {
    opacity: 0.55
  }
});

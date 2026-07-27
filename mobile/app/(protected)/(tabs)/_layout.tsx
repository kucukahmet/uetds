import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";

import { colors, radius } from "@/theme/tokens";

const tabIcons = {
  index: "home",
  trips: "calendar",
  "quick-trip": "add-circle",
  records: "albums",
  settings: "settings"
} as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.90)",
          borderTopColor: colors.divider,
          minHeight: 72,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarItemStyle: {
          minHeight: 56
        },
        tabBarLabelStyle: {
          fontFamily: "Inter",
          fontSize: 12
        },
        tabBarIcon: ({ color, focused, size }) => {
          const iconName = tabIcons[route.name as keyof typeof tabIcons];

          if (route.name === "quick-trip") {
            return (
              <View style={[styles.quickIcon, focused && styles.quickIconActive]}>
                <Ionicons name={iconName} size={24} color={focused ? colors.surface : colors.primary} />
              </View>
            );
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        }
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Ana Sayfa" }} />
      <Tabs.Screen name="trips" options={{ title: "Seferler" }} />
      <Tabs.Screen name="quick-trip" options={{ title: "Hızlı Giriş" }} />
      <Tabs.Screen name="records" options={{ title: "Kayıtlar" }} />
      <Tabs.Screen name="settings" options={{ title: "Ayarlar" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  quickIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  quickIconActive: {
    backgroundColor: colors.primary
  }
});

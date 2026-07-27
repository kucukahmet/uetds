import "react-native-gesture-handler";

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useAuthStore } from "@/store/auth";
import { useBackendStore } from "@/store/backend";
import { colors } from "@/theme/tokens";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 20_000
    }
  }
});

export default function RootLayout() {
  const hydrateAuth = useAuthStore((state) => state.hydrate);
  const authInitialized = useAuthStore((state) => state.initialized);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const hydrateBackend = useBackendStore((state) => state.hydrate);
  const backendInitialized = useBackendStore((state) => state.initialized);
  const backendKey = useBackendStore((state) => state.activeKey);
  const [fontsLoaded] = useFonts({
    Inter: Inter_400Regular,
    "Inter-Medium": Inter_500Medium,
    "Inter-SemiBold": Inter_600SemiBold,
    "Inter-Bold": Inter_700Bold
  });

  useEffect(() => {
    void hydrateBackend().then(() => hydrateAuth());
  }, [hydrateAuth, hydrateBackend]);

  useEffect(() => {
    if (!authInitialized || !backendInitialized) {
      return;
    }
    queryClient.removeQueries({ queryKey: ["backend"], type: "inactive" });
    void queryClient.invalidateQueries({ queryKey: ["backend"] });
  }, [activeCompanyId, authInitialized, backendInitialized, backendKey]);

  if (!fontsLoaded || !authInitialized || !backendInitialized) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { EmptyState, LoadingState } from "@/components/StateViews";
import { colors } from "@/theme/tokens";

export default function RoutesScreen() {
  const query = useQuery({ queryKey: queryKeys.routes(), queryFn: () => endpoints.routes() });

  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <PageHeader title="Rotalar" fallbackHref="/records" />
      <Button label="Yeni Rota" icon="add" onPress={() => router.push("/records/add-route")} />
      {query.isLoading ? <LoadingState /> : null}
      {!query.isLoading && query.data?.results.length === 0 ? <EmptyState title="Rota yok" /> : null}
      {query.data?.results.map((route) => (
        <Card key={route.id}>
          <AppText variant="titleLg">{route.name}</AppText>
          <AppText>{`${route.departure_place || route.departure_city} -> ${route.arrival_place || route.arrival_city}`}</AppText>
          <AppText color={colors.textMuted}>
            {[route.default_group_name, route.default_price ? `${route.default_price} ${route.currency}` : ""].filter(Boolean).join(" / ")}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}

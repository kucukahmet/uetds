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

export default function LocationsScreen() {
  const query = useQuery({ queryKey: queryKeys.locations(), queryFn: () => endpoints.locations() });
  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <PageHeader title="Lokasyonlar" fallbackHref="/records" />
      <Button label="Yeni Lokasyon" icon="add" onPress={() => router.push("/records/add-location")} />
      {query.isLoading ? <LoadingState /> : null}
      {!query.isLoading && query.data?.results.length === 0 ? <EmptyState title="Lokasyon yok" /> : null}
      {query.data?.results.map((item) => (
        <Card key={item.id}>
          <AppText variant="titleLg">{item.place || item.name}</AppText>
          <AppText>{[item.district, item.city].filter(Boolean).join(" / ")}</AppText>
          <AppText>{item.address}</AppText>
        </Card>
      ))}
    </Screen>
  );
}

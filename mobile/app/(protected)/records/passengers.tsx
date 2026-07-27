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
import { fullName } from "@/lib/format";

export default function PassengersScreen() {
  const query = useQuery({ queryKey: queryKeys.passengers(), queryFn: () => endpoints.passengers() });
  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <PageHeader title="Yolcular" fallbackHref="/records" />
      <Button label="Yeni Yolcu" icon="add" onPress={() => router.push("/records/add-passenger")} />
      {query.isLoading ? <LoadingState /> : null}
      {!query.isLoading && query.data?.results.length === 0 ? <EmptyState title="Yolcu yok" /> : null}
      {query.data?.results.map((item) => (
        <Card key={item.id}>
          <AppText variant="titleLg">{fullName(item.first_name, item.last_name)}</AppText>
          <AppText>{item.identity_no || "Kimlik yok"}</AppText>
          <AppText>{item.nationality}</AppText>
        </Card>
      ))}
    </Screen>
  );
}

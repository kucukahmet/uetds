import { useQuery } from "@tanstack/react-query";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { AppText } from "@/components/AppText";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { EmptyState, LoadingState } from "@/components/StateViews";
import { formatDateTime } from "@/lib/format";
import { colors } from "@/theme/tokens";

export default function LogsScreen() {
  const query = useQuery({ queryKey: queryKeys.logs(), queryFn: () => endpoints.logs() });

  return (
    <Screen refreshing={query.isFetching} onRefresh={() => void query.refetch()}>
      <PageHeader title="UETDS Logları" fallbackHref="/settings" />
      {query.isLoading ? <LoadingState /> : null}
      {!query.isLoading && query.data?.results.length === 0 ? <EmptyState title="Log yok" /> : null}
      {query.data?.results.map((log) => (
        <Card key={log.id}>
          <Badge status={log.success ? "submitted" : "failed"} label={log.success ? "Başarılı" : "Hatalı"} />
          <AppText variant="titleLg">{log.operation}</AppText>
          <AppText color={colors.textMuted}>{log.uetds_sonuc_mesaji || "-"}</AppText>
          <AppText variant="labelMd" color={colors.textSubtle}>
            {formatDateTime(log.created_at)}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}

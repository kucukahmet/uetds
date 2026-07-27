import { useQuery, useQueryClient } from "@tanstack/react-query";

import { endpoints } from "@/api/endpoints";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { ListRow } from "@/components/ListRow";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { LoadingState } from "@/components/StateViews";
import { goBackOrReplace } from "@/lib/navigation";
import { useAuthStore } from "@/store/auth";

export default function CompanyScreen() {
  const queryClient = useQueryClient();
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const switchCompany = useAuthStore((state) => state.switchCompany);
  const query = useQuery({ queryKey: queryKeys.companies(), queryFn: endpoints.companies });
  const handleSwitch = async (companyId: string) => {
    if (companyId === activeCompanyId) {
      goBackOrReplace("/settings");
      return;
    }
    await switchCompany(companyId);
    queryClient.removeQueries({ queryKey: ["backend"], type: "inactive" });
    await queryClient.invalidateQueries({ queryKey: ["backend"] });
    goBackOrReplace("/settings");
  };

  return (
    <Screen>
      <PageHeader title="Firma Seçimi" fallbackHref="/settings" />
      {query.isLoading ? <LoadingState /> : null}
      {query.data?.results.map((company) => (
        <Card key={company.id}>
          <ListRow
            title={company.name}
            subtitle={company.unet_no || company.tax_no}
            meta={company.id === activeCompanyId ? "Aktif" : undefined}
            icon={company.id === activeCompanyId ? "checkmark-circle" : "business"}
            onPress={() => void handleSwitch(company.id)}
          />
          {company.id === activeCompanyId ? <Badge status="active" /> : null}
        </Card>
      ))}
    </Screen>
  );
}

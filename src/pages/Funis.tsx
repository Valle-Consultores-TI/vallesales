import { useMemo, useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import { useCreateFunnel, useFunnels } from "@/hooks/useFunnels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const FunnelManagement = () => {
  const funnels = useFunnels(true);
  const createFunnel = useCreateFunnel();
  const [name, setName] = useState("");

  const sortedFunnels = useMemo(
    () => [...(funnels.data ?? [])].sort((left, right) => Number(right.is_default) - Number(left.is_default) || left.name.localeCompare(right.name)),
    [funnels.data],
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createFunnel.mutateAsync(name);
    setName("");
  };

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
          Negocios e funis
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Crie novos negocios e mantenha a Valle Consultores como funil principal.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="new-funnel-name">
              Novo negocio / funil
            </label>
            <Input
              id="new-funnel-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Valle BPO"
              maxLength={120}
            />
          </div>
          <Button
            variant="accent"
            onClick={handleCreate}
            disabled={createFunnel.isPending || !name.trim()}
            className="font-semibold"
          >
            {createFunnel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Criar funil
          </Button>
        </div>
      </Card>

      {funnels.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedFunnels.map((funnel) => (
            <Card key={funnel.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-accent/10 p-2 text-accent">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <p className="truncate font-semibold text-foreground">{funnel.name}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    ID: {funnel.id.slice(0, 8)}
                  </p>
                </div>
                {funnel.is_default && (
                  <Badge variant="secondary">
                    Principal
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
};

export default FunnelManagement;

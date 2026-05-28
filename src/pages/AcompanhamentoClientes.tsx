import { useEffect, useMemo, useState } from "react";
import { Loader2, Briefcase, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { LeadDetailsSheet } from "@/components/crm/LeadDetailsSheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFunnelAccessOptions } from "@/hooks/useFunnels";
import { useArchiveLead, useLeads, useProfiles, useStages } from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/useUserRoles";
import type { Funnel, Lead } from "@/types/crm";
import {
  CUSTOMER_TRACKING_STORAGE_KEY,
  TRACKING_FLOW_LABELS,
  sortTrackingFunnels,
} from "@/lib/customer-tracking";

const AcompanhamentoClientes = () => {
  const { user } = useAuth();
  const perms = usePermissions();
  const trackingFunnelsQuery = useFunnelAccessOptions(!!user, { module: "customer_tracking" });
  const profiles = useProfiles(!!user);
  const archiveLead = useArchiveLead();
  const [activeTrackingFunnelId, setActiveTrackingFunnelId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const accessibleFunnels = useMemo(
    () => sortTrackingFunnels((trackingFunnelsQuery.data ?? []).filter((funnel) => funnel.has_access)),
    [trackingFunnelsQuery.data],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(CUSTOMER_TRACKING_STORAGE_KEY);
    if (stored) {
      setActiveTrackingFunnelId(stored);
    }
  }, []);

  useEffect(() => {
    if (accessibleFunnels.length === 0) {
      setActiveTrackingFunnelId(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(CUSTOMER_TRACKING_STORAGE_KEY);
      }
      return;
    }

    const current = accessibleFunnels.find((funnel) => funnel.id === activeTrackingFunnelId);
    if (current) return;

    const next = accessibleFunnels[0];
    setActiveTrackingFunnelId(next.id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CUSTOMER_TRACKING_STORAGE_KEY, next.id);
    }
  }, [activeTrackingFunnelId, accessibleFunnels]);

  const activeTrackingFunnel = useMemo(
    () => accessibleFunnels.find((funnel) => funnel.id === activeTrackingFunnelId) ?? null,
    [activeTrackingFunnelId, accessibleFunnels],
  );

  const trackingReady = !!activeTrackingFunnelId && !!activeTrackingFunnel;
  const stages = useStages(activeTrackingFunnelId, trackingReady);
  const leads = useLeads(activeTrackingFunnelId, trackingReady, {
    entityKind: "customer_tracking",
  });

  const canEditLead = (lead: Lead) => {
    if (perms.canEditAnyLead) return true;
    if (!perms.canEditOwnLead) return false;
    return lead.owner_id === user?.id || lead.created_by === user?.id;
  };

  const openDetails = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailsOpen(true);
  };

  const handleSelectFunnel = (funnel: Funnel) => {
    setActiveTrackingFunnelId(funnel.id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CUSTOMER_TRACKING_STORAGE_KEY, funnel.id);
    }
  };

  const handleArchiveTrackingLead = async (lead: Lead) => {
    if (!canEditLead(lead)) return;

    const shouldArchive = window.confirm(
      "Deseja arquivar este cliente em acompanhamento? Ele saira do fluxo ativo, mas continuara salvo no historico.",
    );
    if (!shouldArchive) return;

    await archiveLead.mutateAsync(lead);

    if (selectedLead?.id === lead.id) {
      setDetailsOpen(false);
      setSelectedLead(null);
    }
  };

  const loading = trackingFunnelsQuery.isLoading || stages.isLoading || leads.isLoading || profiles.isLoading;
  const flowKey = activeTrackingFunnel?.tracking_flow_key;
  const flowLabel = flowKey ? TRACKING_FLOW_LABELS[flowKey] : "Acompanhamento";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader active="acompanhamento" />

      <div className="border-b border-border bg-card px-4 py-5 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
              Acompanhamento de clientes
            </p>
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-2xl bg-accent/10 p-2 text-accent">
                <Briefcase className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground md:text-[1.9rem]">
                  {activeTrackingFunnel ? flowLabel : "Fluxos de acompanhamento"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Movimente clientes conforme a execucao do processo apos o fechamento comercial.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {accessibleFunnels.map((funnel) => {
              const selected = funnel.id === activeTrackingFunnelId;
              const label = funnel.tracking_flow_key ? TRACKING_FLOW_LABELS[funnel.tracking_flow_key] : funnel.name;

              return (
                <Button
                  key={funnel.id}
                  type="button"
                  variant={selected ? "accent" : "outline"}
                  className="rounded-full"
                  onClick={() => handleSelectFunnel(funnel)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="flex-1 px-4 py-4 md:px-6">
        {loading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-sm">Carregando acompanhamento...</p>
          </div>
        ) : accessibleFunnels.length === 0 ? (
          <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-warning" />
            <h3 className="text-lg font-semibold">Sem acesso ao acompanhamento</h3>
            <p className="text-sm text-muted-foreground">
              Este menu fica disponivel apenas para usuarios com acesso ao funil Valle Consultores.
            </p>
          </div>
        ) : !activeTrackingFunnelId ? (
          <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-warning" />
            <h3 className="text-lg font-semibold">Nenhum fluxo selecionado</h3>
            <p className="text-sm text-muted-foreground">
              Escolha um dos fluxos para acompanhar os clientes em execucao.
            </p>
          </div>
        ) : stages.isError || leads.isError ? (
          <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <h3 className="text-lg font-semibold">Nao foi possivel carregar o acompanhamento</h3>
            <p className="text-sm text-muted-foreground">
              {(stages.error as Error)?.message || (leads.error as Error)?.message || "Erro de conexao com o backend."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="border-border/70 px-4 py-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{activeTrackingFunnel?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {leads.data?.length ?? 0} cliente(s) neste fluxo.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  O acesso deste modulo herda as permissoes do funil Valle Consultores.
                </p>
              </div>
            </Card>

            <KanbanBoard
              funnelId={activeTrackingFunnelId}
              funnelName={activeTrackingFunnel?.name ?? null}
              stages={stages.data ?? []}
              leads={leads.data ?? []}
              profiles={profiles.data ?? []}
              onSelectLead={openDetails}
              onAddInStage={() => undefined}
              canAddLead={false}
              canMoveLead={canEditLead}
              canRenameStages={false}
              canCreateStages={false}
              canDeleteStages={false}
              wonDialogTitle={flowKey === "opening_company" ? "Abertura concluida" : "Fluxo concluido"}
              wonDialogDescription={
                flowKey === "opening_company"
                  ? "Ao concluir a abertura de empresa, o cliente sera enviado automaticamente para o fluxo de implantacao do atendimento contabil."
                  : "Conclua este fluxo quando o onboarding contabil ja tiver sido finalizado."
              }
              wonDialogKeepLabel={flowKey === "opening_company" ? "Concluir e seguir" : "Concluir fluxo"}
              showWonArchiveAction
              onArchiveLead={handleArchiveTrackingLead}
            />
          </div>
        )}
      </main>

      <LeadDetailsSheet
        lead={selectedLead}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onLeadChange={setSelectedLead}
        profiles={profiles.data ?? []}
        stages={stages.data ?? []}
        canEditLead={selectedLead ? canEditLead(selectedLead) : false}
        canDeleteLead={false}
        archiveLead={selectedLead ? async () => {
          await handleArchiveTrackingLead(selectedLead);
        } : undefined}
      />
    </div>
  );
};

export default AcompanhamentoClientes;

import { useEffect, useMemo, useState } from "react";
import { Loader2, Briefcase, AlertTriangle, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { LeadDetailsSheet } from "@/components/crm/LeadDetailsSheet";
import { LeadFormDialog } from "@/components/crm/LeadFormDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useFunnelAccessOptions } from "@/hooks/useFunnels";
import { useArchiveLead, useDeleteLead, useLeads, useProfiles, useStages, useTransferCustomerTrackingFlow } from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/useUserRoles";
import type { Funnel, Lead, TrackingFlowKey } from "@/types/crm";
import {
  CUSTOMER_TRACKING_STORAGE_KEY,
  getTrackingFlowActionLabel,
  TRACKING_FLOW_LABELS,
  sortTrackingFunnels,
} from "@/lib/customer-tracking";

const AcompanhamentoClientes = () => {
  const { user } = useAuth();
  const perms = usePermissions();
  const trackingFunnelsQuery = useFunnelAccessOptions(!!user, { module: "customer_tracking" });
  const profiles = useProfiles(!!user);
  const archiveLead = useArchiveLead();
  const deleteLead = useDeleteLead();
  const transferTrackingFlow = useTransferCustomerTrackingFlow();
  const [activeTrackingFunnelId, setActiveTrackingFunnelId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [defaultStage, setDefaultStage] = useState<string | undefined>();
  const [formSessionKey, setFormSessionKey] = useState(0);
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

  const openNew = (stageId?: string) => {
    setEditLead(null);
    setDefaultStage(stageId);
    setFormSessionKey((current) => current + 1);
    setFormOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setEditLead(lead);
    setDefaultStage(undefined);
    setFormSessionKey((current) => current + 1);
    setFormOpen(true);
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
      "Deseja arquivar este cliente em acompanhamento? Ele sairá do fluxo ativo, mas continuará salvo no histórico.",
    );
    if (!shouldArchive) return;

    await archiveLead.mutateAsync(lead);

    if (selectedLead?.id === lead.id) {
      setDetailsOpen(false);
      setSelectedLead(null);
    }
  };

  const handleDeleteTrackingLead = async (lead: Lead) => {
    if (!perms.canDeleteLead) return;

    const shouldDelete = window.confirm(
      "Deseja excluir este cliente em acompanhamento permanentemente? Esta ação não pode ser desfeita.",
    );
    if (!shouldDelete) return;

    await deleteLead.mutateAsync(lead);

    if (selectedLead?.id === lead.id) {
      setDetailsOpen(false);
      setSelectedLead(null);
    }
  };

  const getTrackingTransferActions = (lead: Lead) => {
    if (lead.entity_kind !== "customer_tracking") return [];

    const actions: Array<{ flow: TrackingFlowKey; label: string }> = [];

    if (lead.tracking_flow_key !== "opening_company") {
      actions.push({ flow: "opening_company", label: getTrackingFlowActionLabel("opening_company", "Mover para") });
    }

    if (lead.tracking_flow_key !== "existing_company") {
      actions.push({ flow: "existing_company", label: getTrackingFlowActionLabel("existing_company", "Mover para") });
    }

    return actions;
  };

  const handleTransferTrackingLead = async (lead: Lead, targetFlow: TrackingFlowKey) => {
    await transferTrackingFlow.mutateAsync({
      leadId: lead.id,
      targetFlow,
    });

    if (selectedLead?.id === lead.id) {
      setDetailsOpen(false);
      setSelectedLead(null);
    }
  };

  const loading = trackingFunnelsQuery.isLoading || stages.isLoading || leads.isLoading || profiles.isLoading;
  const flowKey = activeTrackingFunnel?.tracking_flow_key;
  const flowLabel = flowKey ? TRACKING_FLOW_LABELS[flowKey] : "Acompanhamento";
  const canManageTrackingStages = perms.canManageTeam;

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
                  Movimente clientes conforme a execução do processo após o fechamento comercial.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {perms.canCreateLead && activeTrackingFunnelId && (
              <Button type="button" variant="accent" className="rounded-full" onClick={() => openNew()}>
                <Plus className="mr-2 h-4 w-4" />
                Novo cliente
              </Button>
            )}
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
              Este menu fica disponível apenas para usuários com acesso ao funil Valle Consultores.
            </p>
          </div>
        ) : !activeTrackingFunnelId ? (
          <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-warning" />
            <h3 className="text-lg font-semibold">Nenhum fluxo selecionado</h3>
            <p className="text-sm text-muted-foreground">
              Escolha um dos fluxos para acompanhar os clientes em execução.
            </p>
          </div>
        ) : stages.isError || leads.isError ? (
          <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <h3 className="text-lg font-semibold">Não foi possível carregar o acompanhamento</h3>
            <p className="text-sm text-muted-foreground">
              {(stages.error as Error)?.message || (leads.error as Error)?.message || "Erro de conexão com o backend."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="border-border/70 px-4 py-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{flowLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {leads.data?.length ?? 0} cliente(s) neste fluxo.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  O acesso deste módulo herda as permissões do funil Valle Consultores.
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
              onAddInStage={openNew}
              addEntityLabel="cliente"
              canAddLead={perms.canCreateLead}
              canMoveLead={canEditLead}
              canRenameStages={canManageTrackingStages}
              canCreateStages={canManageTrackingStages}
              canDeleteStages={canManageTrackingStages}
              wonDialogTitle={flowKey === "opening_company" ? "Registro e legalização concluído" : "Fluxo concluído"}
              wonDialogDescription={
                flowKey === "opening_company"
                  ? "Ao concluir registro e legalização, o cliente será enviado automaticamente para Onboarding."
                  : "Conclua este fluxo quando o onboarding contábil já tiver sido finalizado."
              }
              wonDialogKeepLabel={flowKey === "opening_company" ? "Ir para Onboarding" : "Concluir fluxo"}
              showWonArchiveAction
              onArchiveLead={handleArchiveTrackingLead}
              onDeleteLead={perms.canDeleteLead ? handleDeleteTrackingLead : undefined}
            />
          </div>
        )}
      </main>

      <LeadFormDialog
        key={formSessionKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editLead}
        defaultStageId={defaultStage}
        funnelOptions={accessibleFunnels}
        lockedFunnelId={activeTrackingFunnelId}
        wonDialogTitle={flowKey === "opening_company" ? "Registro e legalização concluído" : "Fluxo concluído"}
        wonDialogDescription={
          flowKey === "opening_company"
            ? "Ao concluir registro e legalização, o cliente será enviado automaticamente para Onboarding."
            : "Conclua este fluxo quando o onboarding contábil já tiver sido finalizado."
        }
        wonDialogKeepLabel={flowKey === "opening_company" ? "Ir para Onboarding" : "Concluir fluxo"}
        showWonArchiveAction
      />

      <LeadDetailsSheet
        lead={selectedLead}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onLeadChange={setSelectedLead}
        profiles={profiles.data ?? []}
        stages={stages.data ?? []}
        canEditLead={selectedLead ? canEditLead(selectedLead) : false}
        canDeleteLead={perms.canDeleteLead}
        onEdit={() => {
          if (selectedLead) {
            setDetailsOpen(false);
            openEdit(selectedLead);
          }
        }}
        getTrackingTransferActions={getTrackingTransferActions}
        onTrackingTransfer={handleTransferTrackingLead}
        archiveLead={selectedLead ? async () => {
          await handleArchiveTrackingLead(selectedLead);
        } : undefined}
      />
    </div>
  );
};

export default AcompanhamentoClientes;

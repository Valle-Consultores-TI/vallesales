import { Lead, PipelineStage, Profile } from "@/types/crm";
import type { TrackingFlowKey } from "@/types/crm";
import { LeadCard } from "./LeadCard";
import { addLeadNoteEntry, useArchiveLead, useCreatePipelineStage, useDeletePipelineStage, useRenamePipelineStage, useUpdateLead } from "@/hooks/useLeads";
import { Check, Loader2, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  stages: PipelineStage[];
  leads: Lead[];
  profiles: Profile[];
  highlightedLeadId?: string | null;
  onSelectLead: (lead: Lead) => void;
  onAddInStage: (stageId: string) => void;
  addEntityLabel?: string;
  canAddLead: boolean;
  canMoveLead: (lead: Lead) => boolean;
  canRenameStages: boolean;
  canCreateStages: boolean;
  canDeleteStages: boolean;
  funnelId: string;
  funnelName?: string | null;
  wonDialogTitle?: string;
  wonDialogDescription?: string;
  wonDialogKeepLabel?: string;
  wonDialogArchiveLabel?: string;
  showWonArchiveAction?: boolean;
  showWonCancelAction?: boolean;
  getWonLeadTransferActions?: (lead: Lead) => Array<{ flow: TrackingFlowKey; label: string }>;
  onWonLeadTransfer?: (lead: Lead, flow: TrackingFlowKey) => Promise<void>;
  onArchiveLead?: (lead: Lead) => Promise<void>;
  onDeleteLead?: (lead: Lead) => Promise<void>;
}

const stageColorBar: Record<string, string> = {
  novo_lead: "bg-stage-novo",
  primeiro_contato: "bg-stage-primeiro",
  reuniao_marcada: "bg-stage-reuniao",
  proposta_enviada: "bg-stage-proposta",
  em_negociacao: "bg-stage-negociacao",
  fechado: "bg-stage-fechado",
  perdido: "bg-stage-perdido",
};

export const KanbanBoard = ({
  stages,
  leads,
  profiles,
  highlightedLeadId = null,
  onSelectLead,
  onAddInStage,
  addEntityLabel = "lead",
  canAddLead,
  canMoveLead,
  canRenameStages,
  canCreateStages,
  canDeleteStages,
  funnelId,
  funnelName = null,
  wonDialogTitle = "Cliente fechado",
  wonDialogDescription = "Este cliente pode ser arquivado agora ou permanecer no funil até que você decida arquivar manualmente. O histórico continuará salvo e o contato permanecerá na aba Contatos.",
  wonDialogKeepLabel = "Manter no funil",
  wonDialogArchiveLabel = "Arquivar agora",
  showWonArchiveAction = true,
  showWonCancelAction = true,
  getWonLeadTransferActions,
  onWonLeadTransfer,
  onArchiveLead,
  onDeleteLead,
}: Props) => {
  const update = useUpdateLead();
  const archiveLead = useArchiveLead();
  const createStage = useCreatePipelineStage();
  const deleteStage = useDeletePipelineStage();
  const renameStage = useRenamePipelineStage();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [stageDraftName, setStageDraftName] = useState("");
  const [creatingAfterStageId, setCreatingAfterStageId] = useState<string | null>(null);
  const [newStageName, setNewStageName] = useState("");
  const [stagePendingDeletion, setStagePendingDeletion] = useState<PipelineStage | null>(null);
  const [lostLeadPending, setLostLeadPending] = useState<{ lead: Lead; targetStageId: string; stageName: string } | null>(null);
  const [wonLeadPending, setWonLeadPending] = useState<{ lead: Lead; targetStageId: string; stageName: string } | null>(null);
  const [lossReason, setLossReason] = useState("");
  const [savingLostReason, setSavingLostReason] = useState(false);
  const [hoveredInsertSlotKey, setHoveredInsertSlotKey] = useState<string | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState({ contentWidth: 0, hasOverflow: false });
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyScrollbarRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef<"board" | "sticky" | null>(null);
  const dragPointerXRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    stages.forEach((stage) => {
      map[stage.id] = [];
    });
    leads.forEach((lead) => {
      (map[lead.stage_id] ||= []).push(lead);
    });
    return map;
  }, [stages, leads]);

  const maxStageValue = useMemo(() => {
    let max = 0;
    stages.forEach((stage) => {
      const value = (leadsByStage[stage.id] || []).reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
      if (value > max) max = value;
    });
    return max;
  }, [stages, leadsByStage]);

  const finalizeLeadStageChange = async (
    lead: Lead,
    stageId: string,
    options?: { archiveAfter?: boolean; lostReasonText?: string },
  ) => {
    const updatedLead = await update.mutateAsync({
      id: lead.id,
      stage_id: stageId,
      loss_reason: options?.lostReasonText?.trim() || undefined,
    });

    if (options?.lostReasonText?.trim()) {
      const trimmedLossReason = options.lostReasonText.trim();
      await addLeadNoteEntry({
        leadId: lead.id,
        content: `Motivo da perda: ${trimmedLossReason}`,
        userId: user?.id,
        activityDescription: `Cliente perdido: ${trimmedLossReason}`,
      });
      qc.invalidateQueries({ queryKey: ["lead_notes", lead.id] });
      qc.invalidateQueries({ queryKey: ["lead_activities", lead.id] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });
    }

    if (options?.archiveAfter) {
      await archiveLead.mutateAsync(updatedLead);
    }

    return updatedLead;
  };

  const handleDrop = async (stageId: string) => {
    if (!draggedId) return;
    const lead = leads.find((item) => item.id === draggedId);
    const targetStage = stages.find((item) => item.id === stageId);
    const currentStage = lead ? stages.find((item) => item.id === lead.stage_id) : null;
    setDraggedId(null);
    setOverStageId(null);
    if (!lead || lead.stage_id === stageId) return;
    if (targetStage?.is_lost && !currentStage?.is_lost) {
      setLossReason("");
      setLostLeadPending({ lead, targetStageId: stageId, stageName: targetStage.name });
      return;
    }
    if (targetStage?.is_won && !currentStage?.is_won) {
      setWonLeadPending({ lead, targetStageId: stageId, stageName: targetStage.name });
      return;
    }
    await finalizeLeadStageChange(lead, stageId);
  };

  const openStageRename = (stage: PipelineStage) => {
    setCreatingAfterStageId(null);
    setEditingStageId(stage.id);
    setStageDraftName(stage.name);
  };

  const cancelStageRename = () => {
    setEditingStageId(null);
    setStageDraftName("");
  };

  const handleStageRename = async (stage: PipelineStage) => {
    await renameStage.mutateAsync({
      funnelId: stage.funnel_id,
      stageId: stage.id,
      name: stageDraftName,
    });
    cancelStageRename();
  };

  const openCreateStage = (stageId: string) => {
    setEditingStageId(null);
    setCreatingAfterStageId(stageId);
    setNewStageName("");
  };

  const cancelCreateStage = () => {
    setCreatingAfterStageId(null);
    setNewStageName("");
  };

  const requestStageDeletion = (stage: PipelineStage) => {
    setEditingStageId(null);
    setStageDraftName("");
    setCreatingAfterStageId(null);
    setNewStageName("");
    setStagePendingDeletion(stage);
  };

  const handleDeleteStage = async () => {
    if (!stagePendingDeletion) return;

    await deleteStage.mutateAsync({
      funnelId: stagePendingDeletion.funnel_id,
      stageId: stagePendingDeletion.id,
    });
    setStagePendingDeletion(null);
  };

  const handleCreateStage = async (afterStageId: string) => {
    await createStage.mutateAsync({
      funnelId,
      afterStageId,
      name: newStageName,
    });
    cancelCreateStage();
  };

  const handleConfirmLostLead = async (archiveAfter: boolean) => {
    if (!lostLeadPending || !lossReason.trim()) return;

    setSavingLostReason(true);
    try {
      await finalizeLeadStageChange(lostLeadPending.lead, lostLeadPending.targetStageId, {
        archiveAfter,
        lostReasonText: lossReason,
      });
      setLostLeadPending(null);
      setLossReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mover o lead para perdido.");
    } finally {
      setSavingLostReason(false);
    }
  };

  const handleConfirmWonLead = async (archiveAfter: boolean) => {
    if (!wonLeadPending) return;

    setSavingLostReason(true);
    try {
      await finalizeLeadStageChange(wonLeadPending.lead, wonLeadPending.targetStageId, { archiveAfter });
      setWonLeadPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mover o lead para cliente.");
    } finally {
      setSavingLostReason(false);
    }
  };

  const handleTransferWonLead = async (flow: TrackingFlowKey) => {
    if (!wonLeadPending || !onWonLeadTransfer) return;

    setSavingLostReason(true);
    try {
      const updatedLead = await finalizeLeadStageChange(wonLeadPending.lead, wonLeadPending.targetStageId);
      await onWonLeadTransfer(updatedLead, flow);
      setWonLeadPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a transferência do cliente.");
    } finally {
      setSavingLostReason(false);
    }
  };

  useEffect(() => {
    const boardElement = boardScrollRef.current;
    if (!boardElement) return;

    const updateScrollMetrics = () => {
      setScrollMetrics({
        contentWidth: boardElement.scrollWidth,
        hasOverflow: boardElement.scrollWidth > boardElement.clientWidth + 1,
      });
    };

    updateScrollMetrics();

    const resizeObserver = new ResizeObserver(() => {
      updateScrollMetrics();
    });

    resizeObserver.observe(boardElement);
    window.addEventListener("resize", updateScrollMetrics);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollMetrics);
    };
  }, [stages.length, leads.length, creatingAfterStageId, editingStageId]);

  const syncHorizontalScroll = (source: "board" | "sticky") => {
    const boardElement = boardScrollRef.current;
    const stickyElement = stickyScrollbarRef.current;
    if (!boardElement || !stickyElement) return;

    if (syncingScrollRef.current && syncingScrollRef.current !== source) return;

    syncingScrollRef.current = source;

    if (source === "board") {
      stickyElement.scrollLeft = boardElement.scrollLeft;
    } else {
      boardElement.scrollLeft = stickyElement.scrollLeft;
    }

    window.requestAnimationFrame(() => {
      syncingScrollRef.current = null;
    });
  };

  const stopDragAutoScroll = () => {
    dragPointerXRef.current = null;

    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  };

  useEffect(() => {
    if (!draggedId) {
      stopDragAutoScroll();
      return;
    }

    const boardElement = boardScrollRef.current;
    if (!boardElement) return;

    const edgeThreshold = 140;
    const maxStep = 28;

    const tick = () => {
      const pointerX = dragPointerXRef.current;
      const board = boardScrollRef.current;

      if (!board) {
        autoScrollFrameRef.current = null;
        return;
      }

      if (pointerX !== null) {
        const rect = board.getBoundingClientRect();
        let delta = 0;

        if (pointerX < rect.left + edgeThreshold) {
          const intensity = (rect.left + edgeThreshold - pointerX) / edgeThreshold;
          delta = -Math.ceil(maxStep * Math.min(1, intensity));
        } else if (pointerX > rect.right - edgeThreshold) {
          const intensity = (pointerX - (rect.right - edgeThreshold)) / edgeThreshold;
          delta = Math.ceil(maxStep * Math.min(1, intensity));
        }

        if (delta !== 0) {
          const nextScrollLeft = Math.max(0, Math.min(board.scrollLeft + delta, board.scrollWidth - board.clientWidth));
          if (nextScrollLeft !== board.scrollLeft) {
            board.scrollLeft = nextScrollLeft;
            syncHorizontalScroll("board");
          }
        }
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    const handleWindowDragOver = (event: DragEvent) => {
      dragPointerXRef.current = event.clientX;
    };

    const handleWindowDrop = () => {
      setDraggedId(null);
      setOverStageId(null);
      stopDragAutoScroll();
    };

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);
    autoScrollFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
      stopDragAutoScroll();
    };
  }, [draggedId]);

  const renderInsertSlot = (stageId: string, slotKey: string) => (
    <div
      key={slotKey}
      className={cn(
        "overflow-hidden rounded-lg transition-all duration-150",
        hoveredInsertSlotKey === slotKey ? "h-14" : "h-1.5",
      )}
      onMouseEnter={() => setHoveredInsertSlotKey(slotKey)}
      onMouseLeave={() => setHoveredInsertSlotKey((current) => (current === slotKey ? null : current))}
    >
      <button
        type="button"
        onClick={() => onAddInStage(stageId)}
        className={cn(
          "w-full rounded-lg border border-dashed text-center text-xs transition-all duration-150",
          "border-border/60 bg-background/70 text-muted-foreground hover:border-accent/50 hover:bg-accent/5 hover:text-accent",
          hoveredInsertSlotKey === slotKey
            ? "px-3 py-4 opacity-100"
            : "pointer-events-none px-3 py-0 opacity-0",
        )}
      >
        {`+ Adicionar ${addEntityLabel}`}
      </button>
    </div>
  );

  return (
    <>
      <div
        ref={boardScrollRef}
        onScroll={() => syncHorizontalScroll("board")}
        className="overflow-x-auto overflow-y-visible pb-4 scrollbar-none"
      >
        <div className="flex items-start gap-4">
          {stages.map((stage, idx) => {
            const nextStage = stages[idx + 1] ?? null;
            const prevStage = idx > 0 ? stages[idx - 1] : null;
            const stageLeads = leadsByStage[stage.id] || [];
            const total = stageLeads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
            const prevCount = prevStage ? (leadsByStage[prevStage.id] || []).length : 0;
            const conversion = prevStage && prevCount > 0 ? Math.round((stageLeads.length / prevCount) * 100) : null;
            const isOver = overStageId === stage.id;
            const dotColor = stageColorBar[stage.key] || "bg-muted-foreground";
            const valuePct = maxStageValue > 0 ? Math.max(4, Math.round((total / maxStageValue) * 100)) : 0;
            const canCreateAfterStage = canCreateStages && !stage.is_won && !stage.is_lost;
            const canDeleteStage = canDeleteStages && !stage.is_won && !stage.is_lost;
            const hasStageMenu = canRenameStages || canDeleteStage || canCreateAfterStage;

            return (
              <Fragment key={stage.id}>
                <div
                  className={cn(
                    "group flex w-72 flex-shrink-0 flex-col self-start rounded-xl border transition-all duration-200",
                    isOver
                      ? "bg-accent/5 border-accent/40 shadow-card"
                      : "bg-muted/40 border-transparent hover:border-border/60",
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOverStageId(stage.id);
                  }}
                  onDragLeave={() => setOverStageId((current) => (current === stage.id ? null : current))}
                  onDrop={() => handleDrop(stage.id)}
                >
                  <div className="border-b border-border/50 px-3 pb-2.5 pt-3">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background", dotColor)} />
                        {editingStageId === stage.id ? (
                          <>
                            <Input
                              value={stageDraftName}
                              onChange={(event) => setStageDraftName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleStageRename(stage);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelStageRename();
                                }
                              }}
                              className="h-8 min-w-0 flex-1 text-[13px] font-semibold uppercase tracking-wide"
                              maxLength={120}
                              autoFocus
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-accent hover:bg-accent/10 hover:text-accent"
                              onClick={() => void handleStageRename(stage)}
                              disabled={renameStage.isPending || !stageDraftName.trim()}
                              aria-label={`Salvar nome da fase ${stage.name}`}
                              title="Salvar nome da fase"
                            >
                              {renameStage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={cancelStageRename}
                              disabled={renameStage.isPending}
                              aria-label={`Cancelar edição da fase ${stage.name}`}
                              title="Cancelar"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-[13px] font-semibold uppercase tracking-wide leading-tight text-foreground break-words">
                                {stage.name}
                              </h3>
                            </div>
                            <span className="shrink-0 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                              {stageLeads.length}
                            </span>
                          </>
                        )}
                      </div>

                      {editingStageId !== stage.id && (
                        <div className="flex shrink-0 items-center gap-1">
                          {canAddLead && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground/80 hover:bg-accent/10 hover:text-accent"
                              onClick={() => onAddInStage(stage.id)}
                              aria-label={`Adicionar ${addEntityLabel} na fase ${stage.name}`}
                              title={`Adicionar ${addEntityLabel}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {hasStageMenu && (
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                                  aria-label={`Abrir ações da fase ${stage.name}`}
                                  title="Ações da fase"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {canRenameStages && (
                                  <DropdownMenuItem onSelect={() => openStageRename(stage)}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Editar nome
                                  </DropdownMenuItem>
                                )}
                                {canCreateAfterStage && (
                                  <DropdownMenuItem
                                    disabled={createStage.isPending}
                                    onSelect={() => openCreateStage(stage.id)}
                                  >
                                    <Plus className="mr-2 h-3.5 w-3.5" />
                                    Adicionar fase
                                  </DropdownMenuItem>
                                )}
                                {canDeleteStage && (
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    disabled={deleteStage.isPending}
                                    onSelect={() => requestStageDeletion(stage)}
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Apagar esta fase
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold tabular-nums text-foreground/80">
                        {formatCurrency(total)}
                      </p>
                      {false && conversion !== null && (
                        <span
                          title={`Conversão a partir de "${prevStage?.name}" (${stageLeads.length}/${prevCount})`}
                          className={cn(
                            "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                            conversion >= 70
                              ? "border-success/25 bg-success/10 text-success"
                              : conversion >= 40
                                ? "border-accent/25 bg-accent/10 text-accent"
                                : "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {conversion}%
                        </span>
                      )}
                    </div>

                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border/60">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", dotColor)}
                        style={{ width: `${valuePct}%` }}
                      />
                    </div>
                  </div>

                  <div
                    className={cn(
                      "min-h-[200px] max-h-[60vh] space-y-1 overflow-y-auto rounded-b-xl px-2 py-2 pr-1 scrollbar-thin transition-all",
                      isOver && "bg-accent/5",
                    )}
                  >
                    {stageLeads.length > 0 && canAddLead && renderInsertSlot(stage.id, `${stage.id}:top`)}

                    {stageLeads.map((lead, leadIndex) => (
                      <Fragment key={lead.id}>
                        <div className="animate-fade-in-up">
                          <LeadCard
                            lead={lead}
                            isLost={stage.is_lost}
                            profiles={profiles}
                            funnelName={funnelName}
                            stageName={stage.name}
                            isHighlighted={highlightedLeadId === lead.id}
                            onArchive={onArchiveLead ? () => onArchiveLead(lead) : undefined}
                            archiveLabel={lead.entity_kind === "customer_tracking" ? "Arquivar cliente" : "Arquivar lead"}
                            onDelete={onDeleteLead ? () => onDeleteLead(lead) : undefined}
                            deleteLabel={lead.entity_kind === "customer_tracking" ? "Excluir cliente" : "Excluir lead"}
                            onClick={() => onSelectLead(lead)}
                            draggable={canMoveLead(lead)}
                            onDragStart={(event) => {
                              setDraggedId(lead.id);
                              dragPointerXRef.current = event.clientX;
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDraggedId(null);
                              setOverStageId(null);
                              stopDragAutoScroll();
                            }}
                          />
                        </div>
                        {canAddLead && leadIndex < stageLeads.length - 1 && renderInsertSlot(stage.id, `${stage.id}:after:${lead.id}`)}
                      </Fragment>
                    ))}

                    {stageLeads.length === 0 && canAddLead && (
                      <button
                        onClick={() => onAddInStage(stage.id)}
                        className="w-full rounded-lg border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground transition-all hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
                      >
                        {`+ Adicionar ${addEntityLabel}`}
                      </button>
                    )}
                  </div>
                </div>

                {creatingAfterStageId === stage.id && (
                  <div className="flex-shrink-0 w-60">
                    <div className="flex h-full min-h-[200px] flex-col justify-center rounded-xl border border-dashed border-accent/35 bg-accent/5 px-4 py-5">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Nova fase
                      </p>
                      <p className="mt-1 text-sm text-foreground/80">
                        {nextStage ? `Entre ${stage.name} e ${nextStage.name}` : `Depois de ${stage.name}`}
                      </p>

                      <Input
                        value={newStageName}
                        onChange={(event) => setNewStageName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleCreateStage(stage.id);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelCreateStage();
                          }
                        }}
                        placeholder="Nome da nova fase"
                        maxLength={120}
                        autoFocus
                        className="mt-4"
                      />

                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="accent"
                          size="sm"
                          className="flex-1"
                          onClick={() => void handleCreateStage(stage.id)}
                          disabled={createStage.isPending || !newStageName.trim()}
                        >
                          {createStage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Criar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={cancelCreateStage}
                          disabled={createStage.isPending}
                        >
                          <X className="h-4 w-4" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {scrollMetrics.hasOverflow && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-2 md:px-6">
          <div className="pointer-events-auto rounded-full border border-border/70 bg-background/95 p-1 shadow-card backdrop-blur">
            <div
              ref={stickyScrollbarRef}
              onScroll={() => syncHorizontalScroll("sticky")}
              className="overflow-x-auto overflow-y-hidden scrollbar-thin"
            >
              <div style={{ width: scrollMetrics.contentWidth, height: 1 }} />
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!stagePendingDeletion}
        onOpenChange={(open) => {
          if (!open && !deleteStage.isPending) {
            setStagePendingDeletion(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fase</AlertDialogTitle>
            <AlertDialogDescription>
              {stagePendingDeletion
                ? `Tem certeza que deseja apagar a fase "${stagePendingDeletion.name}"? Essa ação não pode ser desfeita.`
                : "Confirme a exclusão da fase."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteStage.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteStage();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteStage.isPending}
            >
              {deleteStage.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir fase
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!lostLeadPending}
        onOpenChange={(open) => {
          if (!open && !savingLostReason) {
            setLostLeadPending(null);
            setLossReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como perdido</DialogTitle>
            <DialogDescription>
              O lead será movido para perdido. Escolha se deseja arquivar agora ou manter no funil para arquivar manualmente depois.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {lostLeadPending
                ? `Informe o motivo da perda para "${lostLeadPending.stageName}".`
                : "Informe o motivo da perda."}
            </p>
            <Textarea
              rows={4}
              placeholder="Ex.: preço alto, sem retorno, projeto adiado..."
              value={lossReason}
              onChange={(event) => setLossReason(event.target.value)}
              disabled={savingLostReason}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setLostLeadPending(null);
                setLossReason("");
              }}
              disabled={savingLostReason}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleConfirmLostLead(false)}
              disabled={savingLostReason || !lossReason.trim()}
            >
              {savingLostReason && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Manter no funil
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={() => void handleConfirmLostLead(true)}
              disabled={savingLostReason || !lossReason.trim()}
            >
              {savingLostReason && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Arquivar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!wonLeadPending}
        onOpenChange={(open) => {
          if (!open && !savingLostReason) {
            setWonLeadPending(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{wonDialogTitle}</DialogTitle>
            <DialogDescription>{wonDialogDescription}</DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {showWonCancelAction && (
              <Button type="button" variant="ghost" onClick={() => setWonLeadPending(null)} disabled={savingLostReason}>
                Cancelar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => void handleConfirmWonLead(false)} disabled={savingLostReason}>
              {savingLostReason && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {wonDialogKeepLabel}
            </Button>
            {showWonArchiveAction && (
              <Button type="button" variant="accent" className="h-auto whitespace-normal text-left" onClick={() => void handleConfirmWonLead(true)} disabled={savingLostReason}>
                {savingLostReason && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {wonDialogArchiveLabel}
              </Button>
            )}
            {wonLeadPending && onWonLeadTransfer && (getWonLeadTransferActions?.(wonLeadPending.lead) ?? []).map((action) => (
              <Button key={action.flow} type="button" variant="accent" className="h-auto whitespace-normal text-left" onClick={() => void handleTransferWonLead(action.flow)} disabled={savingLostReason}>
                {savingLostReason && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {action.label}
              </Button>
            ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

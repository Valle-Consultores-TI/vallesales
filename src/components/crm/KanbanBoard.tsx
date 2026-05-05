import { useMemo, useState } from "react";
import { Lead, PipelineStage, Profile } from "@/types/crm";
import { LeadCard } from "./LeadCard";
import { useUpdateLead } from "@/hooks/useLeads";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Props {
  stages: PipelineStage[];
  leads: Lead[];
  profiles: Profile[];
  onSelectLead: (lead: Lead) => void;
  onAddInStage: (stageId: string) => void;
  canAddLead: boolean;
  canMoveLead: (lead: Lead) => boolean;
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
  onSelectLead,
  onAddInStage,
  canAddLead,
  canMoveLead,
}: Props) => {
  const update = useUpdateLead();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    stages.forEach((s) => (map[s.id] = []));
    leads.forEach((l) => { (map[l.stage_id] ||= []).push(l); });
    return map;
  }, [stages, leads]);

  // Maior valor entre todas as etapas — para dimensionar a barra de valor
  const maxStageValue = useMemo(() => {
    let max = 0;
    stages.forEach((s) => {
      const v = (leadsByStage[s.id] || []).reduce((sum, l) => sum + Number(l.estimated_value || 0), 0);
      if (v > max) max = v;
    });
    return max;
  }, [stages, leadsByStage]);

  const handleDrop = async (stageId: string) => {
    if (!draggedId) return;
    const lead = leads.find((l) => l.id === draggedId);
    setDraggedId(null);
    setOverStageId(null);
    if (!lead || lead.stage_id === stageId) return;
    await update.mutateAsync({ id: lead.id, stage_id: stageId });
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin h-full">
      {stages.map((stage, idx) => {
        const stageLeads = leadsByStage[stage.id] || [];
        const total = stageLeads.reduce((sum, l) => sum + Number(l.estimated_value || 0), 0);
        const isOver = overStageId === stage.id;
        const dotColor = stageColorBar[stage.key] || "bg-muted-foreground";
        const valuePct = maxStageValue > 0 ? Math.max(4, Math.round((total / maxStageValue) * 100)) : 0;

        // Conversão simples vs. etapa anterior (ignora etapas terminais como referência inicial)
        const prevStage = idx > 0 ? stages[idx - 1] : null;
        const prevCount = prevStage ? (leadsByStage[prevStage.id] || []).length : 0;
        const conversion =
          prevStage && prevCount > 0
            ? Math.round((stageLeads.length / prevCount) * 100)
            : null;

        return (
          <div
            key={stage.id}
            className={cn(
              "group flex-shrink-0 w-72 flex flex-col rounded-xl border transition-all duration-200",
              isOver
                ? "bg-accent/5 border-accent/40 shadow-card"
                : "bg-muted/40 border-transparent hover:border-border/60"
            )}
            onDragOver={(e) => { e.preventDefault(); setOverStageId(stage.id); }}
            onDragLeave={() => setOverStageId((id) => (id === stage.id ? null : id))}
            onDrop={() => handleDrop(stage.id)}
          >
            <div className="px-3 pt-3 pb-2.5 border-b border-border/50">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-background", dotColor)} />
                  <h3 className="font-semibold text-[13px] text-foreground truncate uppercase tracking-wide">{stage.name}</h3>
                  <span className="text-[11px] text-muted-foreground bg-background border border-border/60 rounded-full px-2 py-0.5 font-semibold tabular-nums">
                    {stageLeads.length}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-accent/10 hover:text-accent transition-all"
                  onClick={() => onAddInStage(stage.id)}
                  title="Adicionar lead nesta etapa"
                  disabled={!canAddLead}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-foreground/80 font-semibold tabular-nums">
                  {formatCurrency(total)}
                </p>
                {conversion !== null && (
                  <span
                    title={`Conversão a partir de "${prevStage?.name}" (${stageLeads.length}/${prevCount})`}
                    className={cn(
                      "text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md border",
                      conversion >= 70
                        ? "bg-success/10 text-success border-success/25"
                        : conversion >= 40
                        ? "bg-accent/10 text-accent border-accent/25"
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {conversion}%
                  </span>
                )}
              </div>

              {/* Barra proporcional de valor da etapa */}
              <div className="mt-2 h-1 w-full rounded-full bg-border/60 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", dotColor)}
                  style={{ width: `${valuePct}%` }}
                />
              </div>
            </div>

            <div
              className={cn(
                "flex-1 overflow-y-auto px-2 py-2 space-y-2 scrollbar-thin transition-all min-h-[200px] rounded-b-xl",
                isOver && "bg-accent/5"
              )}
            >
              {stageLeads.map((lead) => (
                <div key={lead.id} className="animate-fade-in-up">
                  <LeadCard
                    lead={lead}
                    profiles={profiles}
                    onClick={() => onSelectLead(lead)}
                    draggable={canMoveLead(lead)}
                    onDragStart={(e) => {
                      setDraggedId(lead.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  />
                </div>
              ))}
              {stageLeads.length === 0 && canAddLead && (
                <button
                  onClick={() => onAddInStage(stage.id)}
                  className="w-full text-center text-xs text-muted-foreground py-8 px-3 rounded-lg border border-dashed border-border/60 hover:border-accent/50 hover:text-accent hover:bg-accent/5 transition-all"
                >
                  + Adicionar lead
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

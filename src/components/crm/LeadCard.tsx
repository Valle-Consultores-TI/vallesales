import { useState } from "react";
import { Lead, Profile } from "@/types/crm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/constants";
import {
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle2,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Copy,
  User,
  UserX,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { startOfLocalDay } from "@/lib/date";
import { getLeadPriority, needsActionToday } from "@/lib/priority";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportLeadAsExcel, exportLeadAsPdf } from "@/lib/lead-export";
import { parseLeadSource } from "@/lib/lead-form";
import { toast } from "sonner";

interface Props {
  lead: Lead;
  isLost?: boolean;
  isHighlighted?: boolean;
  profiles: Profile[];
  funnelName?: string | null;
  stageName?: string | null;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  draggable?: boolean;
  onArchive?: () => void | Promise<void>;
  archiveLabel?: string;
}

const tempStyles: Record<string, string> = {
  frio: "bg-temp-frio/10 text-temp-frio border-temp-frio/25",
  morno: "bg-temp-morno/10 text-temp-morno border-temp-morno/30",
  quente: "bg-temp-quente/10 text-temp-quente border-temp-quente/30",
};

const tempBar: Record<string, string> = {
  frio: "bg-temp-frio",
  morno: "bg-temp-morno",
  quente: "bg-temp-quente",
};

const tempLabel: Record<string, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
};

type FollowUpStatus = "atrasado" | "hoje" | "futuro" | "sem";

function getFollowUpStatus(date: string | null | undefined): FollowUpStatus {
  const d = startOfLocalDay(date);
  if (!d) return "sem";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (d.getTime() < today.getTime()) return "atrasado";
  if (d.getTime() === today.getTime()) return "hoje";
  return "futuro";
}

export const LeadCard = ({
  lead,
  isLost = false,
  isHighlighted = false,
  profiles,
  funnelName = null,
  stageName = null,
  onClick,
  onDragStart,
  onDragEnd,
  draggable = true,
  onArchive,
  archiveLabel = "Arquivar",
}: Props) => {
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "excel" | null>(null);

  const owner = profiles.find((profile) => profile.id === lead.owner_id);
  const ownerName = owner?.full_name || owner?.email || null;
  const followUpStatus = getFollowUpStatus(lead.next_follow_up);
  const isOverdue = followUpStatus === "atrasado";
  const isToday = followUpStatus === "hoje";
  const noContact = !lead.has_been_contacted;
  const isHot = lead.temperature === "quente";
  const priority = getLeadPriority(lead);
  const actionToday = needsActionToday(lead);
  const lossReason = lead.loss_reason?.trim();
  const isCwkCard = (funnelName ?? "").toLowerCase().includes("cwk") || (lead.source ?? "").toLowerCase().includes("cwk");
  const sourceState = parseLeadSource(lead.source);
  const isReferralProgramLead = sourceState.is_referral_program;
  const trackingCode = lead.entity_kind === "customer_tracking" ? lead.tracking_code?.trim() ?? "" : "";

  const handleExport = async (format: "pdf" | "excel") => {
    setExportingFormat(format);

    try {
      const exportContext = {
        lead,
        funnelName,
        stageName,
        ownerName,
      };

      if (format === "pdf") {
        await exportLeadAsPdf(exportContext);
      } else {
        await exportLeadAsExcel(exportContext);
      }
    } catch (error) {
      console.error(error);
      toast.error(`Não foi possível exportar o lead em ${format === "pdf" ? "PDF" : "Excel"}.`);
    } finally {
      setExportingFormat(null);
    }
  };

  const handleCopyTrackingCode = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!trackingCode) return;

    try {
      await navigator.clipboard.writeText(trackingCode);
      toast.success("Codigo de acompanhamento copiado.");
    } catch {
      toast.error("Nao foi possivel copiar o codigo agora.");
    }
  };

  return (
    <Card
      id={`lead-card-${lead.id}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer overflow-hidden border bg-card p-3 pl-3.5 shadow-xs",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover",
        draggable && "active:cursor-grabbing active:scale-[0.99]",
        isHighlighted && "border-accent ring-2 ring-accent/35 shadow-[0_0_0_4px_hsl(var(--accent)/0.14)]",
        isOverdue && "border-destructive/40 bg-destructive/[0.02] ring-1 ring-destructive/20",
        !isOverdue && isHot && "border-temp-quente/45 ring-1 ring-temp-quente/25 shadow-[0_0_0_3px_hsl(var(--temp-quente)/0.08)]",
        !isOverdue && !isHot && isToday && "border-accent/40 ring-1 ring-accent/20",
        !isOverdue && !isHot && !isToday && "border-border/70 hover:border-border",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute bottom-0 left-0 top-0 w-1 transition-all group-hover:w-1.5",
          tempBar[lead.temperature] || "bg-muted",
        )}
      />

      <div className="absolute right-12 top-2 flex items-center gap-1">
        {actionToday && (
          <span
            title="Precisa de ação hoje"
            className="inline-flex h-5 items-center gap-0.5 rounded-full bg-accent px-1.5 text-[9px] font-bold uppercase tracking-wide text-accent-foreground shadow-sm"
          >
            <Zap className="h-2.5 w-2.5" />
            Hoje
          </span>
        )}
        {priority === "alta" && (
          <span
            title="Prioridade alta"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
        {priority === "media" && !actionToday && (
          <span
            title="Prioridade média"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-warning/90 text-warning-foreground shadow-sm"
          >
            {noContact ? <UserX className="h-3 w-3" /> : <Flame className="h-3 w-3" />}
          </span>
        )}
      </div>

      <div className="absolute right-2 top-2 z-10">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Exportar ficha do lead"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background/92 text-muted-foreground shadow-sm backdrop-blur transition-all",
                "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
                "hover:border-accent/35 hover:bg-accent/5 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
              )}
            >
              {exportingFormat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-60 rounded-2xl border-border/70 p-2 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuLabel className="px-2 pb-2 pt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Exportação
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!!exportingFormat}
              className="rounded-xl px-3 py-2.5"
              onSelect={(event) => {
                event.preventDefault();
                void handleExport("pdf");
              }}
            >
              <FileText className="mr-2 h-4 w-4 text-primary" />
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">Salvar como PDF</span>
                <span className="text-xs text-muted-foreground">
                  Tema visual {isCwkCard ? "CWK" : "Valle"}
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!!exportingFormat}
              className="rounded-xl px-3 py-2.5"
              onSelect={(event) => {
                event.preventDefault();
                void handleExport("excel");
              }}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">Salvar como Excel</span>
                <span className="text-xs text-muted-foreground">
                  Planilha estruturada para outro ambiente
                </span>
              </div>
            </DropdownMenuItem>
            {onArchive && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="rounded-xl px-3 py-2.5 text-warning focus:text-warning"
                  onSelect={(event) => {
                    event.preventDefault();
                    void onArchive();
                  }}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{archiveLabel}</span>
                    <span className="text-xs text-muted-foreground">
                      Remove este card do fluxo ativo e envia para o historico
                    </span>
                  </div>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-2 flex items-start justify-between gap-2 pr-20">
        <div className="space-y-1">
          {isReferralProgramLead && (
            <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-accent-foreground shadow-sm">
              Valle Indicação
            </span>
          )}
          {trackingCode && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full border border-accent/25 bg-accent/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-accent shadow-sm">
                {trackingCode}
              </span>
              <button
                type="button"
                onClick={handleCopyTrackingCode}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70 bg-background/92 text-muted-foreground transition-colors hover:border-accent/35 hover:bg-accent/5 hover:text-accent"
                aria-label="Copiar codigo de acompanhamento"
                title="Copiar codigo de acompanhamento"
              >
                <Copy className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
            {lead.company_or_person}
          </h4>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <Badge
          variant="outline"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0 text-[10px] font-medium",
            tempStyles[lead.temperature],
          )}
        >
          {isHot && <span className="h-1.5 w-1.5 rounded-full bg-temp-quente animate-pulse" />}
          {tempLabel[lead.temperature]}
        </Badge>
        {lead.contact_name && (
          <span className="truncate text-xs text-muted-foreground">{lead.contact_name}</span>
        )}
        {isReferralProgramLead && sourceState.indication_by && (
          <span className="truncate text-[10px] font-medium text-accent">
            Indicada por {sourceState.indication_by}
          </span>
        )}
      </div>

      <div className="space-y-1.5 text-xs">
        {Number(lead.estimated_value) > 0 && (
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <DollarSign className="h-3 w-3 text-success" />
            <span className="tabular-nums">{formatCurrency(Number(lead.estimated_value))}</span>
          </div>
        )}

        {owner && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="truncate">{owner.full_name || owner.email}</span>
          </div>
        )}

        {lead.next_follow_up && (
          <div
            className={cn(
              "flex items-center gap-1.5 font-medium",
              isOverdue && "text-destructive",
              isToday && "text-accent",
              !isOverdue && !isToday && "text-muted-foreground",
            )}
          >
            {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
            <span>
              {isOverdue && "Atrasado · "}
              {isToday && "Hoje · "}
              {formatDate(lead.next_follow_up)}
            </span>
          </div>
        )}

        {isLost && lossReason && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-2.5 py-2">
            <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Motivo da perda
            </div>
            <p className="line-clamp-3 text-[11px] leading-relaxed text-foreground">
              {lossReason}
            </p>
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5 border-t border-border/50 pt-1.5">
          {lead.has_been_contacted ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
              <CheckCircle2 className="h-3 w-3" />
              Contato realizado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
              <UserX className="h-3 w-3" />
              Sem contato
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
            {lead.contact_method === "whatsapp" && <MessageSquare className="h-3 w-3" />}
            {lead.contact_method === "ligacao" && <Phone className="h-3 w-3" />}
            {lead.contact_method === "email" && <Mail className="h-3 w-3" />}
          </span>
        </div>
      </div>
    </Card>
  );
};

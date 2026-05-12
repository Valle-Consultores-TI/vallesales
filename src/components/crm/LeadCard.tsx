import { Lead, Profile } from "@/types/crm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/constants";
import {
  Calendar, DollarSign, User, CheckCircle2, Phone, Mail, MessageSquare, AlertTriangle, UserX, Flame, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { startOfLocalDay } from "@/lib/date";
import { getLeadPriority, needsActionToday, priorityMeta } from "@/lib/priority";

interface Props {
  lead: Lead;
  isLost?: boolean;
  profiles: Profile[];
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  draggable?: boolean;
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
const tempLabel: Record<string, string> = { frio: "Frio", morno: "Morno", quente: "Quente" };

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

export const LeadCard = ({ lead, isLost = false, profiles, onClick, onDragStart, draggable = true }: Props) => {
  const owner = profiles.find((p) => p.id === lead.owner_id);
  const followUpStatus = getFollowUpStatus(lead.next_follow_up);
  const isOverdue = followUpStatus === "atrasado";
  const isToday = followUpStatus === "hoje";
  const noContact = !lead.has_been_contacted;
  const isHot = lead.temperature === "quente";
  const priority = getLeadPriority(lead);
  const actionToday = needsActionToday(lead);
  const lossReason = lead.loss_reason?.trim();

  return (
    <Card
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden p-3 pl-3.5 cursor-pointer bg-card border shadow-xs",
        "hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200",
        draggable && "active:cursor-grabbing active:scale-[0.99]",
        // Destaques de atenção (prioridade: atrasado > quente > hoje)
        isOverdue && "border-destructive/40 ring-1 ring-destructive/20 bg-destructive/[0.02]",
        !isOverdue && isHot && "border-temp-quente/45 ring-1 ring-temp-quente/25 shadow-[0_0_0_3px_hsl(var(--temp-quente)/0.08)]",
        !isOverdue && !isHot && isToday && "border-accent/40 ring-1 ring-accent/20",
        !isOverdue && !isHot && !isToday && "border-border/70 hover:border-border",
      )}
    >
      {/* Barra lateral — temperatura */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5",
          tempBar[lead.temperature] || "bg-muted"
        )}
      />

      {/* Bandeiras de atenção + prioridade (canto superior direito) */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {actionToday && (
          <span
            title="Precisa de ação hoje"
            className="inline-flex items-center gap-0.5 px-1.5 h-5 rounded-full bg-accent text-accent-foreground shadow-sm text-[9px] font-bold uppercase tracking-wide"
          >
            <Zap className="h-2.5 w-2.5" /> Hoje
          </span>
        )}
        {priority === "alta" && (
          <span
            title="Prioridade alta"
            className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-destructive text-destructive-foreground shadow-sm"
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
        {priority === "media" && !actionToday && (
          <span
            title="Prioridade média"
            className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-warning/90 text-warning-foreground shadow-sm"
          >
            {noContact ? <UserX className="h-3 w-3" /> : <Flame className="h-3 w-3" />}
          </span>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 mb-2 pr-12">
        <h4 className="font-semibold text-sm leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {lead.company_or_person}
        </h4>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 font-medium rounded-md inline-flex items-center gap-1",
            tempStyles[lead.temperature]
          )}
        >
          {isHot && <span className="h-1.5 w-1.5 rounded-full bg-temp-quente animate-pulse" />}
          {tempLabel[lead.temperature]}
        </Badge>
        {lead.contact_name && (
          <span className="text-xs text-muted-foreground truncate">{lead.contact_name}</span>
        )}
      </div>

      <div className="space-y-1.5 text-xs">
        {Number(lead.estimated_value) > 0 && (
          <div className="flex items-center gap-1.5 text-foreground font-semibold">
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

        <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/50 mt-2">
          {lead.has_been_contacted ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-success font-medium">
              <CheckCircle2 className="h-3 w-3" /> Contato realizado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] text-warning font-semibold">
              <UserX className="h-3 w-3" /> Sem contato
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

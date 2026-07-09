import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAddNote,
  useAssignableProfiles,
  useDeleteLead,
  useLeadActivities,
  useLeadAttachments,
  useLeadNotes,
  useLogContact,
  useUpdateLead,
  useUploadAttachment,
  downloadAttachment,
} from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";
import { useFunnelAccessOptions } from "@/hooks/useFunnels";
import type { Lead, PipelineStage, Profile, TrackingFlowKey } from "@/types/crm";
import { CONTACT_METHOD_OPTIONS, formatCurrency, formatDate, formatDateTime } from "@/lib/constants";
import {
  AlertTriangle,
  Calendar,
  DollarSign,
  Download,
  FileText,
  FileSpreadsheet,
  FileUp,
  History,
  Loader2,
  Mail,
  MapPin,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Phone,
  PhoneCall,
  Trash2,
  User as UserIcon,
  X,
  Copy,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import { parseDateValue } from "@/lib/date";
import { exportLeadAsExcel, exportLeadAsPdf } from "@/lib/lead-export";
import { TRACKING_FLOW_LABELS, isValleSalesFunnel } from "@/lib/customer-tracking";
import { COMPANY_MATURITY_LABELS, formatLeadSourceLabel, parseAdditionalContacts, parseLeadSource } from "@/lib/lead-form";
import { buildValleContractServiceLabels, buildValleContractSummary, hasValleContractSelections } from "@/lib/valle-contract";
import { TrackingInviteCard } from "@/components/crm/TrackingInviteCard";
import { toast } from "sonner";

interface Props {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  stages: PipelineStage[];
  canEditLead: boolean;
  canDeleteLead: boolean;
  onEdit?: () => void;
  onLeadChange?: (lead: Lead) => void;
  archiveLead?: () => Promise<void>;
  restoreLead?: () => Promise<void>;
  reopenLead?: () => Promise<void>;
  getTrackingTransferActions?: (lead: Lead | null | undefined) => Array<{ flow: TrackingFlowKey; label: string }>;
  onTrackingTransfer?: (lead: Lead, flow: TrackingFlowKey) => Promise<void>;
}

type AttachmentPeriodFilter = "all" | "today" | "last_7_days" | "last_30_days" | "this_month" | "last_month";

const tempColors: Record<string, string> = {
  frio: "bg-temp-frio/10 text-temp-frio border-temp-frio/30",
  morno: "bg-temp-morno/10 text-temp-morno border-temp-morno/30",
  quente: "bg-temp-quente/10 text-temp-quente border-temp-quente/30",
};

const tempLabel: Record<string, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
};

const activityLabel: Record<string, string> = {
  stage_change: "Mudança de etapa",
  owner_change: "Mudança de responsável",
  note_added: "Observação",
  contact_logged: "Contato realizado",
  attachment_added: "Anexo",
  lead_created: "Lead criado",
  lead_updated: "Atualização",
};

const attachmentPeriodLabels: Record<AttachmentPeriodFilter, string> = {
  all: "Todo o período",
  today: "Hoje",
  last_7_days: "Últimos 7 dias",
  last_30_days: "Últimos 30 dias",
  this_month: "Este mês",
  last_month: "Mês passado",
};

const getAttachmentDateRange = (filter: AttachmentPeriodFilter, now = new Date()) => {
  if (filter === "all") return null;

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (filter === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (filter === "last_7_days") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return { start, end };
  }

  if (filter === "last_30_days") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 29);
    return { start, end };
  }

  if (filter === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { start, end };
  }

  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
  };
};

export const LeadDetailsSheet = ({
  lead,
  open,
  onOpenChange,
  profiles,
  stages,
  canEditLead,
  canDeleteLead,
  onEdit,
  onLeadChange,
  archiveLead,
  restoreLead,
  reopenLead,
  getTrackingTransferActions,
  onTrackingTransfer,
}: Props) => {
  const [newNote, setNewNote] = useState("");
  const [contactMethod, setContactMethod] = useState("whatsapp");
  const [contactDesc, setContactDesc] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("__none__");
  const [attachmentPeriodFilter, setAttachmentPeriodFilter] = useState<AttachmentPeriodFilter>("all");
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "excel" | null>(null);
  const [transferringFlow, setTransferringFlow] = useState<TrackingFlowKey | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const activities = useLeadActivities(lead?.id ?? null);
  const notes = useLeadNotes(lead?.id ?? null);
  const attachments = useLeadAttachments(lead?.id ?? null);
  const addNote = useAddNote(lead?.id ?? "");
  const logContact = useLogContact(lead?.id ?? "");
  const upload = useUploadAttachment(lead?.id ?? "");
  const del = useDeleteLead();
  const updateLead = useUpdateLead({ errorMessage: "Não foi possível alterar o responsável." });
  const { data: assignableProfiles = [] } = useAssignableProfiles(lead?.funnel_id, !!lead?.funnel_id);
  const allFunnelsQuery = useFunnelAccessOptions(open, { module: "all" });
  const { user } = useAuth();

  useEffect(() => {
    setSelectedOwnerId(lead?.owner_id || "__none__");
  }, [lead?.id, lead?.owner_id]);

  useEffect(() => {
    setAttachmentPeriodFilter("all");
  }, [lead?.id]);

  const filteredAttachments = useMemo(() => {
    const items = attachments.data ?? [];
    const range = getAttachmentDateRange(attachmentPeriodFilter);

    if (!range) {
      return items;
    }

    return items.filter((attachment) => {
      const createdAt = parseDateValue(attachment.created_at);
      if (!createdAt) return false;
      return createdAt >= range.start && createdAt <= range.end;
    });
  }, [attachmentPeriodFilter, attachments.data]);

  if (!lead) return null;

  const stage = stages.find((item) => item.id === lead.stage_id);
  const funnel = (allFunnelsQuery.data ?? []).find((item) => item.id === lead.funnel_id);
  const isValleContractFunnel = isValleSalesFunnel(funnel?.name) || hasValleContractSelections(lead);
  const isArchived = lead.is_archived;
  const isWon = !!stage?.is_won;
  const isLost = !!stage?.is_lost;
  const isValleClosedSalesLead = lead.entity_kind === "lead" && isWon && isValleSalesFunnel(funnel?.name);
  const trackingTransferActions = getTrackingTransferActions?.(lead) ?? [];
  const canTransferTrackingLead = lead.entity_kind === "customer_tracking" && !isArchived && canEditLead && !!onTrackingTransfer && trackingTransferActions.length > 0;
  const canSendToTrackingFlow = isValleClosedSalesLead && !isArchived && canEditLead && !!onTrackingTransfer && trackingTransferActions.length > 0;
  const canShowTrackingActions = canSendToTrackingFlow || canTransferTrackingLead;
  const canArchiveLead = !isArchived && !!archiveLead && canEditLead && (
    lead.entity_kind === "customer_tracking" ||
    isLost ||
    (isWon && !isValleClosedSalesLead)
  );
  const additionalContacts = parseAdditionalContacts(lead.additional_contacts);
  const sourceState = parseLeadSource(lead.source);
  const isOpeningCompanyLead = lead.company_maturity === "opening_company";
  const isCwkLead = sourceState.source.toLowerCase().includes("cwk");
  const isReferralProgramLead = sourceState.is_referral_program;
  const owner = profiles.find((profile) => profile.id === lead.owner_id);
  const ownerName = owner?.full_name || owner?.email || null;
  const lossReason = lead.loss_reason?.trim();
  const trackingCode = lead.entity_kind === "customer_tracking" ? lead.tracking_code?.trim() ?? "" : "";
  const valleContractSummary = isValleContractFunnel ? buildValleContractSummary(lead) : "";
  const valleContractServiceLabels = isValleContractFunnel ? buildValleContractServiceLabels(lead) : [];
  const assignableIds = new Set(assignableProfiles.map((profile) => profile.id));
  const ownerOptions = profiles.filter(
    (profile) => assignableIds.has(profile.id) || profile.id === lead.owner_id,
  );

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await addNote.mutateAsync(newNote.trim());
    setNewNote("");
  };

  const handleLogContact = async () => {
    await logContact.mutateAsync({ method: contactMethod, description: contactDesc });
    setContactDesc("");
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await upload.mutateAsync(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async () => {
    const targetLabel = lead.entity_kind === "customer_tracking" ? "cliente" : "lead";
    if (!confirm(`Excluir este ${targetLabel} permanentemente?`)) return;
    await del.mutateAsync(lead);
    onOpenChange(false);
  };

  const handleOwnerChange = async (value: string) => {
    const nextOwnerId = value === "__none__" ? null : value;
    const previousOwnerId = selectedOwnerId;

    setSelectedOwnerId(value);

    try {
      const updatedLead = await updateLead.mutateAsync({ id: lead.id, owner_id: nextOwnerId });
      setSelectedOwnerId(updatedLead.owner_id || "__none__");
      onLeadChange?.(updatedLead);
    } catch {
      setSelectedOwnerId(previousOwnerId);
    }
  };

  const handleExport = async (format: "pdf" | "excel") => {
    setExportingFormat(format);

    try {
      const exportContext = {
        lead,
        funnelName: funnel?.name ?? null,
        stageName: stage?.name ?? null,
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

  const handleTrackingTransfer = async (flow: TrackingFlowKey) => {
    if (!onTrackingTransfer) return;

    setTransferringFlow(flow);
    try {
      await onTrackingTransfer(lead, flow);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o cliente para acompanhamento.");
    } finally {
      setTransferringFlow(null);
    }
  };

  const handleCopyValleContractSummary = async () => {
    if (!valleContractSummary) return;

    try {
      await navigator.clipboard.writeText(valleContractSummary);
      toast.success("Dados do contrato copiados.");
    } catch {
      toast.error("Não foi possível copiar os dados do contrato agora.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="center"
        showCloseButton={false}
        className="flex h-[min(90vh,54rem)] w-[min(96vw,72rem)] max-w-none flex-col overflow-hidden rounded-2xl border p-0"
      >
        <div className="shrink-0 bg-gradient-header px-6 py-5 text-header-foreground">
          <SheetHeader className="space-y-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-xl leading-tight text-header-foreground break-words">
                  {lead.company_or_person}
                </SheetTitle>
                {lead.contact_name && (
                  <SheetDescription className="text-header-muted">
                    {lead.contact_name}
                  </SheetDescription>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 gap-2 rounded-full border border-white/20 bg-white/10 px-3 text-header-foreground hover:bg-white/20"
                        disabled={!!exportingFormat}
                      >
                        {exportingFormat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Exportar
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60 rounded-2xl p-2">
                      <DropdownMenuLabel className="px-2 pb-2 pt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Exportação
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="rounded-xl px-3 py-2.5"
                        disabled={!!exportingFormat}
                        onSelect={(event) => {
                          event.preventDefault();
                          void handleExport("pdf");
                        }}
                      >
                        <FileText className="mr-2 h-4 w-4 text-primary" />
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium">Salvar como PDF</span>
                          <span className="text-xs text-muted-foreground">
                            Layout temático {isCwkLead || funnel?.name?.toLowerCase().includes("cwk") ? "CWK" : "Valle"}
                          </span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="rounded-xl px-3 py-2.5"
                        disabled={!!exportingFormat}
                        onSelect={(event) => {
                          event.preventDefault();
                          void handleExport("excel");
                        }}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium">Salvar como Excel</span>
                          <span className="text-xs text-muted-foreground">
                            Ficha completa do lead para outro ambiente
                          </span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {isArchived && restoreLead && canEditLead && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8"
                      onClick={() => void restoreLead()}
                    >
                      Restaurar
                    </Button>
                  )}
                  {isArchived && reopenLead && canEditLead && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8"
                      onClick={() => void reopenLead()}
                    >
                      Reabrir
                    </Button>
                  )}
                  {canArchiveLead && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8"
                      onClick={() => void archiveLead()}
                    >
                      Arquivar
                    </Button>
                  )}
                  {onEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-header-foreground hover:bg-header-hover/10"
                    onClick={onEdit}
                    disabled={!canEditLead}
                  >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-header-foreground hover:bg-destructive/30"
                    onClick={handleDelete}
                    disabled={!canDeleteLead}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 gap-2 rounded-full border border-white/20 bg-white/10 px-3 text-header-foreground hover:bg-white/20"
                  >
                    <X className="h-4 w-4" />
                    Fechar
                  </Button>
                </SheetClose>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {stage && <Badge variant="secondary">{stage.name}</Badge>}
              <Badge variant="outline" className={`${tempColors[lead.temperature]} border`}>
                {tempLabel[lead.temperature]}
              </Badge>
              {isArchived && (
                <Badge variant="outline" className="border-border/70 bg-background/20 text-header-foreground">
                  Arquivado
                </Badge>
              )}
              {lead.has_been_contacted && (
                <Badge variant="outline" className="border-success/30 bg-success/20 text-success">
                  Contato realizado
                </Badge>
              )}
              {isReferralProgramLead && (
                <Badge variant="outline" className="border-accent/30 bg-accent/15 text-accent">
                  Valle Indicação
                </Badge>
              )}
            </div>
          </SheetHeader>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {lead.phone && <Info icon={<Phone className="h-3.5 w-3.5" />} label="Telefone" value={lead.phone} />}
            {lead.email && <Info icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value={lead.email} />}
            {(lead.city || lead.uf) && (
              <Info
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Localização"
                value={[lead.city, lead.uf].filter(Boolean).join(" / ")}
              />
            )}
            {funnel && <Info label="Negócio" value={funnel.name} />}
            {trackingCode ? <TrackingInviteCard lead={lead} /> : null}

            <div className="col-span-2 space-y-1">
              <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <UserIcon className="h-3.5 w-3.5" />
                Responsável
              </p>
              <Select
                value={selectedOwnerId}
                onValueChange={handleOwnerChange}
                disabled={updateLead.isPending || !canEditLead}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsável</SelectItem>
                  {ownerOptions.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email}
                      {user?.id === profile.id ? " (eu)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {Number(lead.estimated_value) > 0 && (
              <Info
                icon={<DollarSign className="h-3.5 w-3.5" />}
                label="Valor"
                value={formatCurrency(Number(lead.estimated_value))}
              />
            )}
            {lead.contract_state_registration && <Info label="Inscrição Estadual" value={lead.contract_state_registration} />}
            {lead.employee_count && <Info label="Funcionários" value={lead.employee_count} />}
            {lead.company_maturity && (
              <Info
                label="Perfil empresarial"
                value={COMPANY_MATURITY_LABELS[lead.company_maturity as keyof typeof COMPANY_MATURITY_LABELS] ?? lead.company_maturity}
              />
            )}
            {(lead.next_follow_up || lead.cnpj || sourceState.source || lead.segment || lead.tax_regime) && (
              <div className="col-span-2 grid grid-cols-2 gap-3">
                <div className="space-y-3">
                  {lead.next_follow_up && (
                    <Info
                      icon={<Calendar className="h-3.5 w-3.5" />}
                      label="Proximo follow-up"
                      value={formatDate(lead.next_follow_up)}
                    />
                  )}
                  {(lead.segment || lead.tax_regime) && (
                    <div className="space-y-3">
                      {lead.segment && <Info label="Segmento" value={lead.segment} />}
                      {lead.segment === "Outro" && lead.segment_other && (
                        <Info label="Segmento detalhado" value={lead.segment_other} />
                      )}
                      {lead.tax_regime && <Info label="Regime tributário" value={lead.tax_regime} />}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {lead.cnpj && <Info label="CNPJ" value={lead.cnpj} />}
                  {sourceState.source && (
                    <div className="space-y-3">
                      <Info label="Origem" value={formatLeadSourceLabel(sourceState.source)} />
                      {sourceState.indication_by && <Info label="Indicação por" value={sourceState.indication_by} />}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {isValleContractFunnel && (
            <Card className="space-y-3 border-accent/25 bg-accent/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Dados variáveis para contrato</h4>
                  <p className="text-xs text-muted-foreground">
                    Bloco pronto para copiar e colar no assistente de contratos da Valle Consultores.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleCopyValleContractSummary}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copiar dados
                </Button>
              </div>

              {valleContractServiceLabels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {valleContractServiceLabels.map((service) => (
                    <Badge key={service.code} variant="outline" className="border-accent/30 bg-background/70">
                      {service.code} - {service.label}
                    </Badge>
                  ))}
                </div>
              )}

              <Textarea
                value={valleContractSummary}
                readOnly
                rows={6}
                className="min-h-[9.5rem] resize-none bg-background/80"
              />
            </Card>
          )}

          {isReferralProgramLead && (
            <Card className="space-y-3 border-accent/25 bg-accent/5 p-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Valle Indicação</h4>
                <p className="text-xs text-muted-foreground">
                  Este lead entrou pelo fluxo público de indicações e precisa de abordagem comercial diferenciada.
                </p>
              </div>
              {sourceState.indication_by && (
                <Info label="Cliente que indicou" value={sourceState.indication_by} />
              )}
            </Card>
          )}

          {isLost && lossReason && (
            <Card className="space-y-3 border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <h4 className="text-sm font-semibold">Motivo da perda</h4>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
                {lossReason}
              </p>
            </Card>
          )}

          {(lead.contact_name || lead.phone || lead.email) && (
            <Card className="space-y-3 border-border/70 p-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Contato principal</h4>
                <p className="text-xs text-muted-foreground">Dados principais usados no cadastro do lead.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                {lead.contact_name && <Info label="Nome" value={lead.contact_name} />}
                {lead.phone && <Info label="Telefone" value={lead.phone} />}
                {lead.email && <Info label="E-mail" value={lead.email} />}
              </div>
            </Card>
          )}

          {canShowTrackingActions && (
            <Card className="space-y-3 border-accent/25 bg-accent/5 p-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {canTransferTrackingLead ? "Transferir fluxo de acompanhamento" : "Enviar para acompanhamento"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {canTransferTrackingLead
                    ? `Se precisar, você pode mover este cliente entre os fluxos de ${TRACKING_FLOW_LABELS.opening_company} e ${TRACKING_FLOW_LABELS.existing_company}.`
                    : "Este cliente foi mantido no funil comercial. Quando quiser, você pode enviá-lo para o fluxo operacional adequado."}
                </p>
              </div>
              <div className="flex flex-col gap-2 md:flex-row">
                {trackingTransferActions.map((action) => (
                  <Button
                    key={action.flow}
                    type="button"
                    variant="accent"
                    className="h-auto whitespace-normal text-left"
                    disabled={transferringFlow !== null}
                    onClick={() => void handleTrackingTransfer(action.flow)}
                  >
                    {transferringFlow === action.flow && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {action.label}
                  </Button>
                ))}
              </div>
            </Card>
          )}

          {additionalContacts.length > 0 && (
            <Card className="space-y-3 border-border/70 p-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Contatos adicionais</h4>
                <p className="text-xs text-muted-foreground">Outras pessoas relacionadas a este lead.</p>
              </div>
              <div className="space-y-3">
                {additionalContacts.map((contact, index) => (
                  <div key={contact.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 p-3 md:grid-cols-3">
                    {contact.name && <Info label={`Nome ${index + 1}`} value={contact.name} />}
                    {contact.phone && <Info label="Telefone" value={contact.phone} />}
                    {contact.email && <Info label="E-mail" value={contact.email} />}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(lead.service_types.length > 0 || lead.service_details) && (
            <Card className="space-y-3 border-border/70 p-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {isOpeningCompanyLead ? "Atividades da futura empresa" : "Serviço necessário"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {isOpeningCompanyLead
                    ? "Descrição enviada por quem busca abertura de empresa."
                    : "Necessidade comercial registrada no cadastro."}
                </p>
              </div>
              {!isOpeningCompanyLead && lead.service_types.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {lead.service_types.map((serviceType) => (
                    <Badge key={serviceType} variant="outline" className="border-border/70 bg-secondary/40">
                      {serviceType}
                    </Badge>
                  ))}
                </div>
              )}
              {lead.service_details && (
                <Card className="border-0 bg-secondary/40 p-3 text-sm whitespace-pre-wrap">
                  {lead.service_details}
                </Card>
              )}
            </Card>
          )}

          {(lead.monthly_revenue_managerial ||
            lead.monthly_revenue_fiscal ||
            lead.monthly_invoice_count ||
            lead.employee_count_clt ||
            lead.employee_count_pj ||
            lead.payroll_gross_value ||
            lead.bank_account_count ||
            lead.bank_accounts_split ||
            lead.financial_system ||
            lead.accounting_pain_points) && (
            <Card className="space-y-3 border-border/70 p-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {isCwkLead ? "Diagnóstico CWK" : "Diagnóstico financeiro e operacional"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Informações complementares coletadas no formulário comercial.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                {lead.monthly_revenue_managerial && (
                  <Info label="Faturamento gerencial medio" value={lead.monthly_revenue_managerial} />
                )}
                {lead.monthly_revenue_fiscal && (
                  <Info label="Faturamento fiscal medio" value={lead.monthly_revenue_fiscal} />
                )}
                {lead.monthly_invoice_count && (
                  <Info label="NF por mes" value={lead.monthly_invoice_count} />
                )}
                {lead.employee_count_clt && <Info label="Funcionários CLT" value={lead.employee_count_clt} />}
                {lead.employee_count_pj && <Info label="Profissionais PJ" value={lead.employee_count_pj} />}
                {lead.payroll_gross_value && <Info label="Folha bruta media" value={lead.payroll_gross_value} />}
                {lead.bank_account_count && <Info label="Contas bancarias" value={lead.bank_account_count} />}
                {lead.bank_accounts_split && (
                  <Info label="Separação por projeto/centro de custo" value={lead.bank_accounts_split} />
                )}
                {lead.financial_system && <Info label="Sistema financeiro" value={lead.financial_system} />}
              </div>
              {lead.accounting_pain_points && (
                <Card className="border-0 bg-secondary/40 p-3 text-sm whitespace-pre-wrap">
                  {lead.accounting_pain_points}
                </Card>
              )}
            </Card>
          )}

          {lead.notes && (
            <Card className="border-0 bg-secondary/40 p-3 text-sm whitespace-pre-wrap">
              {lead.notes}
            </Card>
          )}

          <Separator />

          <Tabs defaultValue="history">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="history">
                <History className="mr-1 h-3.5 w-3.5" />
                Histórico
              </TabsTrigger>
              <TabsTrigger value="notes">
                <FileText className="mr-1 h-3.5 w-3.5" />
                Observações
              </TabsTrigger>
              <TabsTrigger value="files">
                <Paperclip className="mr-1 h-3.5 w-3.5" />
                Anexos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="mt-4 space-y-4">
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <PhoneCall className="h-4 w-4" />
                  Registrar contato
                </h4>
                <div className="flex gap-2">
                  <Select value={contactMethod} onValueChange={setContactMethod} disabled={!canEditLead}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHOD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    rows={1}
                    placeholder="Descrição (opcional)"
                    value={contactDesc}
                    onChange={(event) => setContactDesc(event.target.value)}
                    className="min-h-9 flex-1"
                    disabled={!canEditLead}
                  />
                  <Button size="sm" onClick={handleLogContact} disabled={logContact.isPending || !canEditLead}>
                    {logContact.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Registrar
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Linha do tempo</h4>
                {activities.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : activities.data?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma atividade.</p>
                ) : (
                  <div className="space-y-2">
                    {activities.data?.map((activity) => (
                      <div key={activity.id} className="flex gap-3 border-l-2 border-accent py-1 pl-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {activityLabel[activity.type]}
                          </p>
                          <p className="text-foreground">{activity.description}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatDateTime(activity.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-4 space-y-4">
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquarePlus className="h-4 w-4" />
                  Nova observação
                </h4>
                <Textarea
                  rows={3}
                  placeholder="Escreva uma observação..."
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  disabled={!canEditLead}
                />
                <Button size="sm" onClick={handleAddNote} disabled={addNote.isPending || !newNote.trim() || !canEditLead}>
                  {addNote.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Adicionar
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                {notes.data?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem observações.</p>
                ) : (
                  notes.data?.map((note) => (
                    <Card key={note.id} className="p-3 text-sm">
                      <p className="whitespace-pre-wrap">{note.content}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {formatDateTime(note.created_at)}
                      </p>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="files" className="mt-4 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1 sm:min-w-[220px]">
                  <p className="text-xs font-medium text-muted-foreground">Filtrar por período</p>
                  <Select
                    value={attachmentPeriodFilter}
                    onValueChange={(value) => setAttachmentPeriodFilter(value as AttachmentPeriodFilter)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(attachmentPeriodLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {filteredAttachments.length} {filteredAttachments.length === 1 ? "arquivo" : "arquivos"}
                  </span>
                  <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={upload.isPending || !canEditLead}
                  >
                    {upload.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileUp className="mr-1 h-3.5 w-3.5" />
                    )}
                    Enviar arquivo
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {attachments.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : attachments.data?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem anexos.</p>
                ) : filteredAttachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum arquivo encontrado para o período selecionado.</p>
                ) : (
                  filteredAttachments.map((attachment) => (
                    <Card key={attachment.id} className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{attachment.file_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateTime(attachment.created_at)}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => downloadAttachment(attachment.file_path, attachment.file_name)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Info = ({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) => (
  <div className="space-y-0.5">
    <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
      {icon}
      {label}
    </p>
    <p className="break-words text-sm font-medium text-foreground">{value}</p>
  </div>
);

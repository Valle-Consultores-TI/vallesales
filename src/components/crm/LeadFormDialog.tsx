import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { addLeadNoteEntry, useArchiveLead, useAssignableProfiles, useCreateLead, useProfiles, useStages, useUpdateLead, uploadLeadAttachmentFile } from "@/hooks/useLeads";
import { useActiveFunnel } from "@/hooks/useActiveFunnel";
import { useAuth } from "@/hooks/useAuth";
import type { Funnel, Lead } from "@/types/crm";
import type { TrackingFlowKey } from "@/types/crm";
import { CONTACT_METHOD_OPTIONS, SOURCE_OPTIONS, TEMPERATURE_OPTIONS, UF_OPTIONS } from "@/lib/constants";
import {
  COMPANY_MATURITY_OPTIONS,
  formatLeadSourceLabel,
  formatCnpj,
  formatPhone,
  getServiceTypeOptionsForFunnel,
  isIndicationLeadSource,
  isValidLeadPhone,
  LeadAdditionalContact,
  parseAdditionalContacts,
  parseLeadSource,
  SEGMENT_OPTIONS,
  serializeAdditionalContacts,
  serializeLeadSource,
  TAX_REGIME_OPTIONS,
} from "@/lib/lead-form";
import { isValleSalesFunnel } from "@/lib/customer-tracking";
import {
  VALLE_CONTRACT_ACCOUNTING_OPTIONS,
  VALLE_CONTRACT_FINANCIAL_OPTIONS,
  VALLE_CONTRACT_FISCAL_OPTIONS,
  VALLE_CONTRACT_LABOR_OPTIONS,
} from "@/lib/valle-contract";
import { Loader2, Plus, Trash2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead?: Lead | null;
  defaultStageId?: string;
  funnelOptions?: Funnel[];
  lockedFunnelId?: string | null;
  wonDialogTitle?: string;
  wonDialogDescription?: string;
  wonDialogKeepLabel?: string;
  showWonArchiveAction?: boolean;
  showWonCancelAction?: boolean;
  getWonLeadTransferActions?: (lead: Lead | null | undefined) => Array<{ flow: TrackingFlowKey; label: string }>;
  onWonLeadTransfer?: (lead: Lead, flow: TrackingFlowKey) => Promise<void>;
}

type FormState = {
  funnel_id: string;
  company_or_person: string;
  contact_name: string;
  phone: string;
  email: string;
  cnpj: string;
  employee_count: string;
  employee_count_clt: string;
  employee_count_pj: string;
  source: string;
  indication_by: string;
  segment: string;
  segment_other: string;
  city: string;
  uf: string;
  owner_id: string;
  estimated_value: string;
  temperature: string;
  stage_id: string;
  has_been_contacted: boolean;
  contact_method: string;
  next_follow_up: string;
  notes: string;
  company_maturity: string;
  contract_state_registration: string;
  contract_fiscal_code: string;
  contract_accounting_code: string;
  contract_labor_code: string;
  contract_financial_codes: string[];
  contract_include_address: boolean;
  additional_contacts: LeadAdditionalContact[];
  tax_regime: string;
  monthly_revenue_managerial: string;
  monthly_revenue_fiscal: string;
  monthly_invoice_count: string;
  payroll_gross_value: string;
  bank_account_count: string;
  bank_accounts_split: string;
  financial_system: string;
  accounting_pain_points: string;
  service_types: string[];
  service_details: string;
};

type FormErrors = Partial<Record<"funnel_id" | "company_or_person" | "contact_name" | "phone" | "stage_id" | "indication_by", string>>;

type PendingAttachment = {
  id: string;
  file: File;
};

const tempDot: Record<string, string> = {
  frio: "bg-temp-frio",
  morno: "bg-temp-morno",
  quente: "bg-temp-quente",
};

const normalizeSegmentState = (lead: Lead | null | undefined) => {
  const currentSegment = lead?.segment ?? "";
  if (!currentSegment) {
    return {
      segment: "",
      segment_other: lead?.segment_other ?? "",
    };
  }

  if (SEGMENT_OPTIONS.includes(currentSegment as (typeof SEGMENT_OPTIONS)[number])) {
    return {
      segment: currentSegment,
      segment_other: lead?.segment_other ?? "",
    };
  }

  return {
    segment: "Outro",
    segment_other: lead?.segment_other ?? currentSegment,
  };
};

const buildInitialForm = (
  lead: Lead | null | undefined,
  defaultStageId: string | undefined,
  preferredFunnelId?: string | null,
  firstStageId?: string,
): FormState => {
  const segmentState = normalizeSegmentState(lead);
  const sourceState = parseLeadSource(lead?.source);

  return {
    funnel_id: lead?.funnel_id ?? preferredFunnelId ?? "",
    company_or_person: lead?.company_or_person ?? "",
    contact_name: lead?.contact_name ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    cnpj: lead?.cnpj ?? "",
    employee_count: lead?.employee_count ?? "",
    employee_count_clt: lead?.employee_count_clt ?? "",
    employee_count_pj: lead?.employee_count_pj ?? "",
    source: sourceState.source,
    indication_by: sourceState.indication_by,
    segment: segmentState.segment,
    segment_other: segmentState.segment_other,
    city: lead?.city ?? "",
    uf: lead?.uf ?? "",
    owner_id: lead?.owner_id ?? "",
    estimated_value: String(lead?.estimated_value ?? 0),
    temperature: lead?.temperature ?? "morno",
    stage_id: lead?.stage_id ?? defaultStageId ?? firstStageId ?? "",
    has_been_contacted: lead?.has_been_contacted ?? false,
    contact_method: lead?.contact_method ?? "",
    next_follow_up: lead?.next_follow_up ?? "",
    notes: lead?.notes ?? "",
    company_maturity: lead?.company_maturity ?? "",
    contract_state_registration: lead?.contract_state_registration ?? "",
    contract_fiscal_code: lead?.contract_fiscal_code ?? "",
    contract_accounting_code: lead?.contract_accounting_code ?? "",
    contract_labor_code: lead?.contract_labor_code ?? "",
    contract_financial_codes: lead?.contract_financial_codes ?? [],
    contract_include_address: lead?.contract_include_address ?? false,
    additional_contacts: parseAdditionalContacts(lead?.additional_contacts),
    tax_regime: lead?.tax_regime ?? "",
    monthly_revenue_managerial: lead?.monthly_revenue_managerial ?? "",
    monthly_revenue_fiscal: lead?.monthly_revenue_fiscal ?? "",
    monthly_invoice_count: lead?.monthly_invoice_count ?? "",
    payroll_gross_value: lead?.payroll_gross_value ?? "",
    bank_account_count: lead?.bank_account_count ?? "",
    bank_accounts_split: lead?.bank_accounts_split ?? "",
    financial_system: lead?.financial_system ?? "",
    accounting_pain_points: lead?.accounting_pain_points ?? "",
    service_types: lead?.service_types ?? [],
    service_details: lead?.service_details ?? "",
  };
};

const createEmptyAdditionalContact = (): LeadAdditionalContact => ({
  id: crypto.randomUUID(),
  name: "",
  phone: "",
  email: "",
});

export const LeadFormDialog = ({
  open,
  onOpenChange,
  lead,
  defaultStageId,
  funnelOptions,
  lockedFunnelId,
  wonDialogTitle = "Cliente fechado",
  wonDialogDescription = "Este cliente pode ser arquivado agora ou permanecer no funil até que você decida arquivar manualmente. O histórico continuará salvo e o contato permanecerá na aba Contatos.",
  wonDialogKeepLabel = "Manter no funil",
  showWonArchiveAction = true,
  showWonCancelAction = true,
  getWonLeadTransferActions,
  onWonLeadTransfer,
}: Props) => {
  const qc = useQueryClient();
  const { activeFunnelId, funnels: activeFunnels } = useActiveFunnel();
  const availableFunnels = funnelOptions ?? activeFunnels;
  const preferredFunnelId = lockedFunnelId ?? activeFunnelId;
  const { data: profiles = [] } = useProfiles();
  const [form, setForm] = useState<FormState>(() => buildInitialForm(lead, defaultStageId, preferredFunnelId));
  const { data: stages = [] } = useStages(form.funnel_id || undefined, !!form.funnel_id);
  const { data: assignableProfiles = [] } = useAssignableProfiles(form.funnel_id || undefined, !!form.funnel_id);
  const { user } = useAuth();
  const create = useCreateLead();
  const update = useUpdateLead();
  const archiveLead = useArchiveLead();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<FormErrors>({});
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [lossReasonDialogOpen, setLossReasonDialogOpen] = useState(false);
  const [wonArchiveDialogOpen, setWonArchiveDialogOpen] = useState(false);
  const [lossReason, setLossReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(lead, defaultStageId, preferredFunnelId));
    setErrors({});
    setPendingAttachments([]);
    setLossReasonDialogOpen(false);
    setWonArchiveDialogOpen(false);
    setLossReason("");
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  }, [defaultStageId, lead, open, preferredFunnelId]);

  useEffect(() => {
    if (!open || !form.funnel_id || stages.length === 0) return;
    const stageStillValid = stages.some((stage) => stage.id === form.stage_id);
    if (!stageStillValid) {
      const nextStageId = stages.find((stage) => stage.id === defaultStageId)?.id ?? stages[0]?.id ?? "";
      setForm((current) => ({ ...current, stage_id: nextStageId }));
    }
  }, [defaultStageId, form.funnel_id, form.stage_id, open, stages]);

  const loading = create.isPending || update.isPending || archiveLead.isPending;
  const isEdit = !!lead;
  const assignableIds = new Set(assignableProfiles.map((profile) => profile.id));
  const ownerOptions = profiles.filter(
    (profile) => assignableIds.has(profile.id) || profile.id === form.owner_id,
  );
  const selectedFunnel = useMemo(
    () => availableFunnels.find((funnel) => funnel.id === form.funnel_id) ?? null,
    [availableFunnels, form.funnel_id],
  );
  const selectedStage = useMemo(
    () => stages.find((stage) => stage.id === form.stage_id) ?? null,
    [form.stage_id, stages],
  );
  const isTrackingContext = lead?.entity_kind === "customer_tracking" || selectedFunnel?.module === "customer_tracking";
  const entityLabel = isTrackingContext ? "cliente" : "lead";
  const entityLabelCapitalized = isTrackingContext ? "Cliente" : "Lead";
  const isValleContractFunnel = isValleSalesFunnel(selectedFunnel?.name);
  const canManuallyArchiveCurrentLead = Boolean(
    lead &&
    !lead.is_archived &&
    (
      lead.entity_kind === "customer_tracking" ||
      (
        selectedStage &&
        (selectedStage.is_lost || selectedStage.is_won) &&
        !(
          lead.entity_kind === "lead" &&
          selectedStage.is_won &&
          isValleSalesFunnel(selectedFunnel?.name)
        )
      )
    ),
  );
  const serviceTypeOptions = useMemo(
    () => getServiceTypeOptionsForFunnel(selectedFunnel?.name),
    [selectedFunnel?.name],
  );
  const allowedServiceTypeSet = useMemo(
    () => new Set<string>(serviceTypeOptions),
    [serviceTypeOptions],
  );

  useEffect(() => {
    setForm((current) => {
      const filteredServiceTypes = current.service_types.filter((serviceType) => allowedServiceTypeSet.has(serviceType));
      return filteredServiceTypes.length === current.service_types.length
        ? current
        : { ...current, service_types: filteredServiceTypes };
    });
  }, [allowedServiceTypeSet]);

  const patchForm = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const clearError = (field: keyof FormErrors) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const toggleServiceType = (serviceType: string, checked: boolean) => {
    patchForm({
      service_types: checked
        ? Array.from(new Set([...form.service_types, serviceType]))
        : form.service_types.filter((item) => item !== serviceType),
    });
  };

  const toggleContractFinancialCode = (code: string, checked: boolean) => {
    patchForm({
      contract_financial_codes: checked
        ? Array.from(new Set([...form.contract_financial_codes, code]))
        : form.contract_financial_codes.filter((item) => item !== code),
    });
  };

  const updateAdditionalContact = (contactId: string, patch: Partial<LeadAdditionalContact>) => {
    patchForm({
      additional_contacts: form.additional_contacts.map((contact) =>
        contact.id === contactId ? { ...contact, ...patch } : contact,
      ),
    });
  };

  const addPendingAttachments = (files: FileList | null) => {
    if (!files?.length) return;

    setPendingAttachments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        id: crypto.randomUUID(),
        file,
      })),
    ]);
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  const validateForm = () => {
    const nextErrors: FormErrors = {};

    if (!form.company_or_person.trim()) {
      nextErrors.company_or_person = "Informe a empresa ou pessoa.";
    }
    if (!form.funnel_id) {
      nextErrors.funnel_id = "Selecione o negócio/funil.";
    }
    if (!form.stage_id) {
      nextErrors.stage_id = "Selecione a etapa do funil.";
    }
    if (!form.contact_name.trim()) {
      nextErrors.contact_name = "Informe o nome do contato principal.";
    }
    if (!isValidLeadPhone(form.phone)) {
      nextErrors.phone = "Informe um telefone válido para o contato principal.";
    }
    if (isIndicationLeadSource(form.source) && !form.indication_by.trim()) {
      nextErrors.indication_by = "Informe quem fez a indicação.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveLead = async ({
    archiveAfterSave = false,
    lostReasonText,
  }: {
    archiveAfterSave?: boolean;
    lostReasonText?: string;
  } = {}) => {
    const payload = {
      funnel_id: form.funnel_id,
      company_or_person: form.company_or_person.trim(),
      contact_name: form.contact_name.trim(),
      phone: formatPhone(form.phone),
      email: form.email.trim() || null,
      cnpj: form.cnpj.trim() || null,
      employee_count: form.employee_count.trim() || null,
      employee_count_clt: form.employee_count_clt.trim() || null,
      employee_count_pj: form.employee_count_pj.trim() || null,
      source: serializeLeadSource(form.source, form.indication_by),
      segment: form.segment || null,
      segment_other: form.segment === "Outro" ? form.segment_other.trim() || null : null,
      city: form.city.trim() || null,
      uf: form.uf || null,
      owner_id: form.owner_id || null,
      estimated_value: Number(form.estimated_value) || 0,
      temperature: form.temperature as "frio" | "morno" | "quente",
      stage_id: form.stage_id,
      has_been_contacted: form.has_been_contacted,
      contact_method: (form.contact_method || null) as never,
      next_follow_up: form.next_follow_up || null,
      loss_reason: lostReasonText?.trim() || (lead?.loss_reason ?? null),
      notes: form.notes.trim() || null,
      company_maturity: form.company_maturity || null,
      contract_state_registration: form.contract_state_registration.trim() || null,
      contract_fiscal_code: form.contract_fiscal_code || null,
      contract_accounting_code: form.contract_accounting_code || null,
      contract_labor_code: form.contract_labor_code || null,
      contract_financial_codes: form.contract_financial_codes,
      contract_include_address: form.contract_include_address,
      additional_contacts: serializeAdditionalContacts(form.additional_contacts),
      tax_regime: form.tax_regime || null,
      monthly_revenue_managerial: form.monthly_revenue_managerial.trim() || null,
      monthly_revenue_fiscal: form.monthly_revenue_fiscal.trim() || null,
      monthly_invoice_count: form.monthly_invoice_count.trim() || null,
      payroll_gross_value: form.payroll_gross_value.trim() || null,
      bank_account_count: form.bank_account_count.trim() || null,
      bank_accounts_split: form.bank_accounts_split || null,
      financial_system: form.financial_system.trim() || null,
      accounting_pain_points: form.accounting_pain_points.trim() || null,
      service_types: form.service_types,
      service_details: form.service_details.trim() || null,
    };

    const savedLead = lead
      ? await update.mutateAsync({ id: lead.id, ...payload })
      : await create.mutateAsync(payload);

    if (lostReasonText?.trim()) {
      const trimmedLossReason = lostReasonText.trim();
      await addLeadNoteEntry({
        leadId: savedLead.id,
        content: `Motivo da perda: ${trimmedLossReason}`,
        userId: user?.id,
        activityDescription: `Cliente perdido: ${trimmedLossReason}`,
      });
      qc.invalidateQueries({ queryKey: ["lead_notes", savedLead.id] });
      qc.invalidateQueries({ queryKey: ["lead_activities", savedLead.id] });
      qc.invalidateQueries({ queryKey: ["lead", savedLead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });
    }

    const pendingUploads = pendingAttachments.map((attachment) => attachment.file);

    if (pendingUploads.length > 0) {
      const failedUploads: string[] = [];

      for (const file of pendingUploads) {
        try {
          await uploadLeadAttachmentFile({
            leadId: savedLead.id,
            file,
            userId: user?.id,
            displayName: file.name,
          });
        } catch (error) {
          failedUploads.push(error instanceof Error ? error.message : "Falha ao enviar anexo.");
        }
      }

      qc.invalidateQueries({ queryKey: ["lead_attachments", savedLead.id] });
      qc.invalidateQueries({ queryKey: ["lead_activities", savedLead.id] });
      qc.invalidateQueries({ queryKey: ["lead", savedLead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["crm_notifications_feed"] });

      if (failedUploads.length > 0) {
        toast.error("O lead foi salvo, mas um ou mais anexos não puderam ser enviados.");
      }
    }

    if (archiveAfterSave) {
      await archiveLead.mutateAsync(savedLead);
    }

    setLossReasonDialogOpen(false);
    setWonArchiveDialogOpen(false);
    setLossReason("");
    onOpenChange(false);

    return savedLead;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    const targetStage = stages.find((stage) => stage.id === form.stage_id);
    const currentStage = lead ? stages.find((stage) => stage.id === lead.stage_id) : null;
    const isMovingToLost = targetStage?.is_lost && !currentStage?.is_lost;
    const isMovingToWon = targetStage?.is_won && !currentStage?.is_won;

    if (isMovingToLost) {
      setLossReasonDialogOpen(true);
      return;
    }

    if (isMovingToWon) {
      setWonArchiveDialogOpen(true);
      return;
    }

    await saveLead();
  };

  const handleWonTransfer = async (flow: TrackingFlowKey) => {
    if (!onWonLeadTransfer) return;
    const savedLead = await saveLead();
    await onWonLeadTransfer(savedLead, flow);
  };

  const handleManualArchive = async () => {
    if (!lead) return;

    const shouldArchive = window.confirm(
      isTrackingContext
        ? "Deseja arquivar este cliente em acompanhamento? Ele sairá do fluxo ativo, mas continuará salvo no histórico."
        : "Deseja arquivar este negócio? Ele sairá do funil principal, mas continuará salvo no histórico e o contato permanecerá na aba Contatos.",
    );

    if (!shouldArchive) return;

    await archiveLead.mutateAsync(lead);
    setLossReasonDialogOpen(false);
    setWonArchiveDialogOpen(false);
    onOpenChange(false);
  };

  const shouldShowIndicationField = isIndicationLeadSource(form.source);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar ${entityLabel}` : `Novo ${entityLabel}`}</DialogTitle>
          <DialogDescription>
            {isTrackingContext
              ? "Preencha os dados do cliente, organize os contatos e registre o andamento operacional em um único formulário."
              : "Preencha os dados do lead, organize os contatos e registre as informações comerciais em um único formulário."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <FormSection
            title={`Dados do ${entityLabel} / empresa`}
            description={
              isTrackingContext
                ? "Informações principais da empresa, etapa atual e origem do cliente."
                : "Informações principais da empresa, etapa atual e origem do lead."
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FieldBlock className="md:col-span-2" error={errors.company_or_person}>
                <Label htmlFor="company">Empresa ou pessoa *</Label>
                <Input
                  id="company"
                  ref={firstFieldRef}
                  placeholder="Ex.: Acme Ltda ou Joao da Silva"
                  value={form.company_or_person}
                  onChange={(event) => {
                    patchForm({ company_or_person: event.target.value });
                    clearError("company_or_person");
                  }}
                  required
                  autoComplete="off"
                />
              </FieldBlock>

              <FieldBlock error={errors.funnel_id}>
                <Label>{isTrackingContext ? "Fluxo de acompanhamento *" : "Negócio / funil *"}</Label>
                {lockedFunnelId ? (
                  <Input value={selectedFunnel?.name ?? "Fluxo atual"} readOnly />
                ) : (
                  <Select
                    value={form.funnel_id}
                    onValueChange={(value) => {
                      patchForm({ funnel_id: value, owner_id: "" });
                      clearError("funnel_id");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFunnels.map((funnel) => (
                        <SelectItem key={funnel.id} value={funnel.id}>
                          {funnel.name}
                          {funnel.is_default ? " (principal)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FieldBlock>

              <FieldBlock error={errors.stage_id}>
                <Label>{isTrackingContext ? "Etapa do acompanhamento *" : "Etapa do funil *"}</Label>
                <Select
                  value={form.stage_id}
                  onValueChange={(value) => {
                    patchForm({ stage_id: value });
                    clearError("stage_id");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock>
                <Label>Perfil empresarial</Label>
                <Select value={form.company_maturity || "__none__"} onValueChange={(value) => patchForm({ company_maturity: value === "__none__" ? "" : value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    {COMPANY_MATURITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock>
                <Label>Temperatura</Label>
                <Select value={form.temperature} onValueChange={(value) => patchForm({ temperature: value })}>
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", tempDot[form.temperature])} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPERATURE_OPTIONS.map((temperature) => (
                      <SelectItem key={temperature.value} value={temperature.value}>
                        <span className="inline-flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", temperature.color)} />
                          {temperature.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock>
                <div className="flex items-center justify-between">
                  <Label>Responsável</Label>
                  {user?.id && form.owner_id !== user.id && (
                    <button
                      type="button"
                      onClick={() => patchForm({ owner_id: user.id })}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                    >
                      <UserCheck className="h-3 w-3" />
                      Atribuir a mim
                    </button>
                  )}
                </div>
                <Select
                  value={form.owner_id || "__none__"}
                  onValueChange={(value) => patchForm({ owner_id: value === "__none__" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável</SelectItem>
                    {ownerOptions.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email}
                        {profile.id === user?.id ? " (eu)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <div className={cn("grid grid-cols-1 gap-4", shouldShowIndicationField && "md:col-span-2 md:grid-cols-2")}>
                <FieldBlock>
                  <Label>Origem do lead</Label>
                  <Select
                    value={form.source || undefined}
                    onValueChange={(value) => {
                      patchForm({
                        source: value,
                        indication_by: isIndicationLeadSource(value) ? form.indication_by : "",
                      });
                      clearError("indication_by");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map((source) => (
                        <SelectItem key={source} value={source}>
                          {formatLeadSourceLabel(source)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldBlock>

                {shouldShowIndicationField && (
                  <FieldBlock error={errors.indication_by}>
                    <Label>Indicação por</Label>
                    <Input
                      placeholder="Quem indicou este lead?"
                      value={form.indication_by}
                      onChange={(event) => {
                        patchForm({ indication_by: event.target.value });
                        clearError("indication_by");
                      }}
                    />
                  </FieldBlock>
                )}
              </div>

              <FieldBlock>
                <Label>Valor estimado (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.estimated_value}
                  onChange={(event) => patchForm({ estimated_value: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Segmento</Label>
                <Select
                  value={form.segment || undefined}
                  onValueChange={(value) =>
                    patchForm({
                      segment: value,
                      segment_other: value === "Outro" ? form.segment_other : "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEGMENT_OPTIONS.map((segment) => (
                      <SelectItem key={segment} value={segment}>
                        {segment}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              {form.segment === "Outro" && (
                <FieldBlock>
                  <Label>Qual segmento?</Label>
                  <Input
                    placeholder="Descreva o segmento"
                    value={form.segment_other}
                    onChange={(event) => patchForm({ segment_other: event.target.value })}
                  />
                </FieldBlock>
              )}

              <FieldBlock>
                <Label>Cidade</Label>
                <Input value={form.city} onChange={(event) => patchForm({ city: event.target.value })} />
              </FieldBlock>

              <FieldBlock>
                <Label>UF</Label>
                <Select value={form.uf || undefined} onValueChange={(value) => patchForm({ uf: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {UF_OPTIONS.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>
            </div>
          </FormSection>

          <FormSection
            title="Contato principal"
            description="Esse contato principal será usado como referência principal do lead."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FieldBlock error={errors.contact_name}>
                <Label>Nome do contato *</Label>
                <Input
                  value={form.contact_name}
                  onChange={(event) => {
                    patchForm({ contact_name: event.target.value });
                    clearError("contact_name");
                  }}
                />
              </FieldBlock>

              <FieldBlock error={errors.phone}>
                <Label>Telefone *</Label>
                <Input
                  inputMode="numeric"
                  placeholder="(11) 98765-4321"
                  value={form.phone}
                  onChange={(event) => {
                    patchForm({ phone: formatPhone(event.target.value) });
                    clearError("phone");
                  }}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => patchForm({ email: event.target.value })}
                />
              </FieldBlock>
            </div>
          </FormSection>

          <FormSection
            title="Contatos adicionais"
            description="Cadastre outros contatos ligados a este lead sem duplicar o contato principal."
            action={(
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  patchForm({ additional_contacts: [...form.additional_contacts, createEmptyAdditionalContact()] })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar contato
              </Button>
            )}
          >
            {form.additional_contacts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                Nenhum contato adicional cadastrado.
              </div>
            ) : (
              <div className="space-y-3">
                {form.additional_contacts.map((contact, index) => (
                  <div
                    key={contact.id}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 bg-background/60 p-4 md:grid-cols-[1.2fr_1fr_1fr_auto]"
                  >
                    <FieldBlock>
                      <Label>Nome do contato {index + 1}</Label>
                      <Input
                        value={contact.name}
                        onChange={(event) => updateAdditionalContact(contact.id, { name: event.target.value })}
                      />
                    </FieldBlock>

                    <FieldBlock>
                      <Label>Telefone</Label>
                      <Input
                        inputMode="numeric"
                        placeholder="(11) 98765-4321"
                        value={contact.phone}
                        onChange={(event) =>
                          updateAdditionalContact(contact.id, { phone: formatPhone(event.target.value) })
                        }
                      />
                    </FieldBlock>

                    <FieldBlock>
                      <Label>E-mail</Label>
                      <Input
                        type="email"
                        value={contact.email}
                        onChange={(event) => updateAdditionalContact(contact.id, { email: event.target.value })}
                      />
                    </FieldBlock>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          patchForm({
                            additional_contacts: form.additional_contacts.filter((item) => item.id !== contact.id),
                          })
                        }
                        aria-label={`Remover contato ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {isValleContractFunnel && (
            <FormSection
              title="Dados para contrato"
              description="Esses campos alimentam o resumo copiável usado pelo assistente de contratos da Valle Consultores."
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FieldBlock className="md:col-span-2">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-3 rounded-lg border border-border/70 p-4">
                      <div className="space-y-1">
                        <Label>1 - Gestão Fiscal</Label>
                        <p className="text-xs text-muted-foreground">Escolha apenas um item.</p>
                      </div>
                      <Select
                        value={form.contract_fiscal_code || "__none__"}
                        onValueChange={(value) => patchForm({ contract_fiscal_code: value === "__none__" ? "" : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o perfil fiscal" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Não informado</SelectItem>
                          {VALLE_CONTRACT_FISCAL_OPTIONS.map((option) => (
                            <SelectItem key={option.code} value={option.code}>
                              {option.code} - {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3 rounded-lg border border-border/70 p-4">
                      <div className="space-y-1">
                        <Label>2 - Gestão Contábil</Label>
                        <p className="text-xs text-muted-foreground">Escolha um item.</p>
                      </div>
                      <Select
                        value={form.contract_accounting_code || "__none__"}
                        onValueChange={(value) => patchForm({ contract_accounting_code: value === "__none__" ? "" : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o perfil contabil" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Não informado</SelectItem>
                          {VALLE_CONTRACT_ACCOUNTING_OPTIONS.map((option) => (
                            <SelectItem key={option.code} value={option.code}>
                              {option.code} - {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3 rounded-lg border border-border/70 p-4">
                      <div className="space-y-1">
                        <Label>3 - Gestão Trabalhista</Label>
                        <p className="text-xs text-muted-foreground">Escolha um item.</p>
                      </div>
                      <Select
                        value={form.contract_labor_code || "__none__"}
                        onValueChange={(value) => patchForm({ contract_labor_code: value === "__none__" ? "" : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o perfil trabalhista" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Não informado</SelectItem>
                          {VALLE_CONTRACT_LABOR_OPTIONS.map((option) => (
                            <SelectItem key={option.code} value={option.code}>
                              {option.code} - {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3 rounded-lg border border-border/70 p-4">
                      <div className="space-y-1">
                        <Label>5 - Endereço Fiscal/Comercial</Label>
                        <p className="text-xs text-muted-foreground">Opcional.</p>
                      </div>
                      <label className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-3">
                        <Checkbox
                          checked={form.contract_include_address}
                          onCheckedChange={(value) => patchForm({ contract_include_address: Boolean(value) })}
                        />
                        <span className="text-sm text-foreground">Incluir codigo 5 no contrato</span>
                      </label>
                    </div>
                  </div>
                </FieldBlock>

                <FieldBlock className="md:col-span-2">
                  <Label>4 - Gestão Financeira</Label>
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 p-4 md:grid-cols-2">
                    {VALLE_CONTRACT_FINANCIAL_OPTIONS.map((option) => {
                      const checked = form.contract_financial_codes.includes(option.code);
                      return (
                        <label
                          key={option.code}
                          className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleContractFinancialCode(option.code, Boolean(value))}
                          />
                          <span className="text-sm text-foreground">{option.code} - {option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O resumo copiável exibira automaticamente os códigos selecionados no card do cliente.
                  </p>
                </FieldBlock>
              </div>
            </FormSection>
          )}

          <FormSection
            title="Informações comerciais"
            description="Acompanhe contato realizado, próximo passo e observações comerciais."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FieldBlock>
                <Label>Próximo follow-up</Label>
                <Input
                  type="date"
                  value={form.next_follow_up}
                  onChange={(event) => patchForm({ next_follow_up: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Forma de contato</Label>
                <Select
                  value={form.contact_method || undefined}
                  onValueChange={(value) => patchForm({ contact_method: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_METHOD_OPTIONS.map((contactMethod) => (
                      <SelectItem key={contactMethod.value} value={contactMethod.value}>
                        {contactMethod.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <div className="flex items-center gap-3 rounded-lg border border-border/70 px-4 py-3">
                <Switch
                  checked={form.has_been_contacted}
                  onCheckedChange={(checked) => patchForm({ has_been_contacted: checked })}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Já houve contato?</p>
                  <p className="text-xs text-muted-foreground">
                    Marque quando o primeiro contato comercial já tiver acontecido.
                  </p>
                </div>
              </div>

              <FieldBlock className="md:col-span-2">
                <Label>Observações</Label>
                <Textarea
                  rows={4}
                  placeholder="Anote contexto comercial, objeções ou próximos passos."
                  value={form.notes}
                  onChange={(event) => patchForm({ notes: event.target.value })}
                />
              </FieldBlock>
            </div>
          </FormSection>

          <FormSection
            title="Diagnóstico contábil e serviços"
            description="Registre o contexto financeiro, tributário e os serviços desejados pelo lead."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FieldBlock>
                <Label>CNPJ</Label>
                <Input
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  value={form.cnpj}
                  onChange={(event) => patchForm({ cnpj: formatCnpj(event.target.value) })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Inscrição Estadual</Label>
                <Input
                  placeholder="Se vazio, o resumo usará ISENTO"
                  value={form.contract_state_registration}
                  onChange={(event) => patchForm({ contract_state_registration: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Regime tributário atual</Label>
                <Select value={form.tax_regime || undefined} onValueChange={(value) => patchForm({ tax_regime: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_REGIME_OPTIONS.map((taxRegime) => (
                      <SelectItem key={taxRegime} value={taxRegime}>
                        {taxRegime}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock>
                <Label>Faturamento médio mensal gerencial</Label>
                <Input
                  inputMode="decimal"
                  placeholder="Ex.: 150000"
                  value={form.monthly_revenue_managerial}
                  onChange={(event) => patchForm({ monthly_revenue_managerial: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Faturamento médio mensal fiscal</Label>
                <Input
                  inputMode="decimal"
                  placeholder="Ex.: 140000"
                  value={form.monthly_revenue_fiscal}
                  onChange={(event) => patchForm({ monthly_revenue_fiscal: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Quantidade média de NF por mês</Label>
                <Input
                  inputMode="numeric"
                  placeholder="Ex.: 85"
                  value={form.monthly_invoice_count}
                  onChange={(event) => patchForm({ monthly_invoice_count: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Funcionários CLT</Label>
                <Input
                  inputMode="numeric"
                  placeholder="Ex.: 10"
                  value={form.employee_count_clt}
                  onChange={(event) => patchForm({ employee_count_clt: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Profissionais PJ</Label>
                <Input
                  inputMode="numeric"
                  placeholder="Ex.: 4"
                  value={form.employee_count_pj}
                  onChange={(event) => patchForm({ employee_count_pj: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Valor bruto médio da folha</Label>
                <Input
                  inputMode="decimal"
                  placeholder="Ex.: 58000"
                  value={form.payroll_gross_value}
                  onChange={(event) => patchForm({ payroll_gross_value: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Quantidade de contas bancárias</Label>
                <Input
                  inputMode="numeric"
                  placeholder="Ex.: 3"
                  value={form.bank_account_count}
                  onChange={(event) => patchForm({ bank_account_count: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock>
                <Label>Contas separadas por projeto/centro de custo?</Label>
                <Select
                  value={form.bank_accounts_split || undefined}
                  onValueChange={(value) => patchForm({ bank_accounts_split: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sim">Sim</SelectItem>
                    <SelectItem value="Nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock>
                <Label>Sistema financeiro utilizado</Label>
                <Input
                  placeholder="Ex.: Omie, Conta Azul, ERP próprio"
                  value={form.financial_system}
                  onChange={(event) => patchForm({ financial_system: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock className="md:col-span-2">
                <Label>Tipo de serviço</Label>
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 p-4 md:grid-cols-2">
                  {serviceTypeOptions.map((serviceType) => {
                    const checked = form.service_types.includes(serviceType);
                    return (
                      <label
                        key={serviceType}
                        className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleServiceType(serviceType, Boolean(value))}
                        />
                        <span className="text-sm text-foreground">{serviceType}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Você pode selecionar mais de um serviço quando necessário.
                </p>
              </FieldBlock>

              <FieldBlock className="md:col-span-2">
                <Label>Detalhes sobre o serviço necessário</Label>
                <Textarea
                  rows={4}
                  placeholder="Descreva com mais detalhes qual serviço o lead procura, dúvidas principais ou necessidades específicas."
                  value={form.service_details}
                  onChange={(event) => patchForm({ service_details: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock className="md:col-span-2">
                <Label>Principais dores e motivação para trocar de contabilidade</Label>
                <Textarea
                  rows={4}
                  placeholder="Descreva os principais problemas atuais, insatisfações e motivações para mudança."
                  value={form.accounting_pain_points}
                  onChange={(event) => patchForm({ accounting_pain_points: event.target.value })}
                />
              </FieldBlock>

              <FieldBlock className="md:col-span-2">
                <Label>Anexos</Label>
                <Input
                  type="file"
                  multiple
                  accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                  onChange={(event) => {
                    addPendingAttachments(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Se você selecionar um arquivo, ele será anexado ao lead assim que o cadastro for salvo.
                </p>
              </FieldBlock>

              {pendingAttachments.length > 0 ? (
                <FieldBlock className="md:col-span-2">
                  <div className="space-y-2 rounded-lg border border-border/70 bg-background/60 p-3">
                    {pendingAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{attachment.file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(attachment.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePendingAttachment(attachment.id)}
                          aria-label={`Remover anexo ${attachment.file.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </FieldBlock>
              ) : null}
            </div>
          </FormSection>

          <DialogFooter className="gap-2 sm:gap-2">
            {canManuallyArchiveCurrentLead && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleManualArchive()}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isTrackingContext ? "Arquivar cliente" : "Arquivar manualmente"}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="accent" disabled={loading} className="font-semibold">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Salvar alterações" : `Criar ${entityLabel}`}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={lossReasonDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!loading) {
            setLossReasonDialogOpen(nextOpen);
            if (!nextOpen) setLossReason("");
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Marcar como perdido</DialogTitle>
            <DialogDescription>
              {entityLabelCapitalized} será movido para perdido. Escolha se deseja arquivar agora ou manter no funil para arquivar manualmente depois.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Informe o motivo da perda.
            </p>
            <Textarea
              rows={4}
              placeholder="Ex.: preço alto, sem retorno, fechou com outro fornecedor..."
              value={lossReason}
              onChange={(event) => setLossReason(event.target.value)}
              disabled={loading}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setLossReasonDialogOpen(false);
                setLossReason("");
              }}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void saveLead({ lostReasonText: lossReason })}
              disabled={loading || !lossReason.trim()}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Manter no funil
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={() => void saveLead({ lostReasonText: lossReason, archiveAfterSave: true })}
              disabled={loading || !lossReason.trim()}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Arquivar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={wonArchiveDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!loading) {
            setWonArchiveDialogOpen(nextOpen);
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
              <Button type="button" variant="ghost" onClick={() => setWonArchiveDialogOpen(false)} disabled={loading}>
                Cancelar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => void saveLead()} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {wonDialogKeepLabel}
            </Button>
            {showWonArchiveAction && (
              <Button type="button" variant="accent" className="h-auto whitespace-normal text-left" onClick={() => void saveLead({ archiveAfterSave: true })} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Arquivar agora
              </Button>
            )}
            {lead && onWonLeadTransfer && (getWonLeadTransferActions?.(lead) ?? []).map((action) => (
              <Button key={action.flow} type="button" variant="accent" className="h-auto whitespace-normal text-left" onClick={() => void handleWonTransfer(action.flow)} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {action.label}
              </Button>
            ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const FormSection = ({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="space-y-4 rounded-xl border border-border/70 bg-card/70 p-4 md:p-5">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const FieldBlock = ({
  children,
  error,
  className,
}: {
  children: React.ReactNode;
  error?: string;
  className?: string;
}) => (
  <div className={cn("space-y-2", className)}>
    {children}
    {error && <p className="text-xs font-medium text-destructive">{error}</p>}
  </div>
);



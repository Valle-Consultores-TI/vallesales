import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useAssignableProfiles, useCreateLead, useProfiles, useStages, useUpdateLead } from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";
import { Lead } from "@/types/crm";
import { CONTACT_METHOD_OPTIONS, SOURCE_OPTIONS, TEMPERATURE_OPTIONS, UF_OPTIONS } from "@/lib/constants";
import {
  formatPhone,
  isValidLeadPhone,
  LeadAdditionalContact,
  parseAdditionalContacts,
  SEGMENT_OPTIONS,
  serializeAdditionalContacts,
  SERVICE_TYPE_OPTIONS,
  TAX_REGIME_OPTIONS,
} from "@/lib/lead-form";
import { Loader2, Plus, Trash2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead?: Lead | null;
  defaultStageId?: string;
}

type FormState = {
  company_or_person: string;
  contact_name: string;
  phone: string;
  email: string;
  source: string;
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
  additional_contacts: LeadAdditionalContact[];
  tax_regime: string;
  service_types: string[];
  service_details: string;
};

type FormErrors = Partial<Record<"company_or_person" | "contact_name" | "phone" | "stage_id", string>>;

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

const buildInitialForm = (lead: Lead | null | undefined, defaultStageId: string | undefined, firstStageId?: string): FormState => {
  const segmentState = normalizeSegmentState(lead);

  return {
    company_or_person: lead?.company_or_person ?? "",
    contact_name: lead?.contact_name ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    source: lead?.source ?? "",
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
    additional_contacts: parseAdditionalContacts(lead?.additional_contacts),
    tax_regime: lead?.tax_regime ?? "",
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

export const LeadFormDialog = ({ open, onOpenChange, lead, defaultStageId }: Props) => {
  const { data: stages = [] } = useStages();
  const { data: profiles = [] } = useProfiles();
  const { data: assignableProfiles = [] } = useAssignableProfiles();
  const { user } = useAuth();
  const create = useCreateLead();
  const update = useUpdateLead();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(() => buildInitialForm(lead, defaultStageId));
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(lead, defaultStageId, stages[0]?.id));
    setErrors({});
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  }, [lead, open, defaultStageId, stages]);

  const loading = create.isPending || update.isPending;
  const isEdit = !!lead;
  const assignableIds = new Set(assignableProfiles.map((profile) => profile.id));
  const ownerOptions = profiles.filter((profile) => assignableIds.has(profile.id) || profile.id === form.owner_id);

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

  const updateAdditionalContact = (contactId: string, patch: Partial<LeadAdditionalContact>) => {
    patchForm({
      additional_contacts: form.additional_contacts.map((contact) =>
        contact.id === contactId ? { ...contact, ...patch } : contact,
      ),
    });
  };

  const validateForm = () => {
    const nextErrors: FormErrors = {};

    if (!form.company_or_person.trim()) {
      nextErrors.company_or_person = "Informe a empresa ou pessoa.";
    }
    if (!form.stage_id) {
      nextErrors.stage_id = "Selecione a etapa do funil.";
    }
    if (!form.contact_name.trim()) {
      nextErrors.contact_name = "Informe o nome do contato principal.";
    }
    if (!isValidLeadPhone(form.phone)) {
      nextErrors.phone = "Informe um telefone valido para o contato principal.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    const payload = {
      company_or_person: form.company_or_person.trim(),
      contact_name: form.contact_name.trim(),
      phone: formatPhone(form.phone),
      email: form.email.trim() || null,
      source: form.source || null,
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
      notes: form.notes.trim() || null,
      additional_contacts: serializeAdditionalContacts(form.additional_contacts),
      tax_regime: form.tax_regime || null,
      service_types: form.service_types,
      service_details: form.service_details.trim() || null,
    };

    if (lead) {
      await update.mutateAsync({ id: lead.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar lead" : "Novo lead"}</DialogTitle>
          <DialogDescription>
            Preencha os dados do lead, organize os contatos e registre as informacoes comerciais em um unico formulario.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <FormSection
            title="Dados do lead / empresa"
            description="Informacoes principais da empresa, etapa atual e origem do lead."
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

              <FieldBlock error={errors.stage_id}>
                <Label>Etapa do funil *</Label>
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
                  <Label>Responsavel</Label>
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
                    <SelectItem value="__none__">Sem responsavel</SelectItem>
                    {ownerOptions.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email}
                        {profile.id === user?.id ? " (eu)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

              <FieldBlock>
                <Label>Origem do lead</Label>
                <Select value={form.source || undefined} onValueChange={(value) => patchForm({ source: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((source) => (
                      <SelectItem key={source} value={source}>
                        {source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldBlock>

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
            description="Esse contato principal sera usado como referencia principal do lead."
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

          <FormSection
            title="Informacoes comerciais"
            description="Acompanhe contato realizado, proximo passo e observacoes comerciais."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FieldBlock>
                <Label>Proximo follow-up</Label>
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
                  <p className="text-sm font-medium text-foreground">Ja houve contato?</p>
                  <p className="text-xs text-muted-foreground">
                    Marque quando o primeiro contato comercial ja tiver acontecido.
                  </p>
                </div>
              </div>

              <FieldBlock className="md:col-span-2">
                <Label>Observacoes</Label>
                <Textarea
                  rows={4}
                  placeholder="Anote contexto comercial, objeções ou proximos passos."
                  value={form.notes}
                  onChange={(event) => patchForm({ notes: event.target.value })}
                />
              </FieldBlock>
            </div>
          </FormSection>

          <FormSection
            title="Servico necessario"
            description="Registre o regime tributario, os servicos desejados e os detalhes da necessidade."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FieldBlock>
                <Label>Regime tributario</Label>
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

              <FieldBlock className="md:col-span-2">
                <Label>Tipo de servico</Label>
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 p-4 md:grid-cols-2">
                  {SERVICE_TYPE_OPTIONS.map((serviceType) => {
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
                  Voce pode selecionar mais de um servico quando necessario.
                </p>
              </FieldBlock>

              <FieldBlock className="md:col-span-2">
                <Label>Detalhes sobre o servico necessario</Label>
                <Textarea
                  rows={4}
                  placeholder="Descreva com mais detalhes qual servico o lead procura, duvidas principais ou necessidades especificas."
                  value={form.service_details}
                  onChange={(event) => patchForm({ service_details: event.target.value })}
                />
              </FieldBlock>
            </div>
          </FormSection>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="accent" disabled={loading} className="font-semibold">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Salvar alteracoes" : "Criar lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

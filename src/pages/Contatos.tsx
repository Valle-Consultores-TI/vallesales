import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeads, useStages } from "@/hooks/useLeads";
import { useActiveFunnel } from "@/hooks/useActiveFunnel";
import { digitsOnly, formatPhone, parseAdditionalContacts } from "@/lib/lead-form";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/crm";
import { Building2, Check, ChevronDown, Loader2, Mail, Phone, Search, Users, X } from "lucide-react";

type ContactSituation = "open" | "lost" | "won";
type SituationFilter = "all" | ContactSituation;
type ContactKind = "primary" | "additional";
type ContactDisplayKind = ContactKind | "mixed";

type ContactSourceRow = {
  id: string;
  leadId: string;
  funnelId: string;
  funnelName: string;
  contactName: string;
  company: string;
  phone: string | null;
  email: string | null;
  situation: ContactSituation;
  contactKind: ContactKind;
  createdAt: string;
  updatedAt: string;
  sourceOrder: number;
};

type ContactRow = {
  id: string;
  leadIds: string[];
  funnelIds: string[];
  funnelNames: string[];
  contactName: string;
  otherContactNames: string[];
  company: string;
  phone: string | null;
  email: string | null;
  situation: ContactSituation;
  contactKind: ContactDisplayKind;
  updatedAt: string;
  linkedLeadCount: number;
  linkedFunnelCount: number;
  linkedCompanies: string[];
  otherCompanies: string[];
  linkedEmails: string[];
};

const situationLabels: Record<ContactSituation, string> = {
  open: "Em aberto",
  lost: "Perdido",
  won: "Cliente",
};

const situationStyles: Record<ContactSituation, string> = {
  open: "bg-accent/10 text-accent border-accent/25",
  lost: "bg-destructive/10 text-destructive border-destructive/25",
  won: "bg-success/10 text-success border-success/25",
};

const contactKindLabels: Record<ContactDisplayKind, string> = {
  primary: "Principal",
  additional: "Adicional",
  mixed: "Principal + adicional",
};

const contactKindStyles: Record<ContactDisplayKind, string> = {
  primary: "bg-secondary text-secondary-foreground border-border/70",
  additional: "bg-muted/60 text-muted-foreground border-border/70",
  mixed: "bg-accent/10 text-accent border-accent/25",
};

const normalizeText = (value?: string | null) => (value ?? "").trim().toLowerCase();
const normalizePhone = (value?: string | null) => digitsOnly(value ?? "");
const ALL_FUNNELS_VALUE = "__all_funnels__";
const situationPriority: Record<ContactSituation, number> = { won: 3, open: 2, lost: 1 };
const contactKindPriority: Record<ContactKind, number> = { primary: 2, additional: 1 };

const pickPreferred = (...values: Array<string | null | undefined>) =>
  values.find((value) => typeof value === "string" && value.trim()) ?? null;

const compareDatesDesc = (left?: string | null, right?: string | null) =>
  new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();

const compareDatesAsc = (left?: string | null, right?: string | null) =>
  new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();

const uniqueValues = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));

const hasMeaningfulText = (value?: string | null) => Boolean(value?.trim());

const countFilledFields = (row: ContactSourceRow) =>
  [row.contactName, row.company, row.phone, row.email].filter(hasMeaningfulText).length;

const compareSourceRows = (left: ContactSourceRow, right: ContactSourceRow) => {
  const kindDiff = contactKindPriority[right.contactKind] - contactKindPriority[left.contactKind];
  if (kindDiff !== 0) return kindDiff;

  const completenessDiff = countFilledFields(right) - countFilledFields(left);
  if (completenessDiff !== 0) return completenessDiff;

  return compareDatesDesc(left.updatedAt, right.updatedAt);
};

const pickPreferredField = (
  rows: ContactSourceRow[],
  selector: (row: ContactSourceRow) => string | null | undefined,
) =>
  [...rows]
    .sort((left, right) => {
      const leftHasValue = hasMeaningfulText(selector(left));
      const rightHasValue = hasMeaningfulText(selector(right));
      if (leftHasValue !== rightHasValue) return Number(rightHasValue) - Number(leftHasValue);
      return compareSourceRows(left, right);
    })
    .map(selector)
    .find((value) => hasMeaningfulText(value))
    ?.trim() ?? null;

const getFirstRegisteredRow = (rows: ContactSourceRow[]) =>
  [...rows].sort((left, right) => {
    const createdAtDiff = compareDatesAsc(left.createdAt, right.createdAt);
    if (createdAtDiff !== 0) return createdAtDiff;

    const sourceOrderDiff = left.sourceOrder - right.sourceOrder;
    if (sourceOrderDiff !== 0) return sourceOrderDiff;

    return compareDatesAsc(left.updatedAt, right.updatedAt);
  })[0] ?? null;

const classifySituation = (lead: Lead, wonStageId?: string, lostStageId?: string): ContactSituation => {
  if (lead.stage_id === wonStageId) return "won";
  if (lead.stage_id === lostStageId) return "lost";
  return "open";
};

const getContactIdentity = ({
  name,
  phone,
  email,
}: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}) => {
  const phoneKey = normalizePhone(phone);
  if (phoneKey) return `phone:${phoneKey}`;

  const emailKey = normalizeText(email);
  if (emailKey) return `email:${emailKey}`;

  const nameKey = normalizeText(name);
  if (nameKey) return `name:${nameKey}`;

  return null;
};

const buildRowsForLead = (
  lead: Lead,
  funnelName: string,
  wonStageId?: string,
  lostStageId?: string,
): ContactSourceRow[] => {
  const situation = classifySituation(lead, wonStageId, lostStageId);
  const rows: ContactSourceRow[] = [];
  const seen = new Set<string>();

  const registerSeen = (identity: string | null, fallbackId: string) => {
    seen.add(identity ?? fallbackId);
  };

  const hasSeen = (identity: string | null, fallbackId: string) => seen.has(identity ?? fallbackId);

  const primaryIdentity = getContactIdentity({
    name: lead.contact_name,
    phone: lead.phone,
    email: lead.email,
  });
  const primaryFallback = `primary:${lead.id}`;

  rows.push({
    id: `${lead.id}:primary`,
    leadId: lead.id,
    funnelId: lead.funnel_id,
    funnelName,
    contactName: pickPreferred(lead.contact_name, lead.company_or_person) ?? "",
    company: pickPreferred(lead.company_or_person) ?? "",
    phone: lead.phone,
    email: lead.email,
    situation,
    contactKind: "primary",
    createdAt: lead.created_at,
    updatedAt: lead.updated_at ?? lead.created_at,
    sourceOrder: 0,
  });
  registerSeen(primaryIdentity, primaryFallback);

  parseAdditionalContacts(lead.additional_contacts).forEach((contact, index) => {
    const identity = getContactIdentity({
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
    });
    const fallbackId = `additional:${lead.id}:${index}`;
    const hasAnyData = Boolean(contact.name.trim() || contact.phone.trim() || contact.email.trim());
    if (!hasAnyData || hasSeen(identity, fallbackId)) return;

    rows.push({
      id: `${lead.id}:additional:${contact.id || index}`,
      leadId: lead.id,
      funnelId: lead.funnel_id,
      funnelName,
      contactName: pickPreferred(contact.name, lead.company_or_person) ?? "",
      company: pickPreferred(lead.company_or_person) ?? "",
      phone: contact.phone || null,
      email: contact.email || null,
      situation,
      contactKind: "additional",
      createdAt: lead.created_at,
      updatedAt: lead.updated_at ?? lead.created_at,
      sourceOrder: index + 1,
    });
    registerSeen(identity, fallbackId);
  });

  return rows;
};

const consolidateContactRows = (rows: ContactSourceRow[]): ContactRow[] => {
  const groupedRows = new Map<string, ContactSourceRow[]>();

  rows.forEach((row) => {
    const identity = getContactIdentity({
      name: row.contactName,
      phone: row.phone,
      email: row.email,
    }) ?? row.id;

    const current = groupedRows.get(identity) ?? [];
    current.push(row);
    groupedRows.set(identity, current);
  });

  return Array.from(groupedRows.entries())
    .map(([identity, group]) => {
      const firstRegisteredRow = getFirstRegisteredRow(group);
      const leadIds = Array.from(new Set(group.map((row) => row.leadId)));
      const funnelIds = Array.from(new Set(group.map((row) => row.funnelId)));
      const funnelNames = uniqueValues(group.map((row) => row.funnelName));
      const linkedContactNames = uniqueValues(group.map((row) => row.contactName));
      const linkedCompanies = uniqueValues(group.map((row) => row.company));
      const linkedEmails = uniqueValues(group.map((row) => row.email));
      const bestPhone =
        pickPreferredField(group, (row) => row.phone) ??
        (identity.startsWith("phone:") ? identity.slice("phone:".length) : null);
      const formattedPhone = bestPhone ? formatPhone(bestPhone) : null;
      const preferredSituation = group.reduce((best, row) =>
        situationPriority[row.situation] > situationPriority[best] ? row.situation : best,
      group[0]?.situation ?? "lost");
      const hasPrimary = group.some((row) => row.contactKind === "primary");
      const hasAdditional = group.some((row) => row.contactKind === "additional");
      const contactKind: ContactDisplayKind =
        hasPrimary && hasAdditional ? "mixed" : hasPrimary ? "primary" : "additional";
      const updatedAt = [...group]
        .sort((left, right) => compareDatesDesc(left.updatedAt, right.updatedAt))[0]?.updatedAt ?? "";
      const contactName = firstRegisteredRow?.contactName?.trim() || "Sem nome";
      const otherContactNames = linkedContactNames.filter((item) => normalizeText(item) !== normalizeText(contactName));
      const company = firstRegisteredRow?.company?.trim() || "Sem empresa";
      const otherCompanies = linkedCompanies.filter((item) => normalizeText(item) !== normalizeText(company));

      return {
        id: identity,
        leadIds,
        funnelIds,
        funnelNames,
        contactName,
        otherContactNames,
        company,
        phone: formattedPhone,
        email: pickPreferredField(group, (row) => row.email),
        situation: preferredSituation,
        contactKind,
        updatedAt,
        linkedLeadCount: leadIds.length,
        linkedFunnelCount: funnelIds.length,
        linkedCompanies,
        otherCompanies,
        linkedEmails,
      };
    })
    .sort((left, right) => compareDatesDesc(left.updatedAt, right.updatedAt));
};

const Contacts = () => {
  const { activeFunnelId, funnels, loading: funnelLoading } = useActiveFunnel();
  const [search, setSearch] = useState("");
  const [situationFilter, setSituationFilter] = useState<SituationFilter>("all");
  const [selectedFunnelIds, setSelectedFunnelIds] = useState<string[]>([]);
  const [funnelFilterOpen, setFunnelFilterOpen] = useState(false);
  const accessibleFunnelIds = useMemo(() => funnels.map((funnel) => funnel.id), [funnels]);
  const hasAvailableFunnels = accessibleFunnelIds.length > 0;
  const leads = useLeads(null, hasAvailableFunnels);
  const stages = useStages(undefined, hasAvailableFunnels);

  useEffect(() => {
    if (accessibleFunnelIds.length === 0) {
      setSelectedFunnelIds([]);
      return;
    }

    setSelectedFunnelIds((current) => {
      const validCurrent = current.filter((id) => accessibleFunnelIds.includes(id));
      if (validCurrent.length > 0) return validCurrent;
      if (activeFunnelId && accessibleFunnelIds.includes(activeFunnelId)) return [activeFunnelId];
      return [...accessibleFunnelIds];
    });
  }, [accessibleFunnelIds, activeFunnelId]);

  const allFunnelsSelected = hasAvailableFunnels && selectedFunnelIds.length === accessibleFunnelIds.length;
  const selectedFunnels = useMemo(
    () => funnels.filter((funnel) => selectedFunnelIds.includes(funnel.id)),
    [funnels, selectedFunnelIds],
  );

  const toggleFunnel = (funnelId: string) => {
    setSelectedFunnelIds((current) => {
      if (current.includes(funnelId)) {
        const next = current.filter((id) => id !== funnelId);
        return next.length === 0 ? current : next;
      }

      return [...current, funnelId];
    });
  };

  const handleFunnelSelection = (value: string) => {
    if (value === ALL_FUNNELS_VALUE) {
      setSelectedFunnelIds([...accessibleFunnelIds]);
      return;
    }

    toggleFunnel(value);
  };

  const funnelFilterLabel = useMemo(() => {
    if (!hasAvailableFunnels) return "Nenhum funil";
    if (allFunnelsSelected) return "Todos os funis";
    if (selectedFunnels.length === 1) return selectedFunnels[0]?.name ?? "1 funil";
    return `${selectedFunnels.length} funis selecionados`;
  }, [allFunnelsSelected, hasAvailableFunnels, selectedFunnels]);

  const funnelDescription = useMemo(() => {
    if (!hasAvailableFunnels) {
      return "Lista consolidada dos contatos dos negocios.";
    }

    if (allFunnelsSelected) {
      return "Contatos de todos os funis aos quais voce tem acesso.";
    }

    if (selectedFunnels.length === 1) {
      return `Contatos vinculados ao negocio ${selectedFunnels[0]?.name}.`;
    }

    return `Contatos vinculados a ${selectedFunnels.length} funis selecionados.`;
  }, [allFunnelsSelected, hasAvailableFunnels, selectedFunnels]);

  const sourceRows = useMemo(() => {
    const funnelsById = new Map(funnels.map((funnel) => [funnel.id, funnel.name]));
    const stageStatusByFunnel = new Map<string, { wonStageId?: string; lostStageId?: string }>();

    (stages.data ?? []).forEach((stage) => {
      const current = stageStatusByFunnel.get(stage.funnel_id) ?? {};
      stageStatusByFunnel.set(stage.funnel_id, {
        wonStageId: stage.is_won ? stage.id : current.wonStageId,
        lostStageId: stage.is_lost ? stage.id : current.lostStageId,
      });
    });

    return (leads.data ?? [])
      .flatMap((lead) => {
        const stageStatus = stageStatusByFunnel.get(lead.funnel_id);
        return buildRowsForLead(
          lead,
          funnelsById.get(lead.funnel_id) ?? "Funil nao identificado",
          stageStatus?.wonStageId,
          stageStatus?.lostStageId,
        );
      })
      .sort((left, right) => compareDatesDesc(left.updatedAt, right.updatedAt));
  }, [funnels, leads.data, stages.data]);

  const scopedSourceRows = useMemo(() => {
    const allowedFunnels = new Set(selectedFunnelIds);

    return sourceRows.filter((row) => {
      if (allowedFunnels.size > 0 && !allowedFunnels.has(row.funnelId)) return false;
      return true;
    });
  }, [sourceRows, selectedFunnelIds]);

  const scopedRows = useMemo(
    () => consolidateContactRows(scopedSourceRows),
    [scopedSourceRows],
  );

  const filteredRows = useMemo(() => {
    const query = normalizeText(search);

    return scopedRows.filter((row) => {
      if (situationFilter !== "all" && row.situation !== situationFilter) return false;

      if (!query) return true;
      const haystack = [
        row.contactName,
        row.company,
        row.funnelNames.join(" "),
        row.phone,
        row.email,
        row.linkedCompanies.join(" "),
        row.linkedEmails.join(" "),
        situationLabels[row.situation],
        contactKindLabels[row.contactKind],
        row.linkedLeadCount > 1 ? `${row.linkedLeadCount} negocios` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [scopedRows, search, situationFilter]);

  const loading = funnelLoading || leads.isLoading || stages.isLoading;
  const error = (leads.error as Error | null) ?? (stages.error as Error | null);
  const hasActiveFilters = !!search.trim() || situationFilter !== "all" || !allFunnelsSelected;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader active="contatos" />

      <div className="border-b border-border bg-card px-4 py-5 md:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              Contatos
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {funnelDescription}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total" value={String(scopedRows.length)} icon={<Users className="h-4 w-4" />} />
            <StatCard
              label="Em aberto"
              value={String(scopedRows.filter((row) => row.situation === "open").length)}
              icon={<Building2 className="h-4 w-4" />}
            />
            <StatCard
              label="Clientes"
              value={String(scopedRows.filter((row) => row.situation === "won").length)}
              icon={<Mail className="h-4 w-4" />}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, empresa, telefone ou e-mail..."
              className="h-9 bg-background pl-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <Popover open={funnelFilterOpen} onOpenChange={setFunnelFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 justify-between bg-background font-normal md:w-64"
                disabled={!hasAvailableFunnels}
              >
                <span className="truncate text-left">{funnelFilterLabel}</span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleFunnelSelection(ALL_FUNNELS_VALUE)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60",
                    allFunnelsSelected && "bg-muted/60",
                  )}
                >
                  <Checkbox checked={allFunnelsSelected} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">Todos os funis</p>
                    <p className="text-xs text-muted-foreground">
                      {accessibleFunnelIds.length === 1
                        ? "Equivale ao unico funil disponivel."
                        : `Inclui os ${accessibleFunnelIds.length} funis disponiveis para voce.`}
                    </p>
                  </div>
                </button>

                <div className="my-2 h-px bg-border" />

                {funnels.map((funnel) => {
                  const checked = selectedFunnelIds.includes(funnel.id);

                  return (
                    <button
                      key={funnel.id}
                      type="button"
                      onClick={() => handleFunnelSelection(funnel.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60",
                        checked && "bg-muted/60",
                      )}
                    >
                      <Checkbox checked={checked} />
                      <span className="min-w-0 flex-1 truncate text-foreground">{funnel.name}</span>
                      {checked && <Check className="h-4 w-4 text-accent" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          <Select value={situationFilter} onValueChange={(value) => setSituationFilter(value as SituationFilter)}>
            <SelectTrigger className="h-9 bg-background md:w-52">
              <SelectValue placeholder="Situacao" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situacoes</SelectItem>
              <SelectItem value="open">Em aberto</SelectItem>
              <SelectItem value="lost">Perdido</SelectItem>
              <SelectItem value="won">Cliente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <div className="mt-3 text-xs text-muted-foreground">
            {filteredRows.length} contato(s) encontrado(s)
          </div>
        )}
      </div>

      <main className="flex-1 px-4 py-6 md:px-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : !hasAvailableFunnels ? (
          <Card className="mx-auto max-w-2xl p-8 text-center">
            <h3 className="text-lg font-semibold text-foreground">Nenhum funil disponivel</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Seu usuario nao possui acesso a um funil ativo no momento.
            </p>
          </Card>
        ) : error ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
            <X className="h-8 w-8 text-destructive" />
            <h3 className="text-lg font-semibold text-foreground">Nao foi possivel carregar os contatos</h3>
            <p className="text-sm text-muted-foreground">
              {error.message || "Erro ao carregar os dados do funil."}
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <Card className="mx-auto max-w-2xl p-8 text-center">
            <h3 className="text-lg font-semibold text-foreground">Nenhum contato encontrado</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Ajuste os filtros ou cadastre novos leads no funil para ver contatos aqui.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium text-muted-foreground">Nome</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Empresa</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Telefone</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">E-mail</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Situacao</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-muted/20 last:border-0">
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{row.contactName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.linkedLeadCount > 1
                              ? `${row.linkedLeadCount} negocios`
                              : "1 negocio"}
                            {row.linkedFunnelCount > 1
                              ? ` • ${row.linkedFunnelCount} funis`
                              : row.funnelNames[0]
                                ? ` • ${row.funnelNames[0]}`
                                : ""}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={contactKindStyles[row.contactKind]}>
                          {contactKindLabels[row.contactKind]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        <div className="min-w-0">
                          <p className="truncate">{row.company}</p>
                          {row.otherCompanies.length > 0 && (
                            <p className="truncate text-xs text-muted-foreground">
                              + {row.otherCompanies.join(", ")}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.phone ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" />
                            {row.phone}
                          </span>
                        ) : (
                          "Nao informado"
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.linkedEmails.length > 0 ? (
                          <div className="min-w-0">
                            {row.linkedEmails.map((email, index) => (
                              <div key={`${row.id}:email:${email}`} className="min-w-0">
                                <span className="inline-flex max-w-full items-center gap-1.5">
                                  {index === 0 ? <Mail className="h-3.5 w-3.5 shrink-0" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                                  <span className="truncate">{email}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          "Nao informado"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={situationStyles[row.situation]}>
                          {situationLabels[row.situation]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) => (
  <Card className="flex items-center gap-3 p-3">
    <div className="rounded-lg bg-accent/10 p-2 text-accent">{icon}</div>
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  </Card>
);

export default Contacts;

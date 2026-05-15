import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LeadDetailsSheet } from "@/components/crm/LeadDetailsSheet";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActiveFunnel } from "@/hooks/useActiveFunnel";
import { useLeads, useProfiles, useReopenLead, useRestoreLead, useStages } from "@/hooks/useLeads";
import { usePermissions } from "@/hooks/useUserRoles";
import { formatCurrency, formatDateTime } from "@/lib/constants";
import { parseDateValue } from "@/lib/date";
import { buildLeadSearchText } from "@/lib/lead-search";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/crm";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArchiveRestore,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronDown,
  FolderArchive,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import type { DateRange } from "react-day-picker";

type ArchivedSituation = "lost" | "won";
type ArchivedSituationFilter = "all" | ArchivedSituation;

const ALL_FUNNELS_VALUE = "__all_funnels__";

const situationLabels: Record<ArchivedSituation, string> = {
  lost: "Perdido",
  won: "Cliente",
};

const situationStyles: Record<ArchivedSituation, string> = {
  lost: "bg-destructive/10 text-destructive border-destructive/25",
  won: "bg-success/10 text-success border-success/25",
};

const normalizeText = (value?: string | null) => (value ?? "").trim().toLowerCase();

const normalizeRangeStart = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const normalizeRangeEnd = (value: Date) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const formatArchivedDateRangeLabel = (range?: DateRange) => {
  if (!range?.from && !range?.to) return "Selecionar periodo";
  if (range.from && !range.to) return format(range.from, "dd/MM/yyyy", { locale: ptBR });
  if (range.from && range.to) {
    return `${format(range.from, "dd/MM/yyyy", { locale: ptBR })} - ${format(range.to, "dd/MM/yyyy", { locale: ptBR })}`;
  }
  return "Selecionar periodo";
};

const ArchivedLeads = () => {
  const { activeFunnelId, funnels, loading: funnelLoading } = useActiveFunnel();
  const perms = usePermissions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ArchivedSituationFilter>("won");
  const [archivedDateRange, setArchivedDateRange] = useState<DateRange | undefined>();
  const [selectedFunnelIds, setSelectedFunnelIds] = useState<string[]>([]);
  const [funnelFilterOpen, setFunnelFilterOpen] = useState(false);
  const [periodFilterOpen, setPeriodFilterOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const accessibleFunnelIds = useMemo(() => funnels.map((funnel) => funnel.id), [funnels]);
  const hasAvailableFunnels = accessibleFunnelIds.length > 0;
  const leads = useLeads(null, hasAvailableFunnels, { archived: "archived" });
  const stages = useStages(undefined, hasAvailableFunnels);
  const profiles = useProfiles(hasAvailableFunnels);
  const restoreLead = useRestoreLead();
  const reopenLead = useReopenLead();

  useEffect(() => {
    if (accessibleFunnelIds.length === 0) {
      setSelectedFunnelIds([]);
      return;
    }

    if (activeFunnelId && accessibleFunnelIds.includes(activeFunnelId)) {
      setSelectedFunnelIds([activeFunnelId]);
      return;
    }

    setSelectedFunnelIds([accessibleFunnelIds[0]]);
  }, [accessibleFunnelIds, activeFunnelId]);

  const allFunnelsSelected = hasAvailableFunnels && selectedFunnelIds.length === accessibleFunnelIds.length;
  const selectedFunnels = useMemo(
    () => funnels.filter((funnel) => selectedFunnelIds.includes(funnel.id)),
    [funnels, selectedFunnelIds],
  );

  const stagesById = useMemo(
    () => new Map((stages.data ?? []).map((stage) => [stage.id, stage])),
    [stages.data],
  );

  const ownerNameById = useMemo(
    () => new Map((profiles.data ?? []).map((profile) => [profile.id, profile.full_name || profile.email || "Sem nome"])),
    [profiles.data],
  );

  const canEditLead = (lead: Lead) => {
    if (perms.canEditAnyLead) return true;
    if (!perms.canEditOwnLead) return false;
    return lead.owner_id === perms.profile?.id || lead.created_by === perms.profile?.id;
  };

  const archivedRows = useMemo(() => {
    return (leads.data ?? [])
      .map((lead) => {
        if (!lead.is_archived) return null;

        const stage = stagesById.get(lead.stage_id);
        if (!stage) return null;
        const commercialStatus: ArchivedSituation = stage.is_lost ? "lost" : "won";

        return {
          lead,
          commercialStatus,
          funnelName: funnels.find((funnel) => funnel.id === lead.funnel_id)?.name ?? "Funil não identificado",
          ownerName: lead.owner_id ? ownerNameById.get(lead.owner_id) ?? "Responsável não encontrado" : "Sem responsável",
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((left, right) => new Date(right.lead.archived_at ?? 0).getTime() - new Date(left.lead.archived_at ?? 0).getTime());
  }, [funnels, leads.data, ownerNameById, stagesById]);

  const scopedRows = useMemo(() => {
    const allowedFunnels = new Set(selectedFunnelIds);

    if (allowedFunnels.size === 0) return [];

    return archivedRows.filter((row) => {
      if (!allowedFunnels.has(row.lead.funnel_id)) return false;
      return true;
    });
  }, [archivedRows, selectedFunnelIds]);

  const filteredRows = useMemo(() => {
    const query = normalizeText(search);
    const periodStart = archivedDateRange?.from ? normalizeRangeStart(archivedDateRange.from) : null;
    const periodEnd = normalizeRangeEnd(archivedDateRange?.to ?? archivedDateRange?.from ?? new Date());

    return scopedRows.filter((row) => {
      if (statusFilter !== "all" && row.commercialStatus !== statusFilter) return false;

      if (periodStart) {
        const archivedAt = parseDateValue(row.lead.archived_at);
        if (!archivedAt || archivedAt < periodStart || archivedAt > periodEnd) {
          return false;
        }
      }

      if (!query) return true;

      const haystack = [
        buildLeadSearchText(row.lead),
        row.ownerName,
        row.funnelName,
        row.lead.loss_reason,
        situationLabels[row.commercialStatus],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [archivedDateRange, scopedRows, search, statusFilter]);

  const toggleFunnel = (funnelId: string) => {
    setSelectedFunnelIds((current) => {
      if (current.includes(funnelId)) {
        return current.filter((id) => id !== funnelId);
      }

      return [...current, funnelId];
    });
  };

  const handleFunnelSelection = (value: string) => {
    if (value === ALL_FUNNELS_VALUE) {
      setSelectedFunnelIds((current) =>
        current.length === accessibleFunnelIds.length ? [] : [...accessibleFunnelIds],
      );
      return;
    }

    toggleFunnel(value);
  };

  const funnelFilterLabel = useMemo(() => {
    if (!hasAvailableFunnels) return "Nenhum funil";
    if (selectedFunnelIds.length === 0) return "Nenhum funil selecionado";
    if (allFunnelsSelected) return "Todos os funis";
    if (selectedFunnels.length === 1) return selectedFunnels[0]?.name ?? "1 funil";
    return `${selectedFunnels.length} funis selecionados`;
  }, [allFunnelsSelected, hasAvailableFunnels, selectedFunnelIds.length, selectedFunnels]);

  const statusSummaryLabel = useMemo(() => {
    if (statusFilter === "lost") return "Mostrando apenas negócios perdidos.";
    if (statusFilter === "won") return "Mostrando apenas clientes fechados.";
    return "Mostrando todos os negócios arquivados.";
  }, [statusFilter]);

  const periodSummaryLabel = useMemo(() => {
    if (!archivedDateRange?.from) return "Periodo: todo o historico.";
    return `Periodo: ${formatArchivedDateRangeLabel(archivedDateRange)}.`;
  }, [archivedDateRange]);

  const hasActiveFilters = !!search.trim() || statusFilter !== "won" || !!archivedDateRange?.from || !allFunnelsSelected;
  const loading = funnelLoading || leads.isLoading || stages.isLoading || profiles.isLoading;
  const error =
    (leads.error as Error | null) ??
    (stages.error as Error | null) ??
    (profiles.error as Error | null);

  const handleOpenLead = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailsOpen(true);
  };

  const handleRestore = async (lead: Lead) => {
    await restoreLead.mutateAsync(lead);
    if (selectedLead?.id === lead.id) {
      setDetailsOpen(false);
      setSelectedLead(null);
    }
  };

  const handleReopen = async (lead: Lead) => {
    await reopenLead.mutateAsync({ id: lead.id });
    if (selectedLead?.id === lead.id) {
      setDetailsOpen(false);
      setSelectedLead(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader active="arquivados" />

      <div className="border-b border-border bg-gradient-to-b from-card via-card to-accent/5 px-4 py-6 md:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card className="border-border/70 bg-background/75 p-5 shadow-card backdrop-blur">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-accent/12 p-3 text-accent">
                  <FolderArchive className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Histórico comercial</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">Negócios arquivados</h2>
                  <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                    Espaço dedicado para negócios que já saíram da operação principal, sem misturar com os contatos nem poluir o funil.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {false && <FilterStatCard
                  label="Todos os arquivados"
                  helper="Visão completa do histórico"
                  value={String(scopedRows.length)}
                  icon={<FolderArchive className="h-4 w-4" />}
                  active={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                />}
                <FilterStatCard
                  label="Fechados (clientes)"
                  helper="Clique para ver só clientes"
                  value={String(scopedRows.filter((row) => row.commercialStatus === "won").length)}
                  icon={<Check className="h-4 w-4" />}
                  active={statusFilter === "won"}
                  onClick={() => setStatusFilter("won")}
                />
                <FilterStatCard
                  label="Negócios perdidos"
                  helper="Clique para ver só perdidos"
                  value={String(scopedRows.filter((row) => row.commercialStatus === "lost").length)}
                  icon={<X className="h-4 w-4" />}
                  active={statusFilter === "lost"}
                  onClick={() => setStatusFilter("lost")}
                />
              </div>
            </div>
          </Card>

          <Card className="border-border/70 bg-background/85 p-5 shadow-card">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Refinar consulta</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Busque por empresa, contato, responsável, funil ou motivo da perda.
                </p>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar nos arquivados..."
                  className="h-10 bg-background pl-8"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Limpar busca"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Popover open={funnelFilterOpen} onOpenChange={setFunnelFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-between bg-background font-normal"
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
                        : `Inclui os ${accessibleFunnelIds.length} funis disponíveis para você.`}
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

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Periodo de arquivamento</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover open={periodFilterOpen} onOpenChange={setPeriodFilterOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 justify-between bg-background font-normal"
                      >
                        <span className="truncate text-left">{formatArchivedDateRangeLabel(archivedDateRange)}</span>
                        <CalendarClock className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        numberOfMonths={2}
                        locale={ptBR}
                        selected={archivedDateRange}
                        onSelect={(range) => {
                          setArchivedDateRange(range);
                          if (range?.from && range?.to) {
                            setPeriodFilterOpen(false);
                          }
                        }}
                        defaultMonth={archivedDateRange?.from}
                      />
                    </PopoverContent>
                  </Popover>

                  {archivedDateRange?.from && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setArchivedDateRange(undefined)}
                    >
                      Limpar
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="sr-only">{statusSummaryLabel}</span>
                  {periodSummaryLabel}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {hasActiveFilters && (
          <div className="mt-4 text-xs text-muted-foreground">
            {filteredRows.length} negócio(s) encontrado(s)
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
              Seu usuário não possui acesso a um funil ativo no momento.
            </p>
          </Card>
        ) : error ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
            <X className="h-8 w-8 text-destructive" />
            <h3 className="text-lg font-semibold text-foreground">Não foi possível carregar os arquivados</h3>
            <p className="text-sm text-muted-foreground">
              {error.message || "Erro ao carregar os dados do funil."}
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <Card className="mx-auto max-w-2xl p-8 text-center">
            <h3 className="text-lg font-semibold text-foreground">Nenhum negócio arquivado encontrado</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Ajuste os filtros ou aguarde novos arquivamentos para visualizar histórico aqui.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredRows.map((row) => {
              const isMutating = restoreLead.isPending || reopenLead.isPending;

              return (
                <Card
                  key={row.lead.id}
                  className="group cursor-pointer border-border/70 bg-card/90 p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lg"
                  onClick={() => handleOpenLead(row.lead)}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={situationStyles[row.commercialStatus]}>
                            {row.commercialStatus === "won" ? "Fechado (cliente)" : "Perdido"}
                          </Badge>
                          <Badge variant="outline" className="border-border/70 bg-muted/30 text-muted-foreground">
                            {row.funnelName}
                          </Badge>
                        </div>
                        <h3 className="mt-2 truncate text-base font-semibold text-foreground">
                          {row.lead.company_or_person}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {row.lead.contact_name || "Sem contato principal"} {row.lead.phone ? `• ${row.lead.phone}` : ""}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-xl bg-accent/8 p-2 text-accent">
                        {row.commercialStatus === "won" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <InfoPill
                        icon={<CalendarClock className="h-3.5 w-3.5" />}
                        label="Arquivado em"
                        value={formatDateTime(row.lead.archived_at)}
                      />
                      <InfoPill
                        icon={<BriefcaseBusiness className="h-3.5 w-3.5" />}
                        label={row.commercialStatus === "won" ? "Marcado como cliente" : "Marcado como perdido"}
                        value={formatDateTime(row.commercialStatus === "lost" ? row.lead.lost_at : row.lead.won_at)}
                      />
                      <InfoPill label="Responsável" value={row.ownerName} />
                      <InfoPill
                        label="Valor"
                        value={Number(row.lead.estimated_value) > 0 ? formatCurrency(row.lead.estimated_value) : "-"}
                      />
                    </div>

                    {row.lead.loss_reason && (
                      <div className="rounded-xl border border-destructive/15 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Motivo da perda:</span> {row.lead.loss_reason}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenLead(row.lead);
                        }}
                      >
                        Ver detalhes
                      </Button>
                      {canEditLead(row.lead) && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isMutating}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRestore(row.lead);
                            }}
                          >
                            <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
                            Restaurar ao funil
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="accent"
                            disabled={isMutating}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleReopen(row.lead);
                            }}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            Reabrir negócio
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
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
        restoreLead={selectedLead ? async () => {
          await handleRestore(selectedLead);
        } : undefined}
        reopenLead={selectedLead ? async () => {
          await handleReopen(selectedLead);
        } : undefined}
      />
    </div>
  );
};

const FilterStatCard = ({
  label,
  helper,
  value,
  icon,
  active,
  onClick,
}: {
  label: string;
  helper: string;
  value: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
      active
        ? "border-accent bg-accent/8 shadow-sm"
        : "border-border/70 bg-background hover:border-accent/35 hover:bg-accent/5",
    )}
  >
    <div className={cn("rounded-xl p-2.5", active ? "bg-accent text-accent-foreground" : "bg-accent/10 text-accent")}>
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold leading-none text-foreground">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
    </div>
  </button>
);

const InfoPill = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) => (
  <div className="rounded-xl border border-border/70 bg-muted/15 px-3 py-2">
    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
      {icon}
      {label}
    </p>
    <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
  </div>
);

export default ArchivedLeads;

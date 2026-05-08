import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useStages, useLeads, useProfiles } from "@/hooks/useLeads";
import { usePermissions } from "@/hooks/useUserRoles";
import { useActiveFunnel } from "@/hooks/useActiveFunnel";
import { useCreateFunnel, useRenameFunnel } from "@/hooks/useFunnels";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { AppHeader } from "@/components/AppHeader";
import { LeadFormDialog } from "@/components/crm/LeadFormDialog";
import { LeadDetailsSheet } from "@/components/crm/LeadDetailsSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus,
  Search,
  Loader2,
  Thermometer,
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  X,
  UserCheck,
  Zap,
  Building2,
  ChevronDown,
  Check,
  Lock,
  Pencil,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Lead } from "@/types/crm";
import { formatCurrency } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { needsActionToday } from "@/lib/priority";

type StatusFilter = "todos" | "atrasados" | "sem_contato" | "follow_hoje" | "acao_hoje";

const Index = () => {
  const { user } = useAuth();
  const {
    activeFunnel,
    activeFunnelId,
    funnelOptions,
    loading: funnelLoading,
    setActiveFunnelId,
  } = useActiveFunnel();
  const createFunnel = useCreateFunnel();
  const renameFunnel = useRenameFunnel();
  const stages = useStages(activeFunnelId, !!activeFunnelId);
  const leads = useLeads(activeFunnelId, !!activeFunnelId);
  const profiles = useProfiles();
  const perms = usePermissions();

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [onlyMine, setOnlyMine] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [defaultStage, setDefaultStage] = useState<string | undefined>();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [funnelDialogOpen, setFunnelDialogOpen] = useState(false);
  const [funnelMenuOpen, setFunnelMenuOpen] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState("");
  const [renameFunnelName, setRenameFunnelName] = useState("");
  const [editingFunnelId, setEditingFunnelId] = useState<string | null>(null);
  const funnelClickTimerRef = useRef<number | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isOverdue = useCallback((lead: Lead) => {
    if (!lead.next_follow_up) return false;
    const d = new Date(lead.next_follow_up);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  }, [today]);

  const isToday = useCallback((lead: Lead) => {
    if (!lead.next_follow_up) return false;
    const d = new Date(lead.next_follow_up);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }, [today]);

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (leads.data ?? []).filter((lead) => {
      if (onlyMine && lead.owner_id !== user?.id) return false;

      if (q) {
        const haystack = [lead.company_or_person, lead.contact_name, lead.email, lead.phone, lead.city]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (ownerFilter !== "all") {
        if (ownerFilter === "none" ? lead.owner_id : lead.owner_id !== ownerFilter) return false;
      }

      if (statusFilter === "atrasados" && !isOverdue(lead)) return false;
      if (statusFilter === "sem_contato" && lead.has_been_contacted) return false;
      if (statusFilter === "follow_hoje" && !isToday(lead)) return false;
      if (statusFilter === "acao_hoje" && !needsActionToday(lead, today)) return false;

      return true;
    });
  }, [isOverdue, isToday, leads.data, onlyMine, ownerFilter, search, statusFilter, today, user?.id]);

  const stats = useMemo(() => {
    const all = leads.data ?? [];
    const won = stages.data?.find((stage) => stage.is_won)?.id;
    const lost = stages.data?.find((stage) => stage.is_lost)?.id;
    const open = all.filter((lead) => lead.stage_id !== won && lead.stage_id !== lost);
    const pipelineValue = open.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
    const wonValue = all
      .filter((lead) => lead.stage_id === won)
      .reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
    const overdue = open.filter(isOverdue).length;
    const noContact = open.filter((lead) => !lead.has_been_contacted).length;
    const actionToday = open.filter((lead) => needsActionToday(lead, today)).length;
    return { count: open.length, pipelineValue, wonValue, overdue, noContact, actionToday };
  }, [isOverdue, leads.data, stages.data, today]);

  const sortedFunnels = useMemo(
    () => [...funnelOptions].sort((left, right) => Number(right.is_default) - Number(left.is_default) || left.name.localeCompare(right.name)),
    [funnelOptions],
  );
  const accessibleFunnels = useMemo(
    () => sortedFunnels.filter((funnel) => funnel.has_access),
    [sortedFunnels],
  );
  const blockedFunnels = useMemo(
    () => sortedFunnels.filter((funnel) => !funnel.has_access),
    [sortedFunnels],
  );

  const openNew = (stageId?: string) => {
    setEditLead(null);
    setDefaultStage(stageId);
    setFormOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setEditLead(lead);
    setFormOpen(true);
  };

  const openDetails = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailsOpen(true);
  };

  const canEditLead = useCallback((lead: Lead) => {
    if (perms.canEditAnyLead) return true;
    if (!perms.canEditOwnLead) return false;
    return lead.owner_id === user?.id || lead.created_by === user?.id;
  }, [perms.canEditAnyLead, perms.canEditOwnLead, user?.id]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (formOpen || detailsOpen) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        openNew();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detailsOpen, formOpen]);

  const loading = funnelLoading || stages.isLoading || leads.isLoading;
  const hasActiveFilters = ownerFilter !== "all" || statusFilter !== "todos" || !!search || onlyMine;
  const canRenameFunnels = perms.isAdmin || perms.isGestor;

  const clearFilters = () => {
    setSearch("");
    setOwnerFilter("all");
    setStatusFilter("todos");
    setOnlyMine(false);
  };

  const handleCreateFunnel = async () => {
    const created = await createFunnel.mutateAsync(newFunnelName);
    setActiveFunnelId(created.id);
    setNewFunnelName("");
    setFunnelDialogOpen(false);
  };

  const openInlineFunnelRename = (funnel: { id: string; name: string }) => {
    setEditingFunnelId(funnel.id);
    setRenameFunnelName(funnel.name);
    setFunnelMenuOpen(true);
  };

  const handleRenameFunnel = async () => {
    if (!editingFunnelId) return;
    await renameFunnel.mutateAsync({
      funnelId: editingFunnelId,
      name: renameFunnelName,
    });
    setEditingFunnelId(null);
    setFunnelMenuOpen(false);
  };

  const cancelInlineFunnelRename = () => {
    setRenameFunnelName("");
    setEditingFunnelId(null);
  };

  const handleFunnelItemClick = (funnelId: string) => {
    if (funnelClickTimerRef.current) {
      window.clearTimeout(funnelClickTimerRef.current);
    }

    funnelClickTimerRef.current = window.setTimeout(() => {
      setActiveFunnelId(funnelId);
      setFunnelMenuOpen(false);
      funnelClickTimerRef.current = null;
    }, 180);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <AppHeader active="funil" />

      <div className="px-4 py-5 border-b border-border bg-card md:px-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
              Funil comercial
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0">
                <h2 className="text-xl tracking-[-0.02em] text-black md:text-[1.9rem]">
                  <span className="font-semibold">Funil </span>
                  <span className="font-bold text-accent">
                    {funnelLoading ? "Carregando..." : activeFunnel?.name ?? "disponivel"}
                  </span>
                </h2>
              </div>

              <DropdownMenu open={funnelMenuOpen} onOpenChange={setFunnelMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "group h-9 w-fit rounded-full border-[#e8dccf] bg-[#fbf5ef] px-4 text-[#6c5843] shadow-none hover:border-[#ddc9b4] hover:bg-[#f7ede3] hover:text-[#5b4a38]",
                      "focus-visible:ring-accent/30",
                    )}
                    disabled={funnelLoading || funnelOptions.length === 0}
                    aria-label="Trocar funil"
                  >
                    Trocar funil
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[min(92vw,24rem)] p-2">
                <DropdownMenuLabel className="px-2 pb-1">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Funil selecionado
                    </span>
                    <span className="truncate text-sm font-semibold text-foreground">
                      {activeFunnel?.name ?? "Nenhum funil ativo"}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {accessibleFunnels.map((funnel) => (
                    editingFunnelId === funnel.id ? (
                      <div key={funnel.id} className="flex items-center gap-2 rounded-md px-2 py-2">
                        <Building2 className="h-4 w-4 shrink-0 text-accent" />
                        <Input
                          value={renameFunnelName}
                          onChange={(event) => setRenameFunnelName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleRenameFunnel();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelInlineFunnelRename();
                            }
                          }}
                          className="h-8 flex-1"
                          maxLength={120}
                          autoFocus
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="accent"
                          className="h-8 px-2"
                          onClick={() => void handleRenameFunnel()}
                          disabled={renameFunnel.isPending || !renameFunnelName.trim()}
                        >
                          {renameFunnel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          onClick={cancelInlineFunnelRename}
                          disabled={renameFunnel.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        key={funnel.id}
                        type="button"
                        onClick={() => handleFunnelItemClick(funnel.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                          activeFunnelId === funnel.id && "bg-muted/60",
                        )}
                      >
                        <Building2 className="h-4 w-4 shrink-0 text-accent" />
                        <span
                          className={cn(
                            "truncate",
                            canRenameFunnels && "cursor-text rounded-sm transition-colors hover:bg-accent/10",
                          )}
                        >
                          {funnel.name}
                        </span>
                        {canRenameFunnels && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (funnelClickTimerRef.current) {
                                window.clearTimeout(funnelClickTimerRef.current);
                                funnelClickTimerRef.current = null;
                              }
                              openInlineFunnelRename(funnel);
                            }}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-accent/10 hover:text-accent"
                            aria-label={`Editar nome do funil ${funnel.name}`}
                            title="Editar nome do funil"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {funnel.is_default && (
                          <Badge variant="secondary" className="ml-auto">
                            Principal
                          </Badge>
                        )}
                      </button>
                    )
                  ))}
                </DropdownMenuGroup>

                {blockedFunnels.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Sem permissao
                      </p>
                    </div>
                    <div className="space-y-1">
                      {blockedFunnels.map((funnel) => (
                        <Tooltip key={funnel.id}>
                          <TooltipTrigger asChild>
                            <div
                              aria-disabled="true"
                              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm opacity-55"
                            >
                              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">{funnel.name}</span>
                              {funnel.is_default && (
                                <Badge variant="secondary" className="ml-auto">
                                  Principal
                                </Badge>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            Voce nao tem acesso a esse funil.
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </>
                )}

                {perms.isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="gap-3 rounded-md py-2 font-medium text-accent focus:text-accent"
                      onSelect={(event) => {
                        event.preventDefault();
                        setFunnelDialogOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar novo funil
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="mt-0.5 text-sm text-muted-foreground">
              {activeFunnel ? `Acompanhe e gerencie os leads de ${activeFunnel.name}` : "Acompanhe e gerencie seus leads em tempo real"}
            </p>
          </div>

          {perms.canCreateLead && (
            <div className="flex shrink-0 md:pt-7">
              <Button
                onClick={() => openNew()}
                variant="accent"
                size="lg"
                className="w-full font-semibold shadow-card md:w-auto"
                title="Novo lead (atalho: N)"
              >
                <Plus className="mr-1 h-4 w-4" /> Novo lead
                <kbd className="ml-2 hidden rounded bg-black/15 px-1.5 py-0.5 font-mono text-[10px] md:inline-flex">N</kbd>
              </Button>
            </div>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Em aberto" value={String(stats.count)} tone="primary" />
          <StatCard icon={<DollarSign className="h-4 w-4" />} label="Pipeline" value={formatCurrency(stats.pipelineValue)} tone="accent" />
          <StatCard icon={<Thermometer className="h-4 w-4" />} label="Fechados" value={formatCurrency(stats.wonValue)} tone="success" />
          <StatCard
            icon={<Zap className="h-4 w-4" />}
            label="Acoes hoje"
            value={String(stats.actionToday)}
            tone={stats.actionToday > 0 ? "accent" : "muted"}
            clickable
            active={statusFilter === "acao_hoje"}
            onClick={() => setStatusFilter(statusFilter === "acao_hoje" ? "todos" : "acao_hoje")}
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Atrasados"
            value={String(stats.overdue)}
            tone={stats.overdue > 0 ? "danger" : "muted"}
            clickable
            active={statusFilter === "atrasados"}
            onClick={() => setStatusFilter(statusFilter === "atrasados" ? "todos" : "atrasados")}
          />
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, empresa, e-mail, telefone ou cidade..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 border-border bg-background pl-8 focus-visible:ring-accent/40"
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

          <button
            type="button"
            onClick={() => setOnlyMine((value) => !value)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-all",
              onlyMine
                ? "border-accent bg-accent text-accent-foreground shadow-sm"
                : "border-border bg-background text-foreground hover:border-accent/40 hover:text-accent",
            )}
            title="Mostrar somente leads em que sou responsavel"
          >
            <UserCheck className="h-4 w-4" />
            <span className="hidden md:inline">Meus leads</span>
            <Switch checked={onlyMine} className="pointer-events-none -mr-1 scale-75" />
          </button>

          <Select value={ownerFilter} onValueChange={setOwnerFilter} disabled={onlyMine}>
            <SelectTrigger className="h-9 bg-background md:w-56">
              <Users className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Responsavel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os responsaveis</SelectItem>
              <SelectItem value="none">Sem responsavel</SelectItem>
              {(profiles.data ?? []).map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="h-9 bg-background md:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="acao_hoje">Acoes hoje</SelectItem>
              <SelectItem value="atrasados">Follow-up atrasado</SelectItem>
              <SelectItem value="follow_hoje">Follow-up hoje</SelectItem>
              <SelectItem value="sem_contato">Sem contato</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground hover:text-foreground">
              <X className="mr-1 h-3.5 w-3.5" /> Limpar
            </Button>
          )}
        </div>

        {hasActiveFilters && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{filteredLeads.length} lead(s) encontrado(s)</span>
            {statusFilter === "atrasados" && (
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                Atrasados
              </Badge>
            )}
            {statusFilter === "sem_contato" && (
              <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                Sem contato
              </Badge>
            )}
            {statusFilter === "follow_hoje" && (
              <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">
                Follow-up hoje
              </Badge>
            )}
            {statusFilter === "acao_hoje" && (
              <Badge variant="outline" className="border-accent/30 bg-accent/10 text-accent">
                Acoes hoje
              </Badge>
            )}
          </div>
        )}
      </div>

      <main className="flex-1 overflow-hidden px-4 py-4 md:px-6">
        <div className="flex h-full flex-col gap-4">
          <div className="min-h-0 flex-1">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <p className="text-sm">Carregando dados...</p>
              </div>
            ) : !activeFunnelId ? (
              <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 text-center">
                <AlertTriangle className="h-10 w-10 text-warning" />
                <h3 className="text-lg font-semibold">Nenhum funil disponivel</h3>
                <p className="text-sm text-muted-foreground">
                  Seu usuario nao possui acesso a um funil ativo no momento.
                </p>
              </div>
            ) : (stages.isError || leads.isError) ? (
              <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 text-center">
                <AlertTriangle className="h-10 w-10 text-destructive" />
                <h3 className="text-lg font-semibold">Nao foi possivel carregar os dados</h3>
                <p className="text-sm text-muted-foreground">
                  {(stages.error as Error)?.message || (leads.error as Error)?.message || "Erro de conexao com o backend."}
                </p>
                <Button
                  variant="accent"
                  onClick={() => {
                    stages.refetch();
                    leads.refetch();
                    profiles.refetch();
                  }}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <KanbanBoard
                stages={stages.data ?? []}
                leads={filteredLeads}
                profiles={profiles.data ?? []}
                onSelectLead={openDetails}
                onAddInStage={(stageId) => openNew(stageId)}
                canAddLead={perms.canCreateLead}
                canMoveLead={canEditLead}
              />
            )}
          </div>
        </div>
      </main>

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editLead}
        defaultStageId={defaultStage}
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
      />

      <Dialog open={funnelDialogOpen} onOpenChange={setFunnelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar novo funil</DialogTitle>
            <DialogDescription>
              Adicione um novo negocio para separar leads, dashboard e contatos.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateFunnel();
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="new-funnel-name">
                Nome do negocio / funil
              </label>
              <Input
                id="new-funnel-name"
                value={newFunnelName}
                onChange={(event) => setNewFunnelName(event.target.value)}
                placeholder="Ex.: Valle Consultores"
                maxLength={120}
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFunnelDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="accent" disabled={createFunnel.isPending || !newFunnelName.trim()}>
                {createFunnel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Criar funil
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
};

const toneStyles: Record<string, string> = {
  primary: "bg-primary/8 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const StatCard = ({
  icon,
  label,
  value,
  tone = "primary",
  clickable,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "primary" | "accent" | "success" | "danger" | "muted";
  clickable?: boolean;
  active?: boolean;
  onClick?: () => void;
}) => (
  <Card
    onClick={clickable ? onClick : undefined}
    className={cn(
      "flex items-center gap-3 border-border/70 p-3.5 shadow-xs transition-all duration-200",
      clickable && "cursor-pointer hover:-translate-y-0.5 hover:border-border hover:shadow-card",
      active && "border-accent/40 ring-2 ring-accent/40",
    )}
  >
    <div className={`rounded-lg p-2.5 ${toneStyles[tone]}`}>{icon}</div>
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate text-base font-bold tabular-nums text-foreground md:text-lg">{value}</p>
    </div>
  </Card>
);

export default Index;

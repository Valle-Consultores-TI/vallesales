import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  DollarSign,
  Download,
  FileText,
  Flame,
  Loader2,
  Target,
  Trophy,
  UserX,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStages, useLeads } from "@/hooks/useLeads";
import { useActiveFunnel } from "@/hooks/useActiveFunnel";
import { formatCurrency } from "@/lib/constants";
import { parseDateValue } from "@/lib/date";
import { exportDashboardAsPdf } from "@/lib/lead-export";
import { getLeadPriority, needsActionToday, isOverdue, isToday } from "@/lib/priority";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const stageColorVar: Record<string, string> = {
  novo_lead: "hsl(var(--stage-novo))",
  primeiro_contato: "hsl(var(--stage-primeiro))",
  reuniao_marcada: "hsl(var(--stage-reuniao))",
  proposta_enviada: "hsl(var(--stage-proposta))",
  em_negociacao: "hsl(var(--stage-negociacao))",
  fechado: "hsl(var(--stage-fechado))",
  perdido: "hsl(var(--stage-perdido))",
};

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

const formatDashboardDateRangeLabel = (range?: DateRange) => {
  if (!range?.from && !range?.to) return "Todo o historico";
  if (range.from && !range.to) return format(range.from, "dd/MM/yyyy", { locale: ptBR });
  if (range.from && range.to) {
    return `${format(range.from, "dd/MM/yyyy", { locale: ptBR })} - ${format(range.to, "dd/MM/yyyy", { locale: ptBR })}`;
  }
  return "Todo o historico";
};

const filterLeadsByCreatedAt = <T extends { created_at: string }>(allLeads: T[], range?: DateRange) => {
  const periodStart = range?.from ? normalizeRangeStart(range.from) : null;
  const periodEnd = normalizeRangeEnd(range?.to ?? range?.from ?? new Date());

  if (!periodStart) return allLeads;

  return allLeads.filter((lead) => {
    const createdAt = parseDateValue(lead.created_at);
    return !!createdAt && createdAt >= periodStart && createdAt <= periodEnd;
  });
};

const Dashboard = () => {
  const { activeFunnel, activeFunnelId, loading: funnelLoading } = useActiveFunnel();
  const activeFunnelReady = !funnelLoading && !!activeFunnelId && !!activeFunnel;
  const stages = useStages(activeFunnelId, activeFunnelReady);
  const activeLeads = useLeads(activeFunnelId, activeFunnelReady);
  const commercialLeads = useLeads(activeFunnelId, activeFunnelReady, {
    archived: "all",
    entityKind: "lead",
  });
  const dashboardExportRef = useRef<HTMLDivElement | null>(null);
  const [analysisDateRange, setAnalysisDateRange] = useState<DateRange | undefined>();
  const [periodFilterOpen, setPeriodFilterOpen] = useState(false);

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const filteredActiveLeads = useMemo(
    () => filterLeadsByCreatedAt(activeLeads.data ?? [], analysisDateRange),
    [activeLeads.data, analysisDateRange],
  );

  const filteredCommercialLeads = useMemo(
    () => filterLeadsByCreatedAt(commercialLeads.data ?? [], analysisDateRange),
    [commercialLeads.data, analysisDateRange],
  );

  const periodSummaryLabel = useMemo(() => {
    if (!analysisDateRange?.from) return "Analise considerando todo o historico de cadastro.";
    return `Analise considerando os leads cadastrados em ${formatDashboardDateRangeLabel(analysisDateRange)}.`;
  }, [analysisDateRange]);

  const metrics = useMemo(() => {
    const allLeads = filteredCommercialLeads;
    const activeLeadList = filteredActiveLeads;
    const allStages = stages.data ?? [];
    const wonStage = allStages.find((stage) => stage.is_won);
    const lostStage = allStages.find((stage) => stage.is_lost);

    const wonLeads = allLeads.filter((lead) => lead.stage_id === wonStage?.id);
    const lostLeads = allLeads.filter((lead) => lead.stage_id === lostStage?.id);
    const openLeads = activeLeadList.filter(
      (lead) => lead.stage_id !== wonStage?.id && lead.stage_id !== lostStage?.id,
    );

    const pipelineValue = openLeads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
    const wonValue = wonLeads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);
    const totalValue = allLeads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0);

    const noContactCount = openLeads.filter((lead) => !lead.has_been_contacted).length;
    const overdueCount = openLeads.filter((lead) => isOverdue(lead, today)).length;
    const followTodayCount = openLeads.filter((lead) => isToday(lead, today)).length;
    const hotCount = openLeads.filter((lead) => lead.temperature === "quente").length;
    const actionTodayCount = openLeads.filter((lead) => needsActionToday(lead, today)).length;

    const priorityCounts = { alta: 0, media: 0, baixa: 0, normal: 0 };
    openLeads.forEach((lead) => {
      priorityCounts[getLeadPriority(lead, today)] += 1;
    });

    const conversionRate = allLeads.length > 0 ? (wonLeads.length / allLeads.length) * 100 : 0;

    const byStage = allStages.map((stage) => {
      const stageLeads = allLeads.filter((lead) => lead.stage_id === stage.id);
      return {
        id: stage.id,
        key: stage.key,
        name: stage.name,
        count: stageLeads.length,
        value: stageLeads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0),
        color: stageColorVar[stage.key] || "hsl(var(--muted-foreground))",
      };
    });

    return {
      total: allLeads.length,
      wonCount: wonLeads.length,
      lostCount: lostLeads.length,
      openCount: openLeads.length,
      pipelineValue,
      wonValue,
      totalValue,
      noContactCount,
      overdueCount,
      followTodayCount,
      hotCount,
      actionTodayCount,
      priorityCounts,
      conversionRate,
      byStage,
    };
  }, [filteredActiveLeads, filteredCommercialLeads, stages.data, today]);

  const loading = funnelLoading || stages.isLoading || activeLeads.isLoading || commercialLeads.isLoading;

  const handleExportDashboardPdf = async () => {
    if (!dashboardExportRef.current) {
      toast.error("Nao foi possivel localizar a area do dashboard para exportacao.");
      return;
    }

    try {
      await exportDashboardAsPdf({
        element: dashboardExportRef.current,
        funnelName: activeFunnel?.name ?? null,
        title: `Dashboard do funil ${activeFunnel?.name ?? ""}`.trim(),
        subtitle: `${analysisDateRange?.from ? `Periodo analisado: ${formatDashboardDateRangeLabel(analysisDateRange)} • ` : ""}Exportado em ${new Date().toLocaleString("pt-BR")}`,
        fileBaseName: `${activeFunnel?.name ?? "dashboard"}-dashboard`,
      });
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel exportar o dashboard em PDF.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader active="dashboard" />

      <div ref={dashboardExportRef}>
        <div className="border-b border-border bg-card px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                Dashboard Comercial
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Visao geral do pipeline e performance em tempo real
              </p>
              {activeFunnel && (
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Negocio ativo: {activeFunnel.name}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{periodSummaryLabel}</p>
            </div>

            <div className="flex w-full max-w-[360px] flex-col gap-3 lg:items-stretch">
              <Card
                className={cn(
                  "border-l-4 p-4 shadow-sm",
                  metrics.actionTodayCount > 0
                    ? "border-l-accent bg-accent/5"
                    : "border-l-success bg-success/5",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "shrink-0 rounded-xl p-2.5",
                      metrics.actionTodayCount > 0
                        ? "bg-accent text-accent-foreground"
                        : "bg-success/15 text-success",
                    )}
                  >
                    <Zap className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Leads que precisam de acao hoje
                    </p>
                    <div className="mt-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-3xl font-bold leading-none text-foreground tabular-nums">
                          {metrics.actionTodayCount}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {metrics.actionTodayCount > 0
                            ? `${metrics.overdueCount} atrasado(s) • ${metrics.followTodayCount} follow-up hoje • ${metrics.hotCount} quente(s)`
                            : "Tudo em dia no periodo selecionado."}
                        </p>
                      </div>
                      <Link to="/" className="shrink-0">
                        <Button variant="accent" size="sm" className="font-semibold">
                          Abrir funil
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Popover open={periodFilterOpen} onOpenChange={setPeriodFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between bg-white font-normal shadow-sm sm:w-[290px]"
                  >
                    <span className="truncate text-left">
                      Periodo: {formatDashboardDateRangeLabel(analysisDateRange)}
                    </span>
                    <CalendarClock className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    numberOfMonths={2}
                    locale={ptBR}
                    selected={analysisDateRange}
                    onSelect={(range) => {
                      setAnalysisDateRange(range);
                      if (range?.from && range?.to) {
                        setPeriodFilterOpen(false);
                      }
                    }}
                    defaultMonth={analysisDateRange?.from}
                  />
                </PopoverContent>
              </Popover>

              {analysisDateRange?.from && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 px-3"
                  onClick={() => setAnalysisDateRange(undefined)}
                >
                  Limpar
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-[#d8d4df] bg-white font-semibold shadow-sm sm:w-auto"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exportar
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2">
                  <DropdownMenuLabel className="px-2 pb-2 pt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Dashboard
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="rounded-xl px-3 py-2.5"
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleExportDashboardPdf();
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4 text-primary" />
                    <div className="flex flex-col">
                      <span className="font-medium">Dashboard em PDF</span>
                      <span className="text-xs text-muted-foreground">
                        Com identidade Valle ou CWK conforme o funil
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : !activeFunnelId ? (
          <main className="flex-1 px-4 py-6 md:px-6">
            <Card className="mx-auto max-w-2xl p-8 text-center">
              <h3 className="text-lg font-semibold text-foreground">Nenhum funil disponivel</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Seu usuario nao possui acesso a um funil ativo no momento.
              </p>
            </Card>
          </main>
        ) : (
          <main className="flex-1 space-y-6 px-4 py-6 md:px-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Indicadores principais
              </h3>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                <KpiCard
                  tone="primary"
                  icon={<Users className="h-4 w-4" />}
                  label="Total de leads"
                  value={String(metrics.total)}
                />
                <KpiCard
                  tone="accent"
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Valor do pipeline"
                  value={formatCurrency(metrics.pipelineValue)}
                  hint={`${metrics.openCount} em aberto`}
                />
                <KpiCard
                  tone="success"
                  icon={<Trophy className="h-4 w-4" />}
                  label="Ganhos"
                  value={String(metrics.wonCount)}
                  hint={formatCurrency(metrics.wonValue)}
                />
                <KpiCard
                  tone="muted"
                  icon={<XCircle className="h-4 w-4" />}
                  label="Perdidos"
                  value={String(metrics.lostCount)}
                />
                <KpiCard
                  tone="success"
                  icon={<Target className="h-4 w-4" />}
                  label="Taxa de conversao"
                  value={`${metrics.conversionRate.toFixed(1)}%`}
                  hint={`${metrics.wonCount} de ${metrics.total}`}
                />
                <KpiCard
                  tone={metrics.overdueCount > 0 ? "danger" : "muted"}
                  icon={<AlertTriangle className="h-4 w-4" />}
                  label="Follow-up atrasado"
                  value={String(metrics.overdueCount)}
                />
                <KpiCard
                  tone={metrics.noContactCount > 0 ? "warning" : "muted"}
                  icon={<UserX className="h-4 w-4" />}
                  label="Sem contato"
                  value={String(metrics.noContactCount)}
                />
                <KpiCard
                  tone={metrics.hotCount > 0 ? "danger" : "muted"}
                  icon={<Flame className="h-4 w-4" />}
                  label="Leads quentes"
                  value={String(metrics.hotCount)}
                />
              </div>
            </section>

            <section>
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Prioridade dos leads em aberto
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Classificacao automatica por urgencia, atraso, calor e contato.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <PriorityBlock
                    label="Alta"
                    count={metrics.priorityCounts.alta}
                    total={metrics.openCount}
                    className="border-destructive/30 bg-destructive/10 text-destructive"
                  />
                  <PriorityBlock
                    label="Media"
                    count={metrics.priorityCounts.media}
                    total={metrics.openCount}
                    className="border-warning/30 bg-warning/10 text-warning"
                  />
                  <PriorityBlock
                    label="Baixa"
                    count={metrics.priorityCounts.baixa}
                    total={metrics.openCount}
                    className="border-border bg-muted text-muted-foreground"
                  />
                  <PriorityBlock
                    label="Normal"
                    count={metrics.priorityCounts.normal}
                    total={metrics.openCount}
                    className="border-border bg-muted/60 text-muted-foreground"
                  />
                </div>
              </Card>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Leads por etapa</h3>
                    <p className="text-xs text-muted-foreground">
                      Distribuicao quantitativa do funil no periodo selecionado
                    </p>
                  </div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.byStage} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                        formatter={(value: number) => [`${value} lead(s)`, "Quantidade"]}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {metrics.byStage.map((stage) => (
                          <Cell key={stage.id} fill={stage.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Valor por etapa</h3>
                    <p className="text-xs text-muted-foreground">
                      Distribuicao financeira do funil no periodo selecionado
                    </p>
                  </div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={metrics.byStage.filter((stage) => stage.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={95}
                        paddingAngle={2}
                      >
                        {metrics.byStage
                          .filter((stage) => stage.value > 0)
                          .map((stage) => (
                            <Cell
                              key={stage.id}
                              fill={stage.color}
                              stroke="hsl(var(--card))"
                              strokeWidth={2}
                            />
                          ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [formatCurrency(value), "Valor"]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                        iconType="circle"
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </section>

            <section>
              <Card className="overflow-hidden">
                <div className="border-b border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground">Detalhamento por etapa</h3>
                  <p className="text-xs text-muted-foreground">
                    Quantidade e valor agregado em cada etapa do funil
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">
                          Etapa
                        </th>
                        <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">
                          Leads
                        </th>
                        <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">
                          % do total
                        </th>
                        <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">
                          Valor
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.byStage.map((stage) => {
                        const pct = metrics.total > 0 ? (stage.count / metrics.total) * 100 : 0;

                        return (
                          <tr
                            key={stage.id}
                            className="border-t border-border/60 transition-colors hover:bg-muted/30"
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ background: stage.color }}
                                />
                                <span className="font-medium text-foreground">{stage.name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-right font-semibold text-foreground tabular-nums">
                              {stage.count}
                            </td>
                            <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                              {pct.toFixed(1)}%
                            </td>
                            <td className="px-5 py-3 text-right font-semibold text-foreground tabular-nums">
                              {formatCurrency(stage.value)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-muted/30">
                      <tr>
                        <td className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-foreground">
                          Total
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-foreground tabular-nums">
                          {metrics.total}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                          100%
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-foreground tabular-nums">
                          {formatCurrency(metrics.totalValue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </section>
          </main>
        )}
      </div>
    </div>
  );
};

const toneStyles: Record<string, string> = {
  primary: "bg-primary/8 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const KpiCard = ({
  icon,
  label,
  value,
  hint,
  tone = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "accent" | "success" | "warning" | "danger" | "muted";
}) => (
  <Card className="border-border/70 p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
    <div className="flex items-start gap-3">
      <div className={cn("shrink-0 rounded-lg p-2.5", toneStyles[tone])}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate text-lg font-bold leading-tight text-foreground tabular-nums md:text-xl">
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">{hint}</p>
        )}
      </div>
    </div>
  </Card>
);

const PriorityBlock = ({
  label,
  count,
  total,
  className,
}: {
  label: string;
  count: number;
  total: number;
  className?: string;
}) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className={cn("rounded-lg border p-4", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold leading-tight tabular-nums">{count}</p>
      <p className="mt-0.5 text-[11px] opacity-70 tabular-nums">{pct}% do funil em aberto</p>
    </div>
  );
};

export default Dashboard;

import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsUpDown, CircleAlert, FileBarChart, RefreshCw, Search, SlidersHorizontal, Users, WalletCards, X } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEKontrollCompanies, useEKontrollSummary, getCompanyKey, getCompanyName } from "@/hooks/useEKontroll";
import { aggregateMonths, fiscalTotal, matchesSearch, monthFromDate, monthLabel, numericValue, periodError, personnelTotal, shiftMonth, type DataRow } from "@/lib/ekontroll";
import { cn } from "@/lib/utils";

const number = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value);
const compact = (value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const colors = { billing: "#32816c", fiscal: "#527f9a", admissions: "#32816c", dismissals: "#b78362", vacations: "#8a83b5" };
const tooltipStyle = { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))", fontSize: 12 };
const companyCode = (row: DataRow) => String(row.codi_emp ?? row.codigo ?? "");
const companyDocument = (row: DataRow) => String(row.inscricao_federal ?? row.cnpj ?? row.cnpj_cpf ?? "");
const presets = ["Mês atual", "Mês anterior", "3 meses", "6 meses", "12 meses", "Este ano"];

function EmptyChart({ loading, children }: { loading: boolean; children?: ReactNode }) {
  return <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">{loading ? <><RefreshCw className="h-6 w-6 animate-spin" /><p>Consultando os indicadores…</p></> : <><FileBarChart className="h-8 w-8 opacity-40" /><p>{children ?? "Nenhum registro retornado para este recorte."}</p><p className="text-xs">Experimente outra empresa ou competência.</p></>}</div>;
}

function ChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <Card className="min-w-0 border-border/60 shadow-sm"><CardHeader className="pb-4"><CardTitle className="text-base font-semibold">{title}</CardTitle><p className="text-xs leading-relaxed text-muted-foreground">{description}</p></CardHeader><CardContent>{children}</CardContent></Card>;
}

const EKontrollDashboard = () => {
  const queryClient = useQueryClient();
  const currentMonth = monthFromDate(new Date());
  const [period, setPeriod] = useState(() => ({ start: shiftMonth(currentMonth, -5), end: currentMonth }));
  const [draft, setDraft] = useState(period);
  const [selectedId, setSelectedId] = useState("all");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [sort, setSort] = useState("billing");
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const companies = useEKontrollCompanies();
  const options = useMemo(() => (companies.data ?? []).map((company, index) => ({
    company, id: `${companyCode(company)}:${index}`, name: getCompanyName(company), code: companyCode(company), document: companyDocument(company), key: getCompanyKey(company),
  })), [companies.data]);
  const selected = options.find(option => option.id === selectedId);
  const clientKeys = useMemo(() => selectedId === "all" ? options.map(option => option.key).filter(Boolean) : selected?.key ? [selected.key] : [], [options, selected, selectedId]);
  const unavailable = selectedId !== "all" && !selected?.key;
  const summary = useEKontrollSummary({ clientKeys, startMonth: period.start, endMonth: period.end, enabled: options.length > 0 && !companies.isError && !unavailable });
  const loading = companies.isPending || (summary.isPending && options.length > 0 && !unavailable);
  const busy = companies.isFetching || summary.isFetching || refreshing;
  const error = companies.error ?? (unavailable ? null : summary.error);
  const data = unavailable || error ? undefined : summary.data;
  const months = useMemo(() => aggregateMonths(data, period.start, period.end), [data, period]);
  const fiscalRows = useMemo(() => (data?.fiscal ?? []).filter(row => String(row.competencia ?? "").slice(0, 7) >= period.start && String(row.competencia ?? "").slice(0, 7) <= period.end), [data, period]);
  const payrollRows = useMemo(() => (data?.payroll ?? []).filter(row => String(row.competencia ?? "").slice(0, 7) >= period.start && String(row.competencia ?? "").slice(0, 7) <= period.end), [data, period]);
  const billingRows = useMemo(() => (data?.billing ?? []).filter(row => String(row.competencia ?? "").slice(0, 7) >= period.start && String(row.competencia ?? "").slice(0, 7) <= period.end), [data, period]);
  const totalBilling = months.reduce((sum, month) => sum + (month.billing ?? 0), 0);
  const totalFiscal = months.reduce((sum, month) => sum + (month.fiscal ?? 0), 0);
  const totalEvents = payrollRows.reduce((sum, row) => sum + personnelTotal(row), 0);
  const latestPayroll = [...months].reverse().find(month => month.links !== null);
  const pending = draft.start !== period.start || draft.end !== period.end;
  const validation = periodError(draft.start, draft.end);
  const coverage = selectedId === "all" ? options.filter(option => option.key).length : selected?.key ? 1 : 0;
  const filteredOptions = options.filter(option => matchesSearch(`${option.name} ${option.company.nome_fantasia ?? ""} ${option.code} ${option.document}`, companySearch));

  const ranking = useMemo(() => {
    const map = new Map<string, { code: string; name: string; document: string; optionId?: string; billing: number | null; fiscal: number | null; events: number | null }>();
    const lookup = new Map(options.map(option => [option.code, option]));
    const get = (row: DataRow) => {
      const code = companyCode(row);
      if (!code) return null;
      if (!map.has(code)) { const option = lookup.get(code); map.set(code, { code, name: option?.name ?? `Empresa ${code}`, document: option?.document ?? "", optionId: option?.id, billing: null, fiscal: null, events: null }); }
      return map.get(code)!;
    };
    billingRows.forEach(row => { const item = get(row); if (item) item.billing = (item.billing ?? 0) + numericValue(row, ["faturamento"]); });
    fiscalRows.forEach(row => { const item = get(row); if (item) item.fiscal = (item.fiscal ?? 0) + fiscalTotal(row); });
    payrollRows.forEach(row => { const item = get(row); if (item) item.events = (item.events ?? 0) + personnelTotal(row); });
    return [...map.values()].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "pt-BR") : (b[sort as "billing" | "fiscal" | "events"] ?? -Infinity) - (a[sort as "billing" | "fiscal" | "events"] ?? -Infinity));
  }, [billingRows, fiscalRows, payrollRows, options, sort]);
  const filteredRanking = ranking.filter(item => matchesSearch(`${item.name} ${item.code} ${item.document}`, tableSearch));
  const maxPage = Math.max(0, Math.ceil(filteredRanking.length / 8) - 1);
  const activePage = Math.min(page, maxPage);
  const topCompanies = useMemo(() => [...ranking].filter(item => item.billing !== null && item.billing > 0).sort((a, b) => b.billing! - a.billing!).slice(0, 5), [ranking]);
  const last = months.at(-1);
  const previous = months.at(-2);
  const variation = last?.billing != null && previous?.billing != null && previous.billing > 0 ? (last.billing - previous.billing) / previous.billing * 100 : null;
  const hasData = fiscalRows.length + payrollRows.length + billingRows.length > 0;

  const selectCompany = (id: string) => { setSelectedId(id); setCompanyOpen(false); setCompanySearch(""); setPage(0); };
  const choosePreset = (preset: string) => {
    const end = preset === "Mês anterior" ? shiftMonth(currentMonth, -1) : currentMonth;
    const start = preset === "Este ano" ? `${currentMonth.slice(0, 4)}-01` : shiftMonth(end, preset === "3 meses" ? -2 : preset === "6 meses" ? -5 : preset === "12 meses" ? -11 : 0);
    setDraft({ start, end });
  };
  const refresh = async () => {
    setRefreshing(true);
    try { await companies.refetch(); await queryClient.invalidateQueries({ queryKey: ["ekontroll", "summary"] }); }
    finally { setRefreshing(false); }
  };
  const metricValue = (available: boolean, value: string) => loading ? <Skeleton className="h-9 w-32" /> : available && !error && !unavailable ? value : "—";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader active="ekontroll" />
      <main className="mx-auto max-w-[1520px] space-y-6 px-4 py-7 md:px-8" aria-busy={busy}>
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><div className="mb-2 flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Inteligência operacional</span><Badge variant="outline" className="rounded-full text-[10px] font-medium">e-KONTROLL</Badge></div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Uma visão do seu escritório</h1><p className="mt-2 text-sm text-muted-foreground">Da carteira de empresas ao desempenho de cada competência.</p></div>
          <div className="flex flex-col items-start gap-2 sm:items-end"><Button variant="outline" onClick={() => void refresh()} disabled={busy}><RefreshCw className={cn("mr-2 h-4 w-4", busy && "animate-spin")} />{busy ? "Atualizando…" : "Atualizar dados"}</Button><span className="text-xs text-muted-foreground" role="status">{busy ? "Consultando e-KONTROLL" : error ? "Consulta indisponível" : summary.dataUpdatedAt && !unavailable ? `Consultado às ${new Date(summary.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Aguardando consulta"}</span></div>
        </header>
        <Card className="border-border/60 shadow-sm"><CardContent className="space-y-4 p-5">
          <div className="grid items-end gap-4 lg:grid-cols-[minmax(250px,1fr)_180px_180px_auto]">
            <div className="min-w-0 space-y-2"><label id="company-label" className="text-xs font-semibold text-muted-foreground">EMPRESA</label><Popover open={companyOpen} onOpenChange={setCompanyOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-expanded={companyOpen} aria-labelledby="company-label company-value" className="h-11 w-full justify-between bg-background/40 font-normal"><Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" /><span id="company-value" className="truncate">{selected?.name ?? "Todas as empresas"}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[280px] max-w-[calc(100vw-2rem)] p-0"><Command shouldFilter={false}><CommandInput placeholder="Buscar por nome, CNPJ ou código…" value={companySearch} onValueChange={setCompanySearch} /><CommandList><CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>{!companySearch && <CommandItem value="all" onSelect={() => selectCompany("all")}><Building2 className="mr-2 h-4 w-4" />Todas as empresas{selectedId === "all" && <Check className="ml-auto h-4 w-4" />}</CommandItem>}{filteredOptions.slice(0, 80).map(option => <CommandItem key={option.id} value={option.id} onSelect={() => selectCompany(option.id)} className="gap-2 py-3"><div className="min-w-0 flex-1"><p className="truncate font-medium">{option.name}</p><p className="mt-1 text-xs opacity-70">Cód. {option.code || "—"} · {option.document || "Sem documento"}{!option.key && " · Sem acesso aos indicadores"}</p></div>{selectedId === option.id && <Check className="h-4 w-4 shrink-0" />}</CommandItem>)}</CommandList><div className="border-t px-3 py-2 text-xs text-muted-foreground">{filteredOptions.length > 80 ? "Mostrando 80 resultados. Digite para refinar a busca." : `${filteredOptions.length} empresas encontradas`}</div></Command></PopoverContent></Popover></div>
            <div className="space-y-2"><label htmlFor="period-start" className="text-xs font-semibold text-muted-foreground">COMPETÊNCIA INICIAL</label><Input id="period-start" type="month" min="1900-01" max={draft.end || undefined} value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} className="h-11" aria-invalid={!!validation} aria-describedby={validation ? "period-error" : undefined} /></div>
            <div className="space-y-2"><label htmlFor="period-end" className="text-xs font-semibold text-muted-foreground">COMPETÊNCIA FINAL</label><Input id="period-end" type="month" min={draft.start || "1900-01"} value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} className="h-11" aria-invalid={!!validation} aria-describedby={validation ? "period-error" : undefined} /></div>
            <Button className="h-11" disabled={!!validation || !pending} onClick={() => { setPeriod(draft); setPage(0); }}><SlidersHorizontal className="mr-2 h-4 w-4" />Aplicar período</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2"><CalendarDays className="mr-1 h-4 w-4 text-muted-foreground" />{presets.map(preset => <Button key={preset} size="sm" variant="ghost" onClick={() => choosePreset(preset)} className="h-7 rounded-full border border-border/60 px-3 text-xs font-normal hover:bg-primary/5 hover:text-foreground">{preset}</Button>)}<span className="ml-auto text-xs text-muted-foreground">Até 12 competências por consulta</span></div>
          {validation && <p id="period-error" role="alert" className="text-sm text-destructive">{validation}</p>}{pending && !validation && <p className="text-xs text-muted-foreground">Clique em “Aplicar período” para consultar as competências selecionadas.</p>}
        </CardContent></Card>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><div className="flex min-w-0 flex-wrap items-center gap-2"><Badge variant="secondary" className="rounded-full px-3 py-1 font-normal"><CalendarDays className="mr-1.5 h-3 w-3" />{monthLabel(period.start)} — {monthLabel(period.end)}</Badge>{selected && <Badge variant="outline" className="max-w-full gap-2 rounded-full py-1 font-normal"><span className="max-w-[250px] truncate">{selected.name}</span><button aria-label="Limpar filtro de empresa" onClick={() => selectCompany("all")} className="rounded p-0.5 focus-visible:outline focus-visible:outline-2"><X className="h-3 w-3" /></button></Badge>}{period.end >= currentMonth && <span className="text-muted-foreground">O período inclui uma competência em andamento.</span>}</div><span className="text-muted-foreground">{coverage} {coverage === 1 ? "empresa habilitada" : "empresas habilitadas"}{selectedId === "all" ? ` de ${options.length} cadastradas` : ""}</span></div>
        {(error || unavailable) && <div role="alert" className="flex gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><p className="font-semibold">{unavailable ? "Indicadores não habilitados para esta empresa" : "Não foi possível carregar os indicadores"}</p><p className="mt-1 text-muted-foreground">{unavailable ? "Selecione outra empresa ou habilite o acesso dela no e-KONTROLL." : error instanceof Error ? error.message : "Tente atualizar os dados novamente."}</p></div></div>}
        <section aria-label="Indicadores do período" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Faturamento acumulado", value: metricValue(billingRows.length > 0, money(totalBilling)), hint: "Soma do faturamento no período", icon: WalletCards, color: "text-emerald-700 bg-emerald-500/10", detail: billingRows.length ? `${number(months.filter(month => month.billing !== null).length)} competências com retorno` : "Aguardando registros" },
            { label: "Volume fiscal", value: metricValue(fiscalRows.length > 0, number(totalFiscal)), hint: "Documentos e registros fiscais", icon: FileBarChart, color: "text-sky-700 bg-sky-500/10", detail: "Entradas, saídas, serviços e demais totais" },
            { label: "Eventos de pessoal", value: metricValue(payrollRows.length > 0, number(totalEvents)), hint: "Movimentações no período", icon: Users, color: "text-violet-700 bg-violet-500/10", detail: "Admissões + desligamentos + férias" },
            { label: "Vínculos na folha", value: metricValue(!!latestPayroll, number(latestPayroll?.links ?? 0)), hint: latestPayroll ? `Posição de ${monthLabel(latestPayroll.month)}` : "Última competência disponível", icon: Building2, color: "text-amber-700 bg-amber-500/10", detail: "Total de vínculos; não acumulado" },
          ].map(metric => <Card key={metric.label} className="border-border/60 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-muted-foreground">{metric.label}</p><div className={cn("rounded-lg p-2", metric.color)}><metric.icon className="h-4 w-4" /></div></div><div className="mt-4 break-words text-[clamp(1.3rem,2vw,1.9rem)] font-semibold tracking-tight tabular-nums">{metric.value}</div><p className="mt-2 text-xs text-muted-foreground">{metric.hint}</p><div className="mt-4 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">{metric.detail}</div></CardContent></Card>)}
        </section>
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <ChartCard title="Evolução do faturamento" description="Valores em reais por competência · intervalos sem retorno permanecem em branco.">
            {billingRows.length ? <><div className="mb-4 flex flex-wrap items-center gap-2"><span className="text-xl font-semibold tabular-nums">{money(totalBilling)}</span><span className="text-xs text-muted-foreground">no período</span>{variation !== null && <span className="ml-auto flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">{variation >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}{variation > 0 ? "+" : ""}{variation.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · {monthLabel(last!.month)} vs. {monthLabel(previous!.month)}</span>}</div><div className="h-64" role="img" aria-label="Gráfico de faturamento mensal em reais"><ResponsiveContainer width="100%" height="100%"><AreaChart data={months} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}><defs><linearGradient id="billing-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors.billing} stopOpacity={0.22} /><stop offset="100%" stopColor={colors.billing} stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 5" /><XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} /><YAxis tickFormatter={compact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={58} /><Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [money(value), "Faturamento"]} labelFormatter={label => monthLabel(String(label))} /><Area type="monotone" dataKey="billing" stroke={colors.billing} strokeWidth={2.5} fill="url(#billing-fill)" dot={{ r: 3, fill: colors.billing }} activeDot={{ r: 5 }} connectNulls={false} /></AreaChart></ResponsiveContainer></div></> : <EmptyChart loading={loading} />}
          </ChartCard>
          <ChartCard title="Maiores faturamentos" description="As 5 empresas com maior faturamento no recorte. Clique para explorar.">
            {topCompanies.length ? <div className="space-y-5 pt-2">{topCompanies.map((item, index) => <button key={item.code} disabled={!item.optionId} onClick={() => item.optionId && selectCompany(item.optionId)} className="group block w-full rounded-lg text-left outline-offset-4"><div className="mb-2 flex items-center gap-3"><span className="text-xs font-medium text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate text-xs font-medium group-hover:underline" title={item.name}>{item.name}</span><span className="text-xs font-semibold tabular-nums">{money(item.billing!)}</span></div><div className="ml-7 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${item.billing! / topCompanies[0].billing! * 100}%` }} /></div></button>)}<p className="pt-1 text-[11px] text-muted-foreground">Ranking restrito às empresas com retorno de faturamento.</p></div> : <EmptyChart loading={loading}>Nenhuma empresa com faturamento positivo neste recorte.</EmptyChart>}
          </ChartCard>
        </section>
        <section className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Volume fiscal por competência" description="Soma dos totais de documentos de entradas, saídas, serviços, bilhetes, CFe e reduções Z.">
            {fiscalRows.length ? <div className="h-64" role="img" aria-label="Gráfico mensal de quantidade de registros fiscais"><ResponsiveContainer width="100%" height="100%"><BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 5" /><XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} /><YAxis tickFormatter={compact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} /><Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [number(value), "Volume fiscal"]} labelFormatter={label => monthLabel(String(label))} /><Bar dataKey="fiscal" fill={colors.fiscal} radius={[5, 5, 0, 0]} maxBarSize={42} /></BarChart></ResponsiveContainer></div> : <EmptyChart loading={loading} />}
          </ChartCard>
          <ChartCard title="Movimentações de pessoal" description="Admissões, desligamentos e férias por competência · quantidade de eventos.">
            {payrollRows.length ? <div className="h-64" role="img" aria-label="Gráfico mensal de admissões, desligamentos e férias"><ResponsiveContainer width="100%" height="100%"><BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 5" /><XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} /><YAxis tickFormatter={compact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={45} /><Tooltip contentStyle={tooltipStyle} formatter={(value: number) => number(value)} labelFormatter={label => monthLabel(String(label))} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} /><Bar name="Admissões" dataKey="admissions" fill={colors.admissions} radius={[3, 3, 0, 0]} maxBarSize={18} /><Bar name="Desligamentos" dataKey="dismissals" fill={colors.dismissals} radius={[3, 3, 0, 0]} maxBarSize={18} /><Bar name="Férias" dataKey="vacations" fill={colors.vacations} radius={[3, 3, 0, 0]} maxBarSize={18} /></BarChart></ResponsiveContainer></div> : <EmptyChart loading={loading} />}
          </ChartCard>
        </section>
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-base">Desempenho por empresa</CardTitle><p className="mt-1.5 text-xs text-muted-foreground">Valores acumulados no período · {ranking.length} empresas com registros.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar no desempenho por empresa" placeholder="Nome, CNPJ ou código" value={tableSearch} onChange={event => { setTableSearch(event.target.value); setPage(0); }} className="pl-9 sm:w-60" /></div><Select value={sort} onValueChange={value => { setSort(value); setPage(0); }}><SelectTrigger className="sm:w-44" aria-label="Ordenar empresas"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="billing">Maior faturamento</SelectItem><SelectItem value="fiscal">Maior volume fiscal</SelectItem><SelectItem value="events">Mais eventos</SelectItem><SelectItem value="name">Nome A–Z</SelectItem></SelectContent></Select></div></CardHeader>
          <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><caption className="sr-only">Indicadores por empresa entre {monthLabel(period.start)} e {monthLabel(period.end)}</caption><thead className="border-y bg-muted/40 text-xs text-muted-foreground"><tr><th scope="col" className="px-6 py-3 text-left font-medium">Empresa</th><th scope="col" className="px-4 py-3 text-right font-medium">Faturamento</th><th scope="col" className="px-4 py-3 text-right font-medium">Volume fiscal</th><th scope="col" className="px-6 py-3 text-right font-medium">Eventos de pessoal</th></tr></thead><tbody>{loading ? Array.from({ length: 4 }, (_, index) => <tr key={index}><td colSpan={4} className="px-6 py-3"><Skeleton className="h-8 w-full" /></td></tr>) : filteredRanking.slice(activePage * 8, activePage * 8 + 8).map(item => <tr key={item.code} className="border-b border-border/40 transition-colors hover:bg-muted/30"><td className="px-6 py-3.5"><button disabled={!item.optionId} onClick={() => item.optionId && selectCompany(item.optionId)} className="max-w-[320px] text-left hover:underline"><span className="block truncate text-xs font-semibold" title={item.name}>{item.name}</span><span className="mt-1 block text-[11px] text-muted-foreground">{item.document || `Código ${item.code}`}</span></button></td><td className="px-4 py-3 text-right text-xs font-medium tabular-nums">{item.billing === null ? "—" : money(item.billing)}</td><td className="px-4 py-3 text-right text-xs tabular-nums">{item.fiscal === null ? "—" : number(item.fiscal)}</td><td className="px-6 py-3 text-right text-xs tabular-nums">{item.events === null ? "—" : number(item.events)}</td></tr>)}{!loading && !filteredRanking.length && <tr><td colSpan={4} className="px-6 py-12 text-center text-sm text-muted-foreground">{tableSearch ? "Nenhuma empresa corresponde à busca." : "Nenhum registro disponível para este recorte."}</td></tr>}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-muted-foreground"><span>{filteredRanking.length ? `${activePage * 8 + 1}–${Math.min((activePage + 1) * 8, filteredRanking.length)} de ${filteredRanking.length} empresas` : "0 empresas"} · — indica ausência de retorno</span><div className="flex items-center gap-2"><Button size="icon" variant="outline" className="h-8 w-8" aria-label="Página anterior" disabled={!activePage} onClick={() => setPage(activePage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span>{activePage + 1} / {maxPage + 1}</span><Button size="icon" variant="outline" className="h-8 w-8" aria-label="Próxima página" disabled={activePage >= maxPage} onClick={() => setPage(activePage + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div></CardContent>
        </Card>
        {hasData && <p className="pb-2 text-center text-xs leading-relaxed text-muted-foreground">Fonte: e-KONTROLL · Apenas empresas e competências com retorno participam dos indicadores. Dados do mês em andamento podem estar parciais.</p>}
      </main>
    </div>
  );
};

export default EKontrollDashboard;

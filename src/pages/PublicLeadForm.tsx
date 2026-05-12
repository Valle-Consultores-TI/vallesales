import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Building2, CheckCircle2, ChevronDown, Loader2, Send } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatCnpj, formatPhone, isValidLeadPhone, SERVICE_TYPE_OPTIONS, TAX_REGIME_OPTIONS } from "@/lib/lead-form";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const publicLeadSchema = z.object({
  contact_name: z.string().trim().min(2, "Informe o seu nome."),
  company_or_person: z.string().trim().min(2, "Informe o nome da sua empresa."),
  service_types: z.array(z.string()).min(1, "Selecione ao menos um servico."),
  phone: z.string().trim(),
  email: z.string().trim().email("Informe um e-mail valido."),
  cnpj: z.string().trim().min(14, "Informe o CNPJ da empresa."),
  employee_count: z.string().trim().min(1, "Informe a quantidade total de funcionarios."),
  employee_count_clt: z.string().trim().min(1, "Informe a quantidade media de funcionarios CLT."),
  employee_count_pj: z.string().trim().min(1, "Informe a quantidade media de profissionais PJ."),
  tax_regime: z.string().trim().min(1, "Informe o regime tributario atual."),
  monthly_revenue_managerial: z.string().trim().min(1, "Informe o faturamento medio mensal gerencial."),
  monthly_revenue_fiscal: z.string().trim().min(1, "Informe o faturamento medio mensal fiscal."),
  monthly_invoice_count: z.string().trim().min(1, "Informe a quantidade media de NF emitidas por mes."),
  payroll_gross_value: z.string().trim().min(1, "Informe o valor bruto medio da folha de pagamentos."),
  bank_account_count: z.string().trim().min(1, "Informe quantas contas bancarias a empresa possui."),
  bank_accounts_split: z.string().trim().min(1, "Informe se as contas bancarias sao separadas por projeto ou centro de custo."),
  financial_system: z.string().trim().min(1, "Informe qual sistema financeiro voces utilizam."),
  accounting_pain_points: z.string().trim().min(2, "Descreva as principais dores da empresa e a motivacao por trocar."),
  notes: z.string().trim().min(2, "Informe sua mensagem ou observacoes."),
  hp_field: z.string().trim().max(0, "Campo invalido."),
});

const publicLeadStepOneSchema = publicLeadSchema.pick({
  contact_name: true,
  company_or_person: true,
  service_types: true,
  phone: true,
  email: true,
  cnpj: true,
  tax_regime: true,
});

type FormState = {
  contact_name: string;
  company_or_person: string;
  service_types: string[];
  phone: string;
  email: string;
  cnpj: string;
  employee_count: string;
  employee_count_clt: string;
  employee_count_pj: string;
  tax_regime: string;
  monthly_revenue_managerial: string;
  monthly_revenue_fiscal: string;
  monthly_invoice_count: string;
  payroll_gross_value: string;
  bank_account_count: string;
  bank_accounts_split: string;
  financial_system: string;
  accounting_pain_points: string;
  notes: string;
  hp_field: string;
};

const initialForm: FormState = {
  contact_name: "",
  company_or_person: "",
  service_types: [],
  phone: "",
  email: "",
  cnpj: "",
  employee_count: "",
  employee_count_clt: "",
  employee_count_pj: "",
  tax_regime: "",
  monthly_revenue_managerial: "",
  monthly_revenue_fiscal: "",
  monthly_invoice_count: "",
  payroll_gross_value: "",
  bank_account_count: "",
  bank_accounts_split: "",
  financial_system: "",
  accounting_pain_points: "",
  notes: "",
  hp_field: "",
};

const uploadPublicAttachment = async (leadId: string, documentType: "payroll-report" | "trial-balance", file: File) => {
  const body = new FormData();
  body.append("lead_id", leadId);
  body.append("document_type", documentType);
  body.append("file", file);

  const { data, error } = await supabase.functions.invoke("public-lead-upload", { body });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json();
        throw new Error(String(payload?.error || "Nao foi possivel anexar um dos arquivos."));
      } catch {
        throw new Error("Nao foi possivel anexar um dos arquivos.");
      }
    }

    throw new Error(error.message || "Nao foi possivel anexar um dos arquivos.");
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }
};

const PublicLeadForm = () => {
  const [form, setForm] = useState<FormState>(initialForm);
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [payrollReportFile, setPayrollReportFile] = useState<File | null>(null);
  const [trialBalanceFile, setTrialBalanceFile] = useState<File | null>(null);
  const payrollReportInputRef = useRef<HTMLInputElement>(null);
  const trialBalanceInputRef = useRef<HTMLInputElement>(null);

  const utmContext = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      utm_term: params.get("utm_term"),
      utm_content: params.get("utm_content"),
      landing_path: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer || null,
    };
  }, []);

  const patchForm = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const toggleServiceType = (serviceType: string, checked: boolean) => {
    patchForm({
      service_types: checked
        ? Array.from(new Set([...form.service_types, serviceType]))
        : form.service_types.filter((item) => item !== serviceType),
    });
  };

  const resetFileInputs = () => {
    setPayrollReportFile(null);
    setTrialBalanceFile(null);
    if (payrollReportInputRef.current) payrollReportInputRef.current.value = "";
    if (trialBalanceInputRef.current) trialBalanceInputRef.current.value = "";
  };

  const goToSecondStep = () => {
    const parsed = publicLeadStepOneSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos desta etapa.");
      return;
    }

    if (!isValidLeadPhone(form.phone)) {
      toast.error("Informe um telefone valido.");
      return;
    }

    setServicePickerOpen(false);
    setStep(2);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const parsed = publicLeadSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos do formulario.");
      return;
    }

    if (!isValidLeadPhone(form.phone)) {
      toast.error("Informe um telefone valido.");
      return;
    }

    if (!payrollReportFile) {
      toast.error("Encaminhe o Relatorio Geral da Folha do ultimo mes.");
      return;
    }

    if (!trialBalanceFile) {
      toast.error("Encaminhe o balancete mais recente.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.functions.invoke("public-lead-intake", {
      body: {
        contact_name: form.contact_name.trim(),
        company_or_person: form.company_or_person.trim(),
        service_types: form.service_types,
        phone: formatPhone(form.phone),
        email: form.email.trim(),
        cnpj: form.cnpj.trim(),
        employee_count: form.employee_count.trim(),
        employee_count_clt: form.employee_count_clt.trim(),
        employee_count_pj: form.employee_count_pj.trim(),
        tax_regime: form.tax_regime,
        monthly_revenue_managerial: form.monthly_revenue_managerial.trim(),
        monthly_revenue_fiscal: form.monthly_revenue_fiscal.trim(),
        monthly_invoice_count: form.monthly_invoice_count.trim(),
        payroll_gross_value: form.payroll_gross_value.trim(),
        bank_account_count: form.bank_account_count.trim(),
        bank_accounts_split: form.bank_accounts_split,
        financial_system: form.financial_system.trim(),
        accounting_pain_points: form.accounting_pain_points.trim(),
        notes: form.notes.trim(),
        source: "Formulario site",
        hp_field: form.hp_field,
        ...utmContext,
      },
    });

    if (error) {
      setLoading(false);
      if (error instanceof FunctionsHttpError) {
        try {
          const payload = await error.context.json();
          toast.error(String(payload?.error || "Nao foi possivel enviar seu contato."));
          return;
        } catch {
          toast.error("Nao foi possivel enviar seu contato.");
          return;
        }
      }

      toast.error(error.message || "Nao foi possivel enviar seu contato.");
      return;
    }

    if (data?.error) {
      setLoading(false);
      toast.error(String(data.error));
      return;
    }

    const leadId = typeof data?.lead_id === "string" ? data.lead_id : null;

    if (!leadId) {
      setLoading(false);
      toast.error("O lead foi criado, mas nao foi possivel localizar o identificador para anexar os arquivos.");
      return;
    }

    const uploadFailures: string[] = [];

    for (const fileEntry of [
      { type: "payroll-report" as const, file: payrollReportFile },
      { type: "trial-balance" as const, file: trialBalanceFile },
    ]) {
      try {
        await uploadPublicAttachment(leadId, fileEntry.type, fileEntry.file);
      } catch (uploadError) {
        uploadFailures.push(uploadError instanceof Error ? uploadError.message : "Falha ao anexar documento.");
      }
    }

    setLoading(false);
    setSubmitted(true);
    setStep(1);
    setForm(initialForm);
    resetFileInputs();

    if (uploadFailures.length > 0) {
      toast.error("O lead foi enviado, mas um ou mais documentos nao puderam ser anexados.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-header px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="text-header-foreground">
          <div className="mb-6 inline-flex rounded-2xl bg-white/10 p-3 shadow-elevated backdrop-blur">
            <Building2 className="h-8 w-8" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-header-muted">Valle | Consultores</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Proposta sob medida para sua empresa
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-header-muted sm:text-lg">
            Preencha o formulario e conte um pouco sobre seu negocio. Nossa equipe analisara seu cenario e entrara em
            contato com uma proposta alinhada as suas necessidades.
          </p>
        </section>

        <Card className="border-0 shadow-elevated">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Solicite contato</CardTitle>
            <CardDescription>
              {step === 1
                ? "Etapa 1 de 2: dados principais para iniciarmos sua analise."
                : "Etapa 2 de 2: detalhes operacionais, anexos e mensagem final."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="rounded-2xl border border-success/20 bg-success/5 p-6 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
                <h2 className="mt-4 text-lg font-semibold text-foreground">Contato enviado com sucesso</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Seu lead foi registrado. Em breve nossa equipe deve entrar em contato.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5"
                  onClick={() => {
                    setSubmitted(false);
                    setStep(1);
                  }}
                >
                  Enviar outro contato
                </Button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Etapa {step} de 2</p>
                      <p className="text-sm text-muted-foreground">
                        {step === 1 ? "Contato e contexto inicial" : "Diagnostico operacional e anexos"}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">{step === 1 ? "50%" : "100%"}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border/70">
                    <div
                      className={cn(
                        "h-full rounded-full bg-accent transition-all duration-300",
                        step === 1 ? "w-1/2" : "w-full",
                      )}
                    />
                  </div>
                </div>

                {step === 1 ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="public-contact">Qual o seu nome?</Label>
                      <Input
                        id="public-contact"
                        value={form.contact_name}
                        onChange={(event) => patchForm({ contact_name: event.target.value })}
                        placeholder="Digite seu nome"
                        autoComplete="name"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="public-company">Qual o nome da sua empresa?</Label>
                      <Input
                        id="public-company"
                        value={form.company_or_person}
                        onChange={(event) => patchForm({ company_or_person: event.target.value })}
                        placeholder="Digite sua empresa"
                        autoComplete="organization"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Qual servico voce esta buscando?</Label>
                      <Popover open={servicePickerOpen} onOpenChange={setServicePickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background transition-colors",
                              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              form.service_types.length === 0 && "text-muted-foreground",
                            )}
                          >
                            <span className="pr-3">
                              {form.service_types.length > 0
                                ? form.service_types.join(", ")
                                : "Clique para selecionar os servicos"}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
                          <div className="space-y-1">
                            {SERVICE_TYPE_OPTIONS.map((serviceType) => {
                              const checked = form.service_types.includes(serviceType);
                              return (
                                <label
                                  key={serviceType}
                                  className={cn(
                                    "flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/40",
                                    checked && "border-accent/30 bg-accent/5",
                                  )}
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
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="public-phone">Qual o seu telefone?</Label>
                        <Input
                          id="public-phone"
                          value={form.phone}
                          onChange={(event) => patchForm({ phone: formatPhone(event.target.value) })}
                          placeholder="Insira seu telefone"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="public-email">Qual o seu e-mail?</Label>
                        <Input
                          id="public-email"
                          type="email"
                          value={form.email}
                          onChange={(event) => patchForm({ email: event.target.value })}
                          placeholder="Digite seu e-mail"
                          autoComplete="email"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="public-cnpj">CNPJ da empresa</Label>
                      <Input
                        id="public-cnpj"
                        value={form.cnpj}
                        onChange={(event) => patchForm({ cnpj: formatCnpj(event.target.value) })}
                        placeholder="00.000.000/0000-00"
                        inputMode="numeric"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Regime tributario atual</Label>
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
                    </div>

                    <Button type="button" variant="accent" className="w-full font-semibold" onClick={goToSecondStep}>
                      Continuar para etapa 2
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="public-revenue-managerial">Faturamento medio mensal gerencial</Label>
                        <Input
                          id="public-revenue-managerial"
                          value={form.monthly_revenue_managerial}
                          onChange={(event) => patchForm({ monthly_revenue_managerial: event.target.value })}
                          placeholder="Ex.: 150000"
                          inputMode="decimal"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="public-revenue-fiscal">Faturamento medio mensal fiscal</Label>
                        <Input
                          id="public-revenue-fiscal"
                          value={form.monthly_revenue_fiscal}
                          onChange={(event) => patchForm({ monthly_revenue_fiscal: event.target.value })}
                          placeholder="Ex.: 140000"
                          inputMode="decimal"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="public-employees">Quantidade total de funcionarios</Label>
                        <Input
                          id="public-employees"
                          value={form.employee_count}
                          onChange={(event) => patchForm({ employee_count: event.target.value })}
                          placeholder="Digite a quantidade"
                          inputMode="numeric"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="public-invoices">Quantidade media de NF emitidas por mes</Label>
                        <Input
                          id="public-invoices"
                          value={form.monthly_invoice_count}
                          onChange={(event) => patchForm({ monthly_invoice_count: event.target.value })}
                          placeholder="Ex.: 85"
                          inputMode="numeric"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="public-employees-clt">Numero de funcionarios CLT</Label>
                        <Input
                          id="public-employees-clt"
                          value={form.employee_count_clt}
                          onChange={(event) => patchForm({ employee_count_clt: event.target.value })}
                          placeholder="Ex.: 10"
                          inputMode="numeric"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="public-employees-pj">Numero de profissionais PJ</Label>
                        <Input
                          id="public-employees-pj"
                          value={form.employee_count_pj}
                          onChange={(event) => patchForm({ employee_count_pj: event.target.value })}
                          placeholder="Ex.: 4"
                          inputMode="numeric"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="public-payroll">Valor bruto medio da folha de pagamentos</Label>
                      <Input
                        id="public-payroll"
                        value={form.payroll_gross_value}
                        onChange={(event) => patchForm({ payroll_gross_value: event.target.value })}
                        placeholder="Ex.: 58000"
                        inputMode="decimal"
                        required
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="public-bank-count">Quantas contas bancarias?</Label>
                        <Input
                          id="public-bank-count"
                          value={form.bank_account_count}
                          onChange={(event) => patchForm({ bank_account_count: event.target.value })}
                          placeholder="Ex.: 3"
                          inputMode="numeric"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Separadas por projeto/centro de custo?</Label>
                        <Select
                          value={form.bank_accounts_split || undefined}
                          onValueChange={(value) => patchForm({ bank_accounts_split: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sim">Sim</SelectItem>
                            <SelectItem value="Nao">Nao</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="public-financial-system">Qual sistema financeiro voces utilizam?</Label>
                      <Input
                        id="public-financial-system"
                        value={form.financial_system}
                        onChange={(event) => patchForm({ financial_system: event.target.value })}
                        placeholder="Ex.: Omie, Conta Azul, ERP proprio"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="public-pain-points">
                        Quais sao as principais dores da empresa em relacao a contabilidade atual e a motivacao por trocar?
                      </Label>
                      <Textarea
                        id="public-pain-points"
                        rows={4}
                        value={form.accounting_pain_points}
                        onChange={(event) => patchForm({ accounting_pain_points: event.target.value })}
                        placeholder="Descreva o contexto atual, dificuldades e o que voces esperam melhorar."
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="public-payroll-report">
                        Favor encaminhar o Relatorio Geral da Folha de pagamentos do ultimo mes
                      </Label>
                      <Input
                        id="public-payroll-report"
                        ref={payrollReportInputRef}
                        type="file"
                        accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                        onChange={(event) => setPayrollReportFile(event.target.files?.[0] ?? null)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="public-trial-balance">Favor encaminhar o balancete mais recente</Label>
                      <Input
                        id="public-trial-balance"
                        ref={trialBalanceInputRef}
                        type="file"
                        accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                        onChange={(event) => setTrialBalanceFile(event.target.files?.[0] ?? null)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="public-notes">Mensagem / Observacoes</Label>
                      <Textarea
                        id="public-notes"
                        rows={5}
                        value={form.notes}
                        onChange={(event) => patchForm({ notes: event.target.value })}
                        placeholder="Conte um pouco sobre o que sua empresa precisa."
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button type="button" variant="outline" className="w-full sm:flex-1" onClick={() => setStep(1)}>
                        Voltar para etapa 1
                      </Button>
                      <Button type="submit" variant="accent" className="w-full font-semibold sm:flex-1" disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Enviar contato
                      </Button>
                    </div>
                  </>
                )}

                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  aria-hidden="true"
                  value={form.hp_field}
                  onChange={(event) => patchForm({ hp_field: event.target.value })}
                />
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PublicLeadForm;

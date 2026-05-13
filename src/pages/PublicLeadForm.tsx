import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { CheckCircle2, ChevronDown, Loader2, Send } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  COMPANY_MATURITY_OPTIONS,
  formatCnpj,
  formatPhone,
  FORM_SERVICE_TYPE_OPTIONS,
  isValidLeadPhone,
  TAX_REGIME_OPTIONS,
} from "@/lib/lead-form";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import valleSymbolWhite from "@/assets/valle-symbol-white.png";

const stepOneSchema = z.object({
  contact_name: z.string().trim().min(2, "Informe o seu nome."),
  phone: z.string().trim(),
  email: z.string().trim().email("Informe um e-mail valido."),
  company_maturity: z.string().trim().min(1, "Selecione se voce ja tem empresa ou quer abrir uma empresa."),
  hp_field: z.string().trim().max(0, "Campo invalido."),
});

const existingCompanyStepTwoSchema = z.object({
  company_or_person: z.string().trim().min(2, "Informe o nome da sua empresa."),
  service_types: z.array(z.string()).min(1, "Selecione ao menos um servico."),
  cnpj: z.string().trim().min(14, "Informe o CNPJ da empresa."),
  tax_regime: z.string().trim().min(1, "Informe o regime tributario atual."),
  monthly_revenue_managerial: z.string().trim().min(1, "Informe o faturamento medio mensal gerencial."),
  monthly_revenue_fiscal: z.string().trim().min(1, "Informe o faturamento medio mensal fiscal."),
});

const existingCompanyStepThreeSchema = z.object({
  monthly_invoice_count: z.string().trim().min(1, "Informe a quantidade media de NF emitidas por mes."),
  employee_count_clt: z.string().trim().min(1, "Informe a quantidade media de funcionarios CLT."),
  employee_count_pj: z.string().trim().min(1, "Informe a quantidade media de profissionais PJ."),
  payroll_gross_value: z.string().trim().min(1, "Informe o valor bruto medio da folha de pagamentos."),
  bank_account_count: z.string().trim().min(1, "Informe quantas contas bancarias a empresa possui."),
  bank_accounts_split: z.string().trim().min(1, "Informe se as contas bancarias sao separadas por projeto ou centro de custo."),
  financial_system: z.string().trim().min(1, "Informe qual sistema financeiro voces utilizam."),
  accounting_pain_points: z.string().trim().min(2, "Descreva as principais dores da empresa e a motivacao por trocar."),
});

const openingCompanySchema = z.object({
  future_company_activities: z.string().trim().min(2, "Descreva as atividades da sua futura empresa."),
});

type FormState = {
  contact_name: string;
  company_maturity: string;
  company_or_person: string;
  service_types: string[];
  phone: string;
  email: string;
  cnpj: string;
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
  future_company_activities: string;
  hp_field: string;
};

const initialForm: FormState = {
  contact_name: "",
  company_maturity: "",
  company_or_person: "",
  service_types: [],
  phone: "",
  email: "",
  cnpj: "",
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
  future_company_activities: "",
  hp_field: "",
};

const DEFAULT_OPENING_COMPANY_SERVICE = "Legalizacao de Empresas";

const FieldLabel = ({
  children,
  htmlFor,
  required,
  optional,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
}) => (
  <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm font-medium text-foreground">
    <span>{children}</span>
    {required ? <span className="text-destructive">*</span> : null}
    {optional ? <span className="text-xs font-normal text-muted-foreground">opcional</span> : null}
  </Label>
);

const PublicLeadForm = () => {
  const [form, setForm] = useState<FormState>(initialForm);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);

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

  const isOpeningCompany = form.company_maturity === "opening_company";
  const isExistingCompany = form.company_maturity === "existing_company";
  const totalSteps = isExistingCompany ? 3 : 2;
  const progressPercentage = Math.round((step / totalSteps) * 100);

  const toggleServiceType = (serviceType: string, checked: boolean) => {
    patchForm({
      service_types: checked
        ? Array.from(new Set([...form.service_types, serviceType]))
        : form.service_types.filter((item) => item !== serviceType),
    });
  };

  const validateStepOne = () => {
    const parsed = stepOneSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos desta etapa.");
      return false;
    }

    if (!isValidLeadPhone(form.phone)) {
      toast.error("Informe um telefone valido.");
      return false;
    }

    return true;
  };

  const validateStepTwo = () => {
    const parsed = isOpeningCompany
      ? openingCompanySchema.safeParse(form)
      : existingCompanyStepTwoSchema.safeParse(form);

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos do formulario.");
      return false;
    }

    return true;
  };

  const validateStepThree = () => {
    const parsed = existingCompanyStepThreeSchema.safeParse(form);

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos do formulario.");
      return false;
    }

    return true;
  };

  const handleCompanyMaturityChange = (value: string) => {
    setServicePickerOpen(false);
    patchForm({ company_maturity: value });
  };

  const goToSecondStep = () => {
    if (!validateStepOne()) return;

    setServicePickerOpen(false);
    setStep(2);
  };

  const goToThirdStep = () => {
    if (!validateStepTwo()) return;
    setStep(3);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateStepOne() || !validateStepTwo() || (isExistingCompany && !validateStepThree())) {
      return;
    }

    setLoading(true);

    const companyOrPerson = isOpeningCompany
      ? `Abertura de empresa - ${form.contact_name.trim()}`
      : form.company_or_person.trim();
    const employeeCountTotal = isOpeningCompany
      ? "0"
      : String((Number(form.employee_count_clt || 0) || 0) + (Number(form.employee_count_pj || 0) || 0));

    const { data, error } = await supabase.functions.invoke("public-lead-intake", {
      body: {
        contact_name: form.contact_name.trim(),
        company_or_person: companyOrPerson,
        company_maturity: form.company_maturity,
        service_types: isOpeningCompany ? [DEFAULT_OPENING_COMPANY_SERVICE] : form.service_types,
        phone: formatPhone(form.phone),
        email: form.email.trim(),
        employee_count: employeeCountTotal,
        cnpj: isOpeningCompany ? "" : form.cnpj.trim(),
        employee_count_clt: isOpeningCompany ? "" : form.employee_count_clt.trim(),
        employee_count_pj: isOpeningCompany ? "" : form.employee_count_pj.trim(),
        tax_regime: isOpeningCompany ? "" : form.tax_regime,
        monthly_revenue_managerial: isOpeningCompany ? "" : form.monthly_revenue_managerial.trim(),
        monthly_revenue_fiscal: isOpeningCompany ? "" : form.monthly_revenue_fiscal.trim(),
        monthly_invoice_count: isOpeningCompany ? "" : form.monthly_invoice_count.trim(),
        payroll_gross_value: isOpeningCompany ? "" : form.payroll_gross_value.trim(),
        bank_account_count: isOpeningCompany ? "" : form.bank_account_count.trim(),
        bank_accounts_split: isOpeningCompany ? "" : form.bank_accounts_split,
        financial_system: isOpeningCompany ? "" : form.financial_system.trim(),
        accounting_pain_points: isOpeningCompany ? "" : form.accounting_pain_points.trim(),
        future_company_activities: isOpeningCompany ? form.future_company_activities.trim() : "",
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

    setLoading(false);
    setSubmitted(true);
    setStep(1);
    setForm(initialForm);
    setServicePickerOpen(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-header px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="text-header-foreground">
          <div className="mb-6 inline-flex rounded-2xl bg-white/10 p-3 shadow-elevated backdrop-blur">
            <img src={valleSymbolWhite} alt="Valle" className="h-8 w-8 object-contain" />
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
                ? `Etapa 1 de ${totalSteps}: dados principais para iniciarmos sua analise.`
                : isOpeningCompany
                  ? "Etapa 2 de 2: descreva as atividades da futura empresa."
                  : step === 2
                    ? "Etapa 2 de 3: dados da empresa, servicos e enquadramento atual."
                    : "Etapa 3 de 3: detalhes operacionais finais."}
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
                      <p className="text-sm font-semibold text-foreground">Etapa {step} de {totalSteps}</p>
                      <p className="text-sm text-muted-foreground">
                        {step === 1
                          ? "Contato e contexto inicial"
                          : isOpeningCompany
                            ? "Descricao da futura empresa"
                            : step === 2
                              ? "Empresa, servicos e enquadramento"
                              : "Diagnostico operacional"}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">{progressPercentage}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border/70">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>

                {step === 1 ? (
                  <>
                    <div className="space-y-2">
                      <FieldLabel htmlFor="public-contact" required>
                        Qual o seu nome?
                      </FieldLabel>
                      <Input
                        id="public-contact"
                        value={form.contact_name}
                        onChange={(event) => patchForm({ contact_name: event.target.value })}
                        placeholder="Digite seu nome"
                        autoComplete="name"
                        required
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <FieldLabel htmlFor="public-phone" required>
                          Qual o seu telefone?
                        </FieldLabel>
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
                        <FieldLabel htmlFor="public-email" required>
                          Qual o seu e-mail?
                        </FieldLabel>
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
                      <FieldLabel required>
                        Voce ja tem empresa ou procura abertura de empresa?
                      </FieldLabel>
                      <RadioGroup
                        value={form.company_maturity}
                        onValueChange={handleCompanyMaturityChange}
                        className="grid gap-3"
                      >
                        {COMPANY_MATURITY_OPTIONS.map((option) => {
                          const checked = form.company_maturity === option.value;
                          return (
                            <label
                              key={option.value}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-background p-4 transition-colors",
                                checked && "border-accent/40 bg-accent/5 shadow-sm",
                              )}
                            >
                              <RadioGroupItem value={option.value} className="mt-0.5" />
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">{option.label}</p>
                                <p className="text-sm text-muted-foreground">
                                  {option.value === "existing_company"
                                    ? "Tenho interesse em uma proposta para minha empresa"
                                    : "Tenho interesse em servicos de abertura de empresa"}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </RadioGroup>
                    </div>

                    <Button type="button" variant="accent" className="w-full font-semibold" onClick={goToSecondStep}>
                      Continuar para etapa 2
                    </Button>
                  </>
                ) : isOpeningCompany ? (
                  <>
                    <div className="space-y-2">
                      <FieldLabel htmlFor="public-future-company-activities" required>
                        Descreva as atividades da sua futura empresa
                      </FieldLabel>
                      <Textarea
                        id="public-future-company-activities"
                        rows={6}
                        value={form.future_company_activities}
                        onChange={(event) => patchForm({ future_company_activities: event.target.value })}
                        placeholder="Ex.: prestacao de servicos, comercio, consultoria, tecnologia..."
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
                ) : step === 2 ? (
                  <>
                    <div className="space-y-2">
                      <FieldLabel htmlFor="public-company" required>
                        Qual o nome da sua empresa?
                      </FieldLabel>
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
                      <FieldLabel required>Qual servico voce esta buscando?</FieldLabel>
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
                            {FORM_SERVICE_TYPE_OPTIONS.map((serviceType) => {
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
                                    className="mt-1"
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

                    <div className="space-y-2">
                      <FieldLabel htmlFor="public-cnpj" required>
                        CNPJ da empresa
                      </FieldLabel>
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
                      <FieldLabel required>Regime tributario atual</FieldLabel>
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

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <FieldLabel htmlFor="public-revenue-managerial" required>
                          Faturamento medio mensal gerencial
                        </FieldLabel>
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
                        <FieldLabel htmlFor="public-revenue-fiscal" required>
                          Faturamento medio mensal fiscal
                        </FieldLabel>
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

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button type="button" variant="outline" className="w-full sm:flex-1" onClick={() => setStep(1)}>
                        Voltar para etapa 1
                      </Button>
                      <Button type="button" variant="accent" className="w-full font-semibold sm:flex-1" onClick={goToThirdStep}>
                        Continuar para etapa 3
                      </Button>
                    </div>
                  </>
                ) : (
                  <>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <FieldLabel htmlFor="public-invoices" required>
                          Quantidade media de NF emitidas por mes
                        </FieldLabel>
                        <Input
                          id="public-invoices"
                          value={form.monthly_invoice_count}
                          onChange={(event) => patchForm({ monthly_invoice_count: event.target.value })}
                          placeholder="Ex.: 85"
                          inputMode="numeric"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <FieldLabel htmlFor="public-payroll" required>
                          Valor bruto medio da folha de pagamentos
                        </FieldLabel>
                        <Input
                          id="public-payroll"
                          value={form.payroll_gross_value}
                          onChange={(event) => patchForm({ payroll_gross_value: event.target.value })}
                          placeholder="Ex.: 58000"
                          inputMode="decimal"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <FieldLabel htmlFor="public-employees-clt" required>
                          Numero de funcionarios CLT
                        </FieldLabel>
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
                        <FieldLabel htmlFor="public-employees-pj" required>
                          Numero de funcionarios PJ
                        </FieldLabel>
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

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <FieldLabel htmlFor="public-bank-count" required>
                          Quantas contas bancarias?
                        </FieldLabel>
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
                        <FieldLabel required>Separadas por projeto/centro de custo?</FieldLabel>
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
                      <FieldLabel htmlFor="public-financial-system" required>
                        Qual sistema financeiro voces utilizam?
                      </FieldLabel>
                      <Input
                        id="public-financial-system"
                        value={form.financial_system}
                        onChange={(event) => patchForm({ financial_system: event.target.value })}
                        placeholder="Ex.: Omie, Conta Azul, ERP proprio"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <FieldLabel htmlFor="public-pain-points" required>
                        Quais sao as principais dores da empresa em relacao a contabilidade atual e a motivacao por trocar?
                      </FieldLabel>
                      <Textarea
                        id="public-pain-points"
                        rows={4}
                        value={form.accounting_pain_points}
                        onChange={(event) => patchForm({ accounting_pain_points: event.target.value })}
                        placeholder="Descreva o contexto atual, dificuldades e o que voces esperam melhorar."
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button type="button" variant="outline" className="w-full sm:flex-1" onClick={() => setStep(2)}>
                        Voltar para etapa 2
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

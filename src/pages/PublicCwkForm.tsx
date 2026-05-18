import { useMemo, useState } from "react";
import { z } from "zod";
import { Check, CheckCircle2, Loader2, Send } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { UF_OPTIONS } from "@/lib/constants";
import { formatCnpj, formatPhone, isValidLeadPhone } from "@/lib/lead-form";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import cwkLogo from "@/assets/cwk-logo.png";

const CWK_UNIT_OPTIONS = [
  { value: "CWK Lourdes", label: "Lourdes" },
  { value: "CWK Savassi", label: "Savassi" },
  { value: "CWK Santa Efigenia", label: "Santa Efigênia" },
] as const;

const CWK_PLAN_OPTIONS = [
  { value: "virtual_fiscal", label: "Virtual Fiscal", serviceType: "Coworking - Escritorio Virtual" },
  { value: "virtual_full", label: "Virtual Full", serviceType: "Coworking - Escritorio Virtual" },
  { value: "part_time", label: "Part-time", serviceType: "Coworking - Estacao Compartilhada" },
  { value: "full_time", label: "Full-time", serviceType: "Coworking - Estacao Compartilhada" },
  { value: "private", label: "Private", serviceType: "Coworking - Sala Privativa" },
  { value: "meeting_room", label: "Sala de Reunião", serviceType: "Coworking - Salas de Reuniao" },
] as const;

const yesNoOptions = [
  { value: "Sim", label: "Sim" },
  { value: "Nao", label: "Não" },
] as const;

const offeringHighlights = [
  {
    title: "Escritório Virtual",
    description: "Presença empresarial com praticidade.",
    items: ["Central de recados", "Endereço comercial"],
  },
  {
    title: "Escritório Compartilhado",
    description: "Flexibilidade com estrutura pronta.",
    items: ["Mobilidade", "Networking"],
  },
  {
    title: "Sala Privativa",
    description: "Mais foco e autonomia para a equipe.",
    items: ["Privacidade", "Redução de custos"],
  },
  {
    title: "Salas para Reuniões",
    description: "Espaços preparados para encontros importantes.",
    items: ["Multimídia", "Serviço de copa"],
  },
] as const;

const addressRequiredPlans = new Set(["virtual_fiscal", "virtual_full"]);

const representativeSchema = z.object({
  name: z.string().trim(),
  cpf: z.string().trim(),
  email: z.string().trim(),
  phone: z.string().trim(),
});

const contactSchema = z.object({
  name: z.string().trim(),
  email: z.string().trim(),
  phone: z.string().trim(),
});

const stepOneSchema = z.object({
  unit: z.string().trim().min(1, "Selecione a unidade CWK."),
  plan: z.string().trim().min(1, "Selecione o plano desejado."),
  company_or_person: z.string().trim().min(2, "Informe a razão social."),
  trade_name: z.string().trim().min(2, "Informe o nome fantasia."),
  cnpj: z.string().trim().min(14, "Informe o CNPJ da empresa."),
  main_activity: z.string().trim().min(2, "Informe a atividade principal."),
  company_email: z.string().trim().email("Informe um e-mail válido da empresa."),
  company_phone: z.string().trim(),
  contract_change_interest: z.string().trim().min(1, "Informe se há interesse em abertura ou alteração contratual."),
  hp_field: z.string().trim().max(0, "Campo inválido."),
});

const stepTwoSchema = z.object({
  address: z.string().trim(),
  neighborhood: z.string().trim(),
  city: z.string().trim(),
  uf: z.string().trim(),
  cep: z.string().trim(),
  representative_one: representativeSchema,
  representative_two: representativeSchema,
});

const stepThreeSchema = z.object({
  financial_contact: contactSchema,
  commercial_contact: contactSchema,
  message_contact_name: z.string().trim(),
  message_contact_email: z.string().trim(),
  message_contact_phone: z.string().trim(),
  notes: z.string().trim(),
  declarationAccepted: z.boolean(),
});

type RepresentativeForm = z.infer<typeof representativeSchema>;
type ContactForm = z.infer<typeof contactSchema>;

type FormState = {
  unit: string;
  plan: string;
  company_or_person: string;
  trade_name: string;
  cnpj: string;
  main_activity: string;
  company_email: string;
  company_phone: string;
  contract_change_interest: string;
  address: string;
  neighborhood: string;
  city: string;
  uf: string;
  cep: string;
  representative_one: RepresentativeForm;
  representative_two: RepresentativeForm;
  financial_contact: ContactForm;
  commercial_contact: ContactForm;
  message_contact_name: string;
  message_contact_email: string;
  message_contact_phone: string;
  notes: string;
  declarationAccepted: boolean;
  hp_field: string;
};

const emptyRepresentative = (): RepresentativeForm => ({
  name: "",
  cpf: "",
  email: "",
  phone: "",
});

const emptyContact = (): ContactForm => ({
  name: "",
  email: "",
  phone: "",
});

const initialForm: FormState = {
  unit: "",
  plan: "",
  company_or_person: "",
  trade_name: "",
  cnpj: "",
  main_activity: "",
  company_email: "",
  company_phone: "",
  contract_change_interest: "",
  address: "",
  neighborhood: "",
  city: "",
  uf: "",
  cep: "",
  representative_one: emptyRepresentative(),
  representative_two: emptyRepresentative(),
  financial_contact: emptyContact(),
  commercial_contact: emptyContact(),
  message_contact_name: "",
  message_contact_email: "",
  message_contact_phone: "",
  notes: "",
  declarationAccepted: false,
  hp_field: "",
};

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

const digitsOnly = (value: string) => value.replace(/\D/g, "");

const formatCep = (value: string) => {
  const digits = digitsOnly(value).slice(0, 8);
  if (!digits) return "";
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const formatCpf = (value: string) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const isValidCpf = (value: string) => digitsOnly(value).length === 11;

const hasRepresentativeData = (representative: RepresentativeForm) =>
  Object.values(representative).some((value) => value.trim());

const hasContactData = (contact: ContactForm) =>
  Object.values(contact).some((value) => value.trim());

const isAddressRequired = (plan: string, contractChangeInterest: string) =>
  addressRequiredPlans.has(plan) || contractChangeInterest === "Sim";

const formatRepresentativeBlock = (title: string, representative: RepresentativeForm) => {
  if (!hasRepresentativeData(representative)) return null;

  return [
    title,
    `Nome: ${representative.name || "-"}`,
    `CPF: ${representative.cpf || "-"}`,
    `E-mail: ${representative.email || "-"}`,
    `Telefone: ${representative.phone || "-"}`,
  ].join("\n");
};

const formatContactBlock = (title: string, contact: ContactForm) => {
  if (!hasContactData(contact)) return null;

  return [
    title,
    `Nome: ${contact.name || "-"}`,
    `E-mail: ${contact.email || "-"}`,
    `Telefone: ${contact.phone || "-"}`,
  ].join("\n");
};

const PublicCwkForm = () => {
  const [form, setForm] = useState<FormState>(initialForm);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  const selectedUnit = useMemo(
    () => CWK_UNIT_OPTIONS.find((item) => item.value === form.unit) ?? null,
    [form.unit],
  );
  const selectedPlan = useMemo(
    () => CWK_PLAN_OPTIONS.find((item) => item.value === form.plan) ?? null,
    [form.plan],
  );
  const progressPercentage = Math.round((step / 3) * 100);
  const addressRequired = isAddressRequired(form.plan, form.contract_change_interest);

  const patchForm = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const patchRepresentative = (
    key: "representative_one" | "representative_two",
    patch: Partial<RepresentativeForm>,
  ) => {
    setForm((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }));
  };

  const patchContact = (
    key: "financial_contact" | "commercial_contact",
    patch: Partial<ContactForm>,
  ) => {
    setForm((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }));
  };

  const validateStepOne = () => {
    const parsed = stepOneSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos obrigatórios.");
      return false;
    }

    if (!isValidLeadPhone(form.company_phone)) {
      toast.error("Informe um telefone válido da empresa.");
      return false;
    }

    return true;
  };

  const validateStepTwo = () => {
    const parsed = stepTwoSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os dados do representante legal.");
      return false;
    }

    if (addressRequired) {
      if (!form.address.trim()) {
      toast.error("Informe o endereço da empresa.");
        return false;
      }
      if (!form.neighborhood.trim()) {
        toast.error("Informe o bairro da empresa.");
        return false;
      }
      if (!form.city.trim()) {
        toast.error("Informe a cidade da empresa.");
        return false;
      }
      if (!form.uf.trim()) {
        toast.error("Selecione a UF da empresa.");
        return false;
      }
      if (digitsOnly(form.cep).length < 8) {
        toast.error("Informe um CEP válido.");
        return false;
      }
    }

    if (!form.representative_one.name.trim()) {
      toast.error("Informe o nome do representante legal principal.");
      return false;
    }
    if (!isValidCpf(form.representative_one.cpf)) {
      toast.error("Informe um CPF válido para o representante legal principal.");
      return false;
    }
    if (!form.representative_one.email.trim()) {
      toast.error("Informe o e-mail do representante legal principal.");
      return false;
    }
    if (!isValidLeadPhone(form.representative_one.phone)) {
      toast.error("Informe um telefone válido para o representante legal principal.");
      return false;
    }

    if (hasRepresentativeData(form.representative_two)) {
      if (form.representative_two.cpf && !isValidCpf(form.representative_two.cpf)) {
        toast.error("O CPF do segundo representante legal está inválido.");
        return false;
      }
      if (form.representative_two.phone && !isValidLeadPhone(form.representative_two.phone)) {
        toast.error("O telefone do segundo representante legal está inválido.");
        return false;
      }
    }

    return true;
  };

  const validateStepThree = () => {
    const parsed = stepThreeSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os contatos finais.");
      return false;
    }

    if (!form.financial_contact.name.trim()) {
      toast.error("Informe o nome do contato financeiro.");
      return false;
    }
    if (!form.financial_contact.email.trim()) {
      toast.error("Informe o e-mail do contato financeiro.");
      return false;
    }
    if (!form.declarationAccepted) {
      toast.error("Confirme a declaração de veracidade dos dados para continuar.");
      return false;
    }

    if (form.commercial_contact.phone.trim() && !isValidLeadPhone(form.commercial_contact.phone)) {
      toast.error("O telefone do contato comercial está inválido.");
      return false;
    }

    if (form.message_contact_phone.trim() && !isValidLeadPhone(form.message_contact_phone)) {
      toast.error("O telefone para atendimento e recados está inválido.");
      return false;
    }

    return true;
  };

  const goToNextStep = () => {
    if (step === 1 && !validateStepOne()) return;
    if (step === 2 && !validateStepTwo()) return;
    setStep((current) => Math.min(current + 1, 3) as 1 | 2 | 3);
  };

  const goToPreviousStep = () => {
    setStep((current) => Math.max(current - 1, 1) as 1 | 2 | 3);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateStepOne() || !validateStepTwo() || !validateStepThree()) {
      return;
    }

    if (!selectedUnit || !selectedPlan) {
      toast.error("Selecione a unidade e o plano para continuar.");
      return;
    }

    setLoading(true);

    const primaryContactName = form.representative_one.name.trim();
    const primaryContactEmail = form.company_email.trim();
    const primaryContactPhone = formatPhone(form.company_phone);

    const diagnosisBlocks = [
      [
        "Ficha cadastral CWK",
        `Unidade escolhida: ${selectedUnit.value}`,
        `Plano escolhido: ${selectedPlan.label}`,
        `Interesse em abertura de empresa ou alteração contratual: ${form.contract_change_interest}`,
      ].join("\n"),
      [
        "Dados da empresa",
        `Razão social: ${form.company_or_person}`,
        `Nome fantasia: ${form.trade_name}`,
        `CNPJ: ${form.cnpj}`,
        `Atividade principal: ${form.main_activity}`,
        `E-mail da empresa: ${form.company_email}`,
        `Telefone principal: ${form.company_phone}`,
        addressRequired
          ? `Endereço: ${form.address || "-"}`
          : "Endereço: a confirmar em etapa posterior",
        addressRequired
          ? `Bairro: ${form.neighborhood || "-"}`
          : "Bairro: a confirmar em etapa posterior",
        addressRequired
          ? `Cidade/UF: ${[form.city, form.uf].filter(Boolean).join("/") || "-"}`
          : "Cidade/UF: a confirmar em etapa posterior",
        addressRequired
          ? `CEP: ${form.cep || "-"}`
          : "CEP: a confirmar em etapa posterior",
      ].join("\n"),
      formatRepresentativeBlock("Representante legal principal", form.representative_one),
      formatRepresentativeBlock("Segundo representante legal", form.representative_two),
      formatContactBlock("Contato financeiro", form.financial_contact),
      formatContactBlock("Contato comercial", form.commercial_contact),
      form.message_contact_name || form.message_contact_email || form.message_contact_phone
        ? [
            "Atendimento e recados",
            `Nome: ${form.message_contact_name || "-"}`,
            `E-mail: ${form.message_contact_email || "-"}`,
            `Telefone: ${form.message_contact_phone || "-"}`,
          ].join("\n")
        : null,
      form.notes.trim() ? ["Observações adicionais", form.notes.trim()].join("\n") : null,
    ].filter(Boolean);

    const additionalContacts = [
      {
        id: "cwk-legal-main",
        name: primaryContactName ? `Representante legal - ${primaryContactName}` : "",
        phone: form.representative_one.phone,
        email: form.representative_one.email,
      },
      {
        id: "cwk-legal-secondary",
        name: form.representative_two.name ? `Segundo representante - ${form.representative_two.name}` : "",
        phone: form.representative_two.phone,
        email: form.representative_two.email,
      },
      {
        id: "cwk-financial-contact",
        name: form.financial_contact.name ? `Contato financeiro - ${form.financial_contact.name}` : "",
        phone: form.financial_contact.phone,
        email: form.financial_contact.email,
      },
      {
        id: "cwk-commercial-contact",
        name: form.commercial_contact.name ? `Contato comercial - ${form.commercial_contact.name}` : "",
        phone: form.commercial_contact.phone,
        email: form.commercial_contact.email,
      },
      {
        id: "cwk-message-contact",
        name: form.message_contact_name ? `Atendimento e recados - ${form.message_contact_name}` : "",
        phone: form.message_contact_phone,
        email: form.message_contact_email,
      },
    ].filter((contact) => contact.name || contact.phone || contact.email);

    const { data, error } = await supabase.functions.invoke("public-lead-intake", {
      body: {
        target_funnel_name: selectedUnit.value,
        company_maturity: "existing_company",
        company_or_person: form.company_or_person.trim(),
        contact_name: primaryContactName,
        service_types: [selectedPlan.serviceType],
        service_details: [
          `Plano escolhido: ${selectedPlan.label}`,
          `Unidade escolhida: ${selectedUnit.value}`,
          `Nome fantasia: ${form.trade_name.trim()}`,
        ].join("\n"),
        phone: primaryContactPhone,
        email: primaryContactEmail,
        cnpj: formatCnpj(form.cnpj),
        city: form.city.trim(),
        uf: form.uf,
        segment: "Coworking",
        segment_other: `${selectedUnit.value} | ${selectedPlan.label}`,
        source: "Ficha cadastral CWK",
        accounting_pain_points: diagnosisBlocks.join("\n\n"),
        additional_contacts: additionalContacts,
        notes: form.notes.trim(),
        hp_field: form.hp_field,
        ...utmContext,
      },
    });

    if (error) {
      setLoading(false);
      if (error instanceof FunctionsHttpError) {
        try {
          const payload = await error.context.json();
          toast.error(String(payload?.error || "Não foi possível enviar a ficha cadastral."));
          return;
        } catch {
          toast.error("Não foi possível enviar a ficha cadastral.");
          return;
        }
      }

      toast.error(error.message || "Não foi possível enviar a ficha cadastral.");
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
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#4f2878_0%,#5e3187_52%,#ff7f2a_125%)] px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_52%)]" />
      <div className="pointer-events-none absolute -left-20 top-12 h-72 w-72 rounded-full bg-[#ff8b3d]/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-12 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
        <section className="pt-4 text-white">
          <div className="inline-flex rounded-[32px] bg-white/12 px-7 py-5 shadow-[0_18px_60px_rgba(22,12,40,0.28)] backdrop-blur">
            <img
              src={cwkLogo}
              alt="CWK Coworking"
              className="h-28 w-auto object-contain opacity-100 drop-shadow-[0_8px_24px_rgba(255,255,255,0.14)] sm:h-32"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </div>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.32em] text-white/70">Ficha cadastral</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            A forma corporativa de fazer coworking
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/82 sm:text-lg">
            Informe os dados da sua empresa e escolha os serviços CWK que fazem sentido para o seu negócio.
            Nós cuidamos do próximo passo.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {offeringHighlights.map((highlight) => (
              <div
                key={highlight.title}
                className="rounded-[26px] border border-white/14 bg-white/10 p-5 text-white shadow-[0_14px_40px_rgba(26,14,45,0.18)] backdrop-blur"
              >
                <h3 className="text-lg font-bold leading-tight sm:text-xl">{highlight.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/78">{highlight.description}</p>
                <div className="mt-4 space-y-2">
                  {highlight.items.map((item) => (
                    <div key={item} className="flex items-start gap-2.5 text-sm text-white/92">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7ef0cc]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <Card className="border-0 bg-white shadow-[0_24px_80px_rgba(28,18,45,0.32)]">
          <CardHeader className="space-y-3 border-b border-slate-100 bg-[linear-gradient(180deg,#fff_0%,#faf7fd_100%)]">
            <div className="inline-flex w-fit rounded-full bg-[#f4ebff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#4f2878]">
              Cadastro empresarial
            </div>
            <CardTitle className="text-3xl font-black tracking-tight text-slate-900">
              Preencha sua ficha cadastral
            </CardTitle>
            <CardDescription>
              {step === 1 && "Comece com os dados principais da empresa, a unidade desejada e o plano ideal."}
              {step === 2 && "Agora informe o representante legal e, se necessário, os dados complementares da empresa."}
              {step === 3 && "Finalize com os contatos importantes e confirme o envio das informações."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {submitted ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <h2 className="mt-4 text-lg font-semibold text-slate-900">Ficha enviada com sucesso</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Recebemos seus dados e nossa equipe dará continuidade ao atendimento.
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
                  Enviar outra ficha
                </Button>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={submit}>
                <div className="space-y-3 rounded-2xl border border-[#4f2878]/10 bg-[#f7f4fb] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Etapa {step} de 3</p>
                    </div>
                    <span className="text-sm font-semibold text-[#4f2878]">{progressPercentage}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#4f2878_0%,#ff7f2a_100%)] transition-all duration-300"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>

                {step === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <FieldLabel required>Unidade CWK escolhida</FieldLabel>
                      <RadioGroup
                        value={form.unit}
                        onValueChange={(value) => patchForm({ unit: value })}
                        className="grid gap-3 sm:grid-cols-3"
                      >
                        {CWK_UNIT_OPTIONS.map((unit) => {
                          const checked = form.unit === unit.value;
                          return (
                            <label
                              key={unit.value}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-colors",
                                checked && "border-[#4f2878] bg-[#f7f0ff] shadow-sm",
                              )}
                            >
                              <RadioGroupItem value={unit.value} className="mt-1" />
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{unit.label}</p>
                              </div>
                            </label>
                          );
                        })}
                      </RadioGroup>
                    </div>

                    <div className="space-y-2">
                      <FieldLabel required>Plano escolhido</FieldLabel>
                      <Select value={form.plan || undefined} onValueChange={(value) => patchForm({ plan: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o plano" />
                        </SelectTrigger>
                        <SelectContent>
                          {CWK_PLAN_OPTIONS.map((plan) => (
                            <SelectItem key={plan.value} value={plan.value}>
                              {plan.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <FieldLabel htmlFor="cwk-company-name" required>Razão social</FieldLabel>
                      <Input
                        id="cwk-company-name"
                        value={form.company_or_person}
                        onChange={(event) => patchForm({ company_or_person: event.target.value })}
                        placeholder="Digite a razão social da empresa"
                        autoComplete="organization"
                        required
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <FieldLabel htmlFor="cwk-trade-name" required>Nome fantasia</FieldLabel>
                        <Input
                          id="cwk-trade-name"
                          value={form.trade_name}
                          onChange={(event) => patchForm({ trade_name: event.target.value })}
                          placeholder="Digite o nome fantasia"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <FieldLabel htmlFor="cwk-cnpj" required>CNPJ</FieldLabel>
                        <Input
                          id="cwk-cnpj"
                          value={form.cnpj}
                          onChange={(event) => patchForm({ cnpj: formatCnpj(event.target.value) })}
                          placeholder="00.000.000/0000-00"
                          inputMode="numeric"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <FieldLabel htmlFor="cwk-main-activity" required>Atividade principal</FieldLabel>
                      <Textarea
                        id="cwk-main-activity"
                        rows={4}
                        value={form.main_activity}
                        onChange={(event) => patchForm({ main_activity: event.target.value })}
                        placeholder="Descreva a atividade principal da empresa"
                        required
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <FieldLabel htmlFor="cwk-company-email" required>E-mail da empresa</FieldLabel>
                        <Input
                          id="cwk-company-email"
                          type="email"
                          value={form.company_email}
                          onChange={(event) => patchForm({ company_email: event.target.value })}
                          placeholder="empresa@domínio.com"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <FieldLabel htmlFor="cwk-company-phone" required>Celular ou telefone principal</FieldLabel>
                        <Input
                          id="cwk-company-phone"
                          value={form.company_phone}
                          onChange={(event) => patchForm({ company_phone: formatPhone(event.target.value) })}
                          placeholder="(31) 99999-9999"
                          inputMode="tel"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <FieldLabel required>Interesse em abertura de empresa ou alteração contratual?</FieldLabel>
                      <RadioGroup
                        value={form.contract_change_interest}
                        onValueChange={(value) => patchForm({ contract_change_interest: value })}
                        className="grid gap-3 sm:grid-cols-2"
                      >
                        {yesNoOptions.map((option) => (
                          <label key={option.value} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                            <RadioGroupItem value={option.value} />
                            <span className="text-sm font-medium text-slate-800">{option.label}</span>
                          </label>
                        ))}
                      </RadioGroup>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <RepresentativeSection
                      title="Representante legal principal"
                      representative={form.representative_one}
                      onPatch={(patch) => patchRepresentative("representative_one", patch)}
                      required
                    />

                    <Card className="border-slate-200">
                      <CardContent className="space-y-4 p-5">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">Dados complementares da empresa</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {addressRequired
                              ? "Como este plano ou solicitação exige endereço, estes campos são obrigatórios."
                              : "Preencha se já quiser adiantar esses dados."}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <FieldLabel htmlFor="cwk-address" required={addressRequired} optional={!addressRequired}>
                            Endereço da empresa
                          </FieldLabel>
                          <Input
                            id="cwk-address"
                            value={form.address}
                            onChange={(event) => patchForm({ address: event.target.value })}
                            placeholder="Rua, número e complemento"
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <FieldLabel htmlFor="cwk-neighborhood" required={addressRequired} optional={!addressRequired}>
                              Bairro
                            </FieldLabel>
                            <Input
                              id="cwk-neighborhood"
                              value={form.neighborhood}
                              onChange={(event) => patchForm({ neighborhood: event.target.value })}
                              placeholder="Digite o bairro"
                            />
                          </div>

                          <div className="space-y-2">
                            <FieldLabel htmlFor="cwk-cep" required={addressRequired} optional={!addressRequired}>
                              CEP
                            </FieldLabel>
                            <Input
                              id="cwk-cep"
                              value={form.cep}
                              onChange={(event) => patchForm({ cep: formatCep(event.target.value) })}
                              placeholder="00000-000"
                              inputMode="numeric"
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                          <div className="space-y-2">
                            <FieldLabel htmlFor="cwk-city" required={addressRequired} optional={!addressRequired}>
                              Cidade
                            </FieldLabel>
                            <Input
                              id="cwk-city"
                              value={form.city}
                              onChange={(event) => patchForm({ city: event.target.value })}
                              placeholder="Digite a cidade"
                            />
                          </div>

                          <div className="space-y-2">
                            <FieldLabel required={addressRequired} optional={!addressRequired}>UF</FieldLabel>
                            <Select value={form.uf || undefined} onValueChange={(value) => patchForm({ uf: value })}>
                              <SelectTrigger>
                                <SelectValue placeholder="UF" />
                              </SelectTrigger>
                              <SelectContent>
                                {UF_OPTIONS.map((uf) => (
                                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <RepresentativeSection
                      title="Segundo representante legal"
                      representative={form.representative_two}
                      onPatch={(patch) => patchRepresentative("representative_two", patch)}
                    />
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-5">
                    <ContactSection
                      title="Contato financeiro"
                      description="Importante para cobrança, boletos, notas e recorrência."
                      contact={form.financial_contact}
                      onPatch={(patch) => patchContact("financial_contact", patch)}
                      requiredName
                      requiredEmail
                    />

                    <ContactSection
                      title="Contato comercial"
                      description="Opcional. Se não preencher, usaremos os dados principais da empresa e do representante."
                      contact={form.commercial_contact}
                      onPatch={(patch) => patchContact("commercial_contact", patch)}
                    />

                    <Card className="border-slate-200">
                      <CardContent className="space-y-4 p-5">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">Atendimento e envio de recados</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Preencha apenas se o plano exigir atendimento telefônico ou recepção personalizada.
                          </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <FieldLabel htmlFor="cwk-message-contact-name" optional>Nome para atendimento</FieldLabel>
                            <Input
                              id="cwk-message-contact-name"
                              value={form.message_contact_name}
                              onChange={(event) => patchForm({ message_contact_name: event.target.value })}
                              placeholder="Nome do responsável"
                            />
                          </div>

                          <div className="space-y-2">
                            <FieldLabel htmlFor="cwk-message-contact-email" optional>E-mail para atendimento</FieldLabel>
                            <Input
                              id="cwk-message-contact-email"
                              type="email"
                              value={form.message_contact_email}
                              onChange={(event) => patchForm({ message_contact_email: event.target.value })}
                              placeholder="atendimento@empresa.com"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <FieldLabel htmlFor="cwk-message-contact-phone" optional>Telefone para atendimento</FieldLabel>
                          <Input
                            id="cwk-message-contact-phone"
                            value={form.message_contact_phone}
                            onChange={(event) => patchForm({ message_contact_phone: formatPhone(event.target.value) })}
                            placeholder="(31) 99999-9999"
                            inputMode="tel"
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <div className="space-y-2">
                      <FieldLabel htmlFor="cwk-notes" optional>Observações adicionais</FieldLabel>
                      <Textarea
                        id="cwk-notes"
                        rows={4}
                        value={form.notes}
                        onChange={(event) => patchForm({ notes: event.target.value })}
                        placeholder="Se quiser, registre alguma observação complementar."
                      />
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-4">
                      <Checkbox
                        checked={form.declarationAccepted}
                        onCheckedChange={(checked) => patchForm({ declarationAccepted: Boolean(checked) })}
                        className="mt-1"
                      />
                      <span className="text-sm leading-6 text-slate-700">
                        Declaro que as informações preenchidas são verdadeiras e autorizo o contato da CWK para
                        continuidade do atendimento.
                      </span>
                    </label>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  {step > 1 && (
                    <Button type="button" variant="outline" className="w-full sm:flex-1" onClick={goToPreviousStep}>
                      Voltar
                    </Button>
                  )}
                  {step < 3 ? (
                    <Button
                      type="button"
                      className="w-full bg-[#4f2878] font-semibold text-white hover:bg-[#442169] sm:flex-1"
                      onClick={goToNextStep}
                    >
                      Continuar
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      className="w-full bg-[#ff7f2a] font-semibold text-white hover:bg-[#ef7422] sm:flex-1"
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Enviar ficha cadastral
                    </Button>
                  )}
                </div>

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

const RepresentativeSection = ({
  title,
  representative,
  onPatch,
  required = false,
}: {
  title: string;
  representative: RepresentativeForm;
  onPatch: (patch: Partial<RepresentativeForm>) => void;
  required?: boolean;
}) => (
  <Card className="border-slate-200">
    <CardContent className="space-y-4 p-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>

      <div className="space-y-2">
        <FieldLabel required={required}>Nome completo</FieldLabel>
        <Input
          value={representative.name}
          onChange={(event) => onPatch({ name: event.target.value })}
          placeholder="Nome completo"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel required={required}>CPF</FieldLabel>
          <Input
            value={representative.cpf}
            onChange={(event) => onPatch({ cpf: formatCpf(event.target.value) })}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel required={required}>Telefone</FieldLabel>
          <Input
            value={representative.phone}
            onChange={(event) => onPatch({ phone: formatPhone(event.target.value) })}
            placeholder="(31) 99999-9999"
            inputMode="tel"
          />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel required={required}>E-mail</FieldLabel>
        <Input
          type="email"
          value={representative.email}
          onChange={(event) => onPatch({ email: event.target.value })}
          placeholder="nome@empresa.com"
        />
      </div>
    </CardContent>
  </Card>
);

const ContactSection = ({
  title,
  description,
  contact,
  onPatch,
  requiredName = false,
  requiredEmail = false,
}: {
  title: string;
  description: string;
  contact: ContactForm;
  onPatch: (patch: Partial<ContactForm>) => void;
  requiredName?: boolean;
  requiredEmail?: boolean;
}) => (
  <Card className="border-slate-200">
    <CardContent className="space-y-4 p-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>

      <div className="space-y-2">
        <FieldLabel required={requiredName}>Nome completo</FieldLabel>
        <Input
          value={contact.name}
          onChange={(event) => onPatch({ name: event.target.value })}
          placeholder="Nome do contato"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel required={requiredEmail}>E-mail</FieldLabel>
          <Input
            type="email"
            value={contact.email}
            onChange={(event) => onPatch({ email: event.target.value })}
            placeholder="contato@empresa.com"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel optional>Telefone</FieldLabel>
          <Input
            value={contact.phone}
            onChange={(event) => onPatch({ phone: formatPhone(event.target.value) })}
            placeholder="(31) 99999-9999"
            inputMode="tel"
          />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default PublicCwkForm;

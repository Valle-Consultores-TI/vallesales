import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { FunctionsHttpError } from "@supabase/supabase-js";
import {
  CheckCircle2,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { UF_OPTIONS } from "@/lib/constants";
import { FORM_SERVICE_TYPE_OPTIONS, formatPhone, isValidLeadPhone } from "@/lib/lead-form";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import valleLogo from "@/assets/valle-logo-full.png";
import referralTeamImage from "@/assets/valle-indicacao-team.jpg";

const formSchema = z.object({
  referrer_name: z.string().trim().min(2, "Informe seu nome."),
  referrer_company: z.string().trim(),
  referrer_email: z.string().trim().email("Informe um e-mail válido."),
  referrer_phone: z.string().trim(),
  referred_company_or_person: z.string().trim(),
  referred_contact_name: z.string().trim().min(2, "Informe o nome do contato indicado."),
  referred_email: z.string().trim(),
  referred_phone: z.string().trim(),
  city: z.string().trim(),
  uf: z.string().trim(),
  notes: z.string().trim(),
  hp_field: z.string().trim().max(0, "Campo inválido."),
});

type FormState = {
  referrer_name: string;
  referrer_company: string;
  referrer_email: string;
  referrer_phone: string;
  referred_company_or_person: string;
  referred_contact_name: string;
  referred_email: string;
  referred_phone: string;
  city: string;
  uf: string;
  service_types: string[];
  notes: string;
  hp_field: string;
};

type SubmitResponse = {
  ok: boolean;
  tracking_token: string;
  lead_id: string;
  referred_company_or_person: string;
  referred_contact_name: string;
};

type StatusStep = {
  key: string;
  label: string;
  description: string;
  status: "complete" | "current" | "upcoming";
};

type StatusResponse = {
  ok: boolean;
  tracking_token: string;
  created_at: string;
  updated_at: string;
  referrer_name: string;
  referrer_company: string | null;
  referred_company_or_person: string;
  referred_contact_name: string | null;
  referred_email: string | null;
  referred_phone: string | null;
  current_stage: {
    key: string;
    label: string;
    description: string;
    is_terminal: boolean;
    is_won: boolean;
    is_lost: boolean;
  };
  timeline: StatusStep[];
  reward: {
    title: string;
    description: string;
    tone: "neutral" | "positive" | "muted";
  };
};

const initialForm: FormState = {
  referrer_name: "",
  referrer_company: "",
  referrer_email: "",
  referrer_phone: "",
  referred_company_or_person: "",
  referred_contact_name: "",
  referred_email: "",
  referred_phone: "",
  city: "",
  uf: "",
  service_types: [],
  notes: "",
  hp_field: "",
};

const presentationSteps = [
  {
    number: "01",
    title: "Você indica",
    description:
      "Preencha os dados da empresa ou profissional que deseja apresentar à Valle. Em poucos minutos, sua indicação será registrada.",
  },
  {
    number: "02",
    title: "A Valle entra em contato",
    description:
      "Nossa equipe assume a abordagem com uma estratégia própria, conduzindo a conversa de forma profissional e alinhada ao perfil do indicado.",
  },
  {
    number: "03",
    title: "Você acompanha a evolução",
    description:
      "Acompanhe o andamento da oportunidade diretamente pela página: contato realizado, reunião, proposta e próximos passos.",
  },
  {
    number: "04",
    title: "Resultado final",
    description:
      "Veja se a indicação avançou, se houve fechamento ou se a oportunidade não seguiu neste momento. Se virar cliente, você ganha um prêmio pela indicação.",
  },
] as const;

const whyIndicateCards = [
  {
    title: "Você conecta boas oportunidades",
    body: "Indique empresas ou profissionais que podem se beneficiar de uma consultoria estratégica, especializada e próxima.",
  },
  {
    title: "A Valle conduz o processo",
    body: "Você não precisa intermediar conversas, cobrar retornos ou acompanhar por fora. Nosso time assume o contato do início ao fim.",
  },
  {
    title: "Tudo fica transparente",
    body: "Você acompanha cada avanço da oportunidade em um só lugar, com clareza sobre contato, reunião, proposta, retorno e fechamento.",
  },
] as const;

const hypotheticalRewards = [
  {
    title: "Indicação recebida",
    body: "Sua indicação é registrada com sucesso e você recebe a confirmação com o código de acompanhamento.",
  },
  {
    title: "Reunião realizada",
    body: "Quando o cliente indicado realiza uma reunião com a Valle, você pode receber um reconhecimento especial pelo avanço da oportunidade.",
  },
  {
    title: "Contrato fechado",
    body: "Se a indicação se tornar cliente da Valle, você ganha um prêmio exclusivo, como bônus, desconto, cortesia, consultoria extra ou outro benefício definido pelo programa.",
  },
] as const;

const faqItems = [
  {
    question: "Posso indicar mais de um cliente?",
    answer:
      "Sim. Você pode indicar quantas empresas ou profissionais quiser. Cada indicação gera um registro próprio e pode ser acompanhada individualmente.",
  },
  {
    question: "Se o cliente fechar com a Valle, eu serei notificado?",
    answer:
      "Sim. Quando a oportunidade avançar ou chegar ao resultado final, você poderá acompanhar a atualização pelo código de acompanhamento. O programa foi pensado para dar transparência em todas as etapas, desde o primeiro contato até o fechamento.",
  },
  {
    question: "Como acompanho minha indicação?",
    answer:
      "Após enviar a indicação, você receberá um código de acompanhamento. Com esse código, basta acessar a área “Consulte sua indicação”, colar o código ou abrir o link recebido e verificar o status atualizado da oportunidade.",
  },
  {
    question: "Preciso falar com o cliente depois de indicar?",
    answer:
      "Apenas se você quiser. Depois que você envia a indicação, a equipe da Valle assume o contato e conduz o processo comercial com uma abordagem própria.",
  },
  {
    question: "O indicado saberá que fui eu que indiquei?",
    answer:
      "A Valle poderá mencionar a indicação de forma profissional durante a abordagem, quando isso fizer sentido para a conversa.",
  },
] as const;

const stepTone: Record<StatusStep["status"], string> = {
  complete: "border-success/20 bg-success/5",
  current: "border-accent/35 bg-accent/10 shadow-sm",
  upcoming: "border-border/70 bg-background",
};

const stepDotTone: Record<StatusStep["status"], string> = {
  complete: "bg-success text-success-foreground",
  current: "bg-accent text-accent-foreground",
  upcoming: "bg-muted text-muted-foreground",
};

const rewardTone: Record<StatusResponse["reward"]["tone"], string> = {
  neutral: "border-accent/25 bg-accent/5 text-foreground",
  positive: "border-success/20 bg-success/5 text-foreground",
  muted: "border-border/70 bg-secondary/40 text-foreground",
};

const referralTabs = [
  { key: "indicar", label: "Fazer indicação" },
  { key: "acompanhar", label: "Acompanhar indicação" },
] as const;

const lightFieldClassName = "bg-white text-slate-900 caret-slate-900 placeholder:text-slate-500 [color-scheme:light] [&:-webkit-autofill]:[-webkit-text-fill-color:#0f172a] [&:-webkit-autofill]:shadow-[inset_0_0_0px_1000px_#fff]";
const lightSelectTriggerClassName = "bg-white text-slate-900";

const ReferralProgram = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"indicar" | "acompanhar">("indicar");
  const [form, setForm] = useState<FormState>(initialForm);
  const [statusCode, setStatusCode] = useState(searchParams.get("codigo") ?? "");
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [submitted, setSubmitted] = useState<SubmitResponse | null>(null);
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);

  const trackingUrl = useMemo(() => {
    if (!submitted?.tracking_token) return "";
    return `${window.location.origin}/programa-indicacao?codigo=${submitted.tracking_token}`;
  }, [submitted?.tracking_token]);

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

  useEffect(() => {
    const tokenFromUrl = searchParams.get("codigo") ?? "";
    if (!tokenFromUrl) return;
    setStatusCode(tokenFromUrl);
    setActiveTab("acompanhar");
  }, [searchParams]);

  useEffect(() => {
    if (!statusCode.trim()) return;

    const intervalId = window.setInterval(() => {
      void loadStatus(statusCode.trim(), false);
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [statusCode]);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  const validateForm = () => {
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos obrigatórios.");
      return false;
    }

    if (!isValidLeadPhone(form.referrer_phone)) {
      toast.error("Informe um telefone válido para quem está indicando.");
      return false;
    }

    if (!isValidLeadPhone(form.referred_phone)) {
      toast.error("O telefone da pessoa indicada está inválido.");
      return false;
    }

    const referredEmail = form.referred_email.trim();
    const emailCheck = !referredEmail || z.string().email().safeParse(referredEmail).success;
    if (!emailCheck) {
      toast.error("O e-mail da pessoa indicada está inválido.");
      return false;
    }

    return true;
  };

  const loadStatus = async (token: string, showToast = true) => {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      if (showToast) toast.error("Informe o código de acompanhamento.");
      return;
    }

    setStatusLoading(true);

    const { data, error } = await supabase.functions.invoke("public-referral-program", {
      body: {
        action: "status",
        tracking_token: trimmedToken,
      },
    });

    if (error) {
      setStatusLoading(false);
      if (error instanceof FunctionsHttpError) {
        try {
          const payload = await error.context.json();
          if (showToast) toast.error(String(payload?.error || "Não foi possível carregar o acompanhamento."));
          return;
        } catch {
          if (showToast) toast.error("Não foi possível carregar o acompanhamento.");
          return;
        }
      }

      if (showToast) toast.error(error.message || "Não foi possível carregar o acompanhamento.");
      return;
    }

    if (data?.error) {
      setStatusLoading(false);
      if (showToast) toast.error(String(data.error));
      return;
    }

    setStatusLoading(false);
    setStatusData(data as StatusResponse);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    const { data, error } = await supabase.functions.invoke("public-referral-program", {
      body: {
        action: "submit",
        referrer_name: form.referrer_name.trim(),
        referrer_company: form.referrer_company.trim(),
        referrer_email: form.referrer_email.trim(),
        referrer_phone: formatPhone(form.referrer_phone),
        referred_company_or_person: form.referred_company_or_person.trim(),
        referred_contact_name: form.referred_contact_name.trim(),
        referred_email: form.referred_email.trim(),
        referred_phone: formatPhone(form.referred_phone),
        city: form.city.trim(),
        uf: form.uf || null,
        service_types: form.service_types,
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
          toast.error(String(payload?.error || "Não foi possível enviar a indicação."));
          return;
        } catch {
          toast.error("Não foi possível enviar a indicação.");
          return;
        }
      }

      toast.error(error.message || "Não foi possível enviar a indicação.");
      return;
    }

    if (data?.error) {
      setLoading(false);
      toast.error(String(data.error));
      return;
    }

    const nextData = data as SubmitResponse;
    setSubmitted(nextData);
    setForm(initialForm);
    setLoading(false);
    setActiveTab("acompanhar");
    setStatusCode(nextData.tracking_token);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("codigo", nextData.tracking_token);
      return next;
    });
    await loadStatus(nextData.tracking_token, false);
    scrollToSection("formulario-indicacao");
  };

  const handleCopy = async (value: string, successMessage: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error("Não foi possível copiar agora.");
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#2b3c46_0%,#314650_55%,#263740_100%)] text-white">
      <section className="relative overflow-hidden px-4 py-8 md:px-6 md:py-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.1),_transparent_40%)]" />
        <div className="pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative mx-auto max-w-6xl space-y-6">
          <div className="grid gap-6 md:grid-cols-2 md:items-start lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 shadow-sm backdrop-blur">
                <img src={valleLogo} alt="Valle Consultores" className="h-7 w-auto object-contain" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">
                  Valle Indicação
                </span>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-xl text-3xl font-bold tracking-tight text-white sm:text-[2.5rem]">
                  Valle Indicação
                </h1>
                <p className="max-w-xl text-lg font-medium text-white/88 sm:text-xl">
                  Indique, acompanhe e ganhe se fechar
                </p>
                <p className="max-w-xl text-sm leading-7 text-white/78 sm:text-base">
                  Conhece alguém que pode se beneficiar das soluções da Valle? Envie a indicação
                  em poucos minutos, acompanhe cada etapa por aqui e, se o cliente fechar
                  contrato, você receberá um prêmio especial.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="accent"
                  className="min-w-44"
                  onClick={() => {
                    setActiveTab("indicar");
                    scrollToSection("formulario-indicacao");
                  }}
                >
                  Indique agora
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={() => {
                    setActiveTab("acompanhar");
                    scrollToSection("formulario-indicacao");
                  }}
                >
                  Acompanhar indicação
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.45)] backdrop-blur md:h-full md:min-h-[360px]">
              <div className="aspect-[4/3] h-full w-full md:min-h-[360px] md:aspect-auto">
                <img
                  src={referralTeamImage}
                  alt="Equipe Valle em atendimento"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>

        </div>
      </section>

      <section className="px-4 pb-8 md:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="border-white/10 bg-white/8 text-white shadow-[0_24px_50px_-24px_rgba(0,0,0,0.35)] backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl text-white">Como funciona o Valle Indicação</CardTitle>
              <CardDescription className="text-white/68">
                Um fluxo simples para você indicar, acompanhar e ver o resultado da sua oportunidade.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-4">
                {presentationSteps.map((step, index) => (
                  <div key={step.number} className="relative">
                    {index < presentationSteps.length - 1 && (
                      <div className="absolute left-[2.2rem] top-12 hidden h-[2px] w-[calc(100%-1rem)] bg-gradient-to-r from-accent/80 to-white/15 lg:block" />
                    )}
                    <div className="relative h-full rounded-[1.75rem] border border-white/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.06)_100%)] p-5 shadow-[0_18px_30px_-22px_rgba(0,0,0,0.45)]">
                      <div className="mb-5 inline-flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-[1.45rem] bg-accent p-2 text-[1.35rem] font-bold leading-none tracking-[-0.03em] text-white shadow-[0_10px_18px_-12px_rgba(0,0,0,0.65)]">
                        {step.number}
                      </div>
                      <p className="text-lg font-semibold text-white">{step.title}</p>
                      <p className="mt-2 text-sm leading-6 text-white/76">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="formulario-indicacao" className="px-4 pb-10 md:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="border-0 bg-[#f8f5f1] text-slate-900 shadow-[0_24px_50px_-24px_rgba(0,0,0,0.45)]">
            <CardHeader className="space-y-4">
              <div className="flex rounded-full border border-[#ddd4ca] bg-white/80 p-1">
                {referralTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={cn(
                      "flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                      activeTab === tab.key
                        ? "bg-primary text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-900",
                    )}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div>
                <CardTitle className="text-xl text-slate-900">
                  {activeTab === "indicar" ? "Fazer indicação" : "Consulte sua indicação"}
                </CardTitle>
                <CardDescription className="mt-1 text-slate-600">
                  {activeTab === "indicar"
                    ? "Preencha os dados e envie sua indicação para a Valle."
                    : "Use o código gerado no envio para acompanhar o status da sua oportunidade."}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
              {activeTab === "indicar" ? (
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-3 rounded-2xl border border-[#e3d8ce] bg-white p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">Dados de quem está indicando</p>
                      <p className="text-xs text-slate-600">
                        Preencha abaixo com os seus dados, não com os dados da pessoa indicada.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="referrer-name">Seu nome *</Label>
                      <Input
                        id="referrer-name"
                        className={lightFieldClassName}
                        value={form.referrer_name}
                        onChange={(event) => patchForm({ referrer_name: event.target.value })}
                        placeholder="Seu nome"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="referrer-company">Sua empresa</Label>
                      <Input
                        id="referrer-company"
                        className={lightFieldClassName}
                        value={form.referrer_company}
                        onChange={(event) => patchForm({ referrer_company: event.target.value })}
                        placeholder="Nome da sua empresa"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="referrer-email">Seu e-mail *</Label>
                        <Input
                          id="referrer-email"
                          className={lightFieldClassName}
                          type="email"
                          value={form.referrer_email}
                          onChange={(event) => patchForm({ referrer_email: event.target.value })}
                          placeholder="voce@empresa.com"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="referrer-phone">Seu telefone/WhatsApp *</Label>
                        <Input
                          id="referrer-phone"
                          className={lightFieldClassName}
                          value={form.referrer_phone}
                          onChange={(event) => patchForm({ referrer_phone: formatPhone(event.target.value) })}
                          placeholder="(31) 99999-9999"
                          inputMode="tel"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-[#e3d8ce] bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">Quem você quer indicar</p>

                    <div className="space-y-2">
                      <Label htmlFor="referred-contact">Nome do contato *</Label>
                      <Input
                        id="referred-contact"
                        className={lightFieldClassName}
                        value={form.referred_contact_name}
                        onChange={(event) => patchForm({ referred_contact_name: event.target.value })}
                        placeholder="Nome da pessoa"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="referred-company">Empresa ou pessoa</Label>
                      <Input
                        id="referred-company"
                        className={lightFieldClassName}
                        value={form.referred_company_or_person}
                        onChange={(event) => patchForm({ referred_company_or_person: event.target.value })}
                        placeholder="Nome da empresa ou profissional"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="referred-phone">Telefone/WhatsApp *</Label>
                        <Input
                          id="referred-phone"
                          className={lightFieldClassName}
                          value={form.referred_phone}
                          onChange={(event) => patchForm({ referred_phone: formatPhone(event.target.value) })}
                          placeholder="(31) 99999-9999"
                          inputMode="tel"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="referred-email">E-mail</Label>
                        <Input
                          id="referred-email"
                          className={lightFieldClassName}
                          type="email"
                          value={form.referred_email}
                          onChange={(event) => patchForm({ referred_email: event.target.value })}
                          placeholder="contato@empresa.com"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                      <div className="space-y-2">
                        <Label htmlFor="referred-city">Cidade</Label>
                        <Input
                          id="referred-city"
                          className={lightFieldClassName}
                          value={form.city}
                          onChange={(event) => patchForm({ city: event.target.value })}
                          placeholder="Cidade"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>UF</Label>
                        <Select value={form.uf || undefined} onValueChange={(value) => patchForm({ uf: value })}>
                          <SelectTrigger className={lightSelectTriggerClassName}>
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
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Serviços de interesse</Label>
                      <div className="grid gap-2 rounded-2xl border border-[#e5ddd4] bg-[#faf7f3] p-3">
                        {FORM_SERVICE_TYPE_OPTIONS.map((serviceType) => {
                          const checked = form.service_types.includes(serviceType);
                          return (
                            <label
                              key={serviceType}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-xl border border-transparent px-3 py-2 transition-colors",
                                checked && "border-accent/30 bg-accent/5",
                              )}
                            >
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                onCheckedChange={(value) => toggleServiceType(serviceType, Boolean(value))}
                              />
                              <span className="text-sm text-slate-900">{serviceType}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="referral-notes">Por que esta indicação faz sentido?</Label>
                      <Textarea
                        id="referral-notes"
                        className={lightFieldClassName}
                        rows={4}
                        value={form.notes}
                        onChange={(event) => patchForm({ notes: event.target.value })}
                        placeholder="Conte rapidamente qual necessidade você enxerga, por que acredita que a Valle pode ajudar e se essa pessoa já conhece nossa empresa."
                      />
                    </div>
                  </div>

                  <Button type="submit" variant="accent" className="w-full font-semibold" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Enviar para a Valle
                  </Button>

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
              ) : (
                <div className="space-y-5">
                  <div className="space-y-3 rounded-2xl border border-[#e3d8ce] bg-white p-4">
                    <div className="space-y-1">
                      <Label htmlFor="status-code">Código de acompanhamento</Label>
                      <p className="text-sm text-slate-600">
                        Cole o código ou acesse pelo link recebido.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Input
                        id="status-code"
                        className={lightFieldClassName}
                        value={statusCode}
                        onChange={(event) => setStatusCode(event.target.value)}
                        placeholder="Cole o código ou acesse pelo link recebido."
                      />
                      <Button
                        type="button"
                        variant="accent"
                        className="sm:min-w-36"
                        onClick={() => {
                          const trimmed = statusCode.trim();
                          setSearchParams((current) => {
                            const next = new URLSearchParams(current);
                            if (trimmed) next.set("codigo", trimmed);
                            else next.delete("codigo");
                            return next;
                          });
                          void loadStatus(trimmed);
                        }}
                        disabled={statusLoading}
                      >
                        {statusLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                        Consultar
                      </Button>
                    </div>
                    <p className="text-xs leading-5 text-slate-600">
                      O andamento é atualizado conforme a oportunidade avança no funil comercial da Valle.
                    </p>
                  </div>

                  {submitted ? (
                    <Card className="border-success/25 bg-success/5">
                      <CardContent className="space-y-4 p-4">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-success text-success-foreground">
                            <CheckCircle2 className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">Indicação recebida</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">
                              {submitted.referred_company_or_person} entrou no fluxo do Valle Indicação.
                              O próximo passo é abrir ou guardar o link de acompanhamento abaixo.
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                          <div className="rounded-2xl border border-success/20 bg-white px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Código gerado
                            </p>
                            <p className="mt-1 break-all text-sm font-semibold text-slate-900">{submitted.tracking_token}</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-auto rounded-2xl px-4 py-3"
                            onClick={() => handleCopy(submitted.tracking_token, "Código copiado.")}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copiar código
                          </Button>
                        </div>

                        {trackingUrl && (
                          <div className="space-y-3 rounded-2xl border border-accent/30 bg-accent/10 p-4 shadow-sm">
                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Próximo passo
                              </p>
                              <p className="text-sm font-semibold text-slate-900">
                                Use este link para acompanhar sua indicação.
                              </p>
                              <p className="text-sm text-slate-600">
                                Abra agora ou copie para guardar. Esse é o link que você vai usar depois.
                              </p>
                            </div>

                            <div className="rounded-2xl border border-white/80 bg-white px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Link de acompanhamento
                              </p>
                              <p className="mt-1 break-all text-sm font-medium text-slate-900">{trackingUrl}</p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <Button asChild type="button" variant="accent" className="h-auto rounded-2xl px-4 py-3 font-semibold">
                                <a href={trackingUrl}>
                                  Abrir acompanhamento
                                </a>
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-auto rounded-2xl border-accent/25 bg-white px-4 py-3 font-semibold"
                                onClick={() => handleCopy(trackingUrl, "Link copiado.")}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copiar link
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : null}

                  {statusData ? (
                    <Card className="border-[#e5d7c8] bg-white">
                      <CardContent className="space-y-5 p-5">
                        <div className="flex flex-col gap-3 rounded-2xl bg-[linear-gradient(135deg,#2b3c46_0%,#3d505b_100%)] p-5 text-white">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">
                                Etapa atual
                              </p>
                              <h3 className="mt-2 text-2xl font-bold">{statusData.current_stage.label}</h3>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                              <Sparkles className="h-3.5 w-3.5" />
                              Valle Indicação
                            </span>
                          </div>
                          <p className="max-w-2xl text-sm leading-6 text-white/75">
                            {statusData.current_stage.description}
                          </p>
                        </div>

                        <div className={cn("rounded-2xl border p-4", rewardTone[statusData.reward.tone])}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Reconhecimento hipotético
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{statusData.reward.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{statusData.reward.description}</p>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">Linha do tempo</p>
                            <p className="text-xs text-slate-500">
                              Atualizado em {new Date(statusData.updated_at).toLocaleString("pt-BR")}
                            </p>
                          </div>

                          <div className="space-y-3">
                            {statusData.timeline.map((step, index) => (
                              <div
                                key={step.key}
                                className={cn(
                                  "flex items-start gap-3 rounded-2xl border p-4 transition-colors",
                                  stepTone[step.status],
                                )}
                              >
                                <span
                                  className={cn(
                                    "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                    stepDotTone[step.status],
                                  )}
                                >
                                  {step.status === "complete" ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                                  <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="relative px-4 py-10 md:px-6">
        <div className="pointer-events-none absolute inset-x-0 top-10 h-[78%] bg-[linear-gradient(180deg,rgba(193,157,126,0.16)_0%,rgba(233,220,206,0.08)_100%)]" />
        <div className="pointer-events-none absolute inset-x-10 top-16 h-[70%] rounded-[2.5rem] border border-white/6 bg-white/[0.03] blur-[0.5px]" />

        <div className="relative mx-auto max-w-6xl space-y-6">
          <Card className="border-0 bg-[#f8f5f1] text-slate-900 shadow-[0_20px_44px_-26px_rgba(0,0,0,0.35)]">
            <CardHeader>
              <CardTitle className="text-xl text-slate-900">Por que indicar para a Valle?</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              {whyIndicateCards.map((item) => (
                <div key={item.title} className="rounded-[1.6rem] border border-[#e3d8ce] bg-white p-5">
                  <p className="text-base font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-0 bg-[#f8f5f1] text-slate-900 shadow-[0_20px_44px_-26px_rgba(0,0,0,0.35)]">
            <CardHeader>
              <CardTitle className="text-xl text-slate-900">Reconhecimento pela sua indicação</CardTitle>
              <CardDescription className="text-slate-600">
                O Valle Indicação também foi criado para reconhecer quem ajuda a conectar a Valle a novas oportunidades.
              </CardDescription>
              <p className="text-sm leading-7 text-slate-600">
                Cada indicação registrada pode gerar benefícios conforme a evolução da oportunidade no processo comercial.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-3">
              {hypotheticalRewards.map((item) => (
                <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-[#e3d8ce] bg-white px-4 py-4">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary text-white">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-4 pb-10 md:px-6">
        <div className="mx-auto max-w-6xl">
          <Card className="border-white/10 bg-white/8 text-white shadow-[0_20px_44px_-26px_rgba(0,0,0,0.35)] backdrop-blur">
            <CardHeader>
              <CardTitle className="text-xl text-white">Perguntas frequentes</CardTitle>
              <CardDescription className="text-white/68">
                Passe o mouse sobre cada pergunta para ver a resposta.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {faqItems.map((item) => (
                <div
                  key={item.question}
                  className="group rounded-[1.6rem] border border-white/12 bg-white/6 p-5 transition-all duration-200 hover:border-white/25 hover:bg-white/10"
                >
                  <p className="text-sm font-semibold leading-6 text-white">{item.question}</p>
                  <div className="grid transition-all duration-300 group-hover:grid-rows-[1fr] md:grid-rows-[0fr]">
                    <div className="overflow-hidden">
                      <p className="pt-3 text-sm leading-7 text-white/72">{item.answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default ReferralProgram;

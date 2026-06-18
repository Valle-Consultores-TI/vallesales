import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { CheckCircle2, Copy, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { ClientPortalAccessClaimCard } from "@/components/client/ClientPortalAccessClaimCard";
import { ClientPortalShell } from "@/components/client/ClientPortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useClientPortalReferrals, useSubmitClientReferral } from "@/hooks/useClientPortal";
import { UF_OPTIONS } from "@/lib/constants";
import { FORM_SERVICE_TYPE_OPTIONS, formatPhone, isValidLeadPhone } from "@/lib/lead-form";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  referred_company_or_person: z.string().trim(),
  referred_contact_name: z.string().trim().min(2, "Informe o nome do contato indicado."),
  referred_email: z.string().trim().email("Informe um e-mail valido."),
  referred_phone: z.string().trim(),
  city: z.string().trim(),
  uf: z.string().trim(),
  notes: z.string().trim(),
  hp_field: z.string().trim().max(0, "Campo invalido."),
});

type FormState = {
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

const initialForm: FormState = {
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

const rewardTone = {
  neutral: "border-accent/25 bg-accent/10",
  positive: "border-success/25 bg-success/10",
  muted: "border-white/10 bg-white/5",
} as const;

const ClientPortalReferrals = () => {
  const { clientId = "" } = useParams<{ clientId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState<FormState>(initialForm);
  const [submittedToken, setSubmittedToken] = useState<string | null>(null);
  const selectedProjectId = searchParams.get("projeto");
  const referralsQuery = useClientPortalReferrals(selectedProjectId, !!clientId);
  const submitReferral = useSubmitClientReferral();

  const utmContext = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      utmTerm: params.get("utm_term"),
      utmContent: params.get("utm_content"),
      landingPath: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer || null,
    };
  }, []);

  if (referralsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (referralsQuery.error || !referralsQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        {referralsQuery.error instanceof Error ? referralsQuery.error.message : "Não foi possível carregar as indicações."}
      </div>
    );
  }

  const { client, projects, referrals, activeProjectId, claimRequired, claimDocumentValidationMode } = referralsQuery.data;

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
      toast.error(parsed.error.issues[0]?.message ?? "Revise os campos obrigatorios.");
      return false;
    }

    if (!isValidLeadPhone(form.referred_phone)) {
      toast.error("Informe um telefone/WhatsApp valido.");
      return false;
    }

    return true;
  };

  const handleCopy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Não foi possível copiar agora.");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;

    try {
      const result = await submitReferral.mutateAsync({
        projectId: activeProjectId,
        referredCompanyOrPerson: form.referred_company_or_person.trim(),
        referredContactName: form.referred_contact_name.trim(),
        referredEmail: form.referred_email.trim(),
        referredPhone: formatPhone(form.referred_phone),
        city: form.city.trim(),
        uf: form.uf || "",
        serviceTypes: form.service_types,
        notes: form.notes.trim(),
        hpField: form.hp_field,
        ...utmContext,
      });

      setSubmittedToken(result.tracking_token);
      setForm(initialForm);
      toast.success(result.duplicate ? "Essa indicação já havia sido registrada recentemente." : "Indicação enviada para a Valle.");
    } catch {
      // Errors are already handled by the mutation.
    }
  };

  return (
    <ClientPortalShell
      clientId={clientId}
      client={client}
      activeTab="indicacoes"
      title="Indique novos contatos sem preencher seus dados novamente"
      description="Como você já está identificado no portal, basta informar os dados do indicado. O histórico das suas indicações fica salvo abaixo."
    >
      {claimRequired ? (
        <ClientPortalAccessClaimCard claimDocumentValidationMode={claimDocumentValidationMode} />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="border-white/10 bg-white/8 text-white shadow-none backdrop-blur">
          <CardContent className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">Nova indicação</p>
              <p className="text-sm leading-7 text-white/68">
                Preencha somente os dados do indicado. O cliente logado será associado automaticamente a esta indicação.
              </p>
            </div>

            {projects.length > 1 ? (
              <div className="space-y-2">
                <Label className="text-white">Projeto vinculado</Label>
                <Select
                  value={activeProjectId ?? undefined}
                  onValueChange={(value) => {
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      next.set("projeto", value);
                      return next;
                    });
                  }}
                >
                  <SelectTrigger className="border-white/10 bg-white/10 text-white">
                    <SelectValue placeholder="Escolha um projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.displayName ?? "Projeto Valle"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="referred-contact" className="text-white">Nome do contato *</Label>
                <Input
                  id="referred-contact"
                  value={form.referred_contact_name}
                  onChange={(event) => patchForm({ referred_contact_name: event.target.value })}
                  placeholder="Nome da pessoa"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="referred-company" className="text-white">Empresa ou pessoa</Label>
                <Input
                  id="referred-company"
                  value={form.referred_company_or_person}
                  onChange={(event) => patchForm({ referred_company_or_person: event.target.value })}
                  placeholder="Nome da empresa ou profissional"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="referred-phone" className="text-white">Telefone/WhatsApp *</Label>
                  <Input
                    id="referred-phone"
                    value={form.referred_phone}
                    onChange={(event) => patchForm({ referred_phone: formatPhone(event.target.value) })}
                    placeholder="(31) 99999-9999"
                    inputMode="tel"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referred-email" className="text-white">E-mail *</Label>
                  <Input
                    id="referred-email"
                    type="email"
                    value={form.referred_email}
                    onChange={(event) => patchForm({ referred_email: event.target.value })}
                    placeholder="contato@empresa.com"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-2">
                  <Label htmlFor="referred-city" className="text-white">Cidade</Label>
                  <Input
                    id="referred-city"
                    value={form.city}
                    onChange={(event) => patchForm({ city: event.target.value })}
                    placeholder="Cidade"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">UF</Label>
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
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-white">Servicos de interesse</Label>
                <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  {FORM_SERVICE_TYPE_OPTIONS.map((serviceType) => {
                    const checked = form.service_types.includes(serviceType);
                    return (
                      <label
                        key={serviceType}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border border-transparent px-3 py-2 transition-colors",
                          checked && "border-white/15 bg-white/10",
                        )}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          onCheckedChange={(value) => toggleServiceType(serviceType, Boolean(value))}
                        />
                        <span className="text-sm text-white">{serviceType}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="referral-notes" className="text-white">Por que esta indicação faz sentido?</Label>
                <Textarea
                  id="referral-notes"
                  rows={4}
                  value={form.notes}
                  onChange={(event) => patchForm({ notes: event.target.value })}
                  placeholder="Conte rapidamente qual necessidade você enxerga e por que acredita que a Valle pode ajudar."
                />
              </div>

              <Button type="submit" variant="accent" className="w-full font-semibold" disabled={submitReferral.isPending}>
                {submitReferral.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
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

            {submittedToken ? (
              <div className="rounded-2xl border border-success/25 bg-success/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-success text-success-foreground">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Indicacao registrada</p>
                    <p className="mt-1 text-sm leading-6 text-white/72">
                      O código de acompanhamento foi gerado para essa oportunidade.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <div className="flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white">
                    {submittedToken}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                    onClick={() => void handleCopy(submittedToken, "Código copiado.")}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar código
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/8 text-white shadow-none backdrop-blur">
          <CardContent className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">Suas indicações</p>
              <p className="text-sm leading-7 text-white/68">
                As oportunidades criadas com o seu login aparecem aqui com o status comercial mais recente.
              </p>
            </div>

            {referrals.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/72">
                Nenhuma indicação foi registrada com esta conta ainda.
              </div>
            ) : (
              <div className="space-y-4">
                {referrals.map((referral) => (
                  <div key={referral.id} className="rounded-[1.7rem] border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-white">{referral.referredCompanyOrPerson}</p>
                        <p className="mt-1 text-sm text-white/68">
                          {referral.referredContactName ?? "Contato principal não informado"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
                          {referral.currentStage.label}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                          onClick={() => void handleCopy(referral.trackingToken, "Código copiado.")}
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          Copiar código
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Etapa atual</p>
                      <p className="mt-2 text-sm font-semibold text-white">{referral.currentStage.label}</p>
                      <p className="mt-1 text-sm leading-6 text-white/68">{referral.currentStage.description}</p>
                    </div>

                    <div className={cn("mt-4 rounded-2xl border p-4", rewardTone[referral.reward.tone])}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Reconhecimento hipotetico</p>
                      <p className="mt-2 text-sm font-semibold text-white">{referral.reward.title}</p>
                      <p className="mt-1 text-sm leading-6 text-white/68">{referral.reward.description}</p>
                    </div>

                    <div className="mt-4 space-y-2">
                      {referral.timeline.map((step) => (
                        <div key={step.key} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                          <p className="text-sm font-semibold text-white">{step.label}</p>
                          <p className="mt-1 text-sm text-white/68">{step.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPortalShell>
  );
};

export default ClientPortalReferrals;

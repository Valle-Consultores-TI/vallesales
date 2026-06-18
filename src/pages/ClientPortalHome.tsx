import { useParams, Link } from "react-router-dom";
import { ArrowRight, Loader2, Target, Waypoints } from "lucide-react";

import { ClientPortalAccessClaimCard } from "@/components/client/ClientPortalAccessClaimCard";
import { ClientPortalShell } from "@/components/client/ClientPortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useClientPortalOverview } from "@/hooks/useClientPortal";

const actionCards = [
  {
    key: "acompanhar",
    title: "Acompanhar processos",
    description: "Visualize os projetos vinculados ao seu cadastro e acompanhe cada etapa em andamento.",
    icon: <Waypoints className="h-5 w-5" />,
    buildHref: (clientId: string) => `/cliente/${clientId}/acompanhar`,
  },
  {
    key: "indicacoes",
    title: "Indicações",
    description: "Envie novos indicados para a Valle e acompanhe as oportunidades que você abriu.",
    icon: <Target className="h-5 w-5" />,
    buildHref: (clientId: string) => `/cliente/${clientId}/indicacoes`,
  },
] as const;

const ClientPortalHome = () => {
  const { clientId = "" } = useParams<{ clientId: string }>();
  const overview = useClientPortalOverview(!!clientId);

  if (overview.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (overview.error || !overview.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
        {overview.error instanceof Error ? overview.error.message : "Não foi possível carregar o portal do cliente."}
      </div>
    );
  }

  const { client, projects, referralsCount, claimRequired, claimDocumentValidationMode } = overview.data;

  return (
    <ClientPortalShell
      clientId={clientId}
      client={client}
      activeTab="home"
      title="Sua jornada com a Valle em um só lugar"
      description="Escolha se deseja acompanhar seus processos em andamento ou registrar novas indicações diretamente no portal do cliente."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {actionCards.map((card) => (
          <Card key={card.key} className="border-white/10 bg-white/8 text-white shadow-none backdrop-blur">
            <CardContent className="space-y-4 p-5">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 text-white">
                {card.icon}
              </span>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-white">{card.title}</h2>
                <p className="text-sm leading-7 text-white/72">{card.description}</p>
              </div>
              <Button asChild variant="accent" className="w-full sm:w-auto">
                <Link to={card.buildHref(clientId)}>
                  Acessar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {claimRequired ? (
        <ClientPortalAccessClaimCard claimDocumentValidationMode={claimDocumentValidationMode} />
      ) : null}

      <Card className="border-white/10 bg-white/8 text-white shadow-none backdrop-blur">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-white">Resumo do seu portal</p>
              <p className="text-sm text-white/68">
                Tudo o que está vinculado ao seu login de cliente aparece aqui.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
                {projects.length} projeto(s)
              </Badge>
              <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
                {referralsCount} indicação(ões)
              </Badge>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/72">
              {claimRequired
                ? "Assim que o CPF/CNPJ for confirmado, seus projetos aparecerao aqui automaticamente."
                : "Nenhum projeto foi vinculado ao seu login ainda. Assim que a equipe da Valle conectar seu cadastro ao CRM, o acompanhamento aparecera aqui automaticamente."}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {projects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">{project.displayName ?? "Projeto Valle"}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/60">{project.flowLabel}</p>
                  <p className="mt-3 text-sm text-white/72">{project.statusLabel}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </ClientPortalShell>
  );
};

export default ClientPortalHome;

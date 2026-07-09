import { Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useClientPortalInvitationSetup } from "@/hooks/useClientPortal";
import type { Lead } from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type TrackingInviteCardProps = {
  lead: Lead;
};

const copyText = async (value: string, successMessage: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error("Não foi possível copiar agora.");
  }
};

export const TrackingInviteCard = ({ lead }: TrackingInviteCardProps) => {
  const directTrackingCode = lead.tracking_code?.trim() ?? "";
  const trackingSetup = useClientPortalInvitationSetup(
    lead.id,
    lead.entity_kind === "customer_tracking" && !directTrackingCode,
  );
  const relatedProject =
    trackingSetup.data?.projects.find((project) => project.currentTrackingLeadId === lead.id) ??
    trackingSetup.data?.projects[0] ??
    null;
  const trackingCode = directTrackingCode || relatedProject?.trackingCode?.trim() || "";

  if (lead.entity_kind !== "customer_tracking") return null;

  if (!trackingCode && trackingSetup.isLoading) {
    return (
      <Card className="col-span-2 space-y-3 border-accent/25 bg-accent/5 p-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Convite de acompanhamento</h4>
          <p className="text-xs text-muted-foreground">
            Buscando o código e o link deste projeto para montar a mensagem do cliente.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando dados do acompanhamento...
        </div>
      </Card>
    );
  }

  if (!trackingCode) {
    return (
      <Card className="col-span-2 space-y-3 border-destructive/25 bg-destructive/5 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Convite de acompanhamento</h4>
            <p className="text-xs text-muted-foreground">
              Não foi possível localizar um código de acompanhamento para este cliente.
            </p>
          </div>
          <Badge variant="outline" className="border-destructive/30 bg-background/70 text-destructive">
            Sem código
          </Badge>
        </div>
        <p className="text-sm text-destructive">
          {trackingSetup.error instanceof Error
            ? trackingSetup.error.message
            : "Nenhum projeto de acompanhamento foi encontrado para este cliente."}
        </p>
      </Card>
    );
  }

  const recipientName = lead.contact_name?.trim() || lead.company_or_person?.trim() || "cliente";
  const projectLabel = relatedProject?.displayName?.trim() || lead.company_or_person?.trim() || "Projeto Valle";
  const trackingUrl = `https://valle-sales.web.app/acompanhar?codigo=${encodeURIComponent(trackingCode)}`;
  const inviteMessage = [
    `Olá, ${recipientName}! Seu acompanhamento na Valle já está disponível.`,
    "",
    `Projeto: ${projectLabel}`,
    "",
    "Acesse pelo link abaixo:",
    trackingUrl,
    "",
    "Seu código de acompanhamento é:",
    trackingCode,
    "",
    "Se preferir, você também pode entrar na página de acompanhamento e informar esse código manualmente.",
  ].join("\n");

  return (
    <Card className="col-span-2 space-y-4 border-accent/25 bg-accent/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Convite de acompanhamento</h4>
          <p className="text-xs text-muted-foreground">
            Envie esta mensagem para o cliente acompanhar o projeto pela página isolada usando o código abaixo.
          </p>
        </div>
        <Badge variant="outline" className="border-accent/30 bg-background/70">
          Código {trackingCode}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-xl border border-border/70 bg-background/70 p-3 text-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Página de acompanhamento</p>
          <p className="mt-1 break-all font-medium text-foreground">{trackingUrl}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            O link já abre a consulta com o código preenchido para facilitar o acesso do cliente.
          </p>
        </div>

        <Textarea
          value={inviteMessage}
          readOnly
          rows={7}
          className="min-h-[11rem] resize-none bg-background/80 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="accent" onClick={() => void copyText(inviteMessage, "Convite copiado.")}>
          <Copy className="mr-2 h-4 w-4" />
          Copiar convite
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void copyText(trackingCode, "Código de acompanhamento copiado.")}>
          <Link2 className="mr-2 h-4 w-4" />
          Copiar código
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void copyText(trackingUrl, "Link de acompanhamento copiado.")}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Copiar link
        </Button>
      </div>
    </Card>
  );
};

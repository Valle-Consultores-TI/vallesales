import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useClaimClientPortalAccess } from "@/hooks/useClientPortal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ClientPortalAccessClaimCardProps = {
  claimDocumentValidationMode?: "disabled" | "optional" | "required";
};

const formatDocumentNumber = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 14);

  if (digits.length <= 11) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const hasValidDocumentLength = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14;
};

export const ClientPortalAccessClaimCard = ({
  claimDocumentValidationMode = "required",
}: ClientPortalAccessClaimCardProps) => {
  const claimAccess = useClaimClientPortalAccess();
  const [documentNumber, setDocumentNumber] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!hasValidDocumentLength(documentNumber)) {
      toast.error("Informe um CPF com 11 digitos ou um CNPJ com 14 digitos.");
      return;
    }

    try {
      await claimAccess.mutateAsync({
        documentNumber,
        trackingCode,
      });
    } catch {
      // Mutation toasts already handle the error feedback.
    }
  };

  const documentLabel =
    claimDocumentValidationMode === "disabled"
      ? "CPF ou CNPJ"
      : "CPF ou CNPJ do contrato";

  const showDocumentHint = claimDocumentValidationMode !== "disabled";

  return (
    <Card className="border-white/10 bg-white/8 text-white shadow-none backdrop-blur">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-white">Liberar meus projetos</p>
            <p className="text-sm leading-7 text-white/68">
              Nao encontramos um vinculo automatico confiavel para esta conta. Confirme seu CPF/CNPJ para liberar os
              projetos ja cadastrados no acompanhamento.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="space-y-2">
              <Label htmlFor="client-claim-document" className="text-white">
                {documentLabel}
              </Label>
              <Input
                id="client-claim-document"
                value={documentNumber}
                onChange={(event) => setDocumentNumber(formatDocumentNumber(event.target.value))}
                placeholder="Informe o CPF ou CNPJ"
                inputMode="numeric"
                required
              />
              {showDocumentHint ? (
                <p className="text-xs text-white/55">
                  Use o mesmo documento que estiver vinculado ao cadastro do projeto.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-claim-code" className="text-white">
                Codigo de acompanhamento
              </Label>
              <Input
                id="client-claim-code"
                value={trackingCode}
                onChange={(event) => setTrackingCode(event.target.value.toUpperCase())}
                placeholder="Opcional"
                autoCapitalize="characters"
              />
              <p className="text-xs text-white/55">Se voce tiver o codigo, ele ajuda a confirmar o vinculo.</p>
            </div>
          </div>

          {!hasValidDocumentLength(documentNumber) && documentNumber.trim() ? (
            <p className="text-sm text-amber-200">Informe um CPF com 11 digitos ou um CNPJ com 14 digitos.</p>
          ) : null}

          <Button type="submit" variant="accent" disabled={claimAccess.isPending || !hasValidDocumentLength(documentNumber)}>
            {claimAccess.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Liberar acesso
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

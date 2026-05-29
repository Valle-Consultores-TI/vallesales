import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shouldRequireDocument } from "@/lib/project-tracking";
import type { DocumentValidationMode } from "@/types/project-tracking";

type TrackingLookupFormProps = {
  trackingCode: string;
  documentNumber: string;
  documentValidationMode: DocumentValidationMode;
  loading: boolean;
  errorMessage: string | null;
  onTrackingCodeChange: (value: string) => void;
  onDocumentNumberChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export const TrackingLookupForm = ({
  trackingCode,
  documentNumber,
  documentValidationMode,
  loading,
  errorMessage,
  onTrackingCodeChange,
  onDocumentNumberChange,
  onSubmit,
}: TrackingLookupFormProps) => (
  <Card className="border-white/12 bg-white/[0.08] text-white shadow-[0_28px_60px_-30px_rgba(0,0,0,0.45)] backdrop-blur">
    <CardContent className="p-5 sm:p-6">
      <form className="space-y-6" onSubmit={onSubmit}>
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/62">
            Acesso ao acompanhamento
          </p>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
              Consulte sua jornada
            </h2>
            <p className="max-w-md text-sm leading-6 text-white/74">
              Informe o c\u00F3digo recebido para visualizar a etapa atual do seu projeto.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="tracking-code" className="text-white">
              C\u00F3digo de acompanhamento
            </Label>
            <Input
              id="tracking-code"
              value={trackingCode}
              onChange={(event) => onTrackingCodeChange(event.target.value)}
              placeholder="Ex: VALLE-8F42K9"
              className="h-12 rounded-2xl border-white/12 bg-white/92 text-slate-900 placeholder:text-slate-500"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>

          {shouldRequireDocument(documentValidationMode) ? (
            <div className="space-y-2">
              <Label htmlFor="document-number" className="text-white">
                CPF ou CNPJ
              </Label>
              <Input
                id="document-number"
                value={documentNumber}
                onChange={(event) => onDocumentNumberChange(event.target.value)}
                placeholder="Preencha se solicitado"
                className="h-12 rounded-2xl border-white/12 bg-white/92 text-slate-900 placeholder:text-slate-500"
                autoComplete="off"
                inputMode="numeric"
              />
            </div>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-[#f2c7c7] bg-[#fff4f4] px-4 py-3 text-sm leading-6 text-[#8d3b3b]">
            {errorMessage}
          </div>
        ) : null}

        <Button type="submit" variant="accent" size="lg" className="h-12 w-full rounded-2xl font-semibold" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Buscando acompanhamento..." : "Ver andamento"}
        </Button>
      </form>
    </CardContent>
  </Card>
);

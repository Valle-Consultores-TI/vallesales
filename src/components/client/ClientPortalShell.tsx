import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, LogOut, Pencil, Save, X } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { useUpdateClientPortalProfile } from "@/hooks/useClientPortal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ClientPortalIdentity } from "@/types/client-portal";
import valleLogo from "@/assets/valle-logo-full.png";

type ClientPortalShellProps = {
  clientId: string;
  client: ClientPortalIdentity | null;
  activeTab: "home" | "acompanhar" | "indicacoes";
  title: string;
  description: string;
  children: React.ReactNode;
};

const tabItems = [
  { key: "home", label: "Início", buildHref: (clientId: string) => `/cliente/${clientId}` },
  { key: "acompanhar", label: "Acompanhar processos", buildHref: (clientId: string) => `/cliente/${clientId}/acompanhar` },
  { key: "indicacoes", label: "Indicações", buildHref: (clientId: string) => `/cliente/${clientId}/indicacoes` },
] as const;

export const ClientPortalShell = ({
  clientId,
  client,
  activeTab,
  title,
  description,
  children,
}: ClientPortalShellProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const updateProfile = useUpdateClientPortalProfile();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(client?.fullName ?? "");

  useEffect(() => {
    if (!editingName) {
      setDraftName(client?.fullName ?? "");
    }
  }, [client?.fullName, editingName]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/cliente/auth", { replace: true });
  };

  const cancelNameEdit = () => {
    setDraftName(client?.fullName ?? "");
    setEditingName(false);
  };

  const handleSaveName = async () => {
    await updateProfile.mutateAsync({ fullName: draftName });
    setEditingName(false);
  };

  const hasNameChanged = draftName.trim() !== (client?.fullName ?? "").trim();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#2b3c46_0%,#314650_52%,#263740_100%)] text-white">
      <section className="relative overflow-hidden px-4 py-8 md:px-6 md:py-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.09),_transparent_42%)]" />
        <div className="pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/8 p-5 shadow-[0_24px_50px_-24px_rgba(0,0,0,0.35)] backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-white/10 bg-white/10 px-4 py-2">
                <img src={valleLogo} alt="Valle Consultores" className="h-7 w-auto object-contain" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Portal do cliente</p>
                <p className="truncate text-sm text-white/88">{client?.fullName ?? "Cliente Valle"}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {tabItems.map((tab) => (
                <Button
                  key={tab.key}
                  asChild
                  variant={activeTab === tab.key ? "accent" : "outline"}
                  className={cn(
                    "border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white",
                    activeTab === tab.key && "border-transparent",
                  )}
                >
                  <Link to={tab.buildHref(clientId)}>{tab.label}</Link>
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <h1 className="max-w-[14ch] text-[clamp(2.4rem,6vw,3.8rem)] font-bold leading-[0.96] tracking-[-0.04em] text-white">
                {title}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-white/76 sm:text-lg">
                {description}
              </p>
            </div>

            <Card className="border-white/10 bg-white/8 p-5 text-white shadow-none backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Conta conectada</p>
                {!editingName ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-white/72 hover:bg-white/10 hover:text-white"
                    onClick={() => setEditingName(true)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Editar nome
                  </Button>
                ) : null}
              </div>

              {editingName ? (
                <div className="mt-3 space-y-3">
                  <Input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    maxLength={120}
                    autoFocus
                    placeholder="Como você quer aparecer no portal"
                    className="border-white/15 bg-white/10 text-white placeholder:text-white/45"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleSaveName();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelNameEdit();
                      }
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      onClick={() => void handleSaveName()}
                      disabled={updateProfile.isPending || !draftName.trim() || !hasNameChanged}
                    >
                      {updateProfile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                      onClick={cancelNameEdit}
                      disabled={updateProfile.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-lg font-semibold text-white">{client?.fullName ?? "Cliente Valle"}</p>
                  <p className="mt-1 text-sm text-white/68">{client?.email ?? "Sem e-mail principal"}</p>
                </>
              )}
            </Card>
          </div>

          {children}
        </div>
      </section>
    </div>
  );
};

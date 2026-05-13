import { Link, Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useTheme } from "next-themes";
import { Loader2, Moon, Palette, SunMedium, UserRound, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { MyAccountSettings } from "@/components/settings/MyAccountSettings";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUiScale, type UiScale } from "@/hooks/useUiScale";
import { usePermissions } from "@/hooks/useUserRoles";
import { cn } from "@/lib/utils";
import { TeamManagement } from "./Equipe";

type SettingsSection = "account" | "appearance" | "team";

const Configuracoes = () => {
  const location = useLocation();
  const perms = usePermissions();

  const section: SettingsSection =
    location.pathname === "/configuracoes/equipe"
      ? "team"
      : location.pathname === "/configuracoes/aparencia"
        ? "appearance"
        : "account";

  if (section === "team" && !perms.isLoading && !perms.canManageTeam) {
    return <Navigate to="/configuracoes" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader active="configuracoes" />

      <div className="border-b border-border bg-card px-4 py-5 md:px-6">
        <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Configuracoes</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Preferencias da conta, aparencia do sistema e administracao de acesso
        </p>
      </div>

      <main className="mx-auto flex-1 w-full max-w-6xl px-4 py-6 md:px-6">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:pb-0">
              <SettingsNavItem
                to="/configuracoes"
                active={section === "account"}
                icon={<UserRound className="h-4 w-4" />}
                label="Minha conta"
              />
              <SettingsNavItem
                to="/configuracoes/aparencia"
                active={section === "appearance"}
                icon={<Palette className="h-4 w-4" />}
                label="Aparencia"
              />
              {perms.canManageTeam && (
                <SettingsNavItem
                  to="/configuracoes/equipe"
                  active={section === "team"}
                  icon={<Users className="h-4 w-4" />}
                  label="Equipe"
                />
              )}
            </nav>
          </aside>

          <div className="min-w-0">
            {section === "team" ? (
              perms.isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <TeamManagement />
              )
            ) : section === "appearance" ? (
              <ThemePreference />
            ) : (
              <MyAccountSettings profile={perms.profile} primaryRole={perms.primaryRole} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const SettingsNavItem = ({
  to,
  active,
  icon,
  label,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  label: string;
}) => (
  <Link
    to={to}
    className={cn(
      "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors",
      active
        ? "border-accent bg-accent text-accent-foreground"
        : "border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-foreground",
    )}
  >
    {icon}
    {label}
  </Link>
);

const ThemePreference = () => {
  const { theme, setTheme } = useTheme();
  const { scale, setScale } = useUiScale();
  const selectedTheme = theme === "dark" ? "dark" : "light";

  const handleThemeChange = (value: string) => {
    if (value === "light" || value === "dark") {
      setTheme(value);
    }
  };

  const handleScaleChange = (value: string) => {
    if (value === "compact" || value === "default" || value === "comfortable") {
      setScale(value as UiScale);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Aparencia</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Escolha como a interface deve aparecer neste navegador.
        </p>
      </div>

      <Card className="max-w-xl p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-foreground">Tema do sistema</p>
            <p className="mt-0.5 text-sm text-muted-foreground">A preferencia fica salva neste navegador.</p>
          </div>
          <ToggleGroup
            type="single"
            value={selectedTheme}
            onValueChange={handleThemeChange}
            className="justify-start rounded-lg border border-border bg-muted/40 p-1"
          >
            <ToggleGroupItem value="light" aria-label="Usar modo claro" className="gap-2 px-3">
              <SunMedium className="h-4 w-4" />
              Claro
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" aria-label="Usar modo escuro" className="gap-2 px-3">
              <Moon className="h-4 w-4" />
              Escuro
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </Card>

      <Card className="max-w-2xl p-5">
        <div className="space-y-4">
          <div>
            <p className="font-medium text-foreground">Tamanho e densidade da interface</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Isso ajuda quem usa o navegador com zoom reduzido para ver mais elementos, mas ainda quer leitura confortavel.
            </p>
          </div>

          <ToggleGroup
            type="single"
            value={scale}
            onValueChange={handleScaleChange}
            className="flex flex-wrap justify-start gap-2 rounded-lg border border-border bg-muted/40 p-2"
          >
            <ToggleGroupItem value="compact" aria-label="Usar modo compacto" className="px-3">
              Compacto
            </ToggleGroupItem>
            <ToggleGroupItem value="default" aria-label="Usar modo padrao" className="px-3">
              Padrao
            </ToggleGroupItem>
            <ToggleGroupItem value="comfortable" aria-label="Usar modo confortavel" className="px-3">
              Confortavel
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="grid gap-3 md:grid-cols-3">
            <ScalePreviewCard
              value="compact"
              title="Compacto"
              description="Mostra mais elementos na tela. Bom para quem prefere densidade maior."
              active={scale === "compact"}
              onClick={handleScaleChange}
            />
            <ScalePreviewCard
              value="default"
              title="Padrao"
              description="Mantem o equilibrio atual entre leitura e quantidade de informacao."
              active={scale === "default"}
              onClick={handleScaleChange}
            />
            <ScalePreviewCard
              value="comfortable"
              title="Confortavel"
              description="Aumenta texto, icones e espacos para melhorar a leitura com zoom baixo."
              active={scale === "comfortable"}
              onClick={handleScaleChange}
            />
          </div>
        </div>
      </Card>
    </section>
  );
};

const ScalePreviewCard = ({
  value,
  title,
  description,
  active,
  onClick,
}: {
  value: UiScale;
  title: string;
  description: string;
  active: boolean;
  onClick: (value: string) => void;
}) => (
  <button
    type="button"
    onClick={() => onClick(value)}
    className={cn(
      "rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
      active
        ? "border-accent bg-accent/8 shadow-sm"
        : "border-border bg-background hover:border-accent/40 hover:bg-accent/5",
    )}
  >
    <p className="font-medium text-foreground">{title}</p>
    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
  </button>
);

export default Configuracoes;

import { Link, Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useTheme } from "next-themes";
import { Loader2, Moon, Settings, SunMedium, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePermissions } from "@/hooks/useUserRoles";
import { cn } from "@/lib/utils";
import { TeamManagement } from "./Equipe";

type SettingsSection = "theme" | "team";

const Configuracoes = () => {
  const location = useLocation();
  const perms = usePermissions();
  const section: SettingsSection =
    location.pathname === "/configuracoes/equipe"
      ? "team"
      : "theme";

  if (section === "team" && !perms.isLoading && !perms.canManageTeam) {
    return <Navigate to="/configuracoes" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader active="configuracoes" />

      <div className="px-4 md:px-6 py-5 border-b border-border bg-card">
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">Configurações</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Preferências do sistema e administração de acesso
        </p>
      </div>

      <main className="flex-1 px-4 md:px-6 py-6 w-full max-w-6xl mx-auto">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <nav className="flex lg:flex-col gap-2 overflow-x-auto pb-1 lg:pb-0">
              <SettingsNavItem
                to="/configuracoes"
                active={section === "theme"}
                icon={<Settings className="h-4 w-4" />}
                label="Preferências"
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
            ) : (
              <ThemePreference />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const SettingsNavItem = ({
  to, active, icon, label,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  label: string;
}) => (
  <Link
    to={to}
    className={cn(
      "h-10 px-3 rounded-md border text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors",
      active
        ? "bg-accent text-accent-foreground border-accent"
        : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-accent/40"
    )}
  >
    {icon}
    {label}
  </Link>
);

const ThemePreference = () => {
  const { theme, setTheme } = useTheme();
  const selectedTheme = theme === "dark" ? "dark" : "light";

  const handleThemeChange = (value: string) => {
    if (value === "light" || value === "dark") {
      setTheme(value);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">Preferência de tema</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Escolha a aparência usada na interface
        </p>
      </div>

      <Card className="p-5 max-w-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-medium text-foreground">Tema do sistema</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              A preferência fica salva neste navegador
            </p>
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
    </section>
  );
};

export default Configuracoes;

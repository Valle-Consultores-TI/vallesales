import { Link } from "react-router-dom";
import { ContactRound, Kanban, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import valleSymbolWhite from "@/assets/valle-symbol-white.png";

type AppHeaderSection = "funil" | "contatos" | "dashboard" | "configuracoes";

export const AppHeader = ({ active }: { active: AppHeaderSection }) => {
  const { signOut, user } = useAuth();

  const navClass = (section: AppHeaderSection) =>
    cn(
      "h-8",
      active === section
        ? "bg-header-active/10 text-header-foreground hover:bg-header-active/15"
        : "text-header-muted hover:bg-header-hover/10 hover:text-header-foreground"
    );

  return (
    <header className="bg-gradient-header text-header-foreground shadow-sm border-b border-header-border">
      <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="inline-flex rounded-2xl bg-white/10 p-2 shadow-sm backdrop-blur">
            <img src={valleSymbolWhite} alt="Valle" className="h-5 w-5 shrink-0 object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-base md:text-lg leading-tight truncate tracking-tight">Valle Sales</h1>
            <p className="text-[11px] text-header-muted leading-tight truncate tracking-wider font-medium">CRM Comercial</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-header-surface/5 rounded-lg p-1">
          <Link to="/">
            <Button variant="ghost" size="sm" className={navClass("funil")}>
              <Kanban className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Funil</span>
            </Button>
          </Link>
          <Link to="/contatos">
            <Button variant="ghost" size="sm" className={navClass("contatos")}>
              <ContactRound className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Contatos</span>
            </Button>
          </Link>
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className={navClass("dashboard")}>
              <LayoutDashboard className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Dashboard</span>
            </Button>
          </Link>
          <Link to="/configuracoes">
            <Button variant="ghost" size="sm" className={navClass("configuracoes")}>
              <Settings className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Configurações</span>
            </Button>
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <span className="hidden md:block text-sm text-header-muted truncate max-w-[200px]">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-header-foreground hover:bg-header-hover/10 hover:text-header-foreground">
            <LogOut className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Sair</span>
          </Button>
        </div>
      </div>
    </header>
  );
};

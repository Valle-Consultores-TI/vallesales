import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/useUserRoles";
import { Building2, Clock3, ShieldAlert } from "lucide-react";

const AguardandoAprovacao = () => {
  const { signOut } = useAuth();
  const perms = usePermissions();

  const title = perms.isSuspended
    ? "Acesso suspenso"
    : perms.isInactive
      ? "Acesso inativo"
      : "Aguardando aprovacao";

  const description = perms.isSuspended
    ? "Seu acesso operacional foi suspenso. Entre em contato com um administrador para regularizar a conta."
    : perms.isInactive
      ? "Sua conta esta inativa no momento. Um administrador pode reativar o acesso quando necessario."
      : "Sua conta foi criada, mas ainda precisa ser aprovada por um administrador ou gestor antes de acessar o CRM.";

  return (
    <div className="min-h-screen bg-gradient-header px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <Card className="w-full max-w-xl border-0 p-8 shadow-elevated">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-accent p-3 text-accent-foreground shadow-sm">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Valle Sales
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-5">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-warning/12 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-warning">
              {perms.isPending ? <Clock3 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              {perms.statusLabel}
            </div>
            <p className="text-sm leading-6 text-foreground">{description}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Enquanto isso, voce pode sair da conta e aguardar a liberacao do acesso.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{perms.profile?.email ?? "Conta sem e-mail informado"}</span>
            <Button variant="outline" onClick={signOut}>
              Sair
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AguardandoAprovacao;

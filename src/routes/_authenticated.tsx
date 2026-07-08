import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, ROLE_LABELS } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  FileText,
  Upload,
  BarChart3,
  Shield,
  LogOut,
  Wallet,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AuthedLayout,
});

const nav: { to: string; label: string; icon: any; adminOnly?: boolean; hideForRoles?: string[]; clienteOnly?: boolean; hideForCliente?: boolean }[] = [
  { to: "/minhas-parcelas", label: "Minhas Parcelas", icon: Receipt, clienteOnly: true },
  { to: "/", label: "Dashboard", icon: LayoutDashboard, hideForCliente: true },
  { to: "/clientes", label: "Clientes", icon: Users, hideForCliente: true },
  { to: "/contratos", label: "Contratos", icon: FileText, hideForCliente: true },
  { to: "/importar", label: "Importar Excel", icon: Upload, hideForRoles: ["cobranca"], hideForCliente: true },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, hideForCliente: true },
  { to: "/admin", label: "Administração", icon: Shield, adminOnly: true },
];

function AuthedLayout() {
  const { user, loading, signOut, isAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const isClienteOnly = !isAdmin && roles.length > 0 && roles.every((r) => r === "cliente");

  useEffect(() => {
    if (loading || !user) return;
    if (isClienteOnly && pathname !== "/minhas-parcelas") {
      navigate({ to: "/minhas-parcelas" });
    }
  }, [loading, user, isClienteOnly, pathname, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-base text-sidebar-foreground">ParcelaPro</h1>
              <p className="text-xs text-muted-foreground">Controle de parcelamento</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            if (item.clienteOnly && !isClienteOnly) return null;
            if (item.hideForCliente && isClienteOnly) return null;
            if (!isAdmin && item.hideForRoles?.some((r) => roles.includes(r as any))) return null;
            const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as any}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="px-2 text-xs text-muted-foreground">
            <div className="truncate font-medium text-sidebar-foreground">{user.email}</div>
            <div className="truncate">
              {roles.length === 0
                ? "Sem papel atribuído"
                : roles.map((r) => ROLE_LABELS[r]).join(", ")}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contratos")({
  head: () => ({ meta: [{ title: "Contratos | MML Assessoria e Cobrança" }] }),
  component: ContratosLayout,
});

function ContratosLayout() {
  return <Outlet />;
}
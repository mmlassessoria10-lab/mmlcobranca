import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contratos")({
  head: () => ({ meta: [{ title: "Contratos | Stillo Foto" }] }),
  component: ContratosLayout,
});

function ContratosLayout() {
  return <Outlet />;
}
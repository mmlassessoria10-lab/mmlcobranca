import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  roles: string[];
}

export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin" as never,
    });

    if (roleError) throw roleError;
    if (!isAdmin) throw new Error("Apenas administradores podem listar usuários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: usersData, error: usersError }, { data: rolesData, error: rolesError }, { data: profilesData, error: profilesError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("user_roles").select("user_id,role"),
      supabaseAdmin.from("profiles").select("id,email,full_name,created_at"),
    ]);

    if (usersError) throw usersError;
    if (rolesError) throw rolesError;
    if (profilesError) throw profilesError;

    const rolesByUser = new Map<string, string[]>();
    for (const row of rolesData ?? []) {
      const current = rolesByUser.get(row.user_id) ?? [];
      current.push(row.role);
      rolesByUser.set(row.user_id, current);
    }

    const profilesByUser = new Map<string, { email: string | null; full_name: string | null; created_at: string | null }>();
    for (const profile of profilesData ?? []) {
      profilesByUser.set(profile.id, {
        email: profile.email,
        full_name: profile.full_name,
        created_at: profile.created_at,
      });
    }

    return usersData.users
      .map((authUser) => {
        const profile = profilesByUser.get(authUser.id);
        return {
          id: authUser.id,
          email: profile?.email ?? authUser.email ?? null,
          full_name: profile?.full_name ?? (authUser.user_metadata?.full_name as string | undefined) ?? null,
          created_at: profile?.created_at ?? authUser.created_at ?? null,
          last_sign_in_at: authUser.last_sign_in_at ?? null,
          email_confirmed_at: authUser.email_confirmed_at ?? null,
          roles: rolesByUser.get(authUser.id) ?? [],
        } satisfies AdminUserRow;
      })
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  });
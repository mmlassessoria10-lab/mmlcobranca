INSERT INTO public.user_roles (user_id, role)
VALUES ('6d23cd73-14d4-4b8e-8fad-fd51424416b9', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
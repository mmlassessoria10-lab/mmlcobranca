SELECT cron.unschedule('asaas-sync-hourly');

SELECT cron.schedule(
  'asaas-sync-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://mmlcobranca.lovable.app/api/public/hooks/asaas-sync',
    headers:='{"Content-Type": "application/json", "x-hook-secret": "65be8807b6096981f9a4cbf4ed0ac0d511dcaffad3fbacb92e690b13d89398a0"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
-- Parent installs pg_cron and pg_net and stores SUPACLIP_MAINTENANCE_SECRET
-- in private Vault under supaclip_maintenance_cron before applying this job.
-- Apply only after the verified production deployment is promoted.
select cron.schedule('startup-supaclip-maintenance', '*/15 * * * *', $$
  select net.http_get(
    url := 'https://supa-clip.vercel.app/api/maintenance',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'supaclip_maintenance_cron')),
    timeout_milliseconds := 30000
  );
$$);

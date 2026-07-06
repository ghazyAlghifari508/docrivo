-- Advisor wants policies present. App access stays server-admin only; public roles get explicit deny.

do $$
begin
  create policy "deny_public_generation_jobs" on public.generation_jobs
    for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "deny_public_crawled_pages" on public.crawled_pages
    for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "deny_public_extracted_assets" on public.extracted_assets
    for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "deny_public_design_extractions" on public.design_extractions
    for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "deny_public_generated_documents" on public.generated_documents
    for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "deny_public_job_logs" on public.job_logs
    for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "deny_public_rate_limits" on public.rate_limits
    for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

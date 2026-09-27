-- Re-adds the nine foreign keys that the cleaned baseline (Task 1.2) had to
-- drop, because public.users did not exist when the baseline was written.
-- public.users is Better Auth's user table, created in this task. See spec 5.3.
--
-- Requires the four Better Auth tables to exist first. They are not part of
-- this numbered baseline: their source of truth is src/db/schema-auth.ts, and
-- their DDL comes from `drizzle-kit generate` over that file.
--
-- Six were `alter table ... add column user_id uuid references auth.users(id)`.
-- generation_jobs is one of the two that carried ON DELETE CASCADE.
alter table public.generation_jobs
  add constraint generation_jobs_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

alter table public.crawled_pages
  add constraint crawled_pages_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.design_extractions
  add constraint design_extractions_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.extracted_assets
  add constraint extracted_assets_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.generated_documents
  add constraint generated_documents_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.job_logs
  add constraint job_logs_user_id_fkey
  foreign key (user_id) references public.users(id);

-- Two were inline in their `create table`, not named constraints.
alter table public.user_entitlements
  add constraint user_entitlements_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.payment_transactions
  add constraint payment_transactions_user_id_fkey
  foreign key (user_id) references public.users(id);

-- The second of the two that carried ON DELETE CASCADE. The table itself was
-- recovered from the production dump rather than from the migration files.
alter table public.scrape_artifacts
  add constraint scrape_artifacts_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

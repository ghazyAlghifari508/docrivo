-- 0004_scrape_artifacts.sql -- cleaned migration baseline, part 4 of 8.
--
-- Recovered from the live InsForge database during Phase 0.
-- The InsForge-era migrations referenced this table on 18 lines across 3 files
-- and never created it (spec finding F4). Placing it at 0004 puts it ahead of
-- the migrations that depend on it.
--
-- Source of truth: backup/scrape-artifacts-ddl.sql, extracted from the
-- pre-migration production dump on 2026-09-26. That directory is gitignored
-- and holds plaintext production data, so it is not committed; this file is
-- the tracked copy of the definition.
--
-- Extraction note carried over from the source: the dump was matched against
-- DDL-only text with all COPY data blocks removed. The audit-log table stores
-- escaped SQL in a JSON column, so a naive scan of the raw dump also matches
-- that data and corrupts the file.
--
-- Deliberate edits, both in RULES.md's "Deferred" section:
--   * the `scrape_artifacts_user_id_fkey` foreign key to the InsForge auth
--     users table is removed, not re-pointed. `public.users` does not exist
--     until Task 2.1; migration `0011_user_fks.sql` re-adds it there,
--     `on delete cascade`.
--   * the stale trailing note claiming this FK "is rewritten to
--     public.users(id)" is corrected -- it is deferred, not rewritten.
-- The `scrape_artifacts_pkey` constraint immediately below is NOT InsForge
-- infrastructure and is kept verbatim; the table is created without an inline
-- primary key, so dropping this would leave it keyless.

CREATE TABLE public.scrape_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_url text NOT NULL,
    status integer DEFAULT 200 NOT NULL,
    html text NOT NULL,
    preview_html text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_scrape_artifacts_user_id ON public.scrape_artifacts USING btree (user_id, created_at DESC);

ALTER TABLE ONLY public.scrape_artifacts
    ADD CONSTRAINT scrape_artifacts_pkey PRIMARY KEY (id);

-- Not carried forward (see spec 5.3 / 5.4 and RULES.md):
--   * FORCE ROW LEVEL SECURITY
--   * the 3 CREATE POLICY statements that target this table:
--       "Users can view their own scrapes"   FOR SELECT
--       "Users can create scrapes"           FOR INSERT
--       "Users can delete their own scrapes" FOR DELETE
--   * the foreign key (user_id) -> InsForge auth users, on delete cascade
--     -- deferred to migrations/0011_user_fks.sql in Task 2.1.

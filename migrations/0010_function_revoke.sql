-- Closes the PUBLIC-execute gap left by the cleaned baseline.
--
-- The baseline preserves `revoke ... from public` for consume_quota,
-- refund_quota, get_user_entitlement and list_plans, matching the originals.
-- These three callable functions had no such revoke. In production they were
-- shielded indirectly -- the app used an admin key that bypassed privilege
-- checks, and the `revoke ... from anon` / `from authenticated` clauses blocked
-- PostgREST. Neither shield exists in the local topology, where the app
-- connects as the `docrivo` owner and is subject to no function-level revoke.
--
-- claim_next_job and retry_generation_job mutate public.generation_jobs.
-- See spec 5.4: RLS is dropped, so application-layer ownership is the only gate.

revoke execute on function public.claim_next_job() from public;
revoke execute on function public.hit_rate_limit(text, int, int) from public;
revoke execute on function public.retry_generation_job(uuid) from public;

import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import type { UserSchema } from "@insforge/sdk";
import { createInsForgeServerClient } from "./insforge-server";
import { insforge } from "./insforge";

export type AuthUser = Pick<UserSchema, "id" | "email" | "profile">;

export const getUser = cache(async (): Promise<AuthUser | null> => {
  const client = await createInsForgeServerClient();
  const { data, error } = await client.auth.getCurrentUser();
  if (error || !data.user) return null;
  const { id, email, profile } = data.user;
  return { id, email, profile };
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export function isAdminEmail(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  return user;
}

export type GenerationHistoryRow = {
  id: string;
  source_url: string;
  status: string;
  created_at: string;
};

export type ScrapeHistoryRow = {
  id: string;
  source_url: string;
  created_at: string;
};

export const getGenerationHistory = cache(async (limit = 50): Promise<GenerationHistoryRow[]> => {
  const user = await requireUser();
  return insforge.select<GenerationHistoryRow>("generation_jobs", {
    user_id: `eq.${user.id}`,
    select: "id,source_url,status,created_at",
    order: "created_at.desc",
    limit,
  });
});

export const getScrapeHistory = cache(async (limit = 50): Promise<ScrapeHistoryRow[]> => {
  const user = await requireUser();
  return insforge.select<ScrapeHistoryRow>("scrape_artifacts", {
    user_id: `eq.${user.id}`,
    select: "id,source_url,created_at",
    order: "created_at.desc",
    limit,
  });
});

/** Returns the row only if it belongs to the current user, else null. */
export async function getOwnedScrape(id: string) {
  const user = await getUser();
  if (!user) return null;
  return insforge.maybeSingle<{
    id: string;
    user_id: string;
    source_url: string;
    html: string;
    preview_html: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>("scrape_artifacts", { id: `eq.${id}`, user_id: `eq.${user.id}` });
}

/** Throws 404 if the generation job does not belong to the current user. */
export async function requireOwnedJob(id: string) {
  const user = await requireUser();
  const job = await insforge.maybeSingle<{ id: string; user_id: string | null }>("generation_jobs", {
    id: `eq.${id}`,
    select: "id,user_id",
  });
  if (!job || job.user_id !== user.id) notFound();
}

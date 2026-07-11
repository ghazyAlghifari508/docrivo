"use client";

import { useState } from "react";
import { Check, CircleNotch, Crown, Lock, Sparkle } from "@phosphor-icons/react";

type PlanCard = {
  plan: string;
  label: string;
  designmd_quota: number | null;
  scrape_quota: number | null;
  templates_unlocked: boolean;
  price_idr: number;
};

function fmtIdr(n: number) {
  return n.toLocaleString("id-ID");
}

function quotaText(n: number | null) {
  return n == null ? "Unlimited" : `${n}x`;
}

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, proplus: 3 };

const COPY: Record<string, { badge: string; desc: string }> = {
  starter: { badge: "Mulai rapi", desc: "Cocok buat coba workflow Docrivo tanpa komit besar." },
  pro: { badge: "Paling aman", desc: "Kuota lebih lega buat eksplor beberapa referensi." },
  proplus: { badge: "Full access", desc: "Unlimited generate + scrape, plus buka fitur Template." },
};

export function PricingCards({ plans, currentPlan }: { plans: PlanCard[]; currentPlan: string }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const buyable = plans.filter((p) => p.price_idr > 0);
  const currentRank = PLAN_RANK[currentPlan] ?? 0;

  async function buy(plan: string) {
    setBusy(plan);
    setError("");
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (!res.ok || !json.redirectUrl) {
        setError("Gagal memulai pembayaran. Coba lagi.");
        setBusy("");
        return;
      }
      window.location.href = json.redirectUrl;
    } catch {
      setError("Jaringan bermasalah. Coba lagi.");
      setBusy("");
    }
  }

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-3">
        {buyable.map((p) => {
          const active = p.plan === currentPlan;
          const planRank = PLAN_RANK[p.plan] ?? 0;
          const downgrade = planRank < currentRank;
          const highlight = p.plan === "proplus";
          const copy = COPY[p.plan] ?? { badge: "Paket", desc: "Tambah kredit Docrivo." };

          return (
            <article
              key={p.plan}
              className={`relative flex min-h-[440px] flex-col overflow-hidden rounded-cards border border-ink p-6 text-left shadow-hard-xl ${
                highlight ? "bg-lime-sprint" : "bg-paper-white"
              }`}
            >
              <div className="absolute -right-10 -top-10 size-28 rounded-full border border-ink/20 bg-white/25" aria-hidden="true" />
              <div className="absolute -bottom-12 -left-10 size-32 rounded-full border border-ink/10 bg-cream/50" aria-hidden="true" />

              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-ink bg-paper-white px-3 py-1 text-caption font-semibold uppercase tracking-[0.08em] text-ink shadow-hard">
                    {highlight ? <Crown size={13} weight="fill" aria-hidden="true" /> : <Sparkle size={13} weight="fill" aria-hidden="true" />}
                    {copy.badge}
                  </span>
                  <h3 className="mt-5 text-[2rem] font-semibold leading-none tracking-tight text-ink">{p.label}</h3>
                </div>
                {active ? (
                  <span className="rounded-full border border-ink bg-cream px-3 py-1 text-caption font-semibold text-ink shadow-hard">
                    Aktif
                  </span>
                ) : null}
              </div>

              <p className="relative mt-4 text-body-sm leading-7 text-muted">{copy.desc}</p>

              <div className="relative mt-6 border-y border-ink py-5">
                <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-gray">Sekali beli</p>
                <p className="mt-1 text-[2.35rem] font-semibold leading-none text-ink">
                  Rp {fmtIdr(p.price_idr)}
                </p>
              </div>

              <ul className="relative mt-6 flex-1 space-y-3 text-body-sm text-ink">
                <Feature>{quotaText(p.designmd_quota)} generate DESIGN.md</Feature>
                <Feature>{quotaText(p.scrape_quota)} scrape HTML</Feature>
                <Feature muted={!p.templates_unlocked} icon={p.templates_unlocked ? "check" : "lock"}>
                  {p.templates_unlocked ? "Unlock halaman Template" : "Template tetap terkunci"}
                </Feature>
              </ul>

              <button
                disabled={active || downgrade || busy === p.plan}
                onClick={() => buy(p.plan)}
                className={`pressable relative mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-buttons border border-ink px-5 text-body-sm font-semibold shadow-hard disabled:cursor-not-allowed disabled:opacity-60 ${
                  highlight ? "bg-paper-white text-ink" : "bg-lime-sprint text-ink"
                }`}
              >
                {active ? (
                  "Paket aktif"
                ) : downgrade ? (
                  "Tidak tersedia"
                ) : busy === p.plan ? (
                  <>
                    <CircleNotch size={16} className="animate-spin" aria-hidden="true" /> Memproses…
                  </>
                ) : (
                  `Beli ${p.label}`
                )}
              </button>
            </article>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-5 text-center text-caption font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Feature({
  children,
  muted = false,
  icon = "check",
}: {
  children: React.ReactNode;
  muted?: boolean;
  icon?: "check" | "lock";
}) {
  return (
    <li className={`flex items-center gap-3 ${muted ? "text-muted-gray" : ""}`}>
      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-ink bg-paper-white text-ink">
        {icon === "lock" ? <Lock size={13} weight="fill" aria-hidden="true" /> : <Check size={13} weight="bold" aria-hidden="true" />}
      </span>
      <span className={muted ? "line-through" : ""}>{children}</span>
    </li>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, CheckCircle, Warning } from "@phosphor-icons/react";

type State = "checking" | "paid" | "pending" | "error";

/** Runs once after Midtrans redirects back with ?order_id=. Polls verify, then
 *  refreshes the server component so the new plan/credits show. */
export function PaymentVerifier({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId }),
        });
        const json = await res.json();
        if (!alive) return;
        if (res.ok && json.status === "paid") {
          setState("paid");
          router.refresh();
        } else if (res.ok) {
          setState("pending");
        } else {
          setState("error");
        }
      } catch {
        if (alive) setState("error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [orderId, router]);

  const map = {
    checking: { icon: <CircleNotch size={18} className="animate-spin" aria-hidden="true" />, text: "Memeriksa pembayaran…", cls: "text-muted" },
    paid: { icon: <CheckCircle size={18} weight="fill" aria-hidden="true" />, text: "Pembayaran berhasil. Paket kamu sudah aktif.", cls: "text-mint-edge" },
    pending: { icon: <Warning size={18} weight="fill" aria-hidden="true" />, text: "Pembayaran belum selesai. Selesaikan lalu muat ulang.", cls: "text-ink" },
    error: { icon: <Warning size={18} weight="fill" aria-hidden="true" />, text: "Gagal memeriksa pembayaran. Muat ulang halaman.", cls: "text-red-700" },
  }[state];

  return (
    <div
      role="status"
      className={`mb-6 inline-flex items-center gap-2 rounded-buttons border border-ink bg-cream px-4 py-3 text-body-sm font-medium shadow-hard ${map.cls}`}
    >
      {map.icon}
      {map.text}
    </div>
  );
}

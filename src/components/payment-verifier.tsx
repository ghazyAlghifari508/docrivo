"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { CircleNotch, CheckCircle, Warning } from "@phosphor-icons/react";
import { verifyPayment } from "~/queries/entitlements";

type State = "checking" | "paid" | "pending" | "error";

/** Runs once after Midtrans redirects back with ?order_id=. Polls verify, then
 *  refreshes the route loader so the new plan/credits show. */
export function PaymentVerifier({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let alive = true;

    // `void` on the IIFE: the body catches everything it can, and the `alive`
    // flag is what actually stops a late `setState`, so there is nothing for a
    // caller to await here.
    void (async () => {
      try {
        // Poll-based, exactly as before: the deleted `/api/payments/verify`
        // handler asked Midtrans for the order status and, if it was paid,
        // claimed the pending transaction. The claim is now inside
        // `verifyPayment`, so this component has no way to skip it.
        const result = await verifyPayment({ data: { orderId } });
        if (!alive) return;

        if (!result.ok) {
          setState("error");
          return;
        }
        if (result.status === "paid" || result.status === "settlement" || result.status === "capture") {
          setState("paid");
          // `invalidate()` is the equivalent of Next's `router.refresh()`: it
          // re-runs the matched loaders in place instead of reloading the page.
          void router.invalidate();
        } else {
          setState("pending");
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

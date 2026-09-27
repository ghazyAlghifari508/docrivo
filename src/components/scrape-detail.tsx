"use client";

import { Link, isNotFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleNotch, Code, DownloadSimple, GlobeHemisphereWest, Warning } from "@phosphor-icons/react";
import { scrapeQueryOptions } from "~/lib/queries/scrape";
import { CollapsibleOutput } from "~/components/collapsible-output";

type ResultView = "preview" | "code";

export function ScrapeDetail({ id }: { id: string }) {
  // One read, no poll: `createScrape` writes the artifact with the HTML already
  // in hand, so there is no partial state to wait for. The factory says so in
  // `refetchInterval: false`, which is what replaced the effect's liveness flag.
  // `item` is typed from that factory's `queryFn`; the hand-written mirror of the
  // artifact server function's return shape went with it.
  const { data: item, error, isPending } = useQuery(scrapeQueryOptions(id));
  const [view, setView] = useState<ResultView>("preview");
  const [blobUrl, setBlobUrl] = useState("");

  // The download link is a Blob of the stored HTML, which is the only way to hand
  // the bytes back without a second route. The object URL is created when the
  // artifact arrives and revoked when it changes or the view unmounts -- the same
  // pairing the previous cleanup effect did with a ref.
  useEffect(() => {
    if (!item) return;
    const url = URL.createObjectURL(new Blob([item.html], { type: "text/html" }));
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item]);

  if (isPending) {
    return (
      <main id="main" className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white">
        <div className="flex items-center gap-3 text-body-sm text-muted">
          <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
          Memuat hasil scrape…
        </div>
      </main>
    );
  }

  if (error || !item) {
    // Two distinct conditions reach this branch and the old copy merged them.
    // A signed-out visitor gets a 401 from the server function, which is not the
    // same thing as "this artifact is not yours". And a generic failure was
    // unreachable before: `item` was only ever set to `null` for those two
    // answers, so a socket hang left `item === undefined` and the loading spinner
    // up forever. The message below already existed in this file, waiting behind
    // that. `isNotFound` is the ownership answer and it covers both of its halves
    // -- somebody else's artifact and an id that does not exist alike.
    const signedOut = error instanceof Response;
    const transient = !!error && !signedOut && !isNotFound(error);
    return (
      <main id="main" className="grid min-h-[calc(100dvh-67px)] place-items-center bg-paper-white px-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-buttons border border-ink bg-cream shadow-hard">
            <Warning size={22} weight="fill" aria-hidden="true" />
          </span>
          <h1 className="mt-6 text-heading-sm font-semibold tracking-heading-sm">
            {transient
              ? "Gagal memuat hasil scrape."
              : "Hasil scrape tidak ditemukan."}
          </h1>
          <p className="mt-3 text-body-sm leading-7 text-muted">
            {transient
              ? "Coba muat ulang sebentar lagi."
              : signedOut
                ? "Masuk dengan Google dulu untuk melihat hasil scrape ini."
                : "Detail HTML ini cuma tersimpan di akun Google kamu. Scrape ulang kalau sudah dihapus."}
          </p>
          <Link
            to="/history"
            className="pressable mt-7 inline-flex h-11 items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-5 text-body-sm font-medium text-ink shadow-hard"
          >
            <ArrowLeft size={16} weight="bold" aria-hidden="true" /> Kembali ke history
          </Link>
        </div>
      </main>
    );
  }

  const captured = new Date(item.metadata.capturedAt).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const sizeKb = Math.round(item.metadata.htmlBytes / 1024).toLocaleString("id-ID");
  const viewport = `${item.metadata.viewport.width}×${item.metadata.viewport.height}`;

  return (
    <CollapsibleOutput
      label="Hasil scrape HTML"
        summary={`${sizeKb} KB · ${viewport}`}
      >
      <main id="main" className="bg-paper-white">
        <section className="bg-depth text-paper-white">
          <div className="page-shell py-10">
            <Link to="/history" className="inline-flex items-center gap-2 text-caption font-medium text-paper-white/70 hover:text-paper-white">
              <ArrowLeft size={15} aria-hidden="true" /> History
            </Link>
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
              <div>
                <span className="inline-flex rounded-pills border border-lime-sprint bg-lime-sprint/15 px-3 py-1.5 text-caption font-medium uppercase tracking-[0.06em] text-lime-sprint">
                  Scrape HTML
                </span>
                <h1 className="mt-5 max-w-2xl text-heading-lg font-semibold leading-heading-lg tracking-heading-lg">
                  Preview dan code hasil scrape.
                </h1>
                <p className="mt-4 flex items-center gap-2 break-all text-body-sm text-paper-white/60">
                  <GlobeHemisphereWest size={16} className="shrink-0" aria-hidden="true" /> {item.sourceUrl}
                </p>
              </div>
              <dl className="grid gap-3 rounded-cards border border-paper-white/15 bg-paper-white/5 p-5 text-caption text-paper-white/70">
                <MetaItem label="Attempt" value={`#${item.metadata.attempt} · ${item.metadata.captureMode}`} />
                <MetaItem label="Viewport" value={viewport} />
                <MetaItem label="Diambil" value={captured} />
                <MetaItem label="HTML" value={`${sizeKb} KB`} />
              </dl>
            </div>
          </div>
        </section>

        <section className="page-shell py-8">
          <div className="overflow-hidden rounded-cards border border-ink bg-cream text-left shadow-hard">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink bg-paper-white p-3">
              <span className="inline-flex min-w-0 items-center gap-2 break-all text-caption font-medium text-muted">
                <Code size={15} aria-hidden="true" /> {item.metadata.finalUrl}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <div aria-label="Tampilan hasil HTML" className="inline-flex rounded-buttons border border-ink bg-cream p-1">
                  <ViewButton active={view === "preview"} onClick={() => setView("preview")}>Preview</ViewButton>
                  <ViewButton active={view === "code"} onClick={() => setView("code")}>Code</ViewButton>
                </div>
                {blobUrl ? (
                  <a
                    href={blobUrl}
                    download="index.html"
                    className="pressable inline-flex items-center gap-2 rounded-buttons border border-ink bg-lime-sprint px-3 py-2 text-caption font-medium text-ink shadow-hard"
                  >
                    <DownloadSimple size={15} /> Download index.html
                  </a>
                ) : null}
              </div>
            </div>
            {view === "preview" ? (
              <DesktopPreview title={`Preview ${item.sourceUrl}`} srcDoc={item.previewHtml} />
            ) : (
              <pre tabIndex={0} aria-label="Kode HTML hasil scrape" className="h-[calc(100dvh-150px)] min-h-[620px] overflow-auto bg-[#111] p-5 text-[12px] leading-5 text-paper-white">
                <code>{item.html}</code>
              </pre>
            )}
          </div>
        </section>
      </main>
    </CollapsibleOutput>
  );
}

/**
 * Renders the scraped page at a fixed 1440px layout width, then visually scales
 * it down to fit the container. Desktop browsers key media queries off the real
 * iframe width, so a full-width iframe on a laptop reads as ~1300px and a phone-
 * width viewer collapses the page to its mobile layout. Pinning the iframe to
 * 1440px and using CSS transform:scale keeps the desktop layout at any size —
 * scale only shrinks pixels, it doesn't change the layout width the page sees.
 */
const PREVIEW_WIDTH = 1440;
function DesktopPreview({ title, srcDoc }: { title: string; srcDoc: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / PREVIEW_WIDTH));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Container height = the iframe's on-screen (scaled) height so it takes only
  // the room it visually needs. Iframe is 1440 × (viewport-height/scale) tall.
  const frameHeight = Math.round((typeof window !== "undefined" ? window.innerHeight : 900) * 0.82);
  return (
    <div
      ref={wrapRef}
      className="w-full overflow-hidden bg-paper-white"
      style={{ height: frameHeight * scale }}
    >
      <iframe
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{
          width: PREVIEW_WIDTH,
          height: frameHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: 0,
        }}
      />
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-paper-white">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-[3px] px-3 py-1.5 text-caption font-medium ${active ? "bg-lime-sprint text-ink" : "text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
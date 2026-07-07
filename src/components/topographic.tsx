// Signature contour-line watermark from docs/DESIGN.md - runs beneath sections as paper texture.
// SVG so it scales cleanly and themes via a single stroke color.

export function Topographic({
  tone = "ink",
  className = "",
}: {
  tone?: "ink" | "paper";
  className?: string;
}) {
  const stroke = tone === "paper" ? "rgb(255 255 255 / 0.11)" : "rgb(38 38 38 / 0.11)";
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1200 700"
      fill="none"
    >
      <g stroke={stroke} strokeWidth="1.25">
        {/* Nested closed contours - a topographic map read as texture, not data. */}
        {CONTOURS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

// Hand-tuned concentric ridge lines (two "peaks").
const CONTOURS = [
  "M120 640C120 560 200 520 300 520C420 520 470 470 470 400C470 330 400 300 320 300C200 300 150 250 150 180",
  "M60 650C60 540 180 480 320 480C480 480 540 420 540 330C540 240 440 200 320 200C180 200 100 150 100 60",
  "M20 660C20 520 160 440 340 440C540 440 620 360 620 260C620 160 480 110 320 110C160 110 60 60 60 -20",
  "M170 630C185 575 250 560 320 560C395 560 425 505 415 445C405 385 355 360 300 370",
  "M760 690C760 600 830 560 920 560C1020 560 1060 510 1050 440C1040 370 970 345 900 355",
  "M700 700C700 580 820 520 960 520C1110 520 1170 450 1150 360C1130 270 1030 235 920 250",
  "M650 700C650 560 800 480 980 490C1160 500 1240 420 1220 320",
  "M820 680C830 630 880 615 940 620C1000 625 1025 585 1010 540",
  "M-40 380C60 400 140 360 180 280C220 200 320 200 380 260",
  "M1240 200C1140 220 1080 300 1100 400C1120 500 1040 560 960 540",
];

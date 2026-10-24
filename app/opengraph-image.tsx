import { ImageResponse } from "next/og";

export const alt = "HCM Lite — AI-assisted HR, attendance, leave and payroll";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "#09090b",
          backgroundImage:
            "radial-gradient(900px 480px at 12% -10%, rgba(34,197,94,0.20), rgba(9,9,11,0)), radial-gradient(760px 420px at 96% 110%, rgba(63,63,70,0.55), rgba(9,9,11,0))",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 18,
              background: "linear-gradient(180deg,#27272a,#09090b)",
              border: "1px solid rgba(255,255,255,0.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#fafafa", lineHeight: 1 }}>
              H
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600, color: "#fafafa", letterSpacing: -0.5 }}>
            HCM Lite
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              display: "flex",
              fontSize: 66,
              fontWeight: 700,
              color: "#fafafa",
              lineHeight: 1.1,
              letterSpacing: -2,
              maxWidth: 960,
            }}
          >
            HR, attendance, leave and payroll in one place.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", lineHeight: 1.4, maxWidth: 900 }}>
            Role-aware dashboards, working-day payroll rules and an AI assistant that answers
            questions from your own HR data.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {["Admin · HR · Employee", "Live KPIs", "AI assistant", "Server-side PDFs"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                color: "#d4d4d8",
                fontSize: 22,
              }}
            >
              {label}
            </div>
          ))}
          <div style={{ display: "flex", marginLeft: "auto", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: "#22c55e", display: "flex" }} />
            <div style={{ display: "flex", fontSize: 22, color: "#71717a" }}>Next.js · SQLite · OpenRouter</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

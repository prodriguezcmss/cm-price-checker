import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at 20% 10%, rgba(175, 34, 48, 0.12), transparent 30%), radial-gradient(circle at 100% 20%, rgba(31, 62, 93, 0.16), transparent 35%), #f4f7fb"
      }}
    >
      <section
        style={{
          maxWidth: "560px",
          width: "100%",
          background: "#fff",
          borderRadius: "20px",
          border: "1px solid rgba(31, 62, 93, 0.15)",
          padding: "28px",
          boxShadow: "0 12px 34px rgba(18, 40, 63, 0.09)",
          display: "grid",
          gap: "12px"
        }}
      >
        <h1 style={{ fontFamily: "var(--font-display), serif", color: "#1f3e5d" }}>
          CM School Supply
        </h1>
        <p style={{ color: "#3d5063", lineHeight: 1.6 }}>
          This deployment includes your in-store customer price checker powered by Shopify.
        </p>
        <Link
          href="/price-checker"
          style={{
            justifySelf: "start",
            borderRadius: "12px",
            background: "#1f3e5d",
            color: "#fff",
            padding: "11px 16px",
            fontWeight: 600
          }}
        >
          Open Price Checker
        </Link>
      </section>
    </main>
  );
}

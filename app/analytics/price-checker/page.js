"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const LOOKBACK_OPTIONS = [
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "7d", value: 24 * 7 }
];

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

export default function PriceCheckerAnalyticsPage() {
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const loadData = useCallback(async (selectedHours) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/analytics/price-checker?hours=${selectedHours}`);
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Failed to load analytics");
      }

      setData(json);
    } catch (requestError) {
      setData(null);
      setError(requestError.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(24);
  }, [loadData]);

  const successRate = useMemo(() => {
    const successful = data?.totals?.successfulLookups || 0;
    const lookups = data?.totals?.lookups || 0;
    if (!lookups) return "0%";
    return `${Math.round((successful / lookups) * 100)}%`;
  }, [data]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1>Price Checker Analytics</h1>
            <p>Operational view for in-store customer usage.</p>
          </div>

          <div className={styles.controls}>
            {LOOKBACK_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={option.value === hours ? styles.filterActive : styles.filterButton}
                onClick={() => {
                  setHours(option.value);
                  loadData(option.value);
                }}
              >
                {option.label}
              </button>
            ))}
            <button type="button" className={styles.refreshButton} onClick={() => loadData(hours)}>
              Refresh
            </button>
          </div>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

        <section className={styles.kpiGrid}>
          <article className={styles.card}>
            <span>Scan Starts</span>
            <strong>{formatNumber(data?.totals?.cameraStarts)}</strong>
          </article>
          <article className={styles.card}>
            <span>Total Lookups</span>
            <strong>{formatNumber(data?.totals?.lookups)}</strong>
          </article>
          <article className={styles.card}>
            <span>Success Rate</span>
            <strong>{successRate}</strong>
          </article>
          <article className={styles.card}>
            <span>Failed Lookups</span>
            <strong>{formatNumber(data?.totals?.failedLookups)}</strong>
          </article>
          <article className={styles.card}>
            <span>Barcode Lookups</span>
            <strong>{formatNumber(data?.totals?.barcodeLookups)}</strong>
          </article>
          <article className={styles.card}>
            <span>SKU Lookups</span>
            <strong>{formatNumber(data?.totals?.skuLookups)}</strong>
          </article>
        </section>

        <section className={styles.twoCol}>
          <article className={styles.panel}>
            <h2>Top Errors</h2>
            {loading ? <p>Loading...</p> : null}
            {!loading && !data?.topErrors?.length ? <p>No errors in this time window.</p> : null}
            <ul>
              {(data?.topErrors || []).map((errorItem) => (
                <li key={errorItem.message}>
                  <span>{errorItem.message}</span>
                  <strong>{formatNumber(errorItem.count)}</strong>
                </li>
              ))}
            </ul>
          </article>

          <article className={styles.panel}>
            <h2>Top Missing Queries</h2>
            {loading ? <p>Loading...</p> : null}
            {!loading && !data?.topMissingQueries?.length ? <p>No missing-item queries.</p> : null}
            <ul>
              {(data?.topMissingQueries || []).map((row) => (
                <li key={row.queryValue}>
                  <span>{row.queryValue}</span>
                  <strong>{formatNumber(row.count)}</strong>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className={styles.panel}>
          <h2>Recent Failed Lookups</h2>
          {loading ? <p>Loading...</p> : null}
          {!loading && !data?.recentFailures?.length ? <p>No failed lookups in this window.</p> : null}
          {(data?.recentFailures || []).length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time (UTC)</th>
                  <th>Type</th>
                  <th>Query</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {data.recentFailures.map((row, index) => (
                  <tr key={`${row.createdAt}-${index}`}>
                    <td>{new Date(row.createdAt).toLocaleString("en-US", { timeZone: "UTC" })}</td>
                    <td>{row.lookupType || "n/a"}</td>
                    <td>{row.queryValue || "n/a"}</td>
                    <td>{row.errorMessage || "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      </section>
    </main>
  );
}

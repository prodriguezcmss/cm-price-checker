"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function parseApiError(json, fallback) {
  return json?.error || fallback;
}

export default function StaffPosHandoffPage() {
  const [session, setSession] = useState({ loading: true, authenticated: false, staffId: "" });
  const [loginStaffId, setLoginStaffId] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [storeId, setStoreId] = useState("riverside");
  const [codeInput, setCodeInput] = useState("");
  const [handoff, setHandoff] = useState(null);
  const [retrieveError, setRetrieveError] = useState("");
  const [retrieveLoading, setRetrieveLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState("");

  const loadSession = async () => {
    try {
      const response = await fetch("/api/staff/auth/session");
      const json = await response.json();
      if (!response.ok) {
        setSession({ loading: false, authenticated: false, staffId: "" });
        return;
      }

      setSession({
        loading: false,
        authenticated: Boolean(json.authenticated),
        staffId: String(json.staffId || "")
      });
      if (json.staffId) setLoginStaffId(String(json.staffId));
    } catch {
      setSession({ loading: false, authenticated: false, staffId: "" });
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    let active = true;
    const loadConfig = async () => {
      try {
        const response = await fetch("/api/pos-handoff/config");
        const json = await response.json();
        if (!response.ok || !json.ok || !active) return;
        if (json.storeId) {
          setStoreId(String(json.storeId));
        }
      } catch {
        // keep default
      }
    };

    loadConfig();
    return () => {
      active = false;
    };
  }, []);

  const itemCount = useMemo(() => {
    if (!handoff?.items?.length) return 0;
    return handoff.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, [handoff]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      const response = await fetch("/api/staff/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: loginStaffId, pin: loginPin })
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(parseApiError(json, "Unable to sign in"));
      }

      setLoginPin("");
      await loadSession();
    } catch (requestError) {
      setLoginError(requestError.message || "Unable to sign in");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/staff/auth/logout", { method: "POST" }).catch(() => {});
    setSession({ loading: false, authenticated: false, staffId: "" });
    setHandoff(null);
    setCodeInput("");
  };

  const handleRetrieve = async (event) => {
    event.preventDefault();
    const code = normalizeCode(codeInput);
    if (!code) {
      setRetrieveError("Enter a handoff code");
      return;
    }

    setRetrieveLoading(true);
    setRetrieveError("");
    setClaimError("");
    setHandoff(null);

    try {
      const response = await fetch(
        `/api/pos-handoff/retrieve?code=${encodeURIComponent(code)}&storeId=${encodeURIComponent(storeId)}`
      );
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(parseApiError(json, "Unable to retrieve handoff"));
      }

      setHandoff(json.handoff);
    } catch (requestError) {
      setRetrieveError(requestError.message || "Unable to retrieve handoff");
    } finally {
      setRetrieveLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!handoff?.code) return;

    setClaimLoading(true);
    setClaimError("");

    try {
      const response = await fetch("/api/pos-handoff/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: handoff.code, storeId })
      });
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(parseApiError(json, "Unable to claim handoff"));
      }

      setHandoff(json.handoff);
    } catch (requestError) {
      setClaimError(requestError.message || "Unable to claim handoff");
    } finally {
      setClaimLoading(false);
    }
  };

  if (session.loading) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <p>Loading staff session...</p>
        </section>
      </main>
    );
  }

  if (!session.authenticated) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <section className={styles.card}>
            <h1>Staff Sign In</h1>
            <p>Riverside handoff portal access.</p>

            <form className={styles.form} onSubmit={handleLogin}>
              <label>
                Staff ID
                <input
                  type="text"
                  value={loginStaffId}
                  onChange={(event) => setLoginStaffId(event.target.value)}
                  required
                />
              </label>

              <label>
                PIN
                <input
                  type="password"
                  inputMode="numeric"
                  value={loginPin}
                  onChange={(event) => setLoginPin(event.target.value)}
                  required
                />
              </label>

              <button type="submit" disabled={loginLoading}>
                {loginLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            {loginError ? <p className={styles.error}>{loginError}</p> : null}
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <h1>POS Handoff Portal</h1>
              <p>Signed in as {session.staffId}</p>
              <p>Store: {storeId}</p>
            </div>
            <button type="button" className={styles.ghostButton} onClick={handleLogout}>
              Sign Out
            </button>
          </div>

          <form className={styles.formInline} onSubmit={handleRetrieve}>
            <input
              value={codeInput}
              onChange={(event) => setCodeInput(normalizeCode(event.target.value))}
              placeholder="Enter handoff code"
              aria-label="Handoff code"
            />
            <button type="submit" disabled={retrieveLoading}>
              {retrieveLoading ? "Loading..." : "Retrieve"}
            </button>
          </form>

          {retrieveError ? <p className={styles.error}>{retrieveError}</p> : null}
          {claimError ? <p className={styles.error}>{claimError}</p> : null}

          {handoff ? (
            <section className={styles.resultCard}>
              <div className={styles.resultRow}>
                <span>Code</span>
                <strong>{handoff.code}</strong>
              </div>
              <div className={styles.resultRow}>
                <span>Status</span>
                <strong>{handoff.status}</strong>
              </div>
              <div className={styles.resultRow}>
                <span>Items</span>
                <strong>{itemCount}</strong>
              </div>
              <div className={styles.resultRow}>
                <span>Expires</span>
                <strong>{new Date(handoff.expiresAt).toLocaleString()}</strong>
              </div>

              <ul className={styles.itemList}>
                {(handoff.items || []).map((item, index) => (
                  <li key={`${item.variantId || item.sku || index}`}>
                    <span>{item.title || "Unknown product"}</span>
                    <span>SKU: {item.sku || "n/a"}</span>
                    <span>Qty: {item.quantity || 1}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={handleClaim}
                disabled={claimLoading || handoff.status !== "open"}
              >
                {claimLoading ? "Claiming..." : "Claim for POS Cart"}
              </button>
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}

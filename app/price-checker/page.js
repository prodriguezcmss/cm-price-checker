"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./price-checker.module.css";

const BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "codabar"
];

const BRAND_LOGO_URL =
  "https://cdn.shopify.com/s/files/1/0055/1354/3754/files/CM-School-Supply-Alt-Logo-Outlined_ed273e78-e15f-48af-99c9-1e548a0d7ba5.png?v=1771626994";

function formatCurrency(amount) {
  const value = Number(amount || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function BrandLogo() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return <span className={styles.brandWordmark}>School Supply</span>;
  }

  return (
    <img
      src={BRAND_LOGO_URL}
      alt="CM School Supply"
      className={styles.logo}
      onError={() => setIsVisible(false)}
    />
  );
}

export default function PriceCheckerPage() {
  const scannerCardRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const intervalRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const autoResumeTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const loadingRef = useRef(false);
  const lastCodeRef = useRef("");

  const [manualSku, setManualSku] = useState("");
  const [scannerStatus, setScannerStatus] = useState("Tap Start Camera to scan a barcode");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState("");
  const [listItems, setListItems] = useState([]);
  const [handoffConfig, setHandoffConfig] = useState({
    enabled: false,
    storeId: "riverside",
    expiryMinutes: 60
  });
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffResult, setHandoffResult] = useState(null);

  const trackEvent = async (payload) => {
    try {
      await fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch {
      // Skip analytics failures to keep checkout flow smooth.
    }
  };

  const addCurrentProductToList = () => {
    if (!product) return;

    setListItems((current) => {
      const key = product.variantId || product.sku || product.barcode;
      const existingIndex = current.findIndex((item) => item.key === key);
      if (existingIndex >= 0) {
        return current.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: Math.min(50, item.quantity + 1) }
            : item
        );
      }

      return [
        ...current,
        {
          key,
          variantId: product.variantId,
          sku: product.sku,
          barcode: product.barcode,
          title: product.title,
          quantity: 1
        }
      ];
    });

    setHandoffResult(null);
    setScannerStatus("Added to list. Continue scanning.");
  };

  const updateListQuantity = (key, delta) => {
    setListItems((current) =>
      current
        .map((item) =>
          item.key === key
            ? { ...item, quantity: Math.min(50, Math.max(1, item.quantity + delta)) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
    setHandoffResult(null);
  };

  const removeListItem = (key) => {
    setListItems((current) => current.filter((item) => item.key !== key));
    setHandoffResult(null);
  };

  const createHandoff = async () => {
    if (!handoffConfig.enabled || !listItems.length) return;

    setHandoffLoading(true);
    setError("");

    try {
      const response = await fetch("/api/pos-handoff/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: handoffConfig.storeId,
          items: listItems.map((item) => ({
            variantId: item.variantId,
            sku: item.sku,
            barcode: item.barcode,
            title: item.title,
            quantity: item.quantity
          }))
        })
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Failed to create register handoff");
      }

      setHandoffResult({
        code: json.handoffCode,
        expiresAt: json.expiresAt
      });
    } catch (requestError) {
      setHandoffResult(null);
      setError(requestError.message || "Failed to send to register");
    } finally {
      setHandoffLoading(false);
    }
  };

  const scanHint = useMemo(() => {
    if (typeof window === "undefined") return "";
    if (!navigator.mediaDevices?.getUserMedia) {
      return "Camera scanning is not supported on this device. Use SKU entry below.";
    }
    return "Center barcode in frame and keep phone steady.";
  }, []);

  const stopCamera = () => {
    if (autoResumeTimerRef.current) {
      window.clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = null;
    }

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (zxingControlsRef.current?.stop) {
      zxingControlsRef.current.stop();
      zxingControlsRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const playSuccessFeedback = () => {
    if (typeof window !== "undefined" && typeof window.navigator?.vibrate === "function") {
      window.navigator.vibrate(120);
    }

    if (typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }

      const context = audioContextRef.current;
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(940, context.currentTime);
      gainNode.gain.setValueAtTime(0.0001, context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.15);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.16);
    } catch {
      // No-op if audio feedback is unavailable.
    }
  };

  const lookupProduct = async ({ barcode, sku }) => {
    const params = new URLSearchParams();
    if (barcode) params.set("barcode", barcode);
    if (sku) params.set("sku", sku);

    setLoading(true);
    loadingRef.current = true;
    setError("");
    setSuggestions([]);

    try {
      const response = await fetch(`/api/price-checker?${params.toString()}`);
      const json = await response.json();

      if (!response.ok || !json.ok) {
        const requestError = new Error(json.error || "Product lookup failed");
        requestError.suggestions = Array.isArray(json.suggestions) ? json.suggestions : [];
        throw requestError;
      }

      setProduct(json.product);
      if (sku) {
        setManualSku("");
      }
      if (barcode) {
        playSuccessFeedback();
        setScannerStatus(`Barcode detected: ${barcode}. Product loaded.`);
      }
    } catch (requestError) {
      setProduct(null);
      setError(requestError.message || "Unable to find product");
      setSuggestions(Array.isArray(requestError.suggestions) ? requestError.suggestions : []);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const startCamera = async () => {
    stopCamera();
    lastCodeRef.current = "";
    setError("");
    setScannerStatus("Starting camera...");
    trackEvent({ eventType: "camera_start" });

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerStatus("Camera scanner unavailable. Use SKU input instead.");
      return;
    }

    if (!("BarcodeDetector" in window)) {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();

        if (!videoRef.current) {
          throw new Error("Camera preview unavailable");
        }

        setScannerStatus("Camera active. Point at barcode.");
        zxingControlsRef.current = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          async (result) => {
            const code = result?.getText?.()?.trim();

            if (!code || code === lastCodeRef.current || loadingRef.current) {
              return;
            }

            lastCodeRef.current = code;
            await lookupProduct({ barcode: code });
          }
        );
      } catch (cameraError) {
        setScannerStatus("Could not access camera. Check browser permissions.");
        setError(cameraError.message || "Unable to start camera");
      }
      return;
    }

    try {
      detectorRef.current = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScannerStatus("Camera active. Point at barcode.");

      intervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !detectorRef.current || loadingRef.current) {
          return;
        }

        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          const code = codes?.[0]?.rawValue?.trim();

          if (!code || code === lastCodeRef.current) return;

          lastCodeRef.current = code;
          await lookupProduct({ barcode: code });
        } catch {
          // Ignore transient detection errors while scanning.
        }
      }, 700);
    } catch (cameraError) {
      setScannerStatus("Could not access camera. Check browser permissions.");
      setError(cameraError.message || "Unable to start camera");
    }
  };

  const scrollToScanner = () => {
    if (!scannerCardRef.current) return;
    scannerCardRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  const scanNextProduct = () => {
    if (autoResumeTimerRef.current) {
      window.clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = null;
    }
    setProduct(null);
    setSuggestions([]);
    setError("");
    setManualSku("");
    setScannerStatus("Ready to scan next item.");
    scrollToScanner();
  };

  const startOver = () => {
    stopCamera();
    setProduct(null);
    setSuggestions([]);
    setError("");
    setManualSku("");
    lastCodeRef.current = "";
    setScannerStatus("Tap Start Camera to scan a barcode");
    scrollToScanner();
  };

  useEffect(() => {
    return () => {
      stopCamera();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadHandoffConfig = async () => {
      try {
        const response = await fetch("/api/pos-handoff/config");
        const json = await response.json();
        if (!response.ok || !json.ok || !active) return;

        setHandoffConfig({
          enabled: Boolean(json.enabled),
          storeId: String(json.storeId || "riverside"),
          expiryMinutes: Number(json.expiryMinutes || 60)
        });
      } catch {
        // Keep defaults if unavailable.
      }
    };

    loadHandoffConfig();
    return () => {
      active = false;
    };
  }, []);

  const onSkuSubmit = async (event) => {
    event.preventDefault();
    if (!manualSku.trim()) {
      setError("Enter an SKU to search");
      return;
    }

    trackEvent({
      eventType: "manual_lookup_submit",
      lookupType: "sku",
      queryValue: manualSku.trim()
    });

    await lookupProduct({ sku: manualSku.trim() });
  };

  const showSale = product?.salePrice && product?.compareAtPrice;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <BrandLogo />
          <p className={styles.subtitle}>In-Store Price Checker</p>
        </header>

        <section className={styles.scannerCard} ref={scannerCardRef}>
          <h1>Scan Product Barcode</h1>
          <p>{scanHint}</p>

          <video ref={videoRef} className={styles.video} muted playsInline />

          <div className={styles.row}>
            <button type="button" className={styles.primaryButton} onClick={startCamera}>
              Start Camera
            </button>
            <button type="button" className={styles.secondaryButton} onClick={stopCamera}>
              Stop
            </button>
          </div>

          <p className={styles.status}>{scannerStatus}</p>
        </section>

        <section className={styles.skuCard}>
          <h2>Or Enter SKU</h2>
          <form onSubmit={onSkuSubmit} className={styles.row}>
            <input
              value={manualSku}
              onChange={(event) => setManualSku(event.target.value)}
              className={styles.input}
              placeholder="Type SKU"
              aria-label="Product SKU"
            />
            <button className={styles.primaryButton} type="submit" disabled={loading}>
              {loading ? "Checking..." : "Check Price"}
            </button>
          </form>
        </section>

        {error ? <p className={styles.error}>{error}</p> : null}
        {suggestions.length ? (
          <section className={styles.suggestionCard}>
            <h2>Possible Matches</h2>
            <p>We could not find an exact match. Try one of these SKUs:</p>
            <ul className={styles.suggestionList}>
              {suggestions.map((item) => (
                <li key={item.variantId || item.sku || item.title} className={styles.suggestionItem}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>SKU: {item.sku || "n/a"}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!item.sku) return;
                      setManualSku(item.sku);
                      lookupProduct({ sku: item.sku });
                    }}
                  >
                    Use SKU
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {product ? (
          <section className={styles.productCard}>
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.imageAlt || product.title}
                className={styles.productImage}
              />
            ) : null}

            <div className={styles.productInfo}>
              <h2>{product.title}</h2>
              <p className={styles.description}>{product.description || "No description available."}</p>

              <div className={styles.priceLine}>
                {showSale ? (
                  <>
                    <span className={styles.comparePrice}>{formatCurrency(product.compareAtPrice)}</span>
                    <span className={styles.salePrice}>{formatCurrency(product.salePrice)}</span>
                  </>
                ) : (
                  <span className={styles.normalPrice}>{formatCurrency(product.productPrice)}</span>
                )}
              </div>

              <div className={styles.meta}>
                <span>SKU: {product.sku || "n/a"}</span>
                <span>Barcode: {product.barcode || "n/a"}</span>
              </div>

              <div className={styles.row}>
                {handoffConfig.enabled ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={addCurrentProductToList}
                  >
                    Add to List
                  </button>
                ) : null}
                <button type="button" className={styles.primaryButton} onClick={scanNextProduct}>
                  Scan Next Product
                </button>
                <button type="button" className={styles.secondaryButton} onClick={startOver}>
                  Back to Main Screen
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {handoffConfig.enabled ? (
          <section className={styles.handoffCard}>
            <h2>Customer List for Register</h2>
            <p>Store: {handoffConfig.storeId}</p>
            {!listItems.length ? <p>No items added yet.</p> : null}
            {listItems.length ? (
              <ul className={styles.handoffList}>
                {listItems.map((item) => (
                  <li key={item.key} className={styles.handoffItem}>
                    <div>
                      <strong>{item.title || "Unknown product"}</strong>
                      <span>SKU: {item.sku || "n/a"}</span>
                    </div>
                    <div className={styles.row}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => updateListQuantity(item.key, -1)}
                      >
                        -
                      </button>
                      <span className={styles.qty}>{item.quantity}</span>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => updateListQuantity(item.key, 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => removeListItem(item.key)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className={styles.row}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={createHandoff}
                disabled={!listItems.length || handoffLoading}
              >
                {handoffLoading ? "Sending..." : "Send to Register"}
              </button>
            </div>

            {handoffResult ? (
              <div className={styles.handoffCodeCard}>
                <span>Show this code to cashier:</span>
                <strong>{handoffResult.code}</strong>
                <span>
                  Expires: {new Date(handoffResult.expiresAt).toLocaleTimeString("en-US")}
                </span>
              </div>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}

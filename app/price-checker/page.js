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
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const intervalRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const loadingRef = useRef(false);
  const lastCodeRef = useRef("");

  const [manualSku, setManualSku] = useState("");
  const [scannerStatus, setScannerStatus] = useState("Tap Start Camera to scan a barcode");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");

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

  const scanHint = useMemo(() => {
    if (typeof window === "undefined") return "";
    if (!navigator.mediaDevices?.getUserMedia) {
      return "Camera scanning is not supported on this device. Use SKU entry below.";
    }
    return "Center barcode in frame and keep phone steady.";
  }, []);

  const stopCamera = () => {
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

  const lookupProduct = async ({ barcode, sku }) => {
    const params = new URLSearchParams();
    if (barcode) params.set("barcode", barcode);
    if (sku) params.set("sku", sku);

    setLoading(true);
    loadingRef.current = true;
    setError("");

    try {
      const response = await fetch(`/api/price-checker?${params.toString()}`);
      const json = await response.json();

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Product lookup failed");
      }

      setProduct(json.product);
      if (barcode) {
        setScannerStatus(`Barcode detected: ${barcode}`);
      }
    } catch (requestError) {
      setProduct(null);
      setError(requestError.message || "Unable to find product");
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

  useEffect(() => {
    return () => stopCamera();
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

        <section className={styles.scannerCard}>
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
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

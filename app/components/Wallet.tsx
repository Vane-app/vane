"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

/**
 * The user's own wallet.
 *
 * Vane never holds a tasker's or a business's money. Circle's user-controlled wallets
 * are MPC: the keyshare lives with the user, and the PIN is entered inside Circle's
 * own iframe — it never touches a Vane input, a Vane request, or a Vane server. We
 * can prepare an action; only the person can approve it.
 *
 * That is why this is a client component. The whole point is that the work happens in
 * the browser, out of our reach.
 */

type Status = "idle" | "loading" | "creating" | "ready" | "demo" | "error";

interface WalletInfo {
  configured: boolean;
  ready: boolean;
  address: string | null;
  userToken?: string;
  encryptionKey?: string;
  appId?: string;
}

/** Type-only — erased at build, so the SDK itself still loads lazily in the browser. */
type CircleSdk = W3SSdk;

/**
 * Wait for a Circle challenge to finish.
 *
 * The callback fires more than once: Circle reports IN_PROGRESS and PENDING while the
 * user is still working through the modal, and only later COMPLETE. Treating anything
 * other than COMPLETE as a failure — which is what this used to do — killed the flow
 * the instant Circle reported progress and told the user they had cancelled, while the
 * modal was still open in front of them.
 *
 * So: settle only on a terminal state, ignore the rest, and never settle twice.
 */
function runChallenge(sdk: CircleSdk, challengeId: string, what: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    sdk.execute(challengeId, (err, result) => {
      if (err) return finish(() => reject(new Error(err.message ?? `${what} could not be completed.`)));

      const status = (result as { status?: string } | undefined)?.status;
      if (status === "COMPLETE") return finish(resolve);
      if (status === "EXPIRED") return finish(() => reject(new Error(`${what} timed out — try again.`)));
      if (status === "FAILED") return finish(() => reject(new Error(`${what} failed. Check your PIN and try again.`)));

      // IN_PROGRESS, PENDING, or a status we do not recognise: the user is still
      // going. Say nothing and wait for a terminal one.
    });

    /**
     * Closing the modal does not always produce a terminal status, so waiting on the
     * callback alone can hang with the button spinning. Give it a generous window,
     * then stop waiting — the caller re-reads the wallet from Circle afterwards, which
     * is the real source of truth about whether this worked.
     */
    setTimeout(() => finish(resolve), 5 * 60 * 1000);
  });
}

/**
 * The Circle SDK, themed, loaded once per page.
 *
 * Lifted out of useWallet because signing in now needs it too: Circle sends the login
 * code and collects it in its own modal, so the login screen and the wallet are the
 * same SDK instance. Two would mean two device sessions and two sets of theming, and
 * the login modal would arrive in Circle's white while the wallet modal is ours.
 */
let cachedSdk: W3SSdk | null = null;

export async function loadCircleSdk(appId: string): Promise<W3SSdk> {
  if (cachedSdk) return cachedSdk;
    const { W3SSdk: Sdk } = await import("@circle-fin/w3s-pw-web-sdk");
    const instance: CircleSdk = new Sdk({ appSettings: { appId } });

    // Circle's modal ships white by default, which lands like a different product
    // dropped on top of ours. It is the single most important screen in onboarding —
    // the moment the user takes custody — so it has to feel like Vane, not like a
    // third-party interruption. Values mirror :root in globals.css.
    instance.setThemeColor({
      backdrop: "#05090d",
      backdropOpacity: 0.72,
      bg: "#111c24",
      divider: "rgba(255,255,255,0.07)",

      textMain: "#f3f6f7",
      textMain2: "#f3f6f7",
      textAuxiliary: "#9aa9b2",
      textAuxiliary2: "#9aa9b2",
      textSummary: "#9aa9b2",
      textSummaryHighlight: "#f0a94b",
      textPlaceholder: "#6d7d87",
      textDetailToggle: "#f0a94b",
      textInteractive: "#f0a94b",
      interactiveBg: "rgba(240,169,75,0.15)",

      success: "#4fc08d",
      error: "#e0765a",

      pinDotBase: "rgba(255,255,255,0.045)",
      pinDotBaseBorder: "rgba(255,255,255,0.28)",
      pinDotActivated: "#f0a94b",
      enteredPinText: "#f3f6f7",

      // Inputs and dropdowns. Missing these is what left white boxes on a dark modal —
      // the default is a light theme, so every surface has to be named explicitly.
      inputBg: "rgba(255,255,255,0.045)",
      inputBgDisabled: "rgba(255,255,255,0.02)",
      inputText: "#f3f6f7",
      inputBorderFocused: "#f0a94b",
      inputBorderFocusedError: "#e0765a",
      /**
       * The open dropdown panel stays light, deliberately.
       *
       * Circle draws the option rows' text itself and there is no token for it — it is
       * dark, built for a white panel. Making the panel dark produced dark-on-dark and
       * an unreadable list. A light popover over a dark modal is a normal pattern and,
       * more to the point, legible. Legibility beats palette consistency every time.
       */
      dropdownBg: "#f3f6f7",
      dropdownBorderIsOpen: "#f0a94b",
      dropdownBorderError: "#e0765a",

      // Buttons, so the modal's primary action matches ours rather than Circle's blue.
      mainBtnBg: "#f0a94b",
      mainBtnBgOnHover: "#f6c581",
      mainBtnBgDisabled: "rgba(255,255,255,0.08)",
      mainBtnText: "#0a1218",
      mainBtnTextOnHover: "#0a1218",
      // Dark text belongs on the amber fill, never on the disabled one — that was
      // dark-on-dark and made "Continue" unreadable until the form was valid.
      mainBtnTextDisabled: "#6d7d87",
      secondBtnText: "#f3f6f7",
      secondBtnTextOnHover: "#f3f6f7",
      secondBtnTextDisabled: "#6d7d87",
      secondBtnBorder: "rgba(255,255,255,0.18)",
      secondBtnBorderOnHover: "#f0a94b",
      secondBtnBgOnHover: "rgba(240,169,75,0.12)",

      // Circle renders part of each heading as gradient text, defaulting to a
      // purple-to-blue that belongs to no part of this product. Flatten it to amber.
      titleGradients: ["#f0a94b", "#f6c581"],

      // The quiet tertiary buttons ("Skip", "Show PIN").
      plainBtnText: "#f0a94b",
      plainBtnTextOnHover: "#f6c581",
      plainBtnTextDisabled: "#6d7d87",
      plainBtnBg: "transparent",
      plainBtnBgOnHover: "rgba(240,169,75,0.1)",
      secondBtnBorderDisabled: "rgba(255,255,255,0.08)",

      // The PIN-recovery hint panel.
      recoverPinHintTitle: "#f3f6f7",
      recoverPinHintTitleBg: "rgba(240,169,75,0.12)",
      recoverPinHint: "#9aa9b2",

      tooltipText: "#f3f6f7",
      tooltipBg: "#0a1218",
    });

    /**
     * Circle's icons are supplied as image URLs and default to their blue. The tick in
     * the dropdown was the last obviously-foreign mark on the screen. Inlined as data
     * URIs so they need no hosting and cannot fail to load.
     */
    instance.setResources({
      selectCheckMark:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'%3E%3Cpath d='M5 13l4 4L19 7' fill='none' stroke='%23f0a94b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E",
      dropdownArrow:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'%3E%3Cpath d='M6 9l6 6 6-6' fill='none' stroke='%239aa9b2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E",
    });

    /**
     * Shorter recovery questions than Circle's defaults.
     *
     * This step is the tallest in the flow — two questions, each with an answer and a
     * hint — and Circle's own wording wraps onto several lines, which pushes the modal
     * into a scrollbar. We cannot resize their iframe, but we can give it less to say.
     * Kept to two questions: one is materially weaker recovery, and this is the only
     * way back into a wallet Vane cannot restore for them.
     */
    instance.setCustomSecurityQuestions(
      [
        { question: "What was your first pet's name?", type: "TEXT" as never },
        { question: "What city were you born in?", type: "TEXT" as never },
        { question: "What was your first school called?", type: "TEXT" as never },
        { question: "What is your mother's maiden name?", type: "TEXT" as never },
        { question: "What was your first job?", type: "TEXT" as never },
      ],
      2,
    );

    // Without this, execute() fails silently — an expensive thing to debug.
    await instance.getDeviceId();
    cachedSdk = instance;
  return instance;
}

/** The browser's device id, which Circle binds a login token to. */
export async function circleDeviceId(appId: string): Promise<string> {
  const instance = await loadCircleSdk(appId);
  return instance.getDeviceId();
}

export function useWallet() {
  const [status, setStatus] = useState<Status>("idle");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sdkRef = useRef<CircleSdk | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/wallet");
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load your wallet.");
      const info = (await res.json()) as WalletInfo;
      setAddress(info.address);
      // Not configured is not an error — the demo flow stays usable without Circle keys.
      setStatus(!info.configured ? "demo" : info.ready ? "ready" : "idle");
      return info;
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Load the SDK lazily and establish its device session.
   *
   * `getDeviceId()` looks redundant and is not: without it `execute()` fails silently,
   * which is a very expensive thing to debug.
   */
  const sdk = useCallback((appId: string) => loadCircleSdk(appId), []);

  /** Create the user's wallet. They choose a PIN inside Circle's UI; we never see it. */
  const create = useCallback(async () => {
    setError(null);
    setStatus("creating");
    try {
      const res = await fetch("/api/wallet/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start wallet creation.");

      if (data.alreadyExists) {
        setAddress(data.address ?? null);
        setStatus("ready");
        return;
      }

      const instance = await sdk(data.appId);
      instance.setAuthentication({ userToken: data.userToken, encryptionKey: data.encryptionKey });

      await runChallenge(instance, data.challengeId, "Wallet setup");

      // Circle is the authority on whether the wallet exists, not the callback.
      const after = await refresh();
      if (after && after.configured && !after.ready) {
        throw new Error("Wallet setup didn't complete. You can try again.");
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }, [sdk, refresh]);

  /** Approve a prepared contract call — taking a campaign, funding one. */
  const approve = useCallback(
    async (challenge: { challengeId: string; userToken: string; encryptionKey: string; appId: string }) => {
      const instance = await sdk(challenge.appId);
      instance.setAuthentication({
        userToken: challenge.userToken,
        encryptionKey: challenge.encryptionKey,
      });
      return runChallenge(instance, challenge.challengeId, "Approval");
    },
    [sdk],
  );

  return { status, address, error, create, approve, refresh };
}

/**
 * The onboarding step. Deliberately quiet: one line of reassurance and one button.
 * A tasker should understand they own this, without being taught what MPC is.
 */
export function WalletStep({ onDone }: { onDone?: () => void }) {
  const { status, address, error, create } = useWallet();

  useEffect(() => {
    if (status === "ready" || status === "demo") onDone?.();
  }, [status, onDone]);

  if (status === "ready" || status === "demo") {
    return (
      <div className="wallet-step">
        <p className="wallet-ok">Your wallet is ready.</p>
        {address && <code className="wallet-addr">{address}</code>}
        <p className="wallet-note">
          {status === "demo"
            ? "Demo wallet — Circle keys aren't configured on this deployment."
            : "Only you can move what's in it. Vane can't."}
        </p>
      </div>
    );
  }

  return (
    <div className="wallet-step">
      <p className="wallet-note">
        You'll set a PIN with Circle. It creates a wallet only you control — Vane can never
        move your earnings, and there's no seed phrase to keep.
      </p>
      <button className="wallet-btn" onClick={() => void create()} disabled={status === "creating"}>
        {status === "creating" ? "Setting up…" : "Set up my wallet"}
      </button>
      {error && <p className="wallet-error">{error}</p>}
    </div>
  );
}

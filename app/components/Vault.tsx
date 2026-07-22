"use client";

/**
 * The hero object: USDC dropping into a lit escrow vault.
 *
 * Built entirely from gradients, blur and transforms rather than an image, so it
 * stays sharp at any size and ships with no asset. The narrative is the product's:
 * money going in and being held under light until a result is proven.
 */
export function Vault() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-glow" />

      <div className="coin coin-1">
        <span className="coin-face">$</span>
      </div>
      <div className="coin coin-2">
        <span className="coin-face">$</span>
      </div>
      <div className="coin coin-3">
        <span className="coin-face">$</span>
      </div>

      <div className="vault">
        <div className="vault-body" />
        <div className="vault-top">
          <div className="vault-slot" />
        </div>
        <div className="vault-rim" />
      </div>

      <div className="scene-floor" />

      <style jsx>{`
        .scene {
          position: relative;
          width: min(100%, 560px);
          aspect-ratio: 1 / 0.92;
          margin: 0 auto;
          perspective: 1100px;
          perspective-origin: 50% 42%;
        }

        .scene-glow {
          position: absolute;
          left: 50%;
          top: 52%;
          width: 92%;
          height: 62%;
          transform: translate(-50%, -50%);
          background: radial-gradient(50% 50% at 50% 50%, rgba(240, 169, 75, 0.32), transparent 70%);
          filter: blur(26px);
        }

        .scene-floor {
          position: absolute;
          left: 50%;
          bottom: 8%;
          width: 74%;
          height: 12%;
          transform: translateX(-50%);
          background: radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.7), transparent 72%);
          filter: blur(18px);
        }

        /* ---- the vault ---- */
        .vault {
          position: absolute;
          left: 50%;
          bottom: 14%;
          width: 68%;
          transform: translateX(-50%);
          transform-style: preserve-3d;
        }

        .vault-top {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 30% / 30%;
          transform: rotateX(64deg);
          background: conic-gradient(
              from 210deg,
              #ffffff,
              #e7ecef 12%,
              #b9c3ca 26%,
              #f6f8f9 42%,
              #cdd6dc 58%,
              #ffffff 74%,
              #dbe2e7 88%,
              #ffffff
            );
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6) inset, 0 0 60px rgba(240, 169, 75, 0.5),
            0 0 120px rgba(240, 169, 75, 0.28);
          display: grid;
          place-items: center;
        }

        .vault-slot {
          width: 34%;
          height: 13%;
          border-radius: 20px;
          background: linear-gradient(180deg, #1a2027, #454f57 55%, #2a3238);
          box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.85), 0 1px 0 rgba(255, 255, 255, 0.75);
          transform: rotate(-24deg);
        }

        .vault-body {
          position: absolute;
          left: 6%;
          top: 34%;
          width: 88%;
          height: 30%;
          border-radius: 0 0 46% 46% / 0 0 62% 62%;
          background: linear-gradient(180deg, #cfd7dd, #8e99a2 46%, #5f6a73);
          box-shadow: 0 26px 60px rgba(0, 0, 0, 0.75);
        }

        .vault-rim {
          position: absolute;
          left: 3%;
          top: 24%;
          width: 94%;
          height: 26%;
          border-radius: 50%;
          background: linear-gradient(90deg, rgba(240, 169, 75, 0), rgba(255, 196, 118, 0.95), rgba(240, 169, 75, 0));
          filter: blur(7px);
          opacity: 0.9;
        }

        /* ---- the coins ---- */
        .coin {
          position: absolute;
          left: 50%;
          width: 23%;
          aspect-ratio: 1;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: conic-gradient(
            from 140deg,
            #ffffff,
            #d7dee3 14%,
            #9aa5ad 30%,
            #f2f5f7 46%,
            #b4bec5 62%,
            #ffffff 80%,
            #c9d2d8
          );
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.55) inset, 0 18px 34px rgba(0, 0, 0, 0.6),
            0 0 34px rgba(240, 169, 75, 0.4);
        }

        .coin-face {
          font-size: 1.9vw;
          font-weight: 800;
          color: #7d878f;
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.85);
        }

        .coin-1 {
          top: 2%;
          transform: translateX(-16%) rotateX(58deg) rotateZ(-16deg);
          animation: fall1 5.2s ease-in-out infinite;
        }

        .coin-2 {
          top: 20%;
          transform: translateX(-64%) rotateX(48deg) rotateZ(18deg);
          animation: fall2 5.8s ease-in-out infinite;
        }

        .coin-3 {
          top: 36%;
          transform: translateX(-28%) rotateX(66deg) rotateZ(-6deg);
          animation: fall3 6.4s ease-in-out infinite;
        }

        @keyframes fall1 {
          0%,
          100% {
            transform: translateX(-16%) translateY(0) rotateX(58deg) rotateZ(-16deg);
          }
          50% {
            transform: translateX(-16%) translateY(16px) rotateX(58deg) rotateZ(-8deg);
          }
        }
        @keyframes fall2 {
          0%,
          100% {
            transform: translateX(-64%) translateY(0) rotateX(48deg) rotateZ(18deg);
          }
          50% {
            transform: translateX(-64%) translateY(-14px) rotateX(48deg) rotateZ(10deg);
          }
        }
        @keyframes fall3 {
          0%,
          100% {
            transform: translateX(-28%) translateY(0) rotateX(66deg) rotateZ(-6deg);
          }
          50% {
            transform: translateX(-28%) translateY(12px) rotateX(66deg) rotateZ(0deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .coin {
            animation: none !important;
          }
        }

        @media (max-width: 860px) {
          .coin-face {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  );
}

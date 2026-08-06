"use client";

import { useRef, useState } from "react";

/**
 * Image upload with live preview.
 *
 * The file is downscaled in the browser and kept as a data URL, so the upload looks
 * and behaves real without object storage behind it. When Vercel Blob is wired only
 * the onChange target changes — the UI stays.
 *
 * The downscale is not cosmetic. A phone photo is 3–8MB, and as a data URL it becomes
 * a ~10MB string that would be written into a Postgres column and then sent back on
 * every query that touches a campaign or a user. At 256px it is around 15KB, which is
 * small enough to live in a row without anyone noticing.
 *
 * Two shapes: a round avatar and a wide campaign banner.
 */

const MAX_EDGE = { avatar: 256, banner: 1200 } as const;

function downscale(file: File, maxEdge: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like an image."));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, w, h);

        // JPEG keeps photos small; transparency is not something a logo needs here,
        // and a PNG of the same image is several times the size.
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function Upload({
  shape = "avatar",
  value,
  onChange,
  label,
}: {
  shape?: "avatar" | "banner";
  value?: string;
  onChange: (dataUrl: string) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await downscale(file, MAX_EDGE[shape]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      // Let the same file be chosen again after an error.
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div>
      <button type="button" className={`upload upload-${shape}`} onClick={() => ref.current?.click()}>
        {value ? (
          <img src={value} alt="" className="upload-img" />
        ) : (
          <span className="upload-empty">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d="M12 15V4M8 8l4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <b>{busy ? "Loading…" : label ?? "Add photo"}</b>
          </span>
        )}
        {value && <span className="upload-edit">Change</span>}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </button>
      {error && <p className="wallet-error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}

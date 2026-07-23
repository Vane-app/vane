"use client";

import { useRef, useState } from "react";

/**
 * Image upload with live preview.
 *
 * In this prototype the file is read locally with FileReader and kept as a data
 * URL, so the upload looks and behaves real without a backend. When storage is
 * wired (Vercel Blob), only the onChange target changes — the UI stays.
 *
 * Two shapes: a round avatar and a wide campaign banner.
 */
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

  function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      onChange(String(reader.result));
      setBusy(false);
    };
    reader.readAsDataURL(file);
  }

  return (
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
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </button>
  );
}

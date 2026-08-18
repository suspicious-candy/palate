"use client";

import React from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import styles from "./ReviewPrompt.module.css";

export type PendingReview = {
  reservationId: string;
  date: string | Date;
  restaurant?: { _id?: string; name?: string; fsqId?: string } | null;
};

const STARS = [1, 2, 3, 4, 5];
const MAX_TEXT = 999;

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function ReviewPrompt({
  pending,
  onClose,
  onSubmitted,
}: {
  pending: PendingReview[];
  onClose: () => void;
  onSubmitted?: (reservationId: string) => void;
}) {
  const [index, setIndex] = React.useState(0);
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState<number | null>(null);
  const [text, setText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const item = pending[index];
  const done = item === undefined;

  React.useEffect(() => {
    if (done) onClose();
  }, [done, onClose]);

  if (done) return null;

  function advance() {
    setRating(0);
    setHover(null);
    setText("");
    setSaving(false);
    setIndex((i) => i + 1);
  }

  async function save() {
    if (rating < 1 || saving) return;
    setSaving(true);
    try {
      await axios.post("/api/reviews", {
        reservationId: item.reservationId,
        rating,
        text: text.trim() || undefined,
      });
      onSubmitted?.(item.reservationId);
      advance();
    } catch (err: any) {
      // A stale queue: another tab already reviewed this meal. Nothing to fix.
      if (err?.response?.status === 409) {
        onSubmitted?.(item.reservationId);
        advance();
        return;
      }
      toast.error(err?.response?.data?.error ?? "Couldn't save — try again.");
      setSaving(false);
    }
  }

  const shown = hover ?? rating;
  const name = item.restaurant?.name ?? "your table";

  return createPortal(
    <div className={styles.backdrop} onClick={saving ? undefined : onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {pending.length > 1 && (
          <div className={styles.counter}>
            {index + 1} of {pending.length}
          </div>
        )}

        <h2 className={styles.title}>How was {name}?</h2>
        <p className={styles.subtitle}>{formatDate(item.date)}</p>

        <div
          className={styles.stars}
          role="radiogroup"
          aria-label={`Rating for ${name}`}
          onMouseLeave={() => setHover(null)}
        >
          {STARS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              className={`${styles.star} ${n <= shown ? styles.starOn : ""}`}
              disabled={saving}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(null)}
            >
              <i className={n <= shown ? "ph-fill ph-star" : "ph ph-star"} />
            </button>
          ))}
        </div>

        <textarea
          className={styles.textarea}
          placeholder="Anything worth remembering? (optional)"
          maxLength={MAX_TEXT}
          value={text}
          disabled={saving}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.count}>
          {text.length}/{MAX_TEXT}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={onClose}
            disabled={saving}
          >
            Not now
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={save}
            disabled={saving || rating < 1}
          >
            {saving ? "Saving…" : "Submit"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

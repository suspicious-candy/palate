"use client";
import React from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import styles from "./ReservationPrompt.module.css";

type Item = { fsqId: string; name: string };
type Entry = { booked: boolean; date: string; partySize: number };
/* "confirm" is the tracker asking after the fact whether a click became a table.
   "book" is the user deliberately opening this to make one. Same POST, different
   question, so the copy, the defaults and the checkbox all differ. */
type Mode = "confirm" | "book";

function defaultDate(mode: Mode) {
  const d = new Date();
  /* Confirming an already-booked table is about roughly now, while booking one
     is about later, so this rounds up to the next hour rather than opening on a
     minute that has already passed. */
  if (mode === "book") d.setHours(d.getHours() + 1, 0, 0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ReservationPrompt({
  batch,
  mode = "confirm",
  onClose,
  onSaved,
}: {
  batch: Item[];
  mode?: Mode;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const booking = mode === "book";
  const [entries, setEntries] = React.useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      batch.map((c) => [
        c.fsqId,
        /* Nothing to tick in book mode: the user already said which place by
           clicking its button, so the row starts selected. */
        { booked: booking, date: defaultDate(mode), partySize: 2 },
      ])
    )
  );
  const [saving, setSaving] = React.useState(false);

  function update(fsqId: string, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [fsqId]: { ...prev[fsqId], ...patch } }));
  }

  async function save() {
    const toBook = batch.filter((c) => entries[c.fsqId].booked);
    if (!toBook.length) return onClose();

    setSaving(true);
    try {
      await Promise.all(
        toBook.map((c) =>
          axios.post("/api/reservations", {
            fsqId: c.fsqId,
            /* An INSTANT, not a wall clock. The input is datetime-local, so its
               value carries no offset — "2026-08-20T14:29". JavaScript reads an
               offset-less datetime as local time, and the server's local time is
               UTC, so posting it raw moved every booking by the user's offset:
               at GMT-5 a table for 14:29 arrived as 19:29 UTC, five hours in the
               past, and the future-only refinement in the route rejected it as a
               400 that named the date without explaining it.

               new Date() here runs in the BROWSER, where the same string is
               correctly read as local, and toISOString() then pins it to a real
               moment the server cannot misread. */
            date: new Date(entries[c.fsqId].date).toISOString(),
            partySize: entries[c.fsqId].partySize,
          })
        )
      );
      toast.success(
        booking
          ? "Table booked"
          : `Saved ${toBook.length} reservation${toBook.length > 1 ? "s" : ""}`
      );
      onSaved?.();
      onClose();
    } catch (err: any) {
      /* The route answers a validation failure with zod's fieldErrors, which is
         an OBJECT keyed by field. Passing that straight to toast made react-hot-
         toast render it as a React child, React threw "Objects are not valid as
         a React child", and with no error.tsx anywhere the whole tree unmounted
         — so a 400 that should have been a toast presented as a dead page.

         Narrowed rather than stringified: JSON in a toast is not an error
         message, and the field name is already visible in the network tab for
         anyone debugging. */
      const detail = err?.response?.data?.error;
      toast.error(
        typeof detail === "string" ? detail : "Couldn't save — try again."
      );
      setSaving(false);
    }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{booking ? "Book a table" : "Did you book a table?"}</h2>
        <p className={styles.subtitle}>
          {booking ? "Pick a time and a party size." : "Tick the places you actually reserved."}
        </p>

        {batch.map((c) => {
          const e = entries[c.fsqId];
          return (
            <div key={c.fsqId} className={styles.item}>
              <label className={styles.itemLabel}>
                {!booking && (
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={e.booked}
                    onChange={(ev) => update(c.fsqId, { booked: ev.target.checked })}
                  />
                )}
                <span className={styles.name}>{c.name}</span>
              </label>

              {e.booked && (
                <div className={`${styles.fields} ${booking ? styles.fieldsFlush : ""}`}>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={e.date}
                    onChange={(ev) => update(c.fsqId, { date: ev.target.value })}
                  />
                  <input
                    type="number"
                    min={1}
                    className={`${styles.input} ${styles.partyInput}`}
                    value={e.partySize}
                    onChange={(ev) =>
                      update(c.fsqId, { partySize: Math.max(1, Number(ev.target.value)) })
                    }
                  />
                </div>
              )}
            </div>
          );
        })}

        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={saving}>
            {booking ? "Cancel" : "Not now"}
          </button>
          <button type="button" className={styles.btnPrimary} onClick={save} disabled={saving}>
            {saving ? (booking ? "Booking…" : "Saving…") : booking ? "Book" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

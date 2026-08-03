"use client";
import React from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import styles from "./ReservationPrompt.module.css";

type Item = { fsqId: string; name: string };
type Entry = { booked: boolean; date: string; partySize: number };

function defaultDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); 
  return d.toISOString().slice(0, 16);
}

export function ReservationPrompt({ batch, onClose }: { batch: Item[]; onClose: () => void }) {
  const [entries, setEntries] = React.useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      batch.map((c) => [c.fsqId, { booked: false, date: defaultDate(), partySize: 2 }])
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
            date: entries[c.fsqId].date,
            partySize: entries[c.fsqId].partySize,
          })
        )
      );
      toast.success(`Saved ${toBook.length} reservation${toBook.length > 1 ? "s" : ""}`);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Couldn't save — try again.");
      setSaving(false);
    }
  }

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Did you book a table?</h2>
        <p className={styles.subtitle}>Tick the places you actually reserved.</p>

        {batch.map((c) => {
          const e = entries[c.fsqId];
          return (
            <div key={c.fsqId} className={styles.item}>
              <label className={styles.itemLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={e.booked}
                  onChange={(ev) => update(c.fsqId, { booked: ev.target.checked })}
                />
                <span className={styles.name}>{c.name}</span>
              </label>

              {e.booked && (
                <div className={styles.fields}>
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
            Not now
          </button>
          <button type="button" className={styles.btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

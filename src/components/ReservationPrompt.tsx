"use client";
import React from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { toast } from "react-hot-toast";

type Item = { fsqId: string; name: string };
type Entry = { booked: boolean; date: string; partySize: number };

function defaultDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // shift to local time
  return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM" for datetime-local
}

export function ReservationPrompt({ batch, onClose }: { batch: Item[]; onClose: () => void }) {
  // one form entry per restaurant, pre-filled with sensible defaults
  const [entries, setEntries] = React.useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      batch.map((c) => [c.fsqId, { booked: false, date: defaultDate(), partySize: 2 }])
    )
  );
  const [saving, setSaving] = React.useState(false);

  // immutable update: new outer object, new inner object
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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          width: 360,
          maxWidth: "90vw",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginBottom: 4, fontSize: 18, fontWeight: 700 }}>Did you book a table?</h2>
        <p style={{ marginBottom: 16, fontSize: 13, color: "#666" }}>
          Tick the places you actually reserved.
        </p>

        {batch.map((c) => {
          const e = entries[c.fsqId];
          return (
            <div key={c.fsqId} style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={e.booked}
                  onChange={(ev) => update(c.fsqId, { booked: ev.target.checked })}
                />
                <span style={{ fontWeight: 500 }}>{c.name}</span>
              </label>

              {e.booked && (
                <div style={{ display: "flex", gap: 8, marginTop: 6, paddingLeft: 24 }}>
                  <input
                    type="datetime-local"
                    value={e.date}
                    onChange={(ev) => update(c.fsqId, { date: ev.target.value })}
                  />
                  <input
                    type="number"
                    min={1}
                    value={e.partySize}
                    style={{ width: 64 }}
                    onChange={(ev) =>
                      update(c.fsqId, { partySize: Math.max(1, Number(ev.target.value)) })
                    }
                  />
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onClose} disabled={saving}>
            Not now
          </button>
          <button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

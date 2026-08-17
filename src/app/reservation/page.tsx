"use client";

import React from "react";
import axios from "axios";
import Nav from "@/components/Nav";
import { useUser, Restaurant, Reservation } from "@/lib/userContext";
import { useOpenReservation } from "@/lib/ReservationTracker";
import { googleMapsUrl } from "@/lib/mapsUrl";
import { ReviewPrompt, type PendingReview } from "@/components/ReviewPrompt";
import styles from "./page.module.css";

function formatReservationDate(date: string | Date) {
  const d = new Date(date);
  const day = d.toLocaleDateString("en-US", {
    weekday: "long",   // "Tuesday"
    month: "long",     // "July"
    day: "numeric",    // "28"
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day} · ${time}`;
}

type RowProps = {
  date: Date;
  partySize: number;
  rest: Restaurant;
  note: string;
  onCancel: () => void;
  canReview?: boolean;
  onReview?: () => void;
  onBookAgain?: () => void;
};

export default function ReservationPage() {
  const { user } = useUser();
  const openReservation = useOpenReservation();
  const [reservations, setReservations] = React.useState<Reservation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [toGet, setToGet] = React.useState<"upcoming" | "completed" | "cancelled">("upcoming");
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = React.useState<PendingReview | null>(null);

  const loadReservations = React.useCallback(() => {
    setLoading(true);
    axios
      .get("/api/reservations")
      .then((res) => setReservations(res.data.reservations ?? []))
      .catch(() => setReservations([]))
      .finally(() => setLoading(false));
  }, []);

  const loadPending = React.useCallback(() => {
    axios
      .get("/api/reviews/pending")
      .then((res) =>
        setPendingIds(
          new Set<string>(
            (res.data.pending ?? []).map((p: PendingReview) => p.reservationId)
          )
        )
      )
      .catch(() => setPendingIds(new Set()));
  }, []);

  React.useEffect(() => {
    loadReservations();
    loadPending();
  }, [loadReservations, loadPending]);

  const markReviewed = React.useCallback((reservationId: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(reservationId);
      return next;
    });
  }, []);

  const closeReview = React.useCallback(() => setReviewing(null), []);

  async function cancelReservation(res: Reservation) {
    await axios.patch("/api/reservations", {
      reservationId: res._id,
      status: "cancelled",
    });
    loadReservations();
  }

  const upcoming = reservations.filter((r) => r.status === "confirmed");
  const completed = reservations.filter((r) => r.status === "completed");
  const cancelled = reservations.filter((r) => r.status === "cancelled");

  const VIEWS = {
    upcoming:  { list: upcoming,  Row: UpcomingRes },
    completed: { list: completed, Row: CompletedRes },
    cancelled: { list: cancelled, Row: CancelledRes },
  } as const;

  const { list, Row } = VIEWS[toGet];

  const tabs = [
    { key: "upcoming" as const, label: "Upcoming", count: upcoming.length },
    { key: "completed" as const, label: "Completed", count: completed.length },
    { key: "cancelled" as const, label: "Cancelled", count: cancelled.length },
  ];

  return (
    <div className={styles.screen}>
      <Nav user={user ?? undefined} />
      <div className={styles.page}>
        <button className={styles.back}>
          <i className="ph-bold ph-arrow-left" />
          Back to Dashboard
        </button>

        <div className={styles.eyebrow}>Reservations</div>
        <h1 className={styles.title}>Your table history</h1>
        <p className={styles.subtitle}>Every table you&apos;ve booked, past and upcoming.</p>

        <div className={styles.toggle}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`${styles.toggleBtn} ${toGet === t.key ? styles.toggleActive : ""}`}
              onClick={() => setToGet(t.key)}
            >
              {t.label}
              <span className={styles.count}>{t.count}</span>
            </button>
          ))}
        </div>

        <div className={styles.list}>
          {loading ? (
            <div className={styles.empty}>Getting your reservations ready…</div>
          ) : list.length ? (
            list.map((r) => (
              <Row
                key={r._id}
                date={new Date(r.date)}
                partySize={r.partySize}
                rest={r.restaurant}
                note={r.notes ?? ""}
                onCancel={() => cancelReservation(r)}
                canReview={pendingIds.has(r._id)}
                onReview={() =>
                  setReviewing({
                    reservationId: r._id,
                    date: r.date,
                    restaurant: r.restaurant,
                  })
                }
                /* Reload after saving — the new table belongs in Upcoming, and
                   this list is a snapshot taken on mount. */
                onBookAgain={() =>
                  openReservation(
                    { fsqId: r.restaurant.fsqId, name: r.restaurant.name },
                    { onSaved: loadReservations }
                  )
                }
              />
            ))
          ) : (
            <div className={styles.empty}>
              <i className={`ph ph-calendar-x ${styles.emptyIcon}`} />
              <div>No {toGet} reservations.</div>
            </div>
          )}
        </div>
      </div>

      {reviewing && (
        <ReviewPrompt
          pending={[reviewing]}
          onClose={closeReview}
          onSubmitted={markReviewed}
        />
      )}
    </div>
  );
}

/* shared bits ------------------------------------------------------- */
function DateTile({ date }: { date: Date }) {
  return (
    <div className={styles.dateTile}>
      <span className={styles.month}>{date.toLocaleDateString("en-US", { month: "short" })}</span>
      <span className={styles.day}>{date.getDate()}</span>
    </div>
  );
}

function CardBody({ date, partySize, rest, note }: Omit<RowProps, "onCancel">) {
  return (
    <div className={styles.body}>
      <div className={styles.nameRow}>
        <h2 className={styles.name}>{rest?.name}</h2>
        <a
          className={styles.mapLink}
          href={googleMapsUrl(rest)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${rest?.name} on Google Maps`}
        >
          <i className="ph ph-map-pin" />
        </a>
      </div>
      <div className={styles.meta}>
        <span>{formatReservationDate(date)}</span>
        <span className={styles.dot}>•</span>
        <span>Party of {partySize}</span>
      </div>
      {note ? <div className={styles.note}>{note}</div> : null}
    </div>
  );
}

/* rows -------------------------------------------------------------- */
function UpcomingRes({ date, partySize, rest, note, onCancel }: RowProps) {
  return (
    <div className={styles.card}>
      <DateTile date={date} />
      <CardBody date={date} partySize={partySize} rest={rest} note={note} />
      <div className={styles.side}>
        <span className={`${styles.status} ${styles.statusConfirmed}`}>Confirmed</span>
        <button className={styles.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function CompletedRes({ date, partySize, rest, note, canReview, onReview, onBookAgain }: RowProps) {
  return (
    <div className={styles.card}>
      <DateTile date={date} />
      <CardBody date={date} partySize={partySize} rest={rest} note={note} />
      <div className={styles.side}>
        <span className={`${styles.status} ${styles.statusCompleted}`}>Completed</span>
        {canReview && (
          <button className={styles.btn} onClick={onReview}>
            <i className="ph ph-star" /> Rate this
          </button>
        )}
        <button className={styles.btn} onClick={onBookAgain}>Book Again</button>
      </div>
    </div>
  );
}

function CancelledRes({ date, partySize, rest }: RowProps) {
  return (
    <div className={styles.card}>
      <DateTile date={date} />
      <CardBody date={date} partySize={partySize} rest={rest} note="" />
      <div className={styles.side}>
        <span className={`${styles.status} ${styles.statusCancelled}`}>Cancelled</span>
      </div>
    </div>
  );
}

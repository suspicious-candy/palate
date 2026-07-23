"use client";

import React from "react";
import axios from "axios";
import { Restaurant, Reservation } from "@/lib/userContext";
import { googleMapsUrl } from "@/app/dashboard/page";

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
};

export default function ReservationPage() {
  const [reservations, setReservations] = React.useState<Reservation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [toGet, setToGet] = React.useState<"upcoming" | "completed" | "cancelled">("upcoming");

  const loadReservations = React.useCallback(() => {
    setLoading(true);
    axios
      .get("/api/reservations")
      .then((res) => setReservations(res.data.reservations ?? []))
      .catch(() => setReservations([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  async function cancelReservation(res: Reservation) {
    await axios.patch("/api/reservations", {
      reservationId: res._id,
      status: "cancelled",
    });
    loadReservations();
  }

  if (loading) {
    return <div>Getting your reservations ready…</div>;
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

  return (
    <div>
      <div>
        <button>Back to Dashboard</button>
      </div>
      <div>
        <h1>Reservations</h1>
        <p>{"Every table you've booked, past and upcoming"}</p>
      </div>
      <div>
        <button onClick={() => setToGet("upcoming")}>upcoming {upcoming.length}</button>
        <button onClick={() => setToGet("completed")}>Completed {completed.length}</button>
        <button onClick={() => setToGet("cancelled")}>Cancelled {cancelled.length}</button>
      </div>
      <div>
        {list.length ? (
          list.map((r) => (
            <Row
              key={r._id}
              date={new Date(r.date)}
              partySize={r.partySize}
              rest={r.restaurant}
              note={r.notes}
              onCancel={() => cancelReservation(r)}
            />
          ))
        ) : (
          <p>No {toGet} reservations.</p>
        )}
      </div>
    </div>
  );
}

function UpcomingRes({ date, partySize, rest, note, onCancel }: RowProps) {
  return (
    <div>
      <div>
        <p>{date.toLocaleDateString("en-US", { month: "short" })}</p>
        <p>{date.getDate()}</p>
      </div>
      <div>
        <h1>{rest?.name} .</h1>
        <a
          href={googleMapsUrl(rest)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${rest.name} on Google Maps`}
        >
          <i className="ph ph-map-pin" />
        </a>
      </div>
      <div>
        <p>{formatReservationDate(date)} .</p>
        <p>Party of {partySize}</p>
      </div>
      <div>
        <p>{note}</p>
      </div>
      <div>
        <p>confirmed</p>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function CompletedRes({ date, partySize, rest, note }: RowProps) {
  return (
    <div>
      <div>
        <p>{date.toLocaleDateString("en-US", { month: "short" })}</p>
        <p>{date.getDate()}</p>
      </div>
      <div>
        <h1>{rest?.name} .</h1>
        <a
          href={googleMapsUrl(rest)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${rest.name} on Google Maps`}
        >
          <i className="ph ph-map-pin" />
        </a>
      </div>
      <div>
        <p>{formatReservationDate(date)} .</p>
        <p>Party of {partySize}</p>
      </div>
      <div>{note}</div>
      <div>
        <p>Completed</p>
        <button>Book Again</button>
      </div>
    </div>
  );
}

function CancelledRes({ date, partySize, rest }: RowProps) {
  return (
    <div>
      <div>
        <p>{date.toLocaleDateString("en-US", { month: "short" })}</p>
        <p>{date.getDate()}</p>
      </div>
      <div>
        <h1>{rest?.name} .</h1>
        <a
          href={googleMapsUrl(rest)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${rest.name} on Google Maps`}
        >
          <i className="ph ph-map-pin" />
        </a>
      </div>
      <div>
        <p>{formatReservationDate(date)} .</p>
        <p>Party of {partySize}</p>
      </div>
      <div>
        <p>Cancelled</p>
      </div>
    </div>
  );
}

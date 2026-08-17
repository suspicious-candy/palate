"use client";

import React from "react";
import axios from "axios";
import { useUser } from "@/lib/userContext";
import { ReviewPrompt, type PendingReview } from "./ReviewPrompt";

export function PendingReviews() {
  const { user } = useUser();
  const [pending, setPending] = React.useState<PendingReview[]>([]);
  const [dismissed, setDismissed] = React.useState(false);
  const fetchedFor = React.useRef<string | null>(null);

  const userId = user?._id ?? null;

  React.useEffect(() => {
    if (!userId || fetchedFor.current === userId) return;
    fetchedFor.current = userId;

    axios
      .get("/api/reviews/pending")
      .then((res) => setPending(res.data.pending ?? []))
      .catch(() => setPending([]));
  }, [userId]);

  const close = React.useCallback(() => setDismissed(true), []);

  if (dismissed || pending.length === 0) return null;

  return <ReviewPrompt pending={pending} onClose={close} />;
}

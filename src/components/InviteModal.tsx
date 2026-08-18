"use client"

import React from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import axios from "axios";
import { toast } from "react-hot-toast";
import styles from "./InviteModal.module.css";
import type { User } from "@/lib/userContext";

export default function InviteModal({
    user,
    onClose,
}: {
    user: User | null;
    onClose: () => void;
}) {
    const [mounted, setMounted] = React.useState(false);
    const [link, setLink] = React.useState("");
    const [qr, setQr] = React.useState("");
    const [copied, setCopied] = React.useState(false);
    const [identifier, setIdentifier] = React.useState("");
    const [sending, setSending] = React.useState(false);

    React.useEffect(() => setMounted(true), []);

    // The origin is known only in the browser, so the link is built after mount
    // rather than during render.
    React.useEffect(() => {
        if (!user?.username) return;
        setLink(`${window.location.origin}/add/${user.username}`);
    }, [user?.username]);

    React.useEffect(() => {
        if (!link) return;
        QRCode.toDataURL(link, {
            margin: 0,
            width: 240,
            color: { dark: "#1a1a1a", light: "#ffffff" },
        })
            .then(setQr)
            .catch(() => setQr(""));
    }, [link]);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Could not copy the link");
        }
    };

    const sendInvite = async () => {
        const value = identifier.trim();
        if (!value) return;

        setSending(true);
        try {
            const res = await axios.post("/api/user/friends", { identifier: value });
            toast.success(res.data?.message ?? "Request sent");
            setIdentifier("");
        } catch (error: any) {
            toast.error(error.response?.data?.error ?? "Could not send the invite");
        } finally {
            setSending(false);
        }
    };

    if (!mounted) return null;

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-label="Invite friends to Palate"
                onClick={(e) => e.stopPropagation()}
            >
                <button className={styles.close} onClick={onClose} aria-label="Close">
                    ✕
                </button>

                <h1 className={styles.title}>Invite friends to Palate</h1>
                <p className={styles.subtitle}>Share a link or QR — friends join instantly.</p>

                <div className={styles.qrPanel}>
                    <div className={styles.qrBox}>
                        {qr ? (
                            <img src={qr} alt="QR code for your invite link" className={styles.qr} />
                        ) : null}
                    </div>
                    <p className={styles.qrText}>
                        Scan with a phone camera to open Palate and join tonight&apos;s table.
                    </p>
                </div>

                <h2 className={styles.label}>Share link</h2>
                <div className={styles.row}>
                    <input
                        className={styles.linkInput}
                        value={link}
                        readOnly
                        onFocus={(e) => e.target.select()}
                        aria-label="Your invite link"
                    />
                    <button className={styles.primary} onClick={copyLink} disabled={!link}>
                        {copied ? "Copied" : "Copy link"}
                    </button>
                </div>

                <h2 className={styles.label}>Or add by name</h2>
                <div className={styles.row}>
                    <input
                        className={styles.nameInput}
                        placeholder="Username or email"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") sendInvite();
                        }}
                    />
                    <button
                        className={styles.secondary}
                        onClick={sendInvite}
                        disabled={sending || !identifier.trim()}
                    >
                        {sending ? "Sending" : "Send"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

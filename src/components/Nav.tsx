"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Nav.module.css";

function initials(first?: string, last?: string): string {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export default function Nav({ user }: { user?: { firstName?: string; lastName?: string } }) {
    const pathname = usePathname();

    return (
        <nav className={styles.nav}>
            <div className={styles.navInner}>
                <Link href="/dashboard" className={styles.brand}>Palate</Link>

                <div className={styles.navLinks}>
                    <Link
                        href="/dashboard"
                        className={`${styles.navLink} ${pathname === "/dashboard" ? styles.navLinkActive : ""}`}
                    >
                        Home
                    </Link>
                    <Link
                        href="/matching/group"
                        className={`${styles.navLink} ${pathname === "/matching/group" ? styles.navLinkActive : ""}`}
                    >
                        Groups
                    </Link>
                    <span className={styles.navLink}>Reservations</span>
                    <span className={styles.navLink}>Lists</span>
                </div>

                <div className={styles.navSpacer} />

                <div className={styles.navAvatar}>
                    {initials(user?.firstName, user?.lastName)}
                </div>
            </div>
        </nav>
    );
}

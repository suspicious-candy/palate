"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Nav.module.css";
import SearchModal from "./SearchModal";

function initials(first?: string, last?: string): string {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export default function Nav({ user }: { user?: { firstName?: string; lastName?: string } }) {
    const pathname = usePathname();
    const [isOpen,setIsOpen] = React.useState(false);

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
                    <Link
                        href="/lists"
                        className={`${styles.navLink} ${pathname === "/lists" ? styles.navLinkActive : ""}`}
                    >
                        Lists
                    </Link>
                </div>

                <div className={styles.navSpacer} />

                <button
                    className={styles.searchTrigger}
                    onClick={() => setIsOpen(true)}
                    aria-label="Search restaurants"
                >
                    <i className="ph ph-magnifying-glass" />
                </button>
                {isOpen && <SearchModal onClose={() => setIsOpen(false)} />}
                <div className={styles.navAvatar}>
                    {initials(user?.firstName, user?.lastName)}
                </div>
            </div>
        </nav>
    );
}

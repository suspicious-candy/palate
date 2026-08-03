"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import styles from "./Nav.module.css";
import SearchModal from "./SearchModal";
import FriendsModal from "./FriendsModal";
import { useUser } from "@/lib/userContext";
import { initials } from "@/lib/initials";

export default function Nav({ user }: { user?: { firstName?: string; lastName?: string } }) {
    const pathname = usePathname();
    const router = useRouter();
    const { setUser, pending } = useUser();
    const [isOpen,setIsOpen] = React.useState(false);
    const [menuOpen, setMenuOpen] = React.useState(false);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const [inboxOpen,setInboxOpen]=React.useState(false);
    React.useEffect(() => {
        if (!menuOpen) return;

        function onMouseDown(e: MouseEvent) {
            if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
        }
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setMenuOpen(false);
        }

        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [menuOpen]);

    async function handleLogout() {
        setMenuOpen(false);
        try {
            await axios.post("/api/user/logout");
            setUser(null);
            router.replace("/login");
        } catch {
            toast.error("Could not log out. Please try again.");
        }
    }

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
                    <Link
                        href="/reservation"
                        className={`${styles.navLink} ${pathname === "/reservation" ? styles.navLinkActive : ""}`}
                    >
                        Reservations
                    </Link>
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
                {inboxOpen && <FriendsModal onClose={() => setInboxOpen(false)} />}
                <div className={styles.navAvatarWrap} ref={menuRef}>
                    <button
                        type="button"
                        className={`${styles.navAvatar} ${pathname === "/profile" ? styles.navAvatarActive : ""}`}
                        onClick={() => setMenuOpen((open) => !open)}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-label={
                            pending.length > 0
                                ? `Account menu, ${pending.length} pending friend requests`
                                : "Account menu"
                        }
                    >
                        {initials(user?.firstName, user?.lastName)}
                    </button>
                    
                    {pending.length > 0 && (
                        <span className={styles.navBadge}>{pending.length}</span>
                    )}

                    {menuOpen && (
                        <div className={styles.menu} role="menu">
                            <button
                                type="button"
                                role="menuitem"
                                className={styles.menuItem}
                                onClick={()=>{setMenuOpen(false);setInboxOpen(true);}}
                            >
                                <i className="ph ph-users-three" />
                                Friends
                                {pending.length > 0 && (
                                    <span className={styles.menuCount}>{pending.length}</span>
                                )}
                            </button>
                            <Link
                                href="/profile"
                                role="menuitem"
                                className={styles.menuItem}
                                onClick={() => setMenuOpen(false)}
                            >
                                <i className="ph ph-user" />
                                Profile
                            </Link>
                            <button
                                type="button"
                                role="menuitem"
                                className={styles.menuItem}
                                onClick={handleLogout}
                            >
                                <i className="ph ph-sign-out" />
                                Log out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}

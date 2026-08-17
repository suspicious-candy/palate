import VerifyEmailClient from "./VerifyEmailClient";
import styles from "./verify.module.css";

/* Server component reads the token and hands it down as a prop, rather than the
   client reading it with useSearchParams. Same result, one less moving part:
   useSearchParams opts the whole subtree into client-side rendering and has to
   be wrapped in <Suspense> or the build fails. Mirrors join/[code]/page.tsx —
   server page, one small client island for the part that actually acts. */
export default async function VerifyEmailPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    /* `searchParams` is a Promise in this version of Next and must be awaited —
       see AGENTS.md. */
    const { token } = await searchParams;

    if (!token) {
        return (
            <div className={styles.screen}>
                <div className={styles.card}>
                    <span className={styles.brand}>Palate</span>
                    <h1 className={styles.title}>Nothing to verify</h1>
                    <p className={styles.subtitle}>
                        This link is missing its token. Open the one from your inbox.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.screen}>
            <div className={styles.card}>
                <span className={styles.brand}>Palate</span>
                <VerifyEmailClient token={token} />
            </div>
        </div>
    );
}

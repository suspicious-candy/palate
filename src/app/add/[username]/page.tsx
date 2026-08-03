import { connect } from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js";
import AddFriendButton from "./AddFriendButton";
import styles from "./add.module.css";

export default async function AddFriendPage(
    { params }: { params: Promise<{ username: string }> }
) {
    const { username } = await params;

    await connect();
    const inviter: any = await User.findOne({ username })
        .select({ username: 1, firstName: 1, lastName: 1, profilePic: 1 })
        .lean();

    if (!inviter) {
        return (
            <div className={styles.screen}>
                <div className={styles.card}>
                    <span className={styles.brand}>Palate</span>
                    <h1 className={styles.title}>Invite not found</h1>
                    <p className={styles.subtitle}>
                        No Palate account matches this link.
                    </p>
                </div>
            </div>
        );
    }

    const displayName =
        [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") ||
        inviter.username;

    return (
        <div className={styles.screen}>
            <div className={styles.card}>
                <span className={styles.brand}>Palate</span>

                {inviter.profilePic ? (
                    <img src={inviter.profilePic} alt="" className={styles.avatar} />
                ) : (
                    <div className={styles.avatarFallback}>
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                )}

                <h1 className={styles.title}>{displayName} wants to be friends</h1>
                <p className={styles.subtitle}>@{inviter.username}</p>

                <AddFriendButton username={inviter.username} />
            </div>
        </div>
    );
}

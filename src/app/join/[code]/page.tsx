import { connect } from "@/dbConfig/dbConfig";
import matchingModel from "@/models/matching.js";
/* Side-effect import, not dead code: Mongoose resolves `ref: "users"` by
   looking the model up BY NAME in its registry, so populating createdBy from a
   module that never imports it throws MissingSchemaError. */
import "@/models/userModel.js";
import { USER_SUMMARY } from "@/lib/activeGroup";
import { groupIsStale, votingClosesAt } from "@/lib/groupVote";
import JoinGroupButton from "./JoinGroupButton";
import styles from "./join.module.css";

/* What this page is allowed to know.

   Deliberately NOT findGroupByInviteCode: that runs GROUP_POPULATE, which pulls
   in participants.approvals and the restaurant shortlist. This page is public —
   anyone holding a forwarded URL can load it, signed in or not — so handing it
   the full group would mean a stranger reading everyone's ballots before the
   organiser has even seen their request. The projection IS the privacy
   boundary here, the same way USER_SUMMARY is for every populated user ref.

   participants is projected down to `.user` alone: enough to count heads,
   without shipping everyone's location and votes to do it. */
type InviteView = {
    _id: any;
    name: string;
    date: string | Date;
    status: "open" | "voting" | "closed";
    membershipOpen?: boolean;
    createdBy?: { firstName?: string; lastName?: string; username?: string; profilePic?: string } | null;
    participants: { user: any }[];
};

export default async function JoinGroupPage(
    { params }: { params: Promise<{ code: string }> }
) {
    /* `params` is a Promise in this version of Next and must be awaited — see
       AGENTS.md. The folder is [code], so the key is `code`. */
    const { code } = await params;

    await connect();

    const group = await matchingModel
        .findOne({ inviteCode: code })
        .select("name date status membershipOpen createdBy participants.user")
        .populate("createdBy", USER_SUMMARY)
        .lean<InviteView | null>();

    if (!group) {
        return (
            <Shell
                title="Invite not found"
                subtitle="This link has expired or was never valid."
            />
        );
    }

    /* Both refusals rendered before the button exists, rather than letting
       someone click into a 409. Split for the same reason the API splits them:
       a settled group picked a place, a stale one simply happened — possibly
       while still sitting at status "voting" because nobody reopened it. */
    if (group.status === "closed") {
        return (
            <Shell
                title={group.name}
                subtitle="This group has already settled on a place."
            />
        );
    }
    if (groupIsStale(group)) {
        return <Shell title={group.name} subtitle="This dinner has already happened." />;
    }

    const host = group.createdBy ?? null;
    const hostName =
        [host?.firstName, host?.lastName].filter(Boolean).join(" ") ||
        host?.username ||
        "Someone";

    const going = group.participants?.length ?? 0;

    /* Formatted on the server, so this renders in the SERVER's timezone rather
       than the visitor's. Acceptable because there is no client component
       re-rendering the same string (nothing to mismatch on hydration), but it
       is why the ISO value also goes into <time dateTime> — that stays
       unambiguous regardless of where it is read. */
    const when = new Date(group.date).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

    const closesAt = votingClosesAt(group);
    const rosterLocked = group.membershipOpen === false;

    return (
        <div className={styles.screen}>
            <div className={styles.card}>
                <span className={styles.brand}>Palate</span>

                {host?.profilePic ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-supplied avatar host; see the images note in next.config.ts
                    <img src={host.profilePic} alt="" className={styles.avatar} />
                ) : (
                    <div className={styles.avatarFallback}>
                        {hostName.charAt(0).toUpperCase()}
                    </div>
                )}

                <h1 className={styles.title}>{hostName} invited you to dinner</h1>
                <p className={styles.subtitle}>{group.name}</p>

                <p className={styles.meta}>
                    <time dateTime={new Date(group.date).toISOString()}>{when}</time>
                </p>
                {/* A count, never the roster. Who else is going is the group's
                    business until you are actually in it. */}
                <p className={styles.meta}>
                    {going} {going === 1 ? "person" : "people"} going
                </p>

                {rosterLocked ? (
                    <p className={styles.note}>
                        The organiser has locked the guest list — ask {hostName} to
                        reopen it.
                    </p>
                ) : (
                    <>
                        <p className={styles.note}>
                            If you&apos;re friends with an organiser you&apos;ll join
                            straight away. Otherwise they&apos;ll get your request to
                            approve.
                            {closesAt
                                ? ` Voting closes ${closesAt.toLocaleString("en-US", {
                                      weekday: "short",
                                      hour: "numeric",
                                      minute: "2-digit",
                                  })}.`
                                : ""}
                        </p>
                        <JoinGroupButton code={code} />
                    </>
                )}
            </div>
        </div>
    );
}

/* The three dead-end states differ only in their words, and none of them show a
   button — there is nothing to click on a group you cannot join. */
function Shell({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className={styles.screen}>
            <div className={styles.card}>
                <span className={styles.brand}>Palate</span>
                <h1 className={styles.title}>{title}</h1>
                <p className={styles.subtitle}>{subtitle}</p>
            </div>
        </div>
    );
}

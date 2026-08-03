/* Shared by Nav and FriendsModal. Lives here rather than in Nav because
   FriendsModal is imported *by* Nav — importing it back out would make a
   circular module dependency. */
export function initials(first?: string, last?: string): string {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

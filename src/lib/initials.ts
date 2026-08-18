/* Shared by Nav and FriendsModal. Lives here rather than in Nav because
   FriendsModal is imported by Nav, so importing it back out would create a
   circular module dependency. */
export function initials(first?: string, last?: string): string {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

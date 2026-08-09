/* userModel is a .js file, so anything Mongoose returns arrives as `any`.
   Annotating the query gives the preferences shape a real type instead. */
export type UserPreferences = {
    likedCuisines?: { fsqid?: number; name: string }[];
    disliked?: string[];
    allergines?: string[];
    diet?: string[];
};

/**
 * One person's taste, as a sentence the vector index can be searched with.
 *
 * Deliberately shaped like the text the index was BUILT from. rebuild_index.py's
 * build_text() emits "A Italian, Pizza. Located in Brooklyn. Has a good rating."
 * — categories first, restaurant name excluded. Matching that construction means
 * the similarity comes from what the words mean rather than from one side
 * reading like a sentence and the other like a list.
 *
 * Only ATTRACTION goes in here. There is no NOT in vector space: a query saying
 * "no shellfish" pushes toward shellfish, because that is the token carrying the
 * meaning. `disliked` and `allergines` are therefore absent by design — they
 * belong to the caller as a hard filter over candidates, never as text.
 *
 * @returns the sentence, or null when this person has stated no taste at all.
 *   Null rather than a generic "A restaurant": a neutral phrase sits near the
 *   centre of the corpus and scores moderately against everything, and
 *   /recommend/group z-scores each member's row before aggregating — which
 *   would promote that noise to a full-strength vote, and with `blend` being
 *   half least-misery, let it set the minimum. Someone with nothing to say
 *   should abstain from the ranking, not vote randomly in it.
 */
export function buildTasteQuery(preferences: UserPreferences | null): string | null {
    
    const terms = [
        ...(preferences?.likedCuisines?.map((c) => c.name) ?? []),
        ...(preferences?.diet ?? []),
    ].filter((t) => t?.trim());

    if (terms.length === 0) return null;

    return `A ${terms.join(", ")} restaurant`;
}

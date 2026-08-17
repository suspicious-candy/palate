/* userModel is a .js file, so anything Mongoose returns arrives as `any`.
   Annotating the query gives the preferences shape a real type instead. */
export type UserPreferences = {
    likedCuisines?: { fsqid?: number; name: string }[];
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
 * meaning. `allergines` is therefore absent by design — an aversion can only be
 * expressed as a hard filter over candidates, never as text. (There is no
 * exclusion filter at all any more; `disliked` was removed as a tracked field.)
 *
 * `learned` is the same kind of term arriving from a different place: cuisines
 * the person has actually eaten and rated 4+, from loadLearnedCuisines. Stated
 * preferences go in FIRST and the total is capped, so behaviour supplements an
 * explicit choice rather than overruling it — someone who ticked "Italian" at
 * onboarding and then rated three Thai places highly should read as both, not
 * as Thai. Loaded outside this function so it stays pure and so the group
 * shortlist can fetch every member's signal in one query.
 *
 * @returns the sentence, or null when this person has stated no taste at all.
 *   Null rather than a generic "A restaurant": a neutral phrase sits near the
 *   centre of the corpus and scores moderately against everything, and
 *   /recommend/group z-scores each member's row before aggregating — which
 *   would promote that noise to a full-strength vote, and with `blend` being
 *   half least-misery, let it set the minimum. Someone with nothing to say
 *   should abstain from the ranking, not vote randomly in it.
 */
/* Ceiling on the whole sentence. Past a handful of terms the vector drifts
   toward the centre of the corpus — it matches everything a little and nothing
   well — and with stated preferences listed first, this is what makes the cap
   fall on the inferred terms. */
const MAX_TERMS = 6;

export function buildTasteQuery(
    preferences: UserPreferences | null,
    learned: string[] = []
): string | null {

    const terms = [
        ...(preferences?.likedCuisines?.map((c) => c.name) ?? []),
        ...(preferences?.diet ?? []),
        ...learned,
    ].filter((t) => t?.trim());

    /* Case-insensitive, because "Thai" from onboarding and "Thai Restaurant"
       from a category are near-duplicates that would both spend a term. Exact
       repeats are the ones worth removing; near ones are left alone rather than
       guessed at. */
    const seen = new Set<string>();
    const unique = terms.filter((t) => {
        const key = t.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (unique.length === 0) return null;

    return `A ${unique.slice(0, MAX_TERMS).join(", ")} restaurant`;
}

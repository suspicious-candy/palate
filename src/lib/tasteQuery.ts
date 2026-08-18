/* userModel is a .js file, so Mongoose queries return `any`. This annotation
   gives the preferences shape a real type. */
export type UserPreferences = {
    likedCuisines?: { fsqid?: number; name: string }[];
    allergines?: string[];
    diet?: string[];
};

/**
 * Builds one person's taste as a sentence the vector index can be searched with.
 *
 * Mirrors the text the index was built from. build_text() in rebuild_index.py
 * emits "A Italian, Pizza. Located in Brooklyn. Has a good rating." — categories
 * first, restaurant name excluded. Matching that construction keeps the
 * similarity driven by what the words mean, rather than by one side reading as
 * prose and the other as a list.
 *
 * Only attraction terms belong here. Vector space has no NOT: a query saying
 * "no shellfish" moves toward shellfish, because that is the token carrying the
 * meaning. `allergines` is therefore excluded by design — an aversion works only
 * as a hard filter over candidates, never as query text. (`disliked` was removed
 * as a tracked field, so there is no exclusion filter at all any more.)
 *
 * `learned` carries the same kind of term from a different source: cuisines the
 * person has actually eaten and rated 4+, supplied by loadLearnedCuisines.
 * Stated preferences are listed first and the total is capped, so behaviour
 * supplements an explicit choice instead of overruling it — someone who ticked
 * "Italian" at onboarding and then rated three Thai places highly reads as both,
 * not as Thai. It is loaded outside this function to keep the function pure, and
 * so the group shortlist can fetch every member's signal in one query.
 *
 * @returns the sentence, or null when this person has stated no taste at all.
 *   Null rather than a generic "A restaurant": a neutral phrase sits near the
 *   centre of the corpus and scores moderately against everything.
 *   /recommend/group z-scores each member's row before aggregating, which would
 *   promote that noise to a full-strength vote — and with `blend` being half
 *   least-misery, let it set the minimum. Someone with nothing to say should
 *   abstain from the ranking rather than vote randomly in it.
 */

/* Ceiling on the whole sentence. Past a handful of terms the vector drifts
   toward the centre of the corpus, matching everything a little and nothing
   well. Stated preferences are listed first, so the cap falls on the inferred
   terms. */
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

    /* Case-insensitive: "Thai" from onboarding and "Thai Restaurant" from a
       category are near-duplicates that would each spend a term. Only exact
       repeats are removed; near ones are left alone rather than guessed at. */
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

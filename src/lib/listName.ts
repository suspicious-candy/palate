import { z } from "zod";

/* One definition, two consumers — the same reasoning as protectedRoutes.ts.

   /api/user/lists creates and deletes the named list; /api/Restaurants/lists
   adds and removes restaurants inside it. Both interpolate the name into a
   Mongo update path (`lists.${name}`), so both need identical rules, and two
   copies would drift in exactly the direction that hurts: one route accepting a
   key the other cannot address.

   WHY THIS IS A VALIDATOR AND NOT MERELY A LENGTH CHECK

   `user.lists` is a Map, and Mongoose addresses a Map entry by building a dotted
   update path. That means the NAME BECOMES PART OF THE QUERY, and a name that
   contains path syntax is not stored as a key — it is executed as structure.
   Three characters do real damage, all confirmed against a live account:

     "a.b.c"  A dot is a path separator, so this wrote lists.a = { b: { c: [] } }
              — a nested object where the schema declares [ObjectId]. The Map can
              no longer be cast on read, so `user.lists` comes back UNDEFINED and
              every later request to either route throws on `.has(...)`. The
              account's lists feature is bricked, permanently, and nothing short
              of a manual repair brings it back.

     "$set"   A leading $ makes the key an operator position. This wiped the
              entire lists map in one request.

     ""       Produces the path "lists.", which Mongo rejects outright — a 500
              quoting the driver at a user who typed nothing.

   Hence a character class rather than a blocklist: everything except the three
   dangerous glyphs is allowed, so a list called "Date night 💛" or "Mum's
   birthday" still works. Rejecting is the whole job; nothing here sanitises,
   because silently renaming what someone typed is its own bug. */
const FORBIDDEN = /[.$\0]/;

/* THE SECOND CLASS OF DANGEROUS NAME, and the one the character check above
   misses entirely — these contain no special characters at all.

   Mongo stores `lists.__proto__` happily; BSON field names carry no JavaScript
   meaning. The damage happens on the way back out, when the Map is turned into
   a plain object: assigning the key `__proto__` on a JS object sets its
   PROTOTYPE rather than creating an own property, and `constructor` and
   `prototype` corrupt the conversion the same way. The result is identical to
   the dotted-name bug this module was written for — `user.lists` comes back
   undefined, the dashboard and /lists render nothing, and MAX_LISTS stops
   firing because the size it reads is zero.

   Measured, one list each, then one ordinary list after it:

     "__proto__"      Mongo 2 keys -> dashboard undefined
     "constructor"    Mongo 2 keys -> dashboard undefined
     "prototype"      Mongo 2 keys -> dashboard undefined
     "toString"       Mongo 2 keys -> dashboard 2 keys   (fine)
     "hasOwnProperty" Mongo 2 keys -> dashboard 2 keys   (fine)

   So the list is exactly these three, not "anything on Object.prototype" —
   toString and hasOwnProperty are shadowed as ordinary own properties and cause
   no trouble. Case-sensitive, because the JS behaviour is: "__PROTO__" is an
   ordinary key. */
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

export const MAX_LIST_NAME = 60;

/* A cap on how many lists one account may hold, for the same reason
   ADDRESS_LIMIT exists in the addresses route: `lists` is populated on every
   dashboard load (`lists.$*`), so growth here is paid for on every page view.
   The number that matters is how many a person will actually keep. */
export const MAX_LISTS = 50;

export const listNameSchema = z
    .string()
    .trim()
    .min(1, "A list needs a name.")
    .max(MAX_LIST_NAME, `Keep the name under ${MAX_LIST_NAME} characters.`)
    /* .refine rather than .regex so the message can name the actual problem.
       "does not match /^[^.$\0]+$/" is not something to show a person. */
    .refine(
        (name) => !FORBIDDEN.test(name),
        "A list name can't contain a dot or a dollar sign."
    )
    .refine(
        (name) => !RESERVED.has(name),
        "That name is reserved — please pick another."
    );

/* `node:crypto`, not the `crypto` global — that one is WebCrypto and has no
   randomBytes at all. Importing the module makes this file server-only, which is
   correct: nothing in the browser has any business minting invite codes. */
import { randomBytes } from "node:crypto";

/* 32 symbols, and the count is load-bearing rather than aesthetic — see the
   check below.

   Uppercase and digits only, with every ambiguous glyph removed: no I or L
   (they read as 1), no O (reads as 0), and no 0 itself. What survives can be
   read aloud down a table or copied off a screen without anyone having to ask
   which character that was. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ123456789";

/* Ten symbols at 5 bits each, so 32^10 or about 50 bits. Far past guessing over
   HTTP, and short enough to fit on a phone screen next to a QR code. */
const CODE_LENGTH = 10;

/* Guards against modulo bias. Mapping a random byte with `byte % n` is uniform
   only when n divides 256. At 32 it does: every symbol is produced by exactly 8
   of the 256 byte values. Drop one character from the alphabet and 256 % 31 is
   8, so the first nine symbols get an extra byte value each and turn up about 3%
   more often than the rest — a silent loss of entropy nothing downstream would
   surface. Throwing at import is deliberate: a biased code generator that still
   returns plausible codes is exactly the kind of thing that ships. */
if (256 % ALPHABET.length !== 0) {
    throw new Error(
        `inviteCode alphabet must divide 256 to avoid modulo bias, got ${ALPHABET.length}`
    );
}

/**
 * A fresh invite code. Not checked for uniqueness — that is the unique index's
 * job, and the caller's retry-on-11000 is what resolves a collision. Checking
 * here would be a read followed by a write with a gap in between, which is the
 * race rather than the fix.
 */
export function generateInviteCode(length: number = CODE_LENGTH): string {
    const bytes = randomBytes(length);
    let code = "";
    for (const byte of bytes) {
        code += ALPHABET[byte % ALPHABET.length];
    }
    return code;
}

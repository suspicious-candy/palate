/* What must never leave the server on a user document.

   The dashboard route worked this out first and wrote down why: `verifyToken`
   and `forgotPasswordToken` are the same KIND of secret as the password hash.
   Anyone holding verifyToken can verify the account; anyone holding
   forgotPasswordToken can reset it. A projection of "-password" alone looks
   careful and ships both.

   That reasoning was correct and it stayed in one route. Eight other call sites
   across five files kept `.select("-password")`, so every profile edit, every
   preference change, and every add-to-list handed the caller a live
   verification token for their own account in the response body — where it sits
   in browser memory, in any logged network trace, and in the console of anyone
   they screen-share with.

   Hence one constant. A projection string is exactly the kind of thing that
   gets copied to a new route minus the part someone did not understand, and the
   only durable fix is for there to be nothing to copy.

   isVerified is deliberately NOT excluded: the profile page reads it to show
   the badge and the resend button. */
export const SAFE_USER_FIELDS =
    "-password -verifyToken -verifyTokenExpiry " +
    "-forgotPasswordToken -forgotPasswordTokenExpiry";

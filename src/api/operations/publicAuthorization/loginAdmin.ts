import { graphql } from '@gql/publicAuthorization'

/**
 * The only operation this app sends to the public endpoint.
 *
 * `LoginAppType` also carries `onboardingStep` and `onboardingDone`, and they are deliberately not
 * selected: `loginAdmin` hard-codes them (`''` and `true`) because onboarding is an ShopOwner
 * concept and the `admin` collection has no such fields. Asking for them would type a value the
 * operator app must never branch on.
 *
 * `rememberMe` chooses the session cap the server stamps into the refresh session at login — one day
 * unchecked, thirty checked (E14-S05, E14-S07) — not the cookie's lifetime, which is the same either way.
 * The cap is fixed at that moment and enforced on every refresh, so it is a real checkbox on the login form
 * rather than a constant: pinning it here would silently decide how long an operator stays signed in.
 *
 * ⚠️ `turnstileToken` is nullable on both sides, and the gate still holds. The widget is disabled on a
 * machine with no `VITE_TURNSTILE_SITE_KEY`, so this variable is `null` on every developer box and in
 * every test; the server verifies a token only when it holds a secret key of its own, which is exactly
 * where the tokenless request gets refused. Sending `null` cannot weaken the gate — it can only fail to
 * help — so the variable is declared `String`, not `String!`.
 */
export const LoginAdminDocument = graphql(`
	mutation LoginAdmin($email: String!, $password: String!, $rememberMe: Boolean!, $turnstileToken: String) {
		loginAdmin(email: $email, password: $password, rememberMe: $rememberMe, turnstileToken: $turnstileToken) {
			accessToken
		}
	}
`)

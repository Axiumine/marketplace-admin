import { graphql } from '@gql/publicAuthorization'

/**
 * The only operation this app sends to the public endpoint.
 *
 * `LoginAppType` also carries `onboardingStep` and `onboardingDone`, and they are deliberately not
 * selected: `loginAdmin` hard-codes them (`''` and `true`) because onboarding is an ShopOwner
 * concept and the `admin` collection has no such fields. Asking for them would type a value the
 * operator app must never branch on.
 *
 * `rememberMe` controls the lifetime of the refresh-token cookie on the server, so it is a real
 * checkbox on the login form rather than a constant — pinning it here would silently decide how long
 * an operator stays signed in.
 */
export const LoginAdminDocument = graphql(`
	mutation LoginAdmin($email: String!, $password: String!, $rememberMe: Boolean!) {
		loginAdmin(email: $email, password: $password, rememberMe: $rememberMe) {
			accessToken
		}
	}
`)

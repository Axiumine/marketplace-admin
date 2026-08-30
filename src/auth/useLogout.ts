import { useNavigate } from '@tanstack/react-router'
import { useMutation } from 'urql'

import { CTX_LOGOUT } from '@/api/endpoints'
import { LogoutDocument } from '@/api/operations/logout/logout'
import { clearAccessToken } from '@/api/tokenStore'
import { clearSession } from '@/auth/session'

/**
 * Ends the session and returns to the login page.
 *
 * The local state is cleared unconditionally, without looking at the mutation result. `logout` returns
 * `true` whatever it managed to delete server-side, and a logout that failed on the server still has
 * to log the admin out of this browser — leaving a token in memory because a request went wrong is
 * the opposite of what the button promises.
 *
 * urql resolves mutation errors into the result instead of rejecting, so there is no rejection path to
 * guard here.
 *
 * Not memoised. The returned function is only ever attached to a click handler — nothing lists it among
 * the dependencies of an effect — so a new identity per render costs a property assignment and buys the
 * caller no obligation to keep it stable.
 */
export const useLogout = (): (() => Promise<void>) => {
	const [, executeLogout] = useMutation(LogoutDocument)
	const navigate = useNavigate()

	return async () => {
		await executeLogout({}, CTX_LOGOUT)
		clearAccessToken()
		clearSession()
		await navigate({ to: '/' })
	}
}

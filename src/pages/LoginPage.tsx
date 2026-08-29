import { LoginForm } from '@/features/login/LoginForm'

/**
 * The unauthenticated landing page.
 *
 * ⚠️ There is deliberately no "forgotten password" flow, and the note in the card says so rather
 * than leaving the omission to be read as an oversight. The platform's only recovery pair — `resetPwd`
 * and `updatePwd` on public-resource — looks the address up in the `shopOwner` collection, so it
 * answers "email not found" for every admin account that exists. A link to it would be a dead end
 * that looks like a bug in the admin's own credentials.
 *
 * Recovering an admin password is a manual, backend-side operation until a reset flow scoped to the
 * `admin` collection exists.
 */
export const LoginPage = () => (
	<div className="flex h-full items-center justify-center bg-palette-bg1 p-6">
		<div className="w-full max-w-sm rounded-box border-4 border-third bg-white p-6 shadow">
			<h1 className="mb-4 text-2xl font-bold">Marketplace — admin panel</h1>
			<LoginForm />
			<p className="mt-6 text-xs text-tip">
				Password forgotten? Standalone recovery is not available for admin accounts: contact the administrator of the platform.
			</p>
		</div>
	</div>
)

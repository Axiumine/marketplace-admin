import { LoginForm } from '@/features/login/LoginForm'

/**
 * The unauthenticated landing page.
 *
 * ⚠️ There is deliberately no "password dimenticata" flow, and the note in the card says so rather
 * than leaving the omission to be read as an oversight. The platform's only recovery pair — `resetPwd`
 * and `updatePwd` on public-resource — looks the address up in the `imprenditore` collection, so it
 * answers "email not found" for every operator account that exists. A link to it would be a dead end
 * that looks like a bug in the operator's own credentials.
 *
 * Recovering an operator password is a manual, backend-side operation until a reset flow scoped to the
 * `admin` collection exists.
 */
export const LoginPage = () => (
	<div className="flex h-full items-center justify-center bg-palette-bg1 p-6">
		<div className="w-full max-w-sm rounded-box border-4 border-third bg-white p-6 shadow">
			<h1 className="mb-4 text-2xl font-bold">Marketplace — pannello operatore</h1>
			<LoginForm />
			<p className="mt-6 text-xs text-tip">
				Password dimenticata? Il recupero autonomo non è disponibile per gli account operatore: contatta l&apos;amministratore
				della piattaforma.
			</p>
		</div>
	</div>
)

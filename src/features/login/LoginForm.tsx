import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { CTX_PUBLIC_AUTHORIZATION } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { LoginAdminDocument } from '@/api/operations/publicAuthorization/loginAdmin'
import { setAccessToken } from '@/api/tokenStore'
import { Button } from '@/components/ui/Button'
import { PasswordField } from '@/components/ui/PasswordField'
import { TextField } from '@/components/ui/TextField'
import { Toast } from '@/components/ui/Toast'

/**
 * Client-side validation is a courtesy, not a gate.
 *
 * No minimum length on the password: the rules that matter live in the backend, and telling an
 * operator their existing password is "too short" to even try would lock out anyone whose account
 * predates the current policy. The email check is a well-formedness check so an obvious typo does not
 * cost a round-trip.
 */
const loginSchema = z.object({
	email: z.email('Inserisci un indirizzo email valido'),
	password: z.string().min(1, 'Inserisci la password'),
	rememberMe: z.boolean()
})

type LoginValues = z.infer<typeof loginSchema>

/**
 * The login card.
 *
 * ⚠️ Nothing is pre-filled, and no credential may ever be. There is no build-time distinction to hide
 * behind: every `VITE_`-prefixed value is substituted into the client bundle statically, so a
 * "development only" default address and password ship to production in plain text.
 *
 * `rememberMe` is a real checkbox: it sets the lifetime of the refresh-token cookie server-side, and
 * pinning it here would silently decide how long an operator stays signed in.
 */
export const LoginForm = () => {
	const navigate = useNavigate()
	const [loginState, executeLogin] = useMutation(LoginAdminDocument)

	// No `defaultValues`: all three fields are registered, uncontrolled inputs, so react-hook-form reads
	// their initial state off the DOM — `''` for the two text boxes and `false` for an unchecked box,
	// which is what the table would have said. Stating it twice only creates somewhere for the two to
	// disagree.
	const {
		register,
		handleSubmit,
		formState: { errors }
	} = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

	const onSubmit = handleSubmit(async (values) => {
		const result = await executeLogin(values, CTX_PUBLIC_AUTHORIZATION)
		const accessToken = result.data?.loginAdmin.accessToken

		if (accessToken !== undefined && accessToken !== '') {
			setAccessToken(accessToken)
			await navigate({ to: '/loading' })
		}
	})

	// An empty token with no error is the one case the backend cannot express: the mutation is typed
	// non-null, so a blank string means the service answered without minting a session. Reported as a
	// failed login: the alternative is a button that does nothing and says nothing.
	//
	// No `!fetching` or "has run at all" guard in front of it: urql resets a mutation's result to
	// `undefined` when it is executed again, so `data` is only ever the answer to a request that has
	// come back. Both guards would be true whenever the comparison is.
	const failed = loginState.data?.loginAdmin.accessToken === ''

	return (
		<form
			className="flex w-full max-w-sm flex-col gap-4"
			onSubmit={(event) => {
				void onSubmit(event)
			}}
		>
			<div>
				<h2 className="text-xl font-bold">Login</h2>
				<p className="text-sm text-tip">Inserisci le credenziali per effettuare l&apos;accesso.</p>
			</div>

			<TextField
				label="Email"
				type="email"
				autoComplete="username"
				maxLength={50}
				error={errors.email?.message}
				{...register('email')}
			/>

			<PasswordField
				label="Password"
				autoComplete="current-password"
				maxLength={72}
				error={errors.password?.message}
				{...register('password')}
			/>

			<label className="flex items-center gap-2 text-sm">
				<input type="checkbox" {...register('rememberMe')} />
				Ricordami su questo dispositivo
			</label>

			{loginState.error === undefined ? null : <Toast tone="error">{messageOf(loginState.error)}</Toast>}
			{failed ? <Toast tone="error">Credenziali non valide</Toast> : null}

			<Button type="submit" loading={loginState.fetching}>
				Accedi
			</Button>
		</form>
	)
}

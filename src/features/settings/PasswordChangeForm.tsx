import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { CTX_ADMIN_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { AdminUpdatePwdDocument } from '@/api/operations/adminResource/mutations'
import { Button } from '@/components/ui/Button'
import { PasswordField } from '@/components/ui/PasswordField'
import { Toast } from '@/components/ui/Toast'

/**
 * The bounds come from koa-utils' `Constants.mts` — `MIN_PWD_LENGTH = 10`, `MAX_PWD_LENGTH = 72` — and
 * are duplicated here on purpose rather than imported: this app does not depend on a backend package,
 * and the backend re-checks both regardless. 72 is not arbitrary: bcrypt truncates at 72 bytes, so
 * anything past it is silently not part of the password.
 */
export const MIN_PWD_LENGTH = 10
export const MAX_PWD_LENGTH = 72

const passwordSchema = z
	.object({
		passwordOld: z.string().min(1, 'Enter the current password'),
		passwordNew: z
			.string()
			.min(MIN_PWD_LENGTH, `The new password must be at least ${MIN_PWD_LENGTH} characters`)
			.max(MAX_PWD_LENGTH, `The new password cannot exceed ${MAX_PWD_LENGTH} characters`),
		passwordNewRepeat: z.string()
	})
	.refine((values) => values.passwordNew === values.passwordNewRepeat, {
		message: 'The two passwords do not match',
		path: ['passwordNewRepeat']
	})
	.refine((values) => values.passwordNew !== values.passwordOld, {
		message: 'The new password must differ from the current one',
		path: ['passwordNew']
	})

type PasswordValues = z.infer<typeof passwordSchema>

const EMPTY: PasswordValues = { passwordOld: '', passwordNew: '', passwordNewRepeat: '' }

/**
 * Changes the signed-in admin's own password.
 *
 * `adminUpdatePwd` was added to the admin-resource service for this form and takes no `_id`: the
 * account comes from the Redis session, so one admin cannot rewrite another's password by editing
 * a variable. Keep it that way if the form ever grows a "change someone else's password" sibling —
 * that is a different mutation with its own authorization, not an extra argument on this one.
 */
export const ChangePasswordForm = () => {
	const [state, executeUpdate] = useMutation(AdminUpdatePwdDocument)

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors }
	} = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: EMPTY })

	const onSubmit = handleSubmit(async (values) => {
		await executeUpdate({ passwordOld: values.passwordOld, passwordNew: values.passwordNew }, CTX_ADMIN_RESOURCE)
	})

	// The error check is not redundant with the `true`: GraphQL allows data and errors in one answer,
	// and a bare `true` would confirm the change under a red alert.
	const succeeded = state.error === undefined && state.data?.adminUpdatePwd === true

	// Clearing the fields on success matters here: they hold two live passwords, and leaving them in
	// the DOM leaves them in any screenshot, screen share or accessibility dump of the page.
	//
	// Driven off the rendered state rather than off the promise `executeUpdate` returns, even though
	// the submit handler has that answer in hand. urql republishes each mutation result on the hook, so
	// the two are the same answer read twice — and written twice, the success alert and the empty
	// fields could disagree about which answer counted.
	useEffect(() => {
		if (succeeded) reset(EMPTY)
	}, [succeeded, reset])

	return (
		<form
			className="flex max-w-sm flex-col gap-4"
			onSubmit={(event) => {
				void onSubmit(event)
			}}
		>
			<PasswordField
				label="Current password"
				autoComplete="current-password"
				maxLength={MAX_PWD_LENGTH}
				error={errors.passwordOld?.message}
				{...register('passwordOld')}
			/>
			<PasswordField
				label="New password"
				autoComplete="new-password"
				maxLength={MAX_PWD_LENGTH}
				error={errors.passwordNew?.message}
				{...register('passwordNew')}
			/>
			<PasswordField
				label="Repeat the new password"
				autoComplete="new-password"
				maxLength={MAX_PWD_LENGTH}
				error={errors.passwordNewRepeat?.message}
				{...register('passwordNewRepeat')}
			/>

			{state.error === undefined ? null : <Toast tone="error">{messageOf(state.error)}</Toast>}
			{succeeded ? <Toast tone="success">Password updated</Toast> : null}

			<Button type="submit" loading={state.fetching}>
				Change password
			</Button>
		</form>
	)
}

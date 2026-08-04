import { PageHeader } from '@/components/layout/PageHeader'
import { ChangePasswordForm } from '@/features/settings/PasswordChangeForm'

export const SettingsPage = () => (
	<>
		<PageHeader title="Settings" />
		<h2 className="mb-4 text-lg font-bold">Change password</h2>
		<ChangePasswordForm />
	</>
)

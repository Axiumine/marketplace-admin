import type { RouterHistory, SearchSchemaInput } from '@tanstack/react-router'
import { createBrowserHistory, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { getSession } from '@/auth/session'
import { AppShell } from '@/components/layout/AppShell'
import type { ShopOwnersQuery } from '@/features/shopOwners/TblShopOwners'
import { AddShopOwnerPage } from '@/pages/AddShopOwnerPage'
import { ManageShopOwnersPage } from '@/pages/ManageShopOwnersPage'
import { HomePage } from '@/pages/HomePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ShopOwnerDetailPage } from '@/pages/ShopOwnerDetailPage'
import { ShopOwnersPage } from '@/pages/ShopOwnersPage'
import { LoadingPage } from '@/pages/LoadingPage'
import { LoginPage } from '@/pages/LoginPage'

/** The page size a URL that says nothing about paging gets. */
export const DEFAULT_PAGE_SIZE = 20

/**
 * The route tree, written in code rather than generated from a `routes/` directory.
 *
 * File-based routing would emit a `routeTree.gen.ts` that is checked in, linted, type-checked and — the
 * part that decides it — measured by the coverage and mutation gates this repo runs at 100. A generated
 * file cannot be tested, so it would have to be excluded from both, and every exclusion is a hole
 * someone can later hide real code in. Eight routes do not need a generator.
 *
 * It is a *factory* rather than a module-level constant, and that is a testing requirement rather than
 * a preference. Built at module scope, every path string, every `component:` reference and every search
 * default is evaluated once — when the module is first imported, before any test runs. Stryker's vitest
 * runner keeps its module registry between mutants, so none of that code re-executes for the mutant
 * under test and a route whose path was blanked keeps answering as though it had not been. Building the
 * tree inside a call puts all of it back under the test that asks for it. See COVERAGE.md.
 *
 * Called exactly once per router, from `createAppRouter` — which is the only caller anywhere, in the
 * app and in the tests alike, so the factory stays private to this module.
 */
const createAppRouteTree = () => {
	/**
	 * The shopOwners table state, as URL search params.
	 *
	 * Every field `.catch()`es to a default, which is what makes a hand-edited or truncated URL land on
	 * a usable page instead of a validation crash — `?page=abc` is a typo, not an error worth a screen.
	 * The two enums are the backend's own sort vocabulary, so an unknown column never reaches the query.
	 */
	const shopOwnersSearchSchema = z.object({
		page: z.coerce.number().int().min(1).catch(1),
		pageSize: z.coerce.number().int().min(5).max(100).catch(DEFAULT_PAGE_SIZE),
		search: z.string().catch(''),
		sortBy: z.enum(['LAST_NAME', 'FIRST_NAME', 'REGISTERED_AT', 'CITY']).catch('LAST_NAME'),
		sortDir: z.enum(['ASC', 'DESC']).catch('ASC')
	})

	const loadingSearchSchema = z.object({
		/** Where to go once the session is restored. Validated at use — see `safeRedirect` in LoadingPage. */
		redirect: z.string().optional().catch(undefined)
	})

	/**
	 * `validateSearch` is given as a function taking `Record<string, unknown>`, not as the zod schema
	 * itself, and that is a type decision rather than a style one.
	 *
	 * TanStack Router works out which search params a `<Link>` is *required* to supply from the input
	 * type of `validateSearch`. Handing it the schema makes every key required at every call site — even
	 * though each one `.catch()`es to a default and the route is perfectly happy with none of them — so
	 * `<Link to="/p/shopOwners/manage-shopOwners">` would not compile without spelling out all
	 * five.
	 *
	 * The `& SearchSchemaInput` marker is how the router is told to read the parameter type as the
	 * *input* side and the return type as the output side, rather than inferring one from the other. The
	 * input is an index signature — "any query string is acceptable", which is exactly what the
	 * `.catch()` chain guarantees — while the parsed output type stays fully specific.
	 */
	const validateShopOwnersSearch = (
		search: Record<string, unknown> & SearchSchemaInput
	): z.infer<typeof shopOwnersSearchSchema> => shopOwnersSearchSchema.parse(search)

	const validateLoadingSearch = (search: Record<string, unknown> & SearchSchemaInput): z.infer<typeof loadingSearchSchema> =>
		loadingSearchSchema.parse(search)

	// No `component`: a route without one renders an `<Outlet/>`, which is all the root has to do.
	const rootRoute = createRootRoute()

	const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: LoginPage })

	const loadingRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/loading',
		validateSearch: validateLoadingSearch,
		component: LoadingRoute
	})

	/**
	 * The authenticated frame. Pathless (`id`, not `path`), so `/home` stays `/home` while still
	 * rendering inside the sidebar layout, and so the guard below covers every page under it without
	 * repetition.
	 *
	 * The guard is a redirect to `/loading`, not to `/`. An empty session means one of two things — never
	 * signed in, or signed in and reloaded — and only `/loading` can tell them apart, because only a
	 * round-trip to the backend can say whether the httpOnly refresh cookie is still good.
	 */
	const appRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: 'app',
		component: AppShell,
		beforeLoad: ({ location }) => {
			if (getSession() === null) throw redirect({ to: '/loading', search: { redirect: location.href } })
		}
	})

	const homeRoute = createRoute({ getParentRoute: () => appRoute, path: '/home', component: HomePage })

	const settingsRoute = createRoute({
		getParentRoute: () => appRoute,
		path: '/settings',
		component: SettingsPage
	})

	const shopOwnersRoute = createRoute({
		getParentRoute: () => appRoute,
		path: '/shopOwners',
		component: ShopOwnersPage
	})

	const manageShopOwnersRoute = createRoute({
		getParentRoute: () => appRoute,
		path: '/p/shopOwners/manage-shopOwners',
		validateSearch: validateShopOwnersSearch,
		component: ManageShopOwnersRoute
	})

	const addShopOwnerRoute = createRoute({
		getParentRoute: () => appRoute,
		path: '/p/shopOwners/add-shopOwner',
		component: AddShopOwnerPage
	})

	const shopOwnerDetailRoute = createRoute({
		getParentRoute: () => appRoute,
		path: '/p/shopOwners/id/$_id',
		component: ShopOwnerDetailRoute
	})

	/*
	 * The three components below are function declarations, not arrow constants, so they can be named in
	 * the route definitions above while reading their own route's hooks below. They are the only place
	 * the URL is turned into props; the pages themselves stay pure and render from props alone.
	 */

	function LoadingRoute() {
		const { redirect: target } = loadingRoute.useSearch()
		return <LoadingPage redirect={target} />
	}

	function ManageShopOwnersRoute() {
		const query = manageShopOwnersRoute.useSearch()
		const navigate = manageShopOwnersRoute.useNavigate()

		// Not memoised. `TblShopOwners` does list this callback among the dependencies of the effect
		// that pushes the debounced search up, so a fresh identity per render re-runs that effect — but
		// the effect's own guard (`debouncedSearch !== query.search`) is false on every run after the
		// first, so it re-runs and does nothing. A `useCallback` would trade that for a dependency array
		// whose only entry is stable for the life of the router, which is no trade at all.
		const onQueryChange = (next: Partial<ShopOwnersQuery>) => {
			void navigate({ search: (prev) => ({ ...prev, ...next }) })
		}

		return <ManageShopOwnersPage query={query} onQueryChange={onQueryChange} />
	}

	function ShopOwnerDetailRoute() {
		const { _id } = shopOwnerDetailRoute.useParams()
		return <ShopOwnerDetailPage idShopOwner={_id} />
	}

	return rootRoute.addChildren([
		loginRoute,
		loadingRoute,
		appRoute.addChildren([
			homeRoute,
			settingsRoute,
			shopOwnersRoute,
			manageShopOwnersRoute,
			addShopOwnerRoute,
			shopOwnerDetailRoute
		])
	])
}

/**
 * The application router. Called once by `main.tsx`, and once per render by the test helper.
 *
 * `history` is a parameter so the tests go through this function rather than around it: they need a
 * memory history, and a router they built themselves would leave the one the app actually runs on
 * untested. Left out, the router picks the browser history, which is what production wants.
 */
export const createAppRouter = (history: RouterHistory = createBrowserHistory()) =>
	createRouter({ routeTree: createAppRouteTree(), history })

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof createAppRouter>
	}
}

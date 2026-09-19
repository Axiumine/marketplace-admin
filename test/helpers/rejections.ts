/**
 * Catches a promise rejection that gets away from the code under test.
 *
 * A submit handler awaited with `void handler(event)` has nothing attached to its returned
 * promise, so a throw after its last `await` never touches the DOM, `formState`, or anything else
 * a render assertion can see — the mutation the platform is fighting here (see
 * `docs/testing.md`) is exactly that shape. Node still raises `unhandledRejection` for it, once
 * the microtask queue that produced it has drained, which is the one hook left to assert on.
 *
 * Call `stop()` before the test's own assertions so a rejection this test caused is not blamed on
 * whichever test runs next.
 */
export const trackUnhandledRejections = () => {
	const reasons: unknown[] = []
	const onRejection = (reason: unknown) => {
		reasons.push(reason)
	}

	process.on('unhandledRejection', onRejection)

	return {
		reasons,
		/** Lets a rejection already in flight land before the caller reads `reasons`. */
		settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
		stop: () => {
			process.off('unhandledRejection', onRejection)
		}
	}
}

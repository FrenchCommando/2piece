/**
 * Assertion helpers: localise the "I know better than the type system" cases
 * so a broken invariant fails loudly at its source instead of as a confusing
 * downstream null deref.
 */

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`missing #${id}`);
	return el as T;
}

export function getContext2D(
	canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("2d context unavailable");
	return ctx;
}

export function findOrThrow<T>(
	items: readonly T[],
	pred: (t: T) => boolean,
	msg: string,
): T {
	const found = items.find(pred);
	if (!found) throw new Error(msg);
	return found;
}

/** Map.get with an explicit error if the key is absent (distinct from a value of null/undefined). */
export function mapGet<K, V>(m: Map<K, V>, key: K): V {
	if (!m.has(key)) throw new Error(`map missing key ${String(key)}`);
	return m.get(key) as V;
}

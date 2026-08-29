/**
 * The three utilities the admin tables are built from, in one place rather than one copy per panel.
 *
 * They are shared because the security section stacks four tables on a single screen — keys, holders,
 * sessions, revocations — and a table that disagreed by a border colour would read as a different kind of
 * thing rather than as another list. There is no component here on purpose: a `<Table>` wrapper would have
 * to grow a prop for every header, caption and action the four already differ on, and each one of those is
 * the part worth reading in the panel that owns it.
 */
export const CELL_HEAD = 'border-b border-palette-bg3/20 p-2'
export const CELL = 'p-2'
export const ROW = 'border-b border-palette-bg3/10'

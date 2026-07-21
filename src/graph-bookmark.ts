import { App, normalizePath } from "obsidian";
import { SBMLData } from "./sbml-parser";

/** Model bookmarks are collected here rather than piling up at the top level. */
const BOOKMARK_GROUP_TITLE = "SBML Graph Views";

/**
 * Colour groups shipped with every bookmark, so an imported model is readable in the graph
 * without anyone configuring global graph settings. Colours are packed integers, the format
 * Obsidian stores: 0xRRGGBB.
 */
const COLOR_GROUPS: GraphColorGroup[] = [
	{ query: "tag:#Species", color: { a: 1, rgb: 255 } }, // blue
	{ query: "tag:#Reaction", color: { a: 1, rgb: 51400 } }, // teal
	{ query: "tag:#Modifier", color: { a: 1, rgb: 15132185 } }, // yellow
	{ query: "tag:#Compartment", color: { a: 1, rgb: 9211020 } }, // grey
	{ query: "tag:#ModelOverview", color: { a: 1, rgb: 15106620 } }, // orange
];

interface GraphColorGroup {
	query: string;
	color: { a: number; rgb: number };
}

interface BookmarkItem {
	type: string;
	ctime: number;
	title?: string;
	// Existing bookmarks may carry fields we don't model; keep them intact on rewrite.
	[key: string]: unknown;
}

interface BookmarkGroup extends BookmarkItem {
	type: "group";
	items: BookmarkItem[];
}

interface BookmarksFile {
	items: BookmarkItem[];
	[key: string]: unknown;
}

/**
 * Add a graph bookmark scoped to one imported model.
 *
 * Bookmarks aren't part of Obsidian's public API, so this reads and rewrites the config file
 * directly using the public `vault.configDir` and adapter. It's best effort: a failure here
 * must never take down an otherwise successful import, so it reports rather than throws.
 *
 * Returns true if the bookmark was written.
 */
export async function addModelGraphBookmark(
	app: App,
	data: SBMLData,
	folderPath: string,
): Promise<boolean> {
	try {
		const path = normalizePath(`${app.vault.configDir}/bookmarks.json`);
		const adapter = app.vault.adapter;

		let bookmarks: BookmarksFile = { items: [] };
		if (await adapter.exists(path)) {
			const parsed: unknown = JSON.parse(await adapter.read(path));
			if (isBookmarksFile(parsed)) bookmarks = parsed;
		}

		const group = findOrCreateGroup(bookmarks.items, BOOKMARK_GROUP_TITLE);
		group.items.push({
			type: "graph",
			ctime: Date.now(),
			title: data.modelName || data.modelId,
			options: buildGraphOptions(folderPath),
		});

		await adapter.write(path, JSON.stringify(bookmarks, null, 2));
		return true;
	} catch (error) {
		console.error("Could not create the graph bookmark", error);
		return false;
	}
}

/**
 * Graph state for the bookmark: scoped to this model's folder, arrows on (the link direction
 * is meaningful), and tuned a little tighter than Obsidian's defaults, which spread dense
 * reaction networks out too far to read.
 */
function buildGraphOptions(folderPath: string) {
	return {
		"collapse-filter": false,
		// The path is quoted because the output folder name may contain spaces. The tag
		// filter keeps the graph to the reaction network itself: a compartment links to
		// every species it holds, which turns it into a hub that buries the structure.
		// Parentheses matter — without them the OR would escape the path filter and pull
		// in reactions from every other model in the vault.
		search: `path:"${folderPath}" (tag:#Species OR tag:#Reaction)`,
		showTags: false,
		showAttachments: false,
		hideUnresolved: false,
		showOrphans: true,
		"collapse-color-groups": false,
		colorGroups: COLOR_GROUPS,
		"collapse-display": true,
		showArrow: true,
		textFadeMultiplier: -3,
		nodeSizeMultiplier: 2.4,
		lineSizeMultiplier: 3.9,
		"collapse-forces": false,
		centerStrength: 0.47,
		repelStrength: 15.6,
		linkStrength: 1,
		linkDistance: 30,
		scale: 1,
		close: false,
	};
}

/** Find the plugin's bookmark group, creating it at the top level if it isn't there yet. */
function findOrCreateGroup(
	items: BookmarkItem[],
	title: string,
): BookmarkGroup {
	const existing = items.find(
		(item): item is BookmarkGroup =>
			item.type === "group" &&
			item.title === title &&
			Array.isArray(item.items),
	);
	if (existing) return existing;

	const group: BookmarkGroup = {
		type: "group",
		ctime: Date.now(),
		title,
		items: [],
	};
	items.push(group);
	return group;
}

function isBookmarksFile(value: unknown): value is BookmarksFile {
	return (
		typeof value === "object" &&
		value !== null &&
		Array.isArray((value as { items?: unknown }).items)
	);
}

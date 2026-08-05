import { App, normalizePath } from "obsidian";
import { SBMLData } from "./sbml-parser";

/** Model bookmarks are kept in a bookmark group/folder. */
const BOOKMARK_GROUP_TITLE = "SBML Graph Views";

/**
 * Colour groups shipped with every bookmark, so an imported model is readable in the graph
 * without anyone configuring global graph settings. Colours are packed integers, the format
 * Obsidian stores: 0xRRGGBB.
 */
const COLOR_GROUPS: GraphColorGroup[] = [
	{ query: "tag:#Modifier", color: { a: 1, rgb: 15132185 } }, // yellow
	{ query: "tag:#Species", color: { a: 1, rgb: 255 } }, // blue
	{ query: "tag:#Reaction", color: { a: 1, rgb: 51400 } }, // teal
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
	[key: string]: unknown;
}

// TODO double check why we use extends here but not in SBML parser
interface BookmarkGroup extends BookmarkItem {
	type: "group";
	items: BookmarkItem[];
}

interface BookmarksFile {
	items: BookmarkItem[];
	[key: string]: unknown;
}

/**
 * Add a graph bookmark for the one imported model.
 *
 * Bookmarks aren't part of Obsidian's public API, so this reads and rewrites the config file
 * directly using the public `vault.configDir` and adapter. A failure here should report rather than
 * throw an error.
 *
 * Returns true if the bookmark was written.
 */
export async function addModelGraphBookmark(
	app: App,
	data: SBMLData,
	folderPath: string,
): Promise<boolean> {
	try {
		const bookmarksJSONPath = normalizePath(
			`${app.vault.configDir}/bookmarks.json`,
		);
		const adapter = app.vault.adapter;

		let bookmarks: BookmarksFile = { items: [] };
		// Check if file, then if JSON then if bookmarks file
		if (await adapter.exists(bookmarksJSONPath)) {
			const parsedJSONFile: unknown = JSON.parse(
				await adapter.read(bookmarksJSONPath),
			);
			if (isBookmarksFile(parsedJSONFile)) bookmarks = parsedJSONFile;
		}

		const group = findOrCreateGroup(bookmarks.items, BOOKMARK_GROUP_TITLE);
		group.items.push({
			type: "graph",
			ctime: Date.now(),
			title: data.modelName || data.modelId,
			options: buildGraphOptions(folderPath),
		});

		await adapter.write(
			bookmarksJSONPath,
			JSON.stringify(bookmarks, null, 2),
		);
		return true;
	} catch (error) {
		console.error("Could not create the graph bookmark", error);
		return false;
	}
}

function buildGraphOptions(folderPath: string) {
	return {
		"collapse-filter": false,
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
	// Find
	const existing = items.find(
		(item): item is BookmarkGroup =>
			item.type === "group" &&
			item.title === title &&
			Array.isArray(item.items),
	);
	if (existing) return existing;
	// Create
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
		Array.isArray((value as { items?: unknown }).items) // TODO is there really no way we can simplify this line, it looks dense!
	);
}

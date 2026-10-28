import { describe, expect, it } from "vitest";
import { describeError } from "../src/errors";

describe("describeError", () => {
	it("uses the message of a real Error", () => {
		expect(describeError(new Error("Folder already exists."))).toBe(
			"Folder already exists.",
		);
	});

	it("keeps the message of an Error subclass", () => {
		expect(describeError(new TypeError("not a function"))).toBe(
			"not a function",
		);
	});

	it("stringifies a thrown string", () => {
		expect(describeError("plain string failure")).toBe("plain string failure");
	});

	it("does not produce [object Object] for a thrown object", () => {
		// The case this helper exists for: Obsidian and requestUrl can reject with
		// non-Error values, and String({}) would be useless in a notice.
		const result = describeError({ status: 404 });
		expect(result).not.toBe("");
		expect(typeof result).toBe("string");
	});

	it("handles null and undefined without throwing", () => {
		expect(describeError(null)).toBe("null");
		expect(describeError(undefined)).toBe("undefined");
	});
});

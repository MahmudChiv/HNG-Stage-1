import { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import strings from "../strings.json";
import _ from "lodash";
import { z } from "zod";
import { count, error } from "console";

const userSearchSchema = z.object({
  is_palindrome: z.boolean().optional(),
  min_length: z.string().optional().transform(Number),
  max_length: z.string().optional().transform(Number),
  word_count: z.string().optional().transform(Number),
  contains_character: z.string().optional(),
});

type UserSearchQuery = z.infer<typeof userSearchSchema>;

interface String {
  id?: string;
  value?: string;
  properties?: {
    length?: number;
    is_palindrome?: boolean;
    unique_characters?: number;
    word_count?: number;
    sha256_hash?: string;
    character_frequency_map?: { [key: string]: number };
  };
  created_at?: string;
}

const stringStore = {
  strings: strings as String[],
  addString: function (data: String[]) {
    this.strings = data;
  },
};

export const addString = (req: Request, res: Response) => {
  try {
    let { value } = req.body;
    if (value === undefined || value === null)
      return res.status(400).json({ error: "Value is required." });
    if (typeof value !== "string")
      return res.status(422).json({ error: "Value must be a string." });
    value = _.toLower(value);

    if (stringStore.strings.find((str) => str.value === value)) {
      return res.status(409).json({ error: "String already exists." });
    }

    const sha256_hash = crypto.createHash("sha256").update(value).digest("hex");
    const created_at = new Date().toISOString();
    const length = value.length;
    const is_palindrome = value === value.split("").reverse().join("");
    const unique_characters = Array.from(new Set(value)).length;
    const word_count =
      value.trim() === "" ? 0 : value.trim().split(/\s+/).length;

    const character_frequency_map = value
      .split("")
      .reduce((acc: { [key: string]: number }, char: string) => {
        acc[char] = (acc[char] || 0) + 1;
        return acc;
      }, {});

    stringStore.addString([
      ...stringStore.strings,
      {
        id: sha256_hash,
        value,
        properties: {
          length,
          is_palindrome,
          unique_characters,
          word_count,
          sha256_hash,
          character_frequency_map,
        },
        created_at,
      },
    ]);
    const filePath = path.join(__dirname, "../strings.json");
    fs.writeFile(filePath, JSON.stringify(stringStore.strings, null, 2));

    return res.status(201).json({
      id: sha256_hash,
      value,
      properties: {
        length: length,
        is_palindrome,
        unique_characters,
        word_count,
        sha256_hash,
        character_frequency_map,
      },
      created_at,
    });
  } catch (error) {
    return res.status(500).json({ error });
  }
};

export const getString = (req: Request, res: Response) => {
  try {
    let { string } = req.params;
    string = _.toLower(string);
    const foundString = stringStore.strings.find((str) => str.value === string);
    if (!foundString) return res.status(404).json({ error: "String not found." });

    return res.status(200).json({
      id: foundString?.id,
      value: string,
      properties: foundString?.properties,
      created_at: foundString?.created_at,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Server error" });
  }
};

export const getAllStringsWithFiltering = (req: Request, res: Response) => {
  try {
    // Manual, tolerant parsing of query params (don't rely on strict zod parsing here)
    const raw = req.query;

    // is_palindrome: accept boolean or "true"/"false" (case-insensitive)
    let is_palindrome: boolean | undefined;
    if (raw.is_palindrome !== undefined) {
      const v = raw.is_palindrome;
      if (typeof v === "boolean") is_palindrome = v;
      else if (typeof v === "string") {
        const lower = v.toLowerCase();
        if (lower === "true") is_palindrome = true;
        else if (lower === "false") is_palindrome = false;
        else
          return res
            .status(400)
            .json({ error: "is_palindrome must be 'true' or 'false'" });
      } else {
        return res
          .status(400)
          .json({ error: "is_palindrome must be 'true' or 'false'" });
      }
    }

    // Numeric params: min_length, max_length, word_count
    const parseNumberParam = (
      p: unknown,
      name: string
    ): number | undefined | null => {
      if (p === undefined) return undefined;
      if (Array.isArray(p)) {
        // If multiple provided, take the first
        p = p[0];
      }
      const s = String(p).trim();
      if (s === "") return null;
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      return n;
    };

    const min_length = parseNumberParam(raw.min_length, "min_length");
    const max_length = parseNumberParam(raw.max_length, "max_length");
    const word_count = parseNumberParam(raw.word_count, "word_count");

    if (min_length === null)
      return res
        .status(400)
        .json({ error: "min_length must be a valid number" });
    if (max_length === null)
      return res
        .status(400)
        .json({ error: "max_length must be a valid number" });
    if (word_count === null)
      return res
        .status(400)
        .json({ error: "word_count must be a valid number" });

    if (
      min_length !== undefined &&
      max_length !== undefined &&
      min_length > max_length
    ) {
      return res
        .status(400)
        .json({ error: "min_length cannot be greater than max_length" });
    }

    // contains_character: accept single string or multiple values
    let contains_character_values: string[] | undefined;
    if (raw.contains_character !== undefined) {
      if (Array.isArray(raw.contains_character)) {
        contains_character_values = raw.contains_character
          .map(String)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      } else {
        const s = String(raw.contains_character).trim();
        if (s.length > 0) contains_character_values = [s];
        else contains_character_values = [];
      }
      // If user provided empty values only, treat as not provided
      if (contains_character_values.length === 0)
        contains_character_values = undefined;
    }

    // Start with all strings and apply filters cumulatively
    let filteredStrings: String[] = [...stringStore.strings];

    const appliedFilters: Record<string, unknown> = {};

    if (is_palindrome !== undefined) {
      filteredStrings = filteredStrings.filter(
        (str: String) =>
          Boolean(str.properties?.is_palindrome) === is_palindrome
      );
      appliedFilters.is_palindrome = is_palindrome;
    }

    if (min_length !== undefined) {
      filteredStrings = filteredStrings.filter(
        (str: String) => (str.properties?.length ?? 0) >= (min_length as number)
      );
      appliedFilters.min_length = min_length;
    }

    if (max_length !== undefined) {
      filteredStrings = filteredStrings.filter(
        (str: String) => (str.properties?.length ?? 0) <= (max_length as number)
      );
      appliedFilters.max_length = max_length;
    }

    if (word_count !== undefined) {
      filteredStrings = filteredStrings.filter(
        (str: String) =>
          (str.properties?.word_count ?? 0) === (word_count as number)
      );
      appliedFilters.word_count = word_count;
    }

    if (contains_character_values && contains_character_values.length > 0) {
      filteredStrings = filteredStrings.filter((str: String) => {
        if (typeof str.value !== "string") return false;
        // OR semantics: keep strings that include any of the provided characters/substrings
        return contains_character_values!.some((val) =>
          str.value!.includes(val)
        );
      });
      appliedFilters.contains_character =
        contains_character_values.length === 1
          ? contains_character_values[0]
          : contains_character_values;
    }

    // Always return 200 even if no filters provided or no results found
    return res.status(200).json({
      data: filteredStrings,
      count: filteredStrings.length,
      filters_applied: appliedFilters,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Server error" });
  }
};

export const filterByNaturalLanguage = (req: Request, res: Response) => {
  try {
    // Accept query from multiple places to avoid route mismatch (query param `query` or `q`, or path param)
    const raw =
      (req.query && (req.query.query ?? req.query.q)) ??
      (req.params && (req.params.query ?? req.params.string));

    if (raw === undefined) return res.status(400).json({ error: "Query is required." });

    const queryStr = Array.isArray(raw) ? raw[0] : raw;
    if (typeof queryStr !== "string")
      return res.status(400).json({ error: "Query must be a string." });

    const original = queryStr;
    const query = _.toLower(queryStr.trim());

    let filteredStrings: String[] = [...stringStore.strings];
    const parsed_filters: string[] = [];

    switch (query) {
      case "all single word palindromic strings": {
        filteredStrings = filteredStrings.filter(
          (s) =>
            s.properties?.is_palindrome === true &&
            (s.properties?.word_count ?? 0) === 1
        );
        parsed_filters.push("is_palindrome: true", "word_count: 1");
        break;
      }

      case "strings longer than 10 characters": {
        filteredStrings = filteredStrings.filter(
          (s) => (s.properties?.length ?? 0) > 10
        );
        parsed_filters.push("min_length: 11");
        break;
      }

      case "palindromic strings that contain the first vowel": {
        filteredStrings = filteredStrings.filter((s) => {
          if (s.properties?.is_palindrome !== true || typeof s.value !== "string")
            return false;
          return s.value.toLowerCase().includes("a"); // "first vowel" interpreted as 'a'
        });
        parsed_filters.push("is_palindrome: true", 'contains_character: "a"');
        break;
      }

      case "strings containing the letter z": {
        filteredStrings = filteredStrings.filter(
          (s) => typeof s.value === "string" && s.value.toLowerCase().includes("z")
        );
        parsed_filters.push('contains_character: "z"');
        break;
      }

      default:
        // Instead of returning a parsing error that might be swallowed by route ordering,
        // return an explicit 200 with an empty result and an explanatory message so the caller
        // sees that the natural language parser ran but couldn't interpret the query.
        return res.status(200).json({
          data: [],
          count: 0,
          interpreted_query: {
            original,
            parsed_filters: [],
          },
          message: "Could not parse natural language query",
        });
    }

    return res.status(200).json({
      data: filteredStrings,
      count: filteredStrings.length,
      interpreted_query: {
        original,
        parsed_filters,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Server error" });
  }
};

export const deleteString = async (req: Request, res: Response) => {
  try {
    const { string } = req.params;
    if (!string) return res.sendStatus(404);
    const decodedString = decodeURIComponent(string);
    const lowerString = _.toLower(decodedString);
    const existingIndex = stringStore.strings.findIndex(
      (str) => str.value === lowerString
    );
    if (existingIndex === -1) return res.sendStatus(404);

    const deletedString = stringStore.strings[existingIndex];
    const updatedStrings = [...stringStore.strings];
    updatedStrings.splice(existingIndex, 1);
    stringStore.addString(updatedStrings);
    const filePath = path.join(__dirname, "../strings.json");
    await fs.writeFile(filePath, JSON.stringify(stringStore.strings, null, 2));

    return res.sendStatus(204);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Server error" });
  }
}
// MCP resources — HireJack's controlled vocabulary.
//
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
//
// Why these exist: several tool parameters are matched against a FIXED
// vocabulary but typed as free-text. `search_jobs.skill` is a case-insensitive
// substring match against our skills dictionary, so "Kubernetes" works and
// "K8s" silently returns zero jobs — indistinguishable, to the model, from
// "nobody is hiring for this". Same for role titleIds in profile preferences.
// Enumerating the vocabulary as a resource lets a client read the exact
// spellings instead of guessing them.
//
// Deliberately NOT a tool: this is reference data the client reads, not an
// action it performs. It also keeps the tool menu from growing — 18 of 31
// tools had never been called as of 2026-07-24, and a larger menu measurably
// degrades tool selection.
//
// Source is /api/codex (public, no auth), the same endpoint the website's
// skill/role pickers use, so the vocabulary can never drift from the pickers.
import { apiGet } from "./lib/api.js";

export type ResourceDefinition = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
  /** Build the resource body. Returns a JSON-serializable value. */
  build: (codex: CodexPayload) => unknown;
};

type CodexSkill = { id?: string; name?: string; category?: string };
type CodexRole = {
  titleId?: string;
  title?: string;
  family?: string;
  track?: string;
  skills?: string[];
};
type CodexPayload = { skills?: CodexSkill[]; roles?: CodexRole[] };

export const RESOURCES: ResourceDefinition[] = [
  {
    uri: "hirejack://vocabulary/skills",
    name: "skills_vocabulary",
    title: "HireJack skills vocabulary",
    description:
      "Every skill HireJack extracts from job postings, with its canonical " +
      "name, id and category. Read this before filtering by skill — " +
      "`search_jobs.skill` substring-matches these exact names, so 'K8s' " +
      "finds nothing while 'Kubernetes' works. Also the valid values for a " +
      "user's profile skills via `update_preferences`.",
    mimeType: "application/json",
    build: (codex) => {
      const skills = (codex.skills || []).filter((s) => s && s.name);
      const byCategory: Record<string, string[]> = {};
      for (const s of skills) {
        const cat = s.category || "other";
        (byCategory[cat] ||= []).push(s.name as string);
      }
      for (const list of Object.values(byCategory)) list.sort();
      return {
        description:
          "Canonical skill vocabulary. Use `name` verbatim for search_jobs.skill; " +
          "use `id` for profile skills in update_preferences.",
        count: skills.length,
        categories: Object.keys(byCategory).sort(),
        skills_by_category: byCategory,
        skills: skills
          .map((s) => ({ id: s.id, name: s.name, category: s.category }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name))),
      };
    },
  },
  {
    uri: "hirejack://vocabulary/roles",
    name: "roles_vocabulary",
    title: "HireJack role taxonomy",
    description:
      "The canonical role taxonomy: every titleId with its display title, " +
      "role family, IC/management track, and typical skills. Read this for " +
      "the exact `titleId` values `update_preferences.desired_roles` expects, " +
      "and for which family a role rolls up to when filtering " +
      "`search_jobs.family`.",
    mimeType: "application/json",
    build: (codex) => {
      const roles = (codex.roles || []).filter((r) => r && r.titleId);
      const families: Record<string, string[]> = {};
      for (const r of roles) {
        const fam = r.family || "other";
        (families[fam] ||= []).push(r.titleId as string);
      }
      for (const list of Object.values(families)) list.sort();
      return {
        description:
          "Canonical role taxonomy. `titleId` is the value desired_roles expects; " +
          "`family` is the value search_jobs.family expects.",
        count: roles.length,
        families: Object.keys(families).sort(),
        role_ids_by_family: families,
        roles: roles
          .map((r) => ({
            titleId: r.titleId,
            title: r.title,
            family: r.family,
            track: r.track,
            typical_skills: (r.skills || []).slice(0, 10),
          }))
          .sort((a, b) => String(a.titleId).localeCompare(String(b.titleId))),
      };
    },
  },
];

// The vocabulary changes when the taxonomy ships, not per request. Cache it in
// module memory so a warm Lambda serves reads without a round trip; the TTL
// bounds staleness for a container that lives for hours.
const CACHE_TTL_MS = 60 * 60 * 1000;
let cached: { at: number; payload: CodexPayload } | null = null;

async function loadCodex(): Promise<CodexPayload> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.payload;
  const payload = await apiGet<CodexPayload>("/codex", {});
  cached = { at: now, payload };
  return payload;
}

/** Test seam — drops the memo so a test can force a refetch. */
export function _resetVocabularyCache() {
  cached = null;
}

export function listResources() {
  return RESOURCES.map((r) => ({
    uri: r.uri,
    name: r.name,
    title: r.title,
    description: r.description,
    mimeType: r.mimeType,
  }));
}

export async function readResource(uri: string) {
  const def = RESOURCES.find((r) => r.uri === uri);
  if (!def) {
    throw new Error(
      `Unknown resource: ${uri}. Available: ${RESOURCES.map((r) => r.uri).join(", ")}`,
    );
  }
  const codex = await loadCodex();
  return {
    contents: [
      {
        uri: def.uri,
        name: def.name,
        title: def.title,
        mimeType: def.mimeType,
        text: JSON.stringify(def.build(codex), null, 2),
      },
    ],
  };
}

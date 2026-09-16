import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as prettier from "prettier";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
const mode = process.argv[2] || "--check";

if (mode !== "--check" && mode !== "--write" && mode !== "--audit-pristine") {
    console.error("Usage: node scripts/format-integration.mjs --check|--write|--audit-pristine");
    process.exit(2);
}

const pristineRoot = process.env.CANVAS_PRISTINE_WEB ? resolve(process.env.CANVAS_PRISTINE_WEB) : null;
const supportedExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx", ".json", ".md", ".yaml", ".yml"]);

// These are the files whose contents differ semantically from the pristine
// upstream v0.19.0 web/ tree. Keeping this list explicit makes an upgrade
// reviewable and prevents the formatter from silently taking ownership of the
// entire vendored application.
const semanticPatchFiles = [
    "index.html",
    "vite.config.ts",
    "src/router.tsx",
    "src/constant/env.ts",
    "src/constant/runtime-config.ts",
    "src/lib/app-theme.ts",
    "src/lib/agent/agent-site-tools.ts",
    "src/lib/canvas/plugin-loader.ts",
    "src/main.tsx",
    "src/pages/canvas/index.tsx",
    "src/pages/canvas/project.tsx",
    "src/services/api/canvas-agent.ts",
    "src/services/api/image.ts",
    "src/services/app-sync.ts",
    "src/services/config-file.ts",
    "src/stores/canvas/use-canvas-store.ts",
    "src/stores/use-agent-store.ts",
    "src/stores/use-config-store.ts",
    "src/i18n/locales/en-US.ts",
    "src/i18n/locales/zh-CN.ts",
    "src/components/agent/agent-canvas-reference-preview.tsx",
    "src/components/agent/agent-chat-composer.tsx",
    "src/components/agent/agent-chat-message.tsx",
    "src/components/agent/agent-chat-prompt-input.tsx",
    "src/components/agent/agent-event-formatters.ts",
    "src/components/agent/local-agent-panel.tsx",
    "src/components/canvas/canvas-top-bar.tsx",
    "src/components/layout/app-providers.tsx",
    "src/components/layout/app-top-nav.tsx",
    "src/components/layout/channel-editor-drawer.tsx",
    "src/components/layout/mobile-nav-drawer.tsx",
    "src/components/layout/model-script-editor.tsx",
    "src/components/layout/user-status-actions.tsx",
    "src/layouts/user-layout.tsx",
];

// New local runtime files and the regression suite are owned by this
// integration. Test directories are walked recursively so a future test is not
// silently omitted from the gate.
const integrationFiles = [
    "package.json",
    "VENDOR.md",
    "scripts/format-integration.mjs",
    "vitest.config.ts",
    "public/official-plugins.json",
    "src/test-setup.ts",
    "src/components/layout/host-bootstrap-status.tsx",
    "src/lib/agent/agent-security.ts",
    "src/lib/host-bootstrap.ts",
    "src/lib/host-bridge.ts",
    "src/lib/host-contract.ts",
    "src/lib/canvas-i18n.ts",
    "src/lib/canvas/canvas-data-migration.ts",
    "src/services/api/model-catalog.ts",
    "src/components/agent/use-agent-message-asset-url.ts",
];

const testDirectories = ["src/components/agent/__tests__", "src/components/layout/__tests__", "src/lib/__tests__", "src/lib/agent/__tests__", "src/lib/canvas/__tests__", "src/services/__tests__"];

// Regression tests that live beside the implementation rather than under one
// of the dedicated __tests__ directories still belong to this integration's
// format gate. Keep the list explicit so a future test cannot silently fall
// outside the manifest audit.
const explicitTestFiles = ["src/components/agent/use-agent-message-asset-url.test.tsx", "src/lib/canvas/canvas-data-migration.test.ts", "src/services/api/canvas-agent.test.ts", "src/services/app-sync.test.ts"];

// These files contain upstream code plus a small local patch. The pristine
// v0.19.0 source itself is not formatted by the current Prettier release, so a
// whole-file check would rewrite unrelated vendored code. They are still
// parser-checked by default and receive a changed-line audit when
// CANVAS_PRISTINE_WEB points to a clean upstream web/ checkout.
const baselineFormatFiles = new Set([
    "src/constant/runtime-config.ts",
    "src/pages/canvas/project.tsx",
    "src/services/api/image.ts",
    "src/stores/use-agent-store.ts",
    "src/stores/use-config-store.ts",
    "src/components/agent/agent-chat-composer.tsx",
    "src/components/agent/agent-chat-message.tsx",
    "src/components/agent/agent-event-formatters.ts",
    "src/components/agent/local-agent-panel.tsx",
    "src/components/agent/agent-canvas-reference-preview.tsx",
    "src/components/agent/agent-chat-prompt-input.tsx",
    "src/components/agent/agent-chat-inline-tokens.ts",
    "src/components/agent/agent-scroll-to-bottom.tsx",
    "src/components/agent/agent-skills-view.tsx",
    "src/lib/agent/agent-site-tools.ts",
    "src/components/canvas/canvas-node-reference-bar.tsx",
    "src/components/layout/model-script-editor.tsx",
]);

const intentionallyAbsentUpstreamFiles = new Set(["docker-entrypoint.sh", "package-lock.json", "vercel.json"]);
// Local tooling/configuration files are allowed to differ from the pristine
// upstream tree, but are not themselves vendored application patches.
const localConfigFiles = new Set([".prettierignore"]);
const generatedFiles = new Set(["tsconfig.tsbuildinfo"]);
const metadataFiles = new Set(["VERSION", "CHANGELOG.md", "LICENSE", "VENDOR.md"]);

function collectFiles(path) {
    const absolutePath = join(root, path);
    if (!existsSync(absolutePath)) return [];
    return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
        const child = join(absolutePath, entry.name);
        if (entry.isDirectory()) return collectFiles(relative(root, child));
        if (!entry.isFile() || !supportedExtensions.has(extname(entry.name).toLowerCase())) return [];
        return [relative(root, child).replaceAll("\\", "/")];
    });
}

const testFiles = [...testDirectories.flatMap(collectFiles), ...explicitTestFiles];
const manifestFiles = [...new Set([...semanticPatchFiles, ...integrationFiles, ...testFiles])].sort();
const missingFiles = manifestFiles.filter((path) => !existsSync(join(root, path)));

if (missingFiles.length) {
    console.error("Canvas integration format manifest references missing files:");
    for (const path of missingFiles) console.error(`  - ${path}`);
    process.exit(1);
}

function normalizeEol(value) {
    return value.replaceAll("\r\n", "\n");
}

async function prettierOutput(path, source) {
    const absolutePath = join(root, path);
    const options = (await prettier.resolveConfig(absolutePath, { editorconfig: true })) || {};
    return prettier.format(source, { ...options, filepath: absolutePath });
}

async function parserStatus(path) {
    const absolutePath = join(root, path);
    const info = await prettier.getFileInfo(absolutePath, { ignorePath: join(root, ".prettierignore") });
    if (info.ignored) return `${path} (hidden by .prettierignore)`;
    if (!info.inferredParser) return `${path} (Prettier could not infer a parser)`;
    return null;
}

function changedLineRanges(pristinePath, currentPath) {
    let output = "";
    try {
        output = execFileSync("git", ["diff", "--no-index", "--unified=0", "--no-color", "--", pristinePath, currentPath], {
            cwd: repoRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
    } catch (error) {
        output = error?.stdout?.toString?.() || "";
    }
    return [...output.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map((match) => ({
        start: Number(match[1]),
        count: Number(match[2] || 1),
    }));
}

function changedLinesMatchFormatted(source, formatted, ranges) {
    const sourceLines = normalizeEol(source).split("\n");
    const formattedLines = normalizeEol(formatted).split("\n");
    const mismatches = [];
    let formattedSearchStart = 0;
    for (const { start, count } of ranges) {
        for (let offset = 0; offset < count; offset += 1) {
            const lineNumber = start + offset;
            const expected = sourceLines[lineNumber - 1]?.trim().replace(/\s+/g, " ");
            if (!expected) continue;
            let match = -1;
            for (let candidate = formattedSearchStart; candidate < formattedLines.length; candidate += 1) {
                if (formattedLines[candidate].trim().replace(/\s+/g, " ") === expected) {
                    match = candidate;
                    break;
                }
            }
            if (match < 0) mismatches.push(lineNumber);
            else formattedSearchStart = match + 1;
        }
    }
    return mismatches;
}

async function checkManifestFormatting() {
    const failures = [];
    const notes = [];
    for (const path of manifestFiles) {
        const parserError = await parserStatus(path);
        if (parserError) {
            failures.push(parserError);
            continue;
        }
        const source = readFileSync(join(root, path), "utf8");
        if (baselineFormatFiles.has(path)) {
            const formatted = await prettierOutput(path, source);
            if (pristineRoot) {
                const pristinePath = join(pristineRoot, path);
                if (existsSync(pristinePath)) {
                    const pristineSource = readFileSync(pristinePath, "utf8");
                    const ranges = changedLineRanges(pristinePath, join(root, path));
                    const mismatches = changedLinesMatchFormatted(source, formatted, ranges);
                    if (mismatches.length) failures.push(`${path} (local changed lines are not Prettier-formatted: ${mismatches.join(", ")})`);
                    else notes.push(`${path}: checked ${ranges.reduce((total, range) => total + range.count, 0)} changed lines against pristine source`);
                } else {
                    notes.push(`${path}: parser checked; no pristine counterpart at ${pristineRoot}`);
                }
            } else {
                notes.push(`${path}: parser checked; whole-file format differs from upstream v0.18 baseline (set CANVAS_PRISTINE_WEB for hunk audit)`);
            }
            continue;
        }
        const formatted = await prettierOutput(path, source);
        if (mode === "--write") {
            if (source !== formatted) writeFileSync(join(root, path), formatted, "utf8");
        } else if (normalizeEol(source) !== normalizeEol(formatted)) {
            failures.push(path);
        }
    }
    return { failures, notes };
}

function readUpstreamFiles(path) {
    const absolutePath = join(path);
    if (!existsSync(absolutePath)) return [];
    return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory() && [".git", "node_modules", "dist", "build", "coverage"].includes(entry.name)) return [];
        const child = join(absolutePath, entry.name);
        if (entry.isDirectory()) return readUpstreamFiles(child);
        return entry.isFile() ? [child] : [];
    });
}

function auditPristineTree() {
    if (!pristineRoot) {
        console.error("Pristine audit requires CANVAS_PRISTINE_WEB to point to a clean upstream v0.19.0 web/ checkout.");
        process.exitCode = 2;
        return;
    }
    const manifest = new Set(manifestFiles);
    const failures = [];
    const localRoot = root;
    for (const pristinePath of readUpstreamFiles(pristineRoot)) {
        const rel = relative(pristineRoot, pristinePath).replaceAll("\\", "/");
        const localPath = join(localRoot, rel);
        if (!existsSync(localPath)) {
            if (!intentionallyAbsentUpstreamFiles.has(rel)) failures.push(`missing local upstream file: ${rel}`);
            continue;
        }
        if (metadataFiles.has(rel) || generatedFiles.has(rel) || localConfigFiles.has(rel)) continue;
        const pristine = normalizeEol(readFileSync(pristinePath, "utf8"));
        const local = normalizeEol(readFileSync(localPath, "utf8"));
        if (pristine !== local && !manifest.has(rel) && rel !== "bun.lock") failures.push(`unlisted semantic drift: ${rel}`);
    }
    for (const localPath of readUpstreamFiles(localRoot)) {
        const rel = relative(localRoot, localPath).replaceAll("\\", "/");
        if (metadataFiles.has(rel) || generatedFiles.has(rel) || localConfigFiles.has(rel) || rel === "bun.lock") continue;
        if (!existsSync(join(pristineRoot, rel)) && !manifest.has(rel)) failures.push(`unlisted local file: ${rel}`);
    }
    if (failures.length) {
        console.error("Canvas pristine manifest audit failed:");
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exitCode = 1;
    } else {
        console.log(`Canvas pristine manifest audit passed (${manifestFiles.length} manifest files).`);
    }
}

if (mode === "--audit-pristine") {
    auditPristineTree();
} else {
    const { failures, notes } = await checkManifestFormatting();
    if (failures.length) {
        console.error("Canvas integration format check failed:");
        for (const failure of failures) console.error(`  - ${failure}`);
        console.error("Run `bun run format` to format owned files, or set CANVAS_PRISTINE_WEB for mixed-file hunk auditing.");
        process.exitCode = 1;
    } else {
        console.log(`Canvas integration format check passed (${manifestFiles.length} files).`);
    }
    if (notes.length) {
        console.log("Canvas mixed-file audit notes:");
        for (const note of notes) console.log(`  - ${note}`);
    }
    console.log("Run `bun run format:check:upstream` to inspect the complete vendored tree.");
}

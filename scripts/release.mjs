import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const newer = (a, b) => {
  const x = a.split('.').map(BigInt), y = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

export function parseChangelog(text, version) {
  if (!stable.test(version)) throw new Error('Expected stable MAJOR.MINOR.PATCH');
  const sections = [...text.matchAll(/^## (.+)$/gm)];
  if (sections[0]?.[1] !== '[Unreleased]') throw new Error('Start with ## [Unreleased]');
  const entries = new Map();
  let previous;
  for (let i = 1; i < sections.length; i++) {
    const match = /^\[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/.exec(sections[i][1]);
    if (!match || !stable.test(match[1])) throw new Error('Invalid version/date heading');
    const [, current, date] = match;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date');
    if (entries.has(current) || (previous && !newer(previous, current))) throw new Error('Versions must be unique and descending');
    const body = text.slice(sections[i].index + sections[i][0].length, sections[i + 1]?.index ?? text.length).trim();
    if (!/^### (Added|Changed|Deprecated|Removed|Fixed|Security)\n\n- \S/m.test(body)) throw new Error('Release needs categorized changes');
    for (const heading of ['Breaking changes', 'Migration']) {
      if (!new RegExp(`^### ${heading}\\n\\n- \\S`, 'm').test(body)) throw new Error(`Release needs explicit ${heading}`);
    }
    if (/\b(TBD|TODO|PLACEHOLDER)\b/.test(body)) throw new Error('Unfinished release notes');
    entries.set(current, body + '\n');
    previous = current;
  }
  if (entries.keys().next().value !== version) throw new Error('Newest changelog version must match package.json');
  return entries;
}

export function requireSuccessfulCI(runs, workflow) {
  const latest = runs.find(run => run.workflowName === workflow);
  if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success') throw new Error(`Latest ${workflow} push CI must succeed for this exact SHA`);
}

const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = (...args) => run('git', args);
const gh = (...args) => run('gh', args);
const api = path => JSON.parse(gh('api', path));

function main(args) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const entries = parseChangelog(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), pkg.version);
  if (args.length === 1 && args[0] === 'check') {
    console.log(`Release notes verified: ${pkg.version}`);
  } else if (args[0] === 'notes' && args.length <= 2) {
    const notes = entries.get(args[1] ?? pkg.version);
    if (!notes) throw new Error('Version absent from changelog');
    process.stdout.write(notes);
  } else if (args[0] === 'publish' && args.length === 2) {
    const sha = args[1];
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Publish requires a reviewed full commit SHA');
    if (git('status', '--porcelain') || git('rev-parse', 'HEAD') !== sha) throw new Error('Use a clean checkout of the exact release commit');
    // The repository this checkout publishes to, from its origin remote (owners can change; package names do not).
    const repo = gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner').trim(), name = repo.split('/')[1];
    if (api(`repos/${repo}/commits/main`).sha !== sha) throw new Error('Release commit must be current remote main');
    run(process.execPath, ['scripts/distribution.mjs', '--check']);
    const runs = JSON.parse(gh('run', 'list', '--repo', repo, '--commit', sha, '--event', 'push', '--limit', '100', '--json', 'workflowName,status,conclusion'));
    const required = 'Check';
    requireSuccessfulCI(runs, required);
    const tag = `v${pkg.version}`, notes = entries.get(pkg.version);
    const refs = api(`repos/${repo}/git/matching-refs/tags/${tag}`);
    const existingTag = refs.find(ref => ref.ref === `refs/tags/${tag}`);
    if (existingTag && api(`repos/${repo}/commits/${tag}`).sha !== sha) throw new Error('Existing tag points elsewhere; never move release tags');
    const releases = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/releases?per_page=100`)).flat();
    const existing = releases.find(release => release.tag_name === tag);
    if (existing) {
      if (!existingTag || existing.draft || existing.prerelease || existing.body.trim() !== notes.trim()) throw new Error('Existing release conflicts; inspect manually');
      console.log(`Already published: ${existing.html_url}`);
      return;
    }
    // No retries on uncertain network outcomes. Inspect the remote before retrying.
    if (!existingTag) gh('api', '--method', 'POST', `repos/${repo}/git/refs`,
      '-f', `ref=refs/tags/${tag}`, '-f', `sha=${sha}`);
    if (api(`repos/${repo}/commits/${tag}`).sha !== sha) throw new Error('Tag identity changed; stop publication');
    const temp = mkdtempSync(join(tmpdir(), `${name}-release-`));
    try {
      const file = join(temp, 'notes.md'); writeFileSync(file, notes);
      console.log(gh('release', 'create', tag, '--repo', repo, '--target', sha,
        '--title', `${name === 'suo' ? 'Suo' : 'Duet'} ${tag}`, '--notes-file', file, '--latest',
        '--verify-tag'));
    } finally { rmSync(temp, { recursive: true, force: true }); }
  } else throw new Error('Usage: node scripts/release.mjs check | notes [VERSION] | publish FULL_SHA');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

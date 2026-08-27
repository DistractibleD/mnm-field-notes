// Cloudflare Worker for the wiki's "Submit a Screenshot" form (see the
// "submit" page in the wiki's own script.js / renderSubmitPage) AND, as of
// 2026-08-27, MnM Field Notes' own session-export submissions.
//
// This is MnM Field Notes' OWN COPY of the wiki's Worker, extended with a
// second, unrelated code path. The wiki repo has its own copy at
// cloudflare-worker/submit-worker.js there - this project never edits that
// file (see CLAUDE.md "Wiki data" - the wiki repo stays read-only for this
// project, always). If the two copies drift, sync them by hand when you
// want to; nothing here does that automatically.
//
// GitHub Pages can only serve static files - it can't run this code. This
// file isn't deployed by GitHub Pages at all; it's kept here purely for
// reference and version history. To actually deploy or update it, paste
// this file's contents into the Worker's editor in the Cloudflare
// dashboard (Workers & Pages -> your worker -> Edit Code) and click Deploy.
//
// Required Worker secret (Settings -> Variables -> add secret, NOT a plain
// variable): GITHUB_TOKEN - a GitHub fine-grained Personal Access Token,
// scoped to ONLY this repository, with "Contents: Read and write" and
// "Pull requests: Read and write" permissions and nothing else. Never paste
// this token anywhere except that one secret field.
//
// Two independent submission shapes share this one Worker:
//
// 1. Wiki screenshot/notes (unchanged from the original): a visitor fills
//    out the on-wiki form. The browser POSTs a screenshot and/or notes here
//    (at least one is required). This Worker commits either the screenshot
//    (into images/Inbox/) or a small text file (into community-notes/, for
//    a notes-only submission) on a new branch, and opens a pull request.
//    "Regarding" context (which item/monster) and a chosen zone/map are
//    folded into the plain `notes` text as labeled lines by the client
//    before it ever reaches this Worker - this file doesn't know anything
//    about items/monsters/maps.
//
// 2. MnM Field Notes session export (new): the app POSTs a full session
//    export as `sessionExport` (plain text, the exact .txt a session
//    produces), plus an optional `title` for the PR (the app builds one
//    like "Fishing session by AutoTestUser (12 entries)" - this Worker
//    stays domain-agnostic, same reasoning as #1 above, so it never parses
//    the export text itself). Committed into session-exports/ instead of
//    community-notes/ - the existing `notes` field is capped at 2200 chars
//    server-side, fine for a short note, nowhere near enough for a whole
//    session, so this gets its own field with a much higher cap instead of
//    being squeezed into a format built for something else.
//
// Both shapes end the same way: exactly one new file, on a new branch, via
// a pull request - never a direct commit to main. The repo owner accepts a
// submission by merging that PR, or denies it by closing the PR without
// merging; either way nothing on the live site changes until that decision
// is made. This Worker never merges its own PRs and has no ability to.

const OWNER = 'DistractibleD';
const REPO = 'DistractibleD-MonstersAndMemories-Wiki';
const BASE_BRANCH = 'main';
// Must match the wiki's real published URL exactly (scheme + host, no
// trailing path). Browsers enforce this via CORS for the wiki's own
// screenshot/notes form; it does NOT stop a non-browser client (like MnM
// Field Notes' PowerShell host) from POSTing here directly - CORS is a
// browser-only mechanism. That's fine and expected for the session-export
// path below; it's a deliberate exception to "only the wiki calls this",
// not an oversight.
const ALLOWED_ORIGIN = 'https://distractibled.github.io';

const MAX_BYTES = 8 * 1024 * 1024; // 8MB - screenshot cap, unchanged
const ALLOWED_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
const MAX_EXPORT_BYTES = 512 * 1024; // 512KB - generous for any real session, still a sane abuse ceiling

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'Invalid submission — please try again.' }, 400);
    }

    // Honeypot field: real visitors never see or fill this in (see the
    // wiki's renderSubmitPage), so anything that does is almost certainly a
    // bot. Respond as if it worked so the bot doesn't learn to avoid the
    // field. MnM Field Notes always sends this field empty too, for the
    // same reason, even though it isn't a public-facing form.
    if (form.get('website')) {
      return json({ ok: true });
    }

    const rawSessionExport = form.get('sessionExport');
    if (typeof rawSessionExport === 'string' && rawSessionExport) {
      return handleSessionExport(form, rawSessionExport, env);
    }
    return handleWikiSubmission(form, env);
  }
};

// ---------------------------------------------------------------------------
// Path 2: MnM Field Notes session export
// ---------------------------------------------------------------------------
async function handleSessionExport(form, text, env) {
  if (byteLength(text) > MAX_EXPORT_BYTES) {
    return json({ error: 'That session export is too large.' }, 400);
  }

  const stamp = Date.now();
  const filename = `session-export-${stamp}.txt`;
  const title = (form.get('title') || '').toString().slice(0, 200) || `Session export (${filename})`;
  const base64 = bytesToBase64(new TextEncoder().encode(text));

  const prBody = [
    'Submitted through MnM Field Notes\' session export feature.',
    '',
    'This only adds the export text file to `session-exports/` — nothing else changes, and ' +
      'nothing is live until this PR is merged. **Merge to accept, close (without merging) ' +
      'to deny.**'
  ].join('\n');

  try {
    await commitAndOpenPr(env, {
      branchPrefix: 'session-export',
      stamp,
      filePath: 'session-exports',
      filename,
      base64,
      commitMessage: `Add session export (${filename})`,
      prTitle: title,
      prBody
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: 'Something went wrong submitting this — please try again in a moment.' }, 502);
  }
}

// ---------------------------------------------------------------------------
// Path 1: wiki screenshot/notes (unchanged behavior from the original)
// ---------------------------------------------------------------------------
async function handleWikiSubmission(form, env) {
  const rawFile = form.get('screenshot');
  const hasFile = rawFile && typeof rawFile !== 'string';
  // Slightly higher than the client's own 2000-char textarea limit, since
  // the client prepends its own short "Regarding: ..."/"Zone/Map: ..."
  // lines onto whatever the visitor typed (see renderSubmitPage).
  const notes = (form.get('notes') || '').toString().slice(0, 2200);

  if (!hasFile && !notes) {
    return json({ error: 'Please attach a screenshot or write a note.' }, 400);
  }

  let ext, base64;
  if (hasFile) {
    const file = rawFile;
    if (file.size > MAX_BYTES) {
      return json({ error: 'That screenshot is too large (8MB max).' }, 400);
    }
    ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return json({ error: 'Please attach an image file (PNG, JPG, WEBP, or GIF).' }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    base64 = bytesToBase64(bytes);
  } else {
    // Notes-only submission — encode the note text itself as the "file"
    // content, same base64 helper used for image bytes.
    base64 = bytesToBase64(new TextEncoder().encode(`# Wiki text submission\n\n${notes}\n`));
  }

  const stamp = Date.now();
  const filePath = hasFile ? 'images/Inbox' : 'community-notes';
  const filename = hasFile ? `submission-${stamp}.${ext}` : `note-${stamp}.md`;

  const prBody = [
    'Submitted through the wiki\'s "Submit a Screenshot" form.',
    '',
    hasFile
      ? 'This only adds the screenshot to `images/Inbox/` — nothing else changes, and ' +
        'nothing is live until this PR is merged. **Merge to accept, close (without ' +
        'merging) to deny.**'
      : 'This is a text-only submission (no screenshot attached) — it only adds a small ' +
        'note file to `community-notes/`. Nothing else changes, and nothing is live ' +
        'until this PR is merged. **Merge to accept, close (without merging) to deny.**',
    '',
    notes ? `Submitter's notes:\n\n${notes}` : '(No notes were included.)'
  ].join('\n');

  try {
    await commitAndOpenPr(env, {
      branchPrefix: 'submission',
      stamp,
      filePath,
      filename,
      base64,
      commitMessage: `Add wiki submission (${filename})`,
      prTitle: `Wiki submission: ${filename}`,
      prBody
    });
    return json({ ok: true });
  } catch (err) {
    return json({ error: 'Something went wrong submitting this — please try again in a moment.' }, 502);
  }
}

// ---------------------------------------------------------------------------
// Shared: branch + commit + PR, used by both paths above. Always exactly
// one new file, never edits an existing one, so concurrent submissions
// (from either path, from anyone) can never conflict with each other.
// ---------------------------------------------------------------------------
async function commitAndOpenPr(env, { branchPrefix, stamp, filePath, filename, base64, commitMessage, prTitle, prBody }) {
  const gh = (path, opts = {}) => fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'wiki-submission-worker',
      ...(opts.headers || {})
    }
  });

  // 1. Read the latest commit on the base branch.
  const refRes = await gh(`/git/ref/heads/${BASE_BRANCH}`);
  if (!refRes.ok) throw new Error('read-base-branch');
  const baseSha = (await refRes.json()).object.sha;

  // 2. Create a new branch from that commit.
  const branch = `${branchPrefix}/${stamp}`;
  const createRefRes = await gh('/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha })
  });
  if (!createRefRes.ok) throw new Error('create-branch');

  // 3. Commit the one file on that branch.
  const putRes = await gh(`/contents/${filePath}/${filename}`, {
    method: 'PUT',
    body: JSON.stringify({ message: commitMessage, content: base64, branch })
  });
  if (!putRes.ok) throw new Error('commit-file');

  // 4. Open a pull request — this is the "waiting for accept/deny" step.
  const prRes = await gh('/pulls', {
    method: 'POST',
    body: JSON.stringify({ title: prTitle, head: branch, base: BASE_BRANCH, body: prBody })
  });
  if (!prRes.ok) throw new Error('open-pr');
}

function byteLength(str) {
  return new TextEncoder().encode(str).length;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

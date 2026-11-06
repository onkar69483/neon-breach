import { spawn } from 'node:child_process';

// Terminals never report key releases, so on Windows we poll the real key state (GetAsyncKeyState) in a
// small PowerShell helper, exactly like a native game would. Bit i of the reported mask = KEYS[i] is down.
export const KEYS = [
  ['up', 0x26, 'fwd'],
  ['down', 0x28, 'back'],
  ['left', 0x25, 'turnL'],
  ['right', 0x27, 'turnR'],
  ['w', 0x57, 'fwd'],
  ['s', 0x53, 'back'],
  ['a', 0x41, 'strafeL'],
  ['d', 0x44, 'strafeR'],
  ['q', 0x51, 'turnL'],
  ['e', 0x45, 'turnR'],
  ['space', 0x20, 'fire'],
  ['x', 0x58, 'fire'],
];

export const NATIVE_ACTIONS = new Set(KEYS.map((k) => k[2]));

export function maskToActions(mask, keys = KEYS) {
  const set = new Set();
  keys.forEach((k, i) => {
    if ((mask >> i) & 1) set.add(k[2]);
  });
  return set;
}

export function buildScript(keys, parentPid) {
  const vks = keys.map((k) => k[1]).join(',');
  return `
$ErrorActionPreference = 'Stop'
Add-Type -Namespace NB -Name K -MemberDefinition '[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);'
$vk = @(${vks})
$last = -1
$tick = 0
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
while ($true) {
  $m = 0
  for ($i = 0; $i -lt $vk.Length; $i++) {
    if (([NB.K]::GetAsyncKeyState($vk[$i]) -band 0x8000) -ne 0) { $m = $m -bor (1 -shl $i) }
  }
  if ($m -ne $last) { $last = $m; [Console]::Out.WriteLine($m); [Console]::Out.Flush() }
  $tick++
  if ($tick % 100 -eq 0) {
    if (-not (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue)) { exit }
  }
  Start-Sleep -Milliseconds 5
}
`;
}

// Returns { stop() } or null when unsupported. Callbacks: onReady(), onMask(mask), onExit().
export function startKeyHelper({ keys = KEYS, onReady, onMask, onExit }) {
  if (process.platform !== 'win32') return null;
  const script = buildScript(keys, process.pid);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  let child;
  try {
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
    );
  } catch {
    return null;
  }
  let buf = '';
  let stopped = false;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line === 'READY') onReady && onReady();
      else if (line !== '' && /^\d+$/.test(line)) onMask && onMask(Number(line));
    }
  });
  const done = () => {
    if (stopped) return;
    stopped = true;
    onExit && onExit();
  };
  child.on('error', done);
  child.on('exit', done);
  return {
    stop() {
      stopped = true;
      try { child.kill(); } catch { /* already gone */ }
    },
  };
}

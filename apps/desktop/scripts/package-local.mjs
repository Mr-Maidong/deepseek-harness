#!/usr/bin/env node
/**
 * Package the Desktop application in this checkout for local use.
 *
 * Lanes:
 *   all      official end-to-end packaging: build, prepare, electron-builder, packaged-runtime smoke
 *   prepare  official preparation only; stops before electron-builder
 *   pack     reuse the prepared target tree and rerun electron-builder only
 *
 * The pack lane is the fast iteration lane. It recompiles nothing: it repacks whatever prepare or all
 * last staged, so changes made after that staging are absent. Its destination is replaced, so close
 * any application started from it first.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { desktopTargetBuildPaths, desktopTargetPlatform } from './desktop-build-paths.mjs'
import { loadDesktopPackageEnvironment } from './desktop-package-environment.mjs'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const REPOSITORY_ROOT = resolve(APP_ROOT, '..', '..')
const TARGETS = new Set(['win-x64', 'mac-arm64', 'mac-x64'])
const LANES = new Set(['all', 'prepare', 'pack'])
const WINDOWS_SIGNING_PREFIX = 'DSH_DESKTOP_WINDOWS_'
const UPLOAD_CREDENTIAL_NAMES = new Set([
  'DOWNLOAD_TEST_COS_SECRET_ID', 'DOWNLOAD_TEST_COS_SECRET_KEY',
  'DOWNLOAD_PROD_COS_SECRET_ID', 'DOWNLOAD_PROD_COS_SECRET_KEY',
])
/** npm mirror that serves the same Electron archives the shared download cache holds. */
const DEFAULT_ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
const PACKAGE_MANIFEST = join(APP_ROOT, 'package.json')

const USAGE = [
  'Package the Desktop application for local use.',
  '',
  '  node apps/desktop/scripts/package-local.mjs [options]',
  '',
  'Options',
  '  --lane <all|prepare|pack>  all: full official packaging (default)',
  '                             prepare: build and stage only',
  '                             pack: electron-builder over the staged tree (fast, no recompile)',
  '  --target <name>            win-x64 (default on Windows), mac-arm64, mac-x64',
  '  --installer                build the installer instead of the runnable application directory',
  '  --output <dir>             pack destination (default: the target artifact directory)',
  '  --signed                   use release signing configuration instead of an unsigned local build',
  '  --build-version <version>  version to package; forwards the official override',
  '  --clean                    delete the pack destination before packing',
  '  --launch                   start the packaged application after a successful pack',
  '  --no-electron-mirror       download Electron from its default origin instead of the cache mirror',
  '  --electron-mirror <url>    override the Electron download mirror',
  '  --electron-custom-dir <d>  override the mirror directory holding the version (for example v44.0.0)',
  '  --dry-run                  print the commands and destination without running them',
  '  --help                     print this text',
  '',
].join('\n')

/** Positional-free argument parser for this script. */
function parseInvocation() {
  return parseArgs({
    options: {
      lane: { type: 'string', default: 'all' },
      target: { type: 'string' },
      installer: { type: 'boolean', default: false },
      output: { type: 'string' },
      signed: { type: 'boolean', default: false },
      'build-version': { type: 'string' },
      clean: { type: 'boolean', default: false },
      launch: { type: 'boolean', default: false },
      'no-electron-mirror': { type: 'boolean', default: false },
      'electron-mirror': { type: 'string' },
      'electron-custom-dir': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  }).values
}

function hostTarget() {
  if (process.platform === 'win32') return 'win-x64'
  return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
}

function strip(environment, predicate) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !predicate(name)))
}

/** Electron version this checkout installs, which the cache mirror directory must match. */
function installedElectronVersion() {
  const installed = join(APP_ROOT, 'node_modules', 'electron', 'package.json')
  if (existsSync(installed)) return JSON.parse(readFileSync(installed, 'utf8')).version
  const declared = JSON.parse(readFileSync(PACKAGE_MANIFEST, 'utf8')).devDependencies.electron
  return String(declared).replace(/^[\^~]/u, '')
}

function cachedElectronArchive(paths, version, platform, arch) {
  if (!existsSync(paths.downloads)) return undefined
  const name = 'electron-v' + version + '-' + platform + '-' + arch + '.zip'
  for (const entry of readdirSync(paths.downloads, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = join(paths.downloads, entry.name, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Build the two child environments this script uses: one for preparation and one for
 * electron-builder. Both mirror what the official packaging entry passes to its stages.
 */
function environments(fileEnvironment, target, unsigned) {
  const { platform, arch } = desktopTargetPlatform(target)
  const base = strip(fileEnvironment, name => name.startsWith(WINDOWS_SIGNING_PREFIX) || UPLOAD_CREDENTIAL_NAMES.has(name))
  delete base.ELECTRON_RUN_AS_NODE
  const preparation = { ...base, DSH_DESKTOP_TARGET_PLATFORM: platform, DSH_DESKTOP_TARGET_ARCH: arch }
  const builder = unsigned
    ? { ...strip(preparation, name => /^(?:WIN_)?CSC_/iu.test(name)), CSC_IDENTITY_AUTO_DISCOVERY: 'false', DSH_DESKTOP_UNSIGNED: '1' }
    : { ...preparation, DSH_DESKTOP_UNSIGNED: '0' }
  if (platform === 'win32') builder.ELECTRON_BUILDER_7Z_FILTER = 'BCJ'
  builder.DSH_DESKTOP_PACKAGING_RUN_DIR = join(APP_ROOT, '.desktop-build', 'packaging-runs',
    'local-' + new Date().toISOString().replace(/[:.]/gu, '-'))
  return { platform, arch, preparation, builder }
}

/** pnpm entry that this checkout can run even when no shell exposes one on PATH. */
function pnpmInvocation() {
  const entry = process.env.npm_execpath
  if (entry !== undefined && entry !== '' && existsSync(entry)) return { command: process.execPath, args: [entry], shell: false }
  const home = process.env.USERPROFILE ?? process.env.HOME
  const bundled = home === undefined ? undefined : join(home, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')
  if (bundled !== undefined && existsSync(bundled)) return { command: process.execPath, args: [bundled], shell: false }
  return { command: 'pnpm', args: [], shell: process.platform === 'win32' }
}

function electronBuilderArguments(target, output) {
  const { platform, arch } = desktopTargetPlatform(target)
  return [
    'exec', 'electron-builder', '--config', 'electron-builder.config.mjs',
    platform === 'win32' ? '--win' : '--mac',
    platform === 'win32' ? '--x64' : arch === 'arm64' ? '--arm64' : '--x64',
    '--publish', 'never', '--dir',
    '--config.directories.output', output,
  ]
}

/** Official package script that supersedes the lanes this script assembles itself. */
function officialScript(target, unsigned, installer) {
  const suffix = target === 'win-x64' ? 'win:x64' : target === 'mac-arm64' ? 'mac:arm64' : 'mac:x64'
  if (unsigned) return 'package:' + suffix + ':unsigned'
  return 'package:' + suffix + (installer ? '' : ':dir')
}

function applicationPath(target, output) {
  if (desktopTargetPlatform(target).platform === 'win32') return join(output, 'win-unpacked', 'DeepSeek Harness.exe')
  return join(output, target === 'mac-arm64' ? 'mac-arm64' : 'mac', 'DeepSeek Harness.app')
}

function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    console.log('+ ' + [command, ...args].join(' '))
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error([command, ...args].join(' ') + ' exited with ' + String(code ?? signal)))
    })
  })
}

function describeAge(path) {
  const minutes = Math.round((Date.now() - statSync(path).mtimeMs) / 60000)
  return minutes < 1 ? 'less than a minute ago' : minutes + ' minutes ago'
}

async function main() {
  const values = parseInvocation()
  if (values.help) {
    process.stdout.write(USAGE)
    return
  }
  if (!LANES.has(values.lane)) throw new Error('unknown lane ' + JSON.stringify(values.lane) + '; expected all, prepare, or pack')
  const target = values.target ?? hostTarget()
  if (!TARGETS.has(target)) throw new Error('unknown target ' + JSON.stringify(target) + '; expected ' + [...TARGETS].join(', '))
  const unsigned = !values.signed
  if (unsigned && desktopTargetPlatform(target).platform !== 'win32') {
    throw new Error('unsigned artifacts are Windows-only; macOS packaging uses the release signing configuration')
  }
  if (values.lane !== 'pack' && values.output !== undefined) {
    throw new Error('--output applies to the pack lane; the official lanes always write to the target artifact directory')
  }
  const paths = desktopTargetBuildPaths(target)
  const fileEnvironment = loadDesktopPackageEnvironment(desktopTargetPlatform(target).platform)
  const { preparation, builder } = environments(fileEnvironment, target, unsigned)
  const pnpm = pnpmInvocation()
  const electronVersion = installedElectronVersion()
  const downloadEnvironment = values['no-electron-mirror'] ? preparation : {
    ...preparation,
    ELECTRON_MIRROR: values['electron-mirror'] ?? DEFAULT_ELECTRON_MIRROR,
    ELECTRON_CUSTOM_DIR: values['electron-custom-dir'] ?? 'v' + electronVersion,
  }
  const versionArguments = values['build-version'] === undefined ? [] : ['--build-version', values['build-version']]
  const started = Date.now()
  console.log('package-local: ' + values.lane + ' lane, ' + target + ', ' + (unsigned ? 'unsigned' : 'signed'))
  const steps = []
  if (values.lane !== 'pack') {
    const script = values.lane === 'all' ? officialScript(target, unsigned, values.installer) : 'prepare:package'
    const scriptArguments = values.lane === 'all' ? (values.installer ? [] : ['--dir']) : [target]
    if (values.lane === 'all') {
      const cached = values['no-electron-mirror'] ? undefined : cachedElectronArchive(paths, electronVersion, 'win32', 'x64')
      console.log(cached === undefined
        ? 'package-local: Electron ' + electronVersion + ' is not in the download cache yet'
        : 'package-local: reusing cached Electron archive ' + cached)
    }
    steps.push({
      command: pnpm.command,
      args: [...pnpm.args, '--filter', '@deepseek-ai/dsh-desktop', 'run', script, '--', ...scriptArguments, ...versionArguments],
      options: { cwd: REPOSITORY_ROOT, env: values.lane === 'all' ? downloadEnvironment : preparation, shell: pnpm.shell },
    })
  }
  let output = unsigned ? paths.unsignedArtifacts : paths.artifacts
  if (values.lane !== 'prepare') {
    output = values.output === undefined ? output : resolve(values.output)
    if (values.lane === 'pack') {
      if (!existsSync(paths.dsh)) throw new Error('no prepared tree at ' + paths.dsh + '; run --lane all (or --lane prepare) first')
      console.log('package-local: staged tree is from ' + describeAge(paths.dsh) + '; later changes are not included')
      if (values.clean && !values['dry-run']) rmSync(output, { recursive: true, force: true })
      if (!values['dry-run']) mkdirSync(output, { recursive: true })
      steps.push({
        command: pnpm.command,
        args: [...pnpm.args, ...electronBuilderArguments(target, output)],
        options: { cwd: APP_ROOT, env: builder, shell: pnpm.shell },
      })
    }
    console.log('package-local: application ' + applicationPath(target, output))
  }
  for (const step of steps) {
    if (values['dry-run']) console.log('+ ' + [step.command, ...step.args].join(' '))
    else await run(step.command, step.args, step.options)
  }
  if (values.launch && values.lane !== 'prepare' && !values['dry-run']) {
    const application = applicationPath(target, output)
    if (!existsSync(application)) throw new Error('nothing to launch at ' + application)
    if (process.platform === 'darwin') await run('open', [application], {})
    else await run(application, [], { detached: true, stdio: 'ignore' })
  }
  console.log('package-local: done in ' + ((Date.now() - started) / 1000).toFixed(0) + 's')
}

try {
  await main()
} catch (error) {
  process.stderr.write('package-local: ' + (error instanceof Error ? error.message : String(error)) + '\n')
  process.exitCode = 1
}

import { isAbsolute, normalize } from 'path'

export interface PolicyValidationInput {
  cwd?: string
  allowedPaths?: string[]
}

export interface PolicyValidationResult {
  allowed: boolean
  deniedReason?: string
}

const ALLOWED_SUBCOMMANDS: Record<string, Set<string>> = {
  docker: new Set(['pull', 'run', 'exec', 'logs', 'wait', 'stop', 'rm', 'cp', 'inspect', 'commit']),
  git: new Set(['clone', 'status', 'add', 'commit', 'format-patch', 'am', 'apply', 'rev-parse']),
  tar: new Set(['-czf', '-xzf']),
}

const DENIED_DOCKER_FLAGS = new Set([
  '--privileged',
  '--pid=host',
  '--ipc=host',
  '--device',
  '--cap-add',
  '--security-opt',
  '--security-opt=seccomp=unconfined',
  '--security-opt=apparmor=unconfined',
  '--security-opt=label=disable',
])

function deny(deniedReason: string): PolicyValidationResult {
  return { allowed: false, deniedReason }
}

function ok(): PolicyValidationResult {
  return { allowed: true }
}

function normalizePaths(paths?: string[]): string[] {
  if (!paths || paths.length === 0) return []
  return paths
    .filter(Boolean)
    .map(path => normalize(path))
}

function isPathAllowed(path: string, allowedPaths: string[]): boolean {
  if (allowedPaths.length === 0) return true
  const normalized = normalize(path)
  return allowedPaths.some(allowed => normalized === allowed || normalized.startsWith(`${allowed}/`))
}

function parseDockerVolumeSource(value: string): string | null {
  if (!value) return null
  if (value.startsWith('/')) {
    const idx = value.indexOf(':')
    return idx > 0 ? value.slice(0, idx) : value
  }
  return null
}

function validateDockerFlags(args: string[]): PolicyValidationResult {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (DENIED_DOCKER_FLAGS.has(arg)) {
      return deny(`Denied docker flag: ${arg}`)
    }
    if (arg.startsWith('--cap-add=')) return deny('Denied docker capability escalation')
    if (arg.startsWith('--device=')) return deny('Denied docker device passthrough')
    if (arg.startsWith('--pid=host')) return deny('Denied host PID namespace')
    if (arg.startsWith('--ipc=host')) return deny('Denied host IPC namespace')
    if (arg === '--volume' || arg === '-v') {
      const mountSpec = args[index + 1] || ''
      const source = parseDockerVolumeSource(mountSpec)
      if (source === '/' || source?.startsWith('/etc') || source?.startsWith('/var/run')) {
        return deny(`Denied dangerous host mount source: ${source}`)
      }
      if (source?.includes('docker.sock') || source?.includes('podman.sock')) {
        return deny('Denied socket mount')
      }
    }
    if (arg.startsWith('-v') && arg.length > 2) {
      const source = parseDockerVolumeSource(arg.slice(2))
      if (source === '/' || source?.startsWith('/etc') || source?.startsWith('/var/run')) {
        return deny(`Denied dangerous host mount source: ${source}`)
      }
      if (source?.includes('docker.sock') || source?.includes('podman.sock')) {
        return deny('Denied socket mount')
      }
    }
  }
  return ok()
}

function validatePathBoundaries(program: string, args: string[], options?: PolicyValidationInput): PolicyValidationResult {
  const allowedPaths = normalizePaths(options?.allowedPaths)
  if (allowedPaths.length === 0) return ok()

  if (program === 'docker') {
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]
      if ((arg === '--volume' || arg === '-v') && args[index + 1]) {
        const source = parseDockerVolumeSource(args[index + 1])
        if (source && !isPathAllowed(source, allowedPaths)) {
          return deny(`Host mount source outside allowed paths: ${source}`)
        }
      }
      if (arg.startsWith('-v') && arg.length > 2) {
        const source = parseDockerVolumeSource(arg.slice(2))
        if (source && !isPathAllowed(source, allowedPaths)) {
          return deny(`Host mount source outside allowed paths: ${source}`)
        }
      }
      if (arg === 'cp') {
        const from = args[index + 1]
        const to = args[index + 2]
        for (const candidate of [from, to]) {
          if (!candidate) continue
          if (candidate.includes(':')) continue
          if (isAbsolute(candidate) && !isPathAllowed(candidate, allowedPaths)) {
            return deny(`docker cp path outside allowed paths: ${candidate}`)
          }
        }
      }
    }
  }

  if (program === 'git') {
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '-C' && args[index + 1]) {
        const gitPath = args[index + 1]
        if (isAbsolute(gitPath) && !isPathAllowed(gitPath, allowedPaths)) {
          return deny(`git -C path outside allowed paths: ${gitPath}`)
        }
      }
    }
  }

  if (program === 'tar') {
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '-C' && args[index + 1]) {
        const tarPath = args[index + 1]
        if (isAbsolute(tarPath) && !isPathAllowed(tarPath, allowedPaths)) {
          return deny(`tar -C path outside allowed paths: ${tarPath}`)
        }
      }
    }
  }

  return ok()
}

export function validateHostCommand(
  program: string,
  args: string[],
  options?: PolicyValidationInput,
): PolicyValidationResult {
  const allowedPrograms = new Set(['docker', 'git', 'tar'])
  if (!allowedPrograms.has(program)) {
    return deny(`Program is not allowed: ${program}`)
  }

  const subcommand = args[0]
  if (!subcommand) {
    return deny(`Missing subcommand for program: ${program}`)
  }

  const allowedSubcommands = ALLOWED_SUBCOMMANDS[program]
  if (!allowedSubcommands.has(subcommand)) {
    return deny(`Subcommand is not allowed: ${program} ${subcommand}`)
  }

  if (program === 'docker') {
    const dockerResult = validateDockerFlags(args)
    if (!dockerResult.allowed) return dockerResult
  }

  return validatePathBoundaries(program, args, options)
}

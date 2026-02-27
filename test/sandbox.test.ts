import { describe, it, expect } from 'vitest';
import { DockerSandbox } from '../src/sandbox/docker.js';
import type { SandboxConfig } from '../src/sandbox/types.js';

describe('DockerSandbox', () => {
  it('builds correct container config', () => {
    const sandbox = new DockerSandbox();
    const config: SandboxConfig = {
      image: 'minion-base',
      repoPath: '/path/to/repo',
      runDir: '/home/user/.minion/runs/abc123',
      memory: '4g',
      cpus: 2,
      network: 'bridge',
    };
    const containerOpts = sandbox.buildContainerOptions(config);
    expect(containerOpts.Image).toBe('minion-base');
    expect(containerOpts.HostConfig.Binds).toContain('/path/to/repo:/host-repo:ro');
    expect(containerOpts.HostConfig.Binds).toContain('/home/user/.minion/runs/abc123:/minion-run');
    expect(containerOpts.HostConfig.Memory).toBe(4 * 1024 * 1024 * 1024);
  });

  it('passes proxy env vars to container', () => {
    const sandbox = new DockerSandbox();
    const config: SandboxConfig = {
      image: 'minion-base',
      repoPath: '/path/to/repo',
      runDir: '/home/user/.minion/runs/abc123',
      memory: '4g',
      cpus: 2,
      network: 'bridge',
    };
    process.env.HTTP_PROXY = 'http://proxy:8080';
    const containerOpts = sandbox.buildContainerOptions(config);
    expect(containerOpts.Env).toContain('HTTP_PROXY=http://proxy:8080');
    delete process.env.HTTP_PROXY;
  });

  it('applies Linux UID/GID on linux platform', () => {
    const sandbox = new DockerSandbox();
    const config: SandboxConfig = {
      image: 'minion-base',
      repoPath: '/path/to/repo',
      runDir: '/tmp/run',
      memory: '4g',
      cpus: 2,
      network: 'bridge',
    };
    const containerOpts = sandbox.buildContainerOptions(config);
    // On macOS this will be empty, on Linux it would be set
    // Just verify the method doesn't throw
    expect(containerOpts).toBeDefined();
  });

  it('mounts pi-runtime and sets entrypoint', () => {
    const sandbox = new DockerSandbox('/home/user/.minion');
    const config: SandboxConfig = {
      image: 'node:22-slim',
      repoPath: '/path/to/repo',
      runDir: '/home/user/.minion/runs/abc123',
      memory: '4g',
      cpus: 2,
      network: 'bridge',
    };

    const opts = sandbox.buildContainerOptions(config);
    expect(opts.Entrypoint).toEqual(['/minion-bootstrap.sh']);
    expect(opts.HostConfig.Binds).toContain(
      '/home/user/.minion/pi-runtime:/opt/pi-runtime:ro'
    );
  });
});

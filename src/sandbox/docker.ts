import Dockerode from 'dockerode';
import { platform, homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type { Sandbox, SandboxConfig, SandboxHandle } from './types.js';

function parseMemory(mem: string): number {
  const match = mem.match(/^(\d+)([gmk]?)$/i);
  if (!match) return 4 * 1024 * 1024 * 1024;
  const num = parseInt(match[1]);
  switch (match[2]?.toLowerCase()) {
    case 'g': return num * 1024 * 1024 * 1024;
    case 'm': return num * 1024 * 1024;
    case 'k': return num * 1024;
    default: return num;
  }
}

export class DockerSandbox implements Sandbox {
  private docker: Dockerode;
  private minionHome: string;

  constructor(minionHome?: string) {
    this.docker = new Dockerode();
    this.minionHome = minionHome || join(homedir(), '.minion');
  }

  buildContainerOptions(config: SandboxConfig): Record<string, any> {
    const env: string[] = [];
    if (process.env.HTTP_PROXY) env.push(`HTTP_PROXY=${process.env.HTTP_PROXY}`);
    if (process.env.HTTPS_PROXY) env.push(`HTTPS_PROXY=${process.env.HTTPS_PROXY}`);
    if (process.env.NO_PROXY) env.push(`NO_PROXY=${process.env.NO_PROXY}`);

    // Add pi-runtime environment
    env.push(`PI_RUNTIME=/opt/pi-runtime`);

    const bootstrapPath = join(this.minionHome, 'bootstrap.sh');
    const piRuntimePath = join(this.minionHome, 'pi-runtime');

    const binds: string[] = [
      `${config.repoPath}:/host-repo:ro`,
      `${config.runDir}:/minion-run`,
      `${bootstrapPath}:/minion-bootstrap.sh:ro`,
      `${piRuntimePath}:/opt/pi-runtime:ro`,  // Key: offline mount pi-runtime
    ];

    // Always mount dist/ directory for development
    // Priority: MINION_DIST_PATH env var -> {repoPath}/dist -> {repoPath}/../dist
    let distPath = process.env.MINION_DIST_PATH;

    if (!distPath) {
      // Try to find dist/ directory relative to repoPath
      const repoDist = join(config.repoPath, 'dist');
      const parentDist = join(config.repoPath, '..', 'dist');
      const cwdDist = join(process.cwd(), 'dist');

      if (existsSync(repoDist)) {
        distPath = repoDist;
      } else if (existsSync(parentDist)) {
        distPath = parentDist;
      } else if (existsSync(cwdDist)) {
        distPath = cwdDist;
      }
    }

    if (distPath && existsSync(distPath)) {
      binds.push(`${distPath}:/opt/minion/dist:ro`);
      env.push('MINION_DEV_MODE=1');
      env.push(`MINION_DIST_MOUNTED=${distPath}`);
    }

    const opts: Record<string, any> = {
      Image: config.image,
      Env: env,
      HostConfig: {
        Binds: binds,
        Memory: parseMemory(config.memory),
        NanoCpus: config.cpus * 1e9,
        NetworkMode: config.network,
      },
      Entrypoint: ['/minion-bootstrap.sh'],
      Cmd: [],
    };

    if (platform() === 'linux') {
      opts.User = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
    }

    return opts;
  }
  async pull(image: string): Promise<void> {
    // Check if image exists locally first
    try {
      await this.docker.getImage(image).inspect();
      // Image exists locally, skip pull
      return;
    } catch {
      // Image doesn't exist locally, try to pull
    }

    const stream = await this.docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async start(config: SandboxConfig): Promise<SandboxHandle> {
    const opts = this.buildContainerOptions(config);
    const container = await this.docker.createContainer(opts);
    await container.start();

    return {
      containerId: container.id,
      async *logs() {
        const stream = await container.logs({
          follow: true, stdout: true, stderr: true,
        });
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          const text = chunk.toString('utf-8');
          yield text;
        }
      },
      async wait() {
        const result = await container.wait();
        return { exitCode: result.StatusCode };
      },
      async stop() {
        try { await container.stop({ t: 10 }); } catch {}
        try { await container.remove(); } catch {}
      },
    };
  }
}

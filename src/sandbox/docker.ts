import Dockerode from 'dockerode';
import { platform } from 'os';
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

  constructor() {
    this.docker = new Dockerode();
  }

  buildContainerOptions(config: SandboxConfig): Record<string, any> {
    const env: string[] = [];
    if (process.env.HTTP_PROXY) env.push(`HTTP_PROXY=${process.env.HTTP_PROXY}`);
    if (process.env.HTTPS_PROXY) env.push(`HTTPS_PROXY=${process.env.HTTPS_PROXY}`);
    if (process.env.NO_PROXY) env.push(`NO_PROXY=${process.env.NO_PROXY}`);

    const opts: Record<string, any> = {
      Image: config.image,
      Env: env,
      HostConfig: {
        Binds: [
          `${config.repoPath}:/host-repo:ro`,
          `${config.runDir}:/minion-run`,
        ],
        Memory: parseMemory(config.memory),
        NanoCpus: config.cpus * 1e9,
        NetworkMode: config.network,
      },
    };

    if (platform() === 'linux') {
      opts.User = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
    }

    return opts;
  }
  async pull(image: string): Promise<void> {
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

export interface ContainerPreset {
  key: string;          // config key, e.g. "git.userName"
  label: string;        // human-readable label
  description: string;  // what this preset controls
  default: string;      // default value
  envVar: string;       // env variable name written to .env
}

export const CONTAINER_PRESETS: ContainerPreset[] = [
  {
    key: 'git.userName',
    label: 'Git 用户名',
    description: '容器内 git commit 使用的作者名',
    default: 'Minion Agent',
    envVar: 'GIT_AUTHOR_NAME',
  },
  {
    key: 'git.userEmail',
    label: 'Git 邮箱',
    description: '容器内 git commit 使用的邮箱',
    default: 'minion@localhost',
    envVar: 'GIT_AUTHOR_EMAIL',
  },
  {
    key: 'timezone',
    label: '时区',
    description: '容器时区',
    default: 'UTC',
    envVar: 'TZ',
  },
  {
    key: 'locale',
    label: '语言环境',
    description: '容器 locale 设置',
    default: 'en_US.UTF-8',
    envVar: 'LANG',
  },
];

/** Merge defaults with user overrides, return envVar→value map */
export function resolvePresets(
  userOverrides: Record<string, string> = {},
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const preset of CONTAINER_PRESETS) {
    result[preset.envVar] = userOverrides[preset.key] ?? preset.default;
  }
  return result;
}

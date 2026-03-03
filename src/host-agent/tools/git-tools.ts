import { execFileSync } from 'child_process'

interface CreateBranchArgs {
  branchName: string
  baseBranch?: string
}

interface CreateBranchResult {
  success: boolean
  branch: string
}

interface PushChangesArgs {
  branch: string
  force?: boolean
}

interface PushChangesResult {
  success: boolean
}

export function createCreateBranchTool() {
  return {
    name: 'create_branch',
    description: 'Create a new git branch for the task',
    parameters: {
      type: 'object',
      properties: {
        branchName: {
          type: 'string',
          description: 'Branch name (e.g., "fix/login-bug")'
        },
        baseBranch: {
          type: 'string',
          description: 'Base branch (default: "main")'
        }
      },
      required: ['branchName']
    },
    execute: async (args: CreateBranchArgs): Promise<CreateBranchResult> => {
      const baseBranch = args.baseBranch || 'main'

      // Validate branch name
      if (!/^[a-zA-Z0-9/_-]+$/.test(args.branchName)) {
        throw new Error(`Invalid branch name: ${args.branchName}`)
      }

      try {
        execFileSync('git', ['checkout', baseBranch], {
          stdio: 'pipe',
          cwd: process.cwd(),
          timeout: 30_000,
          maxBuffer: 1024 * 1024
        })
        execFileSync('git', ['checkout', '-b', args.branchName], {
          stdio: 'pipe',
          cwd: process.cwd(),
          timeout: 30_000,
          maxBuffer: 1024 * 1024
        })
        return { success: true, branch: args.branchName }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to create branch: ${message}`)
      }
    }
  }
}

export function createPushChangesTool() {
  return {
    name: 'push_changes',
    description: 'Push changes to remote repository',
    parameters: {
      type: 'object',
      properties: {
        branch: {
          type: 'string',
          description: 'Branch name to push'
        },
        force: {
          type: 'boolean',
          description: 'Force push (default: false)'
        }
      },
      required: ['branch']
    },
    execute: async (args: PushChangesArgs): Promise<PushChangesResult> => {
      try {
        const gitArgs = ['push', 'origin', args.branch]
        if (args.force) {
          gitArgs.push('--force')
        }

        execFileSync('git', gitArgs, {
          stdio: 'pipe',
          cwd: process.cwd(),
          timeout: 60_000,
          maxBuffer: 1024 * 1024
        })
        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to push: ${message}`)
      }
    }
  }
}

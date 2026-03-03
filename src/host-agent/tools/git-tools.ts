import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core'
import { Type, type Static } from '@sinclair/typebox'
import { execFileSync } from 'child_process'

interface CreateBranchResult {
  success: boolean
  branch: string
}

interface PushChangesResult {
  success: boolean
}

const CreateBranchSchema = Type.Object({
  branchName: Type.String({ description: 'Branch name (e.g., "fix/login-bug")' }),
  baseBranch: Type.Optional(Type.String({ description: 'Base branch (default: "main")' }))
})

const PushChangesSchema = Type.Object({
  branch: Type.String({ description: 'Branch name to push' }),
  force: Type.Optional(Type.Boolean({ description: 'Force push (default: false)' }))
})

export const createBranchTool: AgentTool<typeof CreateBranchSchema> = {
  name: 'create_branch',
  label: 'create_branch',
  description: 'Create a new git branch for the task',
  parameters: CreateBranchSchema,
  execute: async (_id: string, args: Static<typeof CreateBranchSchema>): Promise<AgentToolResult<CreateBranchResult>> => {
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
      const result = { success: true, branch: args.branchName }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to create branch: ${message}`)
    }
  }
}

export const pushChangesTool: AgentTool<typeof PushChangesSchema> = {
  name: 'push_changes',
  label: 'push_changes',
  description: 'Push changes to remote repository',
  parameters: PushChangesSchema,
  execute: async (_id: string, args: Static<typeof PushChangesSchema>): Promise<AgentToolResult<PushChangesResult>> => {
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
      const result = { success: true }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to push: ${message}`)
    }
  }
}

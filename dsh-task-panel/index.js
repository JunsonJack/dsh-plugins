import {registerDeliverableNudge} from './server/deliverable-nudge.js'
import {registerFileClipboard} from './server/file-clipboard.js'
import {registerFileOperations} from './server/file-operations.js'
import {registerGitStatus} from './server/git-status.js'

export const name = 'dsh-task-panel'

export function apply(root, config) {
  registerDeliverableNudge(root, config)
  registerFileClipboard(root)
  registerFileOperations(root)
  registerGitStatus(root)
}

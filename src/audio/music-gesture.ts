export type MusicClickAction =
  | 'defer-toggle'
  | 'cycle-track'
  | 'restore-and-cycle-track'
  | 'toggle-now'

export function resolveMusicClick(
  clickDetail: number,
  hasPendingPointerClick: boolean,
  hasCommittedPointerToggle = false,
): MusicClickAction {
  if (clickDetail === 0) return 'toggle-now'
  if (clickDetail >= 2 && hasCommittedPointerToggle) {
    return 'restore-and-cycle-track'
  }
  if (hasPendingPointerClick || clickDetail >= 2) return 'cycle-track'
  return 'defer-toggle'
}

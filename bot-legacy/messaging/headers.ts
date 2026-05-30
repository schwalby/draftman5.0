import { spacedCaps } from './ansi'

export type HeaderKey =
  | 'draftman'
  | 'queuePopped'
  | 'captainVote'
  | 'captainsSelected'
  | 'mapSelection'
  | 'serverLocation'
  | 'snakeDraft'
  | 'matchSummary'
  | 'winner'

const TITLES: Record<HeaderKey, string> = {
  draftman:         '⚡ ' + spacedCaps('Draft Man 5.0'),
  queuePopped:      '🎮 ' + spacedCaps('Queue Popped'),
  captainVote:      '⚔️  ' + spacedCaps('Vote for Captains'),
  captainsSelected: '✅ ' + spacedCaps('Captains Selected'),
  mapSelection:     '🗺️  ' + spacedCaps('Map Selection'),
  serverLocation:   '🖥️  ' + spacedCaps('Server Location'),
  snakeDraft:       '🎯 ' + spacedCaps('Snake Draft'),
  matchSummary:     '📋 ' + spacedCaps('Match Summary'),
  winner:           '🏆 ' + spacedCaps('Winner'),
}

export function getTitle(key: HeaderKey): string {
  return TITLES[key]
}

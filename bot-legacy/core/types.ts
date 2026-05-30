import { WebhookClient } from 'discord.js'

// ── Player ────────────────────────────────────────────────────────────────────
export interface QueuePlayer {
  discordId: string
  discordUsername: string
  joinedAt: number
  fake?: boolean
}

// ── Match state ───────────────────────────────────────────────────────────────
export type TimerKey =
  | 'activity' | 'vote' | 'subWindow'
  | 'captainInterval' | 'mapInterval' | 'serverInterval'
  | 'resultDelay'

export type MatchStatus =
  | 'gathering'
  | 'captain_vote'
  | 'map_vote'
  | 'server_vote'
  | 'draft'
  | 'in_progress'
  | 'result_pending'
  | 'complete'

export interface ActiveMatch {
  matchNumber: number
  status: MatchStatus
  textChannelId: string
  gatherVoiceId: string
  teamAVoiceId?: string
  teamBVoiceId?: string
  players: QueuePlayer[]
  waitlist: QueuePlayer[]
  confirmedInVoice: Set<string>
  activityCheckDone: boolean
  captainA?: QueuePlayer
  captainB?: QueuePlayer
  teamA: QueuePlayer[]
  teamB: QueuePlayer[]
  voteOrder: string[]
  currentStep: number
  captainCandidates: QueuePlayer[]
  captainVotes: Record<string, string>
  mapOptions: string[]
  mapVotes: Record<string, string>
  serverVotes: Record<string, string>
  winnerVotes: Record<string, string>
  selectedMap?: string
  selectedServer?: string
  draftPickIndex: number
  draftOrder: number[]
  remainingPlayers: QueuePlayer[]
  captainVoteEndTime: number
  mapVoteEndTime: number
  serverVoteEndTime: number
  captainVoteMsgId?: string
  captainVoteListMsgId?: string
  mapVoteMsgId?: string
  mapVoteListMsgId?: string
  serverVoteMsgId?: string
  serverVoteListMsgId?: string
  draftMsgId?: string
  winnerVoteMsgId?: string
  dbMatchId?: string
  matchWebhook?: WebhookClient
  timers: Map<TimerKey, ReturnType<typeof setTimeout>>
}

// ── Config ────────────────────────────────────────────────────────────────────
export interface BotConfig {
  queue_size: number
  timeout_minutes: number
  activity_window_minutes: number
  sub_window_minutes: number
  captain_cooldown_games: number
  map_count: number
  vote_threshold: number
  captain_vote_seconds: number
  map_vote_seconds: number
  server_vote_seconds: number
  result_delay_minutes: number
  vote_order: string[]
  server_locations: string[]
  header_style: 'shadow' | 'small' | 'box' | 'hybrid'
}

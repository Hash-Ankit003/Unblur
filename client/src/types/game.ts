export interface Player {
  id: string;
  username: string;
  score: number;
  roundScore: number;
  isHost: boolean;
  isReady: boolean;
  hasGuessed: boolean;
  guessTime?: number;
  disconnected: boolean;
  socketId: string;
  coins: number;
  streak: number;
  multiplierActive: boolean;
  doublePointsActive: boolean;
}

export interface GameConfig {
  rounds: number;
  roundDuration: number;
  categories: string[];
  maxPlayers: number;
  isPrivate: boolean;
}

export type GameState = 'LOBBY' | 'STARTING' | 'ROUND_ACTIVE' | 'ROUND_END' | 'GAME_END';

export interface RoomState {
  roomId: string;
  players: Player[];
  config: GameConfig;
  state: GameState;
  currentRound: number;
  timer: number;
  correctAnswersCount: number;
}

export interface WinnerStats {
  podium: Player[];
  fastestGuess?: { username: string; time: number };
  mostFirsts?: { username: string; count: number };
  averageSpeed?: { username: string; time: number }[];
}

export interface ChatMessage {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  type: 'chat' | 'system' | 'correct';
}

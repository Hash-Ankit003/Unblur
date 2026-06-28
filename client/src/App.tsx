import { useState, useEffect } from 'react';
import { socket } from './socket';
import { audio } from './audio';
import { Player, GameConfig, GameState, WinnerStats } from './types/game';
import Home from './components/Home';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import WinnerScreen from './components/WinnerScreen';
import { LogOut, Layers, User } from 'lucide-react';

export default function App() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [username, setUsername] = useState('');
  
  // Game states
  const [players, setPlayers] = useState<Player[]>([]);
  const [config, setConfig] = useState<GameConfig>({
    rounds: 3,
    roundDuration: 60,
    categories: ['Animals', 'Landmarks', 'Logos', 'Countries', 'Scientists', 'Fruits & Veggies', 'Gaming & Pop Culture', 'Cricketers', 'Country Flags', 'Anime', 'Footballers', 'Bollywood', 'Cars', 'Monuments'],
    maxPlayers: 10,
    isPrivate: false
  });
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [currentRound, setCurrentRound] = useState(1);
  const [timer, setTimer] = useState(60);
  const [winnerStats, setWinnerStats] = useState<WinnerStats | null>(null);

  // Parse URL search parameters on mount for ?room=ABCDE invitation links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setRoomId(roomParam.toUpperCase());
    }
  }, []);

  // Listen for socket events
  useEffect(() => {
    const handleStateUpdate = (state: any) => {
      setPlayers(state.players);
      setConfig(state.config);
      setGameState(state.state);
      setCurrentRound(state.currentRound);
      setTimer(state.timer);
    };

    const handleTimerUpdate = (timeLeft: number) => {
      setTimer(timeLeft);
    };

    const handleGameOver = (stats: WinnerStats) => {
      setWinnerStats(stats);
      setGameState('GAME_END');
    };

    const handleKicked = () => {
      alert('You have been kicked from the room by the host.');
      handleLeaveRoom();
    };

    socket.on('room_state_update', handleStateUpdate);
    socket.on('timer_update', handleTimerUpdate);
    socket.on('game_over', handleGameOver);
    socket.on('kicked', handleKicked);

    return () => {
      socket.off('room_state_update', handleStateUpdate);
      socket.off('timer_update', handleTimerUpdate);
      socket.off('game_over', handleGameOver);
      socket.off('kicked', handleKicked);
    };
  }, []);

  const handleJoined = (roomCode: string, name: string, pid: string) => {
    setJoined(true);
    setRoomId(roomCode);
    setPlayerId(pid);
    setUsername(name);
    
    // Clear URL query parameters for clean navigation
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleLeaveRoom = () => {
    audio.playClick();
    socket.emit('leave_room');
    socket.disconnect();
    
    // Reset local state
    setJoined(false);
    setRoomId('');
    setPlayerId('');
    setPlayers([]);
    setGameState('LOBBY');
    setWinnerStats(null);
  };

  // Page Routing based on GameState
  const renderContent = () => {
    if (!joined) {
      return <Home onJoined={handleJoined} />;
    }

    switch (gameState) {
      case 'LOBBY':
      case 'STARTING':
        return (
          <Lobby
            roomId={roomId}
            players={players}
            config={config}
            currentPlayerId={playerId}
            gameState={gameState}
          />
        );
      case 'ROUND_ACTIVE':
      case 'ROUND_END':
        return (
          <GameRoom
            roomId={roomId}
            players={players}
            currentPlayerId={playerId}
            currentRound={currentRound}
            totalRounds={config.rounds}
            state={gameState}
            timer={timer}
          />
        );
      case 'GAME_END':
        if (winnerStats) {
          return (
            <WinnerScreen
              stats={winnerStats}
              players={players}
              currentPlayerId={playerId}
            />
          );
        }
        return null;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between">
      {/* Premium Header */}
      <header className="glass-panel sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => !joined && window.location.reload()}>
          <div className="p-1.5 bg-gradient-to-tr from-primary to-secondary rounded-lg">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
            UNBLUR.IO
          </span>
        </div>

        {joined && (
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-slate-950/40 py-1.5 px-3 rounded-xl border border-slate-850">
              <User className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold text-slate-350">{username}</span>
            </div>

            <button
              onClick={handleLeaveRoom}
              className="flex items-center gap-1.5 bg-accent/10 hover:bg-accent hover:text-white border border-accent/20 text-accent text-xs font-bold py-2 px-4 rounded-xl transition duration-200"
            >
              <LogOut className="w-3.5 h-3.5" />
              Leave Room
            </button>
          </div>
        )}
      </header>

      {/* Main Page Area */}
      <main className="flex-1 py-6 flex items-center justify-center">
        {renderContent()}
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-slate-900 text-center text-[10px] font-bold text-slate-600 uppercase tracking-widest bg-slate-950/20">
        © 2026 Unblur.io • Real-Time Multiplayer Image Reveal Game
      </footer>
    </div>
  );
}

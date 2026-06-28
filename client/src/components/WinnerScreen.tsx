import { useEffect } from 'react';
import { socket } from '../socket';
import { audio } from '../audio';
import { Player, WinnerStats } from '../types/game';
import { Trophy, RefreshCw, Star, Zap, Gauge } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';

interface WinnerScreenProps {
  stats: WinnerStats;
  players: Player[];
  currentPlayerId: string;
}

export default function WinnerScreen({ stats, players, currentPlayerId }: WinnerScreenProps) {
  const me = players.find(p => p.id === currentPlayerId);
  const isHost = me?.isHost || false;

  // Trigger confetti and play winner fanfare on mount
  useEffect(() => {
    audio.playWinnerFanfare();

    // Fire confetti bursts
    const duration = 4 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#6366f1', '#a855f7', '#f43f5e', '#10b981']
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#6366f1', '#a855f7', '#f43f5e', '#10b981']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, []);

  const handlePlayAgain = () => {
    audio.playClick();
    if (isHost) {
      socket.emit('reset_to_lobby');
    }
  };

  const getPodiumBadge = (index: number) => {
    switch (index) {
      case 0: return '🥇 1st';
      case 1: return '🥈 2nd';
      case 2: return '🥉 3rd';
      default: return '';
    }
  };

  const podium = stats.podium || [];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto px-4 py-8 space-y-8 relative"
    >
      <div className="text-center space-y-2">
        <motion.span 
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="text-xs font-black uppercase tracking-widest text-primary text-glow-primary"
        >
          Match Finished
        </motion.span>
        <motion.h1 
          initial={{ y: -10 }}
          animate={{ y: 0 }}
          className="text-4xl md:text-5xl font-black tracking-tight text-white flex items-center justify-center gap-3"
        >
          <Trophy className="w-10 h-10 text-yellow-400 animate-bounce" /> Champions Podium
        </motion.h1>
      </div>

      {/* 3D Glassmorphic Podium */}
      <div className="glass-panel p-8 rounded-3xl relative overflow-hidden flex flex-col md:flex-row items-end justify-center gap-6 pt-16 min-h-[350px] border border-white/5 bg-slate-900/40 shadow-2xl">
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08),transparent_70%)] pointer-events-none"></div>

        {/* 2nd Place */}
        {podium[1] && (
          <div className="w-full md:w-48 flex flex-col items-center order-2 md:order-1 mt-6 md:mt-0 z-10">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4 }}
              className="w-12 h-12 rounded-full border-2 border-slate-400 bg-slate-950/40 flex items-center justify-center font-black text-slate-350 mb-3 shadow-lg"
            >
              2
            </motion.div>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="font-extrabold text-md text-slate-200 mb-2 truncate max-w-full px-2"
            >
              {podium[1].username}
            </motion.div>
            {/* Podium Block */}
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: 96 }}
              transition={{ type: "spring", stiffness: 80, damping: 15, delay: 0.2 }}
              className="w-full bg-gradient-to-b from-slate-900 to-slate-950 border-t-4 border-slate-450 rounded-t-2xl shadow-xl p-4 flex flex-col items-center justify-center overflow-hidden"
            >
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{getPodiumBadge(1)}</span>
              <span className="font-black text-lg text-slate-200 mt-1">{podium[1].score} pts</span>
            </motion.div>
          </div>
        )}

        {/* 1st Place */}
        {podium[0] && (
          <div className="w-full md:w-56 flex flex-col items-center order-1 md:order-2 z-10">
            <motion.div 
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 12, delay: 0.6 }}
              className="w-16 h-16 rounded-full border-2 border-yellow-400 bg-yellow-400/10 flex items-center justify-center font-black text-yellow-400 mb-3 shadow-2xl relative glow-primary"
            >
              <Star className="w-8 h-8 text-yellow-400 absolute opacity-20 animate-spin-slow" />
              👑
            </motion.div>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="font-black text-lg text-yellow-400 mb-2 truncate max-w-full px-2 text-glow-primary"
            >
              {podium[0].username}
            </motion.div>
            {/* Podium Block */}
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: 144 }}
              transition={{ type: "spring", stiffness: 80, damping: 15 }}
              className="w-full bg-gradient-to-b from-slate-900 to-slate-950 border-t-4 border-yellow-500 rounded-t-2xl shadow-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-yellow-500/5 to-transparent pointer-events-none"></div>
              <span className="text-xs font-black text-yellow-400 uppercase tracking-widest">{getPodiumBadge(0)}</span>
              <span className="font-black text-2xl text-yellow-300 mt-1 text-glow-primary">{podium[0].score} pts</span>
            </motion.div>
          </div>
        )}

        {/* 3rd Place */}
        {podium[2] && (
          <div className="w-full md:w-48 flex flex-col items-center order-3 mt-6 md:mt-0 z-10">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 }}
              className="w-10 h-10 rounded-full border-2 border-amber-650 bg-slate-950/40 flex items-center justify-center font-black text-amber-500 mb-3 shadow-lg"
            >
              3
            </motion.div>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="font-extrabold text-md text-slate-200 mb-2 truncate max-w-full px-2"
            >
              {podium[2].username}
            </motion.div>
            {/* Podium Block */}
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: 72 }}
              transition={{ type: "spring", stiffness: 80, damping: 15, delay: 0.3 }}
              className="w-full bg-gradient-to-b from-slate-900 to-slate-950 border-t-4 border-amber-700 rounded-t-2xl shadow-xl p-4 flex flex-col items-center justify-center overflow-hidden"
            >
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider">{getPodiumBadge(2)}</span>
              <span className="font-black text-md text-slate-200 mt-1">{podium[2].score} pts</span>
            </motion.div>
          </div>
        )}
      </div>

      {/* Stats Dashboard & Controls */}
      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Statistics panel */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-panel p-6 rounded-3xl space-y-4 border border-white/5 bg-slate-900/40 shadow-2xl"
        >
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Session Records
          </h2>
          
          <div className="space-y-3">
            {/* Fastest guesser */}
            {stats.fastestGuess ? (
              <div className="flex justify-between items-center bg-slate-950/40 p-3 rounded-2xl border border-slate-850">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-accent" />
                  <span className="text-xs font-bold text-slate-450">Fastest Guess Speed</span>
                </div>
                <span className="text-xs font-black text-slate-200">
                  {stats.fastestGuess.username} ({stats.fastestGuess.time.toFixed(1)}s)
                </span>
              </div>
            ) : (
              <div className="text-center text-xs text-slate-500 py-3">
                No correct guesses were submitted this match.
              </div>
            )}
            
            {/* Speed estimates */}
            {stats.averageSpeed && stats.averageSpeed.map(playerSpeed => (
              <div key={playerSpeed.username} className="flex justify-between items-center bg-slate-950/20 p-2.5 rounded-xl text-xs">
                <span className="text-slate-450 font-bold">{playerSpeed.username} avg speed</span>
                <span className="text-slate-200 font-extrabold">{playerSpeed.time.toFixed(1)}s</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Play Again controls */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-panel p-6 rounded-3xl flex flex-col justify-center items-center text-center space-y-4 border border-white/5 bg-slate-900/40 shadow-2xl"
        >
          <h3 className="text-md font-black text-slate-200 uppercase tracking-wide">
            Want to play another match?
          </h3>
          <p className="text-slate-400 text-xs max-w-xs leading-relaxed font-medium">
            {isHost 
              ? 'Restart this room with the same group of players and settings.'
              : 'Waiting for the room host to initiate a new game session.'}
          </p>

          {isHost ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handlePlayAgain}
              className="w-full max-w-xs bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-black py-3.5 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 glow-primary shadow-lg uppercase tracking-wider text-xs"
            >
              <RefreshCw className="w-4 h-4" /> Play Again
            </motion.button>
          ) : (
            <div className="w-full max-w-xs bg-slate-950/60 border border-slate-850 px-5 py-3.5 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">
              Waiting for Host...
            </div>
          )}
        </motion.div>

      </div>
    </motion.div>
  );
}

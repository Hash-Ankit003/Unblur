import { useState } from 'react';
import { socket } from '../socket';
import { audio } from '../audio';
import { Player, GameConfig, GameState } from '../types/game';
import { Crown, Play, Settings, Share2, User, X, CheckCircle, AlertCircle, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LobbyProps {
  roomId: string;
  players: Player[];
  config: GameConfig;
  currentPlayerId: string;
  gameState: GameState;
}

export default function Lobby({ roomId, players, config, currentPlayerId, gameState }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const me = players.find(p => p.id === currentPlayerId);
  const isHost = me?.isHost || false;

  const handleCopyCode = () => {
    audio.playClick();
    const joinUrl = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const updateSetting = (key: keyof GameConfig, value: any) => {
    if (!isHost) return;
    socket.emit('update_config', { [key]: value });
  };

  const handleCategoryToggle = (category: string) => {
    if (!isHost) return;
    const current = config.categories;
    let updated;
    if (current.includes(category)) {
      if (current.length === 1) return;
      updated = current.filter(c => c !== category);
    } else {
      updated = [...current, category];
    }
    updateSetting('categories', updated);
  };

  const handleReadyToggle = () => {
    audio.playClick();
    if (me) {
      socket.emit('toggle_ready', !me.isReady);
    }
  };

  const handleStartGame = () => {
    audio.playClick();
    if (isHost) {
      socket.emit('start_game');
    }
  };

  const handleKick = (playerId: string) => {
    audio.playClick();
    if (isHost) {
      socket.emit('kick_player', playerId);
    }
  };

  const categories = [
    'Animals', 'Landmarks', 'Logos', 'Countries', 'Scientists', 'Fruits & Veggies', 
    'Gaming & Pop Culture', 'Cricketers', 'Country Flags', 'Anime', 'Footballers', 
    'Bollywood', 'Cars', 'Monuments'
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 100, damping: 18 }}
      className="max-w-5xl mx-auto px-4 py-6 grid md:grid-cols-3 gap-8 relative"
    >
      {/* Left Column: Room Settings (2/3 width on wide screens) */}
      <div className="md:col-span-2 space-y-6">
        
        {/* Room Header & Invite */}
        <div className="glass-panel p-6 rounded-3xl relative overflow-hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border border-white/5 bg-slate-900/40 shadow-2xl">
          <div>
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
              Lobby Room
            </span>
            <h1 className="text-3xl font-black tracking-tight text-white mt-0.5">
              Code: <span className="text-primary text-glow-primary tracking-wider">{roomId}</span>
            </h1>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCopyCode}
            className="flex items-center justify-center gap-2 bg-slate-950/50 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-slate-200 text-sm font-bold py-2.5 px-5 rounded-xl transition duration-200"
          >
            <Share2 className="w-4 h-4 text-primary" />
            {copied ? 'Copied Link!' : 'Invite Friends'}
          </motion.button>
        </div>

        {/* Configuration Panel */}
        <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/5 bg-slate-900/40 shadow-2xl">
          <h2 className="text-md font-black flex items-center gap-2 text-slate-200 uppercase tracking-wider">
            <Settings className="w-4.5 h-4.5 text-primary" /> Game Configuration
          </h2>

          <div className="grid sm:grid-cols-2 gap-6">
            
            {/* Rounds Setting */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Number of Rounds
                </span>
                <span className="text-xs font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg">
                  {config.rounds} Rounds
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={60}
                value={config.rounds}
                onChange={(e) => updateSetting('rounds', parseInt(e.target.value))}
                disabled={!isHost}
                className="w-full h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-black px-1">
                <span>1 Round</span>
                <span>60 Rounds</span>
              </div>
            </div>

            {/* Round Duration Setting */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Round Duration
                </span>
                <span className="text-xs font-black text-secondary bg-secondary/10 border border-secondary/20 px-2 py-0.5 rounded-lg">
                  {config.roundDuration}s
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={120}
                step={10}
                value={config.roundDuration}
                onChange={(e) => updateSetting('roundDuration', parseInt(e.target.value))}
                disabled={!isHost}
                className="w-full h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-black px-1">
                <span>30s</span>
                <span>120s</span>
              </div>
            </div>

            {/* Room Size Setting */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Max Players
                </span>
                <span className="text-xs font-black text-slate-200 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg">
                  {config.maxPlayers} Max
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={50}
                step={1}
                value={config.maxPlayers}
                onChange={(e) => updateSetting('maxPlayers', parseInt(e.target.value))}
                disabled={!isHost}
                className="w-full h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-black px-1">
                <span>2 Players</span>
                <span>50 Players</span>
              </div>
            </div>

          </div>

          <hr className="border-slate-850" />

          {/* Categories Selector */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
              Active Categories (Choose at least one)
            </label>
            <div className="grid sm:grid-cols-3 gap-3">
              {categories.map((category, idx) => {
                const active = config.categories.includes(category);
                return (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03, type: "spring", stiffness: 150 }}
                    key={category}
                    onClick={() => handleCategoryToggle(category)}
                    disabled={!isHost}
                    className={`py-3 px-4 rounded-xl text-xs font-bold border transition duration-200 flex items-center justify-between group ${
                      active
                        ? 'bg-primary/10 border-primary text-primary glow-primary'
                        : 'bg-slate-950/20 border-slate-850 text-slate-400 hover:border-slate-700 disabled:hover:border-slate-850'
                    }`}
                  >
                    <span className="truncate pr-1 group-hover:translate-x-0.5 transition-transform duration-200">{category}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-primary animate-pulse' : 'bg-slate-800'}`}></span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Lobby state alerts */}
          {!isHost && (
            <div className="bg-slate-950/40 p-4 rounded-2xl flex items-start gap-3 border border-slate-850">
              <AlertCircle className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
              <div className="text-xs text-slate-400 leading-relaxed font-medium">
                You are currently a <span className="text-slate-200 font-bold">Guest</span>. Only the host (<span className="text-primary font-bold">{players.find(p => p.isHost)?.username}</span>) can update settings and initiate the game.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Player List & Ready System */}
      <div className="space-y-6">
        
        {/* Player List */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col h-[320px] border border-white/5 bg-slate-900/40 shadow-2xl">
          <h2 className="text-md font-black mb-4 flex items-center gap-2 text-slate-200 uppercase tracking-wider">
            <Users className="w-4.5 h-4.5 text-primary" /> Players ({players.length}/{config.maxPlayers})
          </h2>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            <AnimatePresence>
              {players.map((player) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-850/60 bg-slate-950/30 group transition duration-200 hover:border-slate-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-lg bg-slate-850 flex items-center justify-center text-xs font-bold text-slate-350 border border-slate-800 shrink-0">
                      {player.isHost ? (
                        <Crown className="w-4 h-4 text-amber-400 animate-pulse" />
                      ) : (
                        <User className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <span className="font-bold text-sm truncate text-slate-200">
                      {player.username} {player.id === currentPlayerId && <span className="text-slate-500 font-normal">(You)</span>}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Ready Tag */}
                    {player.isReady ? (
                      <span className="text-[9px] font-black text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider">
                        <CheckCircle className="w-3 h-3" /> Ready
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-slate-500 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Waiting
                      </span>
                    )}

                    {/* Host Kick Option */}
                    {isHost && player.id !== currentPlayerId && (
                      <button
                        onClick={() => handleKick(player.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent/10 hover:text-accent rounded transition duration-200"
                        title="Kick Player"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Ready Action Buttons */}
        <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/5 bg-slate-900/40 shadow-2xl">
          {/* Guest Ready Button */}
          {!isHost && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleReadyToggle}
              className={`w-full font-black py-3.5 px-6 rounded-xl transition duration-200 border flex items-center justify-center gap-2 uppercase tracking-wider text-xs ${
                me?.isReady
                  ? 'bg-success/15 hover:bg-success/20 border-success/40 text-success glow-success'
                  : 'bg-primary hover:brightness-110 text-white border-primary/20 glow-primary'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              {me?.isReady ? "You are Ready" : "Mark as Ready"}
            </motion.button>
          )}

          {/* Host Start Button */}
          {isHost && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleStartGame}
              className="w-full bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-black py-3.5 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 glow-primary shadow-lg uppercase tracking-wider text-xs"
            >
              <Play className="w-4 h-4 fill-white" /> Start Game
            </motion.button>
          )}
        </div>

      </div>

      {/* Starting Intermission Overlay */}
      <AnimatePresence>
        {gameState === 'STARTING' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#0a0b10]/95 backdrop-blur-md flex flex-col items-center justify-center z-50 p-6 rounded-3xl"
          >
            <div className="relative flex flex-col items-center justify-center text-center">
              {/* Loading Spinner */}
              <div className="relative w-28 h-28 flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-secondary animate-spin"></div>
                <Play className="w-8 h-8 text-primary animate-pulse fill-primary" />
              </div>
              
              <h2 className="text-2xl font-black tracking-widest text-white uppercase mb-2">
                Ingesting Assets
              </h2>
              <p className="text-[10px] text-slate-450 font-bold max-w-xs leading-relaxed uppercase tracking-wider mb-6">
                Pre-caching optimized image stages for Round 1...
              </p>

              {/* Countdown */}
              <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary scale-110 animate-bounce">
                GET READY!
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

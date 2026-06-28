import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { audio } from '../audio';
import { Layers, Play, Plus, Zap, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface HomeProps {
  onJoined: (roomId: string, username: string, playerId: string) => void;
}

export default function Home({ onJoined }: HomeProps) {
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('unblur_username') || '';
  });
  const [roomCode, setRoomCode] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [publicRooms, setPublicRooms] = useState<{ roomId: string; playersCount: number; maxPlayers: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch public rooms list on mount
  useEffect(() => {
    socket.connect();
    
    const fetchRooms = () => {
      socket.emit('list_public_rooms', (rooms: any[]) => {
        setPublicRooms(rooms);
      });
    };

    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }
    setError('');
    setLoading(true);
    audio.playClick();

    localStorage.setItem('unblur_username', username.trim());

    socket.emit('create_room', { username: username.trim(), isPrivate }, (res: any) => {
      setLoading(false);
      if (res.success) {
        onJoined(res.roomId, username.trim(), res.playerId);
      } else {
        setError(res.error || 'Failed to create room.');
      }
    });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code.');
      return;
    }
    setError('');
    setLoading(true);
    audio.playClick();

    localStorage.setItem('unblur_username', username.trim());

    socket.emit('join_room', {
      roomId: roomCode.trim().toUpperCase(),
      username: username.trim()
    }, (res: any) => {
      setLoading(false);
      if (res.success) {
        onJoined(roomCode.trim().toUpperCase(), username.trim(), res.playerId);
      } else {
        setError(res.error || 'Failed to join room.');
      }
    });
  };

  const handleQuickJoin = (code: string) => {
    if (!username.trim()) {
      setError('Please enter a username first.');
      return;
    }
    setError('');
    setLoading(true);
    audio.playClick();

    localStorage.setItem('unblur_username', username.trim());

    socket.emit('join_room', {
      roomId: code,
      username: username.trim()
    }, (res: any) => {
      setLoading(false);
      if (res.success) {
        onJoined(code, username.trim(), res.playerId);
      } else {
        setError(res.error || 'Failed to join room.');
      }
    });
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center relative px-4 overflow-hidden">
      {/* Background Decorative Orbs */}
      <motion.div 
        animate={{ 
          scale: [1, 1.15, 1],
          x: [0, 15, 0],
          y: [0, -20, 0]
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 left-1/4 w-80 h-80 bg-primary/15 rounded-full blur-[110px] pointer-events-none"
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          x: [0, -25, 0],
          y: [0, 15, 0]
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[130px] pointer-events-none"
      />

      {/* Main Container */}
      <motion.div 
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        className="w-full max-w-4xl grid md:grid-cols-5 gap-8 items-stretch z-10"
      >
        
        {/* Left Side: Game Info & Join Panel */}
        <motion.div 
          whileHover={{ y: -3 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="md:col-span-3 glass-panel p-8 rounded-3xl flex flex-col justify-between relative overflow-hidden border border-white/5 bg-slate-900/40 shadow-2xl"
        >
          {/* Neon Border top-glow */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary via-secondary to-accent"></div>

          <div>
            <motion.div 
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="flex items-center gap-3 mb-8"
            >
              <div className="p-2.5 bg-gradient-to-tr from-primary to-secondary rounded-xl glow-primary shadow-lg shadow-primary/20">
                <Layers className="w-5.5 h-5.5 text-white" />
              </div>
              <span className="font-extrabold text-2xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
                UNBLUR.IO
              </span>
            </motion.div>

            <h1 className="text-4xl md:text-5xl font-black leading-[1.15] mb-5 text-white tracking-tight">
              Guess it before it <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent text-glow-primary">
                becomes clear!
              </span>
            </h1>

            <p className="text-slate-400 text-sm md:text-[15px] mb-8 max-w-md leading-relaxed font-medium">
              Every round, all players see the same heavily pixelated image. 
              As the timer ticks down, the image slowly unblurs. Guess fast to stack up scores and earn coins!
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                Choose Your Nickname
              </label>
              <input
                type="text"
                placeholder="Enter nickname..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={15}
                className="w-full bg-slate-950/40 border border-slate-800/80 hover:border-slate-700 focus:border-primary/80 focus:ring-1 focus:ring-primary/40 rounded-xl px-4 py-3 text-white placeholder-slate-600 font-bold transition duration-200 focus:outline-none"
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-accent/15 border border-accent/30 text-accent text-xs font-bold py-2.5 px-4 rounded-lg overflow-hidden"
                >
                  ⚠️ {error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Right Side: Action Forms */}
        <div className="md:col-span-2 flex flex-col gap-6">
          {/* Form 1: Create Room */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="glass-panel p-6 rounded-3xl flex-1 flex flex-col justify-center border border-white/5 bg-slate-900/40 shadow-2xl"
          >
            <h2 className="text-md font-extrabold mb-4 flex items-center gap-2 text-slate-200 uppercase tracking-wider">
              <Plus className="w-4 h-4 text-primary" /> Create Room
            </h2>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div className="flex items-center gap-3 bg-slate-950/30 p-3.5 rounded-xl border border-slate-850/50 hover:border-slate-800 transition duration-200">
                <input
                  type="checkbox"
                  id="private-check"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 accent-primary rounded cursor-pointer"
                />
                <label htmlFor="private-check" className="text-xs font-bold text-slate-400 cursor-pointer select-none">
                  Make this a private room
                </label>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-black py-3 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 glow-primary shadow-lg"
              >
                <Plus className="w-4 h-4" /> Create Room
              </motion.button>
            </form>
          </motion.div>

          {/* Form 2: Join Code */}
          <motion.div 
            whileHover={{ y: -3 }}
            className="glass-panel p-6 rounded-3xl flex-1 flex flex-col justify-center border border-white/5 bg-slate-900/40 shadow-2xl"
          >
            <h2 className="text-md font-extrabold mb-4 flex items-center gap-2 text-slate-200 uppercase tracking-wider">
              <Zap className="w-4 h-4 text-secondary" /> Join with Code
            </h2>
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <input
                type="text"
                placeholder="Enter 5-character Code..."
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={5}
                className="w-full bg-slate-950/40 border border-slate-800/80 hover:border-slate-700 focus:border-secondary/80 focus:ring-1 focus:ring-secondary/40 rounded-xl px-4 py-3 text-white text-center font-black tracking-[0.2em] placeholder-slate-600 transition duration-200 focus:outline-none"
              />

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={loading}
                className="w-full bg-slate-800 hover:bg-slate-750 text-white font-black py-3 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 border border-slate-750"
              >
                <Play className="w-4 h-4 text-secondary fill-secondary" /> Join Game
              </motion.button>
            </form>
          </motion.div>
        </div>

      </motion.div>

      {/* Public Lobbies Section */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-4xl mt-8 glass-panel p-6 rounded-3xl z-10 border border-white/5 bg-slate-900/20 shadow-xl"
      >
        <h2 className="text-sm font-black mb-4 flex items-center gap-2 text-slate-400 uppercase tracking-wider">
          <Users className="w-4.5 h-4.5 text-primary" /> Active Public Lobbies ({publicRooms.length})
        </h2>

        {publicRooms.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs font-bold border border-dashed border-slate-850 rounded-2xl bg-slate-950/10">
            No public rooms active right now. Create one and invite your friends!
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {publicRooms.map((room) => (
              <motion.div 
                whileHover={{ y: -2, borderColor: 'rgba(99,102,241,0.25)' }}
                key={room.roomId} 
                className="glass-panel p-4 rounded-2xl flex items-center justify-between border border-slate-850/80 bg-slate-900/30 transition duration-200"
              >
                <div>
                  <div className="font-extrabold text-sm tracking-widest text-primary">ROOM {room.roomId}</div>
                  <div className="text-slate-450 text-[11px] font-bold mt-1 uppercase">
                    Players: <span className="text-slate-200">{room.playersCount}/{room.maxPlayers}</span>
                  </div>
                </div>
                
                <button
                  onClick={() => handleQuickJoin(room.roomId)}
                  className="bg-primary/10 hover:bg-primary text-primary hover:text-white text-xs font-black py-1.5 px-3.5 rounded-lg border border-primary/25 hover:border-primary transition duration-200"
                >
                  Join
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

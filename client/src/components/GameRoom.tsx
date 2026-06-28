import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import { audio } from '../audio';
import { Player, ChatMessage } from '../types/game';
import { Send, Clock, HelpCircle, Check, RefreshCw, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GameRoomProps {
  roomId: string;
  players: Player[];
  currentPlayerId: string;
  currentRound: number;
  totalRounds: number;
  state: string;
  timer: number;
}

export default function GameRoom({
  roomId,
  players,
  currentPlayerId,
  currentRound,
  totalRounds,
  state,
  timer: initialTimer
}: GameRoomProps) {
  const [timer, setTimer] = useState(initialTimer);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [guessText, setGuessText] = useState('');
  const [privateGuesses, setPrivateGuesses] = useState<{ text: string; correct: boolean }[]>([]);
  const [category, setCategory] = useState('');
  const [wordLength, setWordLength] = useState(0);
  const [letterHint, setLetterHint] = useState('');
  const [clueHint, setClueHint] = useState('');
  
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [floatingEmotes, setFloatingEmotes] = useState<{ id: string; emote: string; x: number }[]>([]);
  const [isFrozenEffect, setIsFrozenEffect] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Scoreboard state shown between rounds
  const [showRoundScores, setShowRoundScores] = useState(false);
  const [roundAnswer, setRoundAnswer] = useState('');

  // 1. Shake & glow feedback state
  const [inputStatus, setInputStatus] = useState<'idle' | 'incorrect' | 'correct'>('idle');

  // 2. Double-buffered image cross-fade
  const [prevImg, setPrevImg] = useState<string | null>(null);
  const [currImg, setCurrImg] = useState<string | null>(null);
  const [fadeTrigger, setFadeTrigger] = useState(false);

  // 3. Intermission timer countdown
  const [intermissionTimer, setIntermissionTimer] = useState(10);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const guessInputRef = useRef<HTMLInputElement>(null);

  const me = players.find(p => p.id === currentPlayerId);
  const myGuessStatus = me?.hasGuessed || false;

  // Particle Burst Confetti System
  const triggerBurst = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.parentElement?.clientWidth || 400;
    canvas.height = canvas.parentElement?.clientHeight || 300;

    const particles: any[] = [];
    const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b', '#f97316'];

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12 - 3,
        radius: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: Math.random() * 0.02 + 0.01,
        gravity: 0.15
      });
    }

    const animateParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let active = false;

      particles.forEach(p => {
        if (p.alpha > 0) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.alpha -= p.decay;
          
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fill();
          active = true;
        }
      });

      if (active) {
        requestAnimationFrame(animateParticles);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    animateParticles();
  };

  // Sync Timer from parent updates
  useEffect(() => {
    setTimer(initialTimer);
    if (initialTimer <= 10 && initialTimer > 0 && state === 'ROUND_ACTIVE') {
      audio.playTick();
    }
  }, [initialTimer, state]);

  // Double-buffered image update handler
  useEffect(() => {
    if (imgSrc) {
      if (currImg && currImg !== imgSrc) {
        setPrevImg(currImg);
        setFadeTrigger(true);
      }
      setCurrentImgSrcClean(imgSrc);
    } else {
      setPrevImg(null);
      setCurrImg(null);
      setFadeTrigger(false);
    }
  }, [imgSrc]);

  // Helper function to avoid stale state closures
  const setCurrentImgSrcClean = (src: string) => {
    setCurrImg(src);
  };

  useEffect(() => {
    let raf: number;
    if (fadeTrigger) {
      raf = requestAnimationFrame(() => {
        setFadeTrigger(false);
      });
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fadeTrigger]);

  // Intermission Countdown Timer Effect
  useEffect(() => {
    let interval: any;
    if (showRoundScores) {
      setIntermissionTimer(10);
      interval = setInterval(() => {
        setIntermissionTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [showRoundScores]);

  // Set up socket listeners
  useEffect(() => {
    // Reset round state variables
    const handleRoundStart = (data: any) => {
      setImgSrc(null);
      setPrivateGuesses([]);
      setLetterHint('');
      setClueHint('');
      setCategory(data.category);
      setWordLength(data.wordLength);
      setInputStatus('idle');
      setIsFrozenEffect(false);
      
      const initialHint = data.answerTemplate || '_ '.repeat(data.wordLength).trim();
      setLetterHint(initialHint);

      setShowRoundScores(false);
      setRoundAnswer('');
      audio.playRoundStart();
      
      // Auto-focus guess box
      setTimeout(() => {
        guessInputRef.current?.focus();
      }, 500);
    };

    const handleImageUpdate = (data: { image: string; stage: number }) => {
      setImgSrc(data.image);
    };

    const handleHintUpdate = (data: { type: string; text: string }) => {
      if (data.type === 'letters') {
        setLetterHint(data.text);
      } else if (data.type === 'clue') {
        setClueHint(data.text);
      }
    };

    const handleChatMessage = (msg: ChatMessage) => {
      setChatMessages(prev => [...prev, msg]);
    };

    const handleGuessResult = (data: { correct: boolean; score: number; coins?: number; streak?: number }) => {
      if (data.correct) {
        audio.playCorrect();
        triggerBurst();
        if (data.streak && data.streak >= 2) {
          audio.playStreak();
        }
      }
    };

    const handlePrivateGuessResult = (data: { text: string; correct: boolean }) => {
      setPrivateGuesses(prev => [...prev, { text: data.text, correct: data.correct }]);
      if (data.correct) {
        setInputStatus('correct');
        triggerBurst();
      } else {
        setInputStatus('incorrect');
        // Reset so shake animation can run again on subsequent wrong answers
        setTimeout(() => {
          setInputStatus(prev => prev === 'incorrect' ? 'idle' : prev);
        }, 500);
      }
    };

    const handleRoundEnd = (data: { answer: string; players: Player[]; clearImage: string }) => {
      setRoundAnswer(data.answer);
      setImgSrc(data.clearImage);
      setShowRoundScores(true);
      audio.playRoundEnd();
    };

    const handleEmoteReceived = (data: { playerId: string; emote: string }) => {
      const id = Math.random().toString();
      const x = Math.floor(Math.random() * 60) + 20;
      setFloatingEmotes(prev => [...prev, { id, emote: data.emote, x }]);
      setTimeout(() => {
        setFloatingEmotes(prev => prev.filter(fe => fe.id !== id));
      }, 1800);
    };

    const handlePurchaseResponse = (res: { success: boolean; message: string; data?: any }) => {
      if (res.success) {
        audio.playPurchase();
        if (res.data?.mask) {
          setLetterHint(res.data.mask);
        }
      } else {
        const systemAlert: ChatMessage = {
          id: Math.random().toString(),
          username: 'Shop',
          text: `⚠️ Shop Error: ${res.message}`,
          timestamp: Date.now(),
          type: 'system'
        };
        setChatMessages(prev => [...prev, systemAlert]);
      }
    };

    const handleBlurFrozen = () => {
      setIsFrozenEffect(true);
      audio.playFreeze();
    };

    const handleBlurThawed = () => {
      setIsFrozenEffect(false);
    };

    socket.on('round_start', handleRoundStart);
    socket.on('image_update', handleImageUpdate);
    socket.on('hint_update', handleHintUpdate);
    socket.on('chat_message', handleChatMessage);
    socket.on('guess_result', handleGuessResult);
    socket.on('private_guess_result', handlePrivateGuessResult);
    socket.on('round_end', handleRoundEnd);
    socket.on('emote_received', handleEmoteReceived);
    socket.on('purchase_response', handlePurchaseResponse);
    socket.on('blur_frozen', handleBlurFrozen);
    socket.on('blur_thawed', handleBlurThawed);

    return () => {
      socket.off('round_start', handleRoundStart);
      socket.off('image_update', handleImageUpdate);
      socket.off('hint_update', handleHintUpdate);
      socket.off('chat_message', handleChatMessage);
      socket.off('guess_result', handleGuessResult);
      socket.off('private_guess_result', handlePrivateGuessResult);
      socket.off('round_end', handleRoundEnd);
      socket.off('emote_received', handleEmoteReceived);
      socket.off('purchase_response', handlePurchaseResponse);
      socket.off('blur_frozen', handleBlurFrozen);
      socket.off('blur_thawed', handleBlurThawed);
    };
  }, []);

  // Auto-scroll chat window
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('send_chat', chatInput.trim());
    setChatInput('');
  };

  const handleSendGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessText.trim() || myGuessStatus || state !== 'ROUND_ACTIVE') return;
    
    socket.emit('submit_guess', guessText.trim());
    setGuessText('');
  };

  // Sort players by score
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  // Find player with correct guess and highest round score (fastest guesser)
  const roundWinner = [...players]
    .filter(p => p.roundScore > 0)
    .sort((a, b) => b.roundScore - a.roundScore)[0];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-4 grid md:grid-cols-4 gap-6 items-stretch min-h-[82vh]">
      
      {/* 1. Left Sidebar: Player List & Leaderboard */}
      <div className="md:col-span-1 glass-panel p-4 rounded-3xl flex flex-col h-[580px] md:h-auto">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
          Leaderboard
        </h2>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <AnimatePresence>
            {sortedPlayers.map((player, idx) => (
              <motion.div
                layout
                key={player.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-200 ${
                  player.streak >= 2
                    ? 'streak-glow-fire border-orange-500/40'
                    : player.hasGuessed
                    ? 'bg-success/5 border-success/40'
                    : player.disconnected
                    ? 'bg-slate-950/20 border-slate-900 opacity-50'
                    : 'bg-slate-950/30 border-slate-850/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xs font-bold text-slate-500 w-4">
                    {idx + 1}
                  </span>
                  <span className="font-bold text-sm truncate text-slate-200 flex items-center gap-1.5">
                    {player.username}
                    {player.streak >= 2 && (
                      <span className="text-xs animate-bounce" title={`${player.streak} Round Streak!`}>
                        🔥 {player.streak}
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {player.roundScore > 0 && (
                    <span className="text-[10px] font-bold text-success animate-pulse mr-1">
                      +{player.roundScore}
                    </span>
                  )}
                  <div className="flex flex-col items-end">
                    <span className="font-extrabold text-sm text-slate-200">
                      {player.score}
                    </span>
                    <span className="text-[9px] font-extrabold text-amber-500 flex items-center gap-0.5">
                      🪙 {player.coins}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-850 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>Room Code: <b className="text-slate-400 tracking-wider">{roomId}</b></span>
          <span>Rounds: <b className="text-slate-400">{currentRound}/{totalRounds}</b></span>
        </div>
      </div>

      {/* 2. Center Stage: Image Viewer & Guess Inputs */}
      <div className="md:col-span-2 flex flex-col justify-between gap-4">
        
        {/* Top bar: Timer and Hint template */}
        <div className="glass-panel p-4 rounded-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Clock className={`w-4 h-4 ${timer <= 15 ? 'text-accent animate-pulse' : 'text-primary'}`} />
              <span className={`text-md font-extrabold tracking-tabular ${timer <= 15 ? 'text-accent' : 'text-slate-200'}`}>
                {timer}s
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-xl text-amber-400 font-extrabold text-xs">
                🪙 {me?.coins || 0}
              </span>
              {me && me.streak >= 2 && (
                <span className="bg-orange-500/15 border border-orange-550/30 px-2 py-1 rounded-xl text-orange-400 font-extrabold text-xs animate-pulse">
                  🔥 {me.streak} Streak
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center">
            {category && (
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                Category: {category}
              </span>
            )}
            <span className="text-md font-mono font-bold tracking-[0.3em] text-primary select-text mt-0.5">
              {letterHint || '_ '.repeat(wordLength).trim()}
            </span>
          </div>

          <div className="w-16 text-right">
            {clueHint && (
              <span 
                className="text-[10px] font-extrabold text-secondary cursor-help border-b border-dashed border-secondary"
                title={clueHint}
              >
                Hint Active
              </span>
            )}
          </div>
        </div>

        {/* Center Panel: The Game Screen */}
        <div className={`glass-panel rounded-3xl relative overflow-hidden flex-1 min-h-[300px] flex items-center justify-center bg-slate-950/40 p-4 transition-all duration-300 ${
          isFrozenEffect ? 'border-sky-500/50 shadow-[0_0_20px_rgba(14,165,233,0.25)]' : ''
        }`}>
          
          {/* Frozen Effect overlay */}
          {isFrozenEffect && (
            <div className="absolute inset-0 bg-sky-950/10 backdrop-blur-[0.5px] flex items-center justify-center pointer-events-none z-10">
              <span className="text-[10px] font-black uppercase text-sky-400 tracking-[0.2em] bg-slate-900/90 border border-sky-500/30 px-3.5 py-1.5 rounded-full shadow-lg animate-pulse">
                ❄️ Blur Frozen
              </span>
            </div>
          )}

          {/* Floating Emotes Layer */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {floatingEmotes.map(fe => (
              <div
                key={fe.id}
                className="float-emote"
                style={{ left: `${fe.x}%`, bottom: '20px' }}
              >
                {fe.emote}
              </div>
            ))}
          </div>

          {/* Confetti Particle Canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-20"
          />

          <AnimatePresence mode="wait">
            {currImg ? (
              <div className="relative w-full h-full flex items-center justify-center min-h-[300px]">
                {prevImg && (
                  <img
                    src={prevImg}
                    alt="Previous Stage"
                    className="absolute max-h-[380px] w-full rounded-2xl object-contain select-none opacity-45 blur-[1.5px]"
                    style={{ imageRendering: 'pixelated' }}
                    draggable={false}
                  />
                )}
                <img
                  src={currImg}
                  alt="Guess Target"
                  className={`max-h-[380px] w-full rounded-2xl object-contain shadow-2xl select-none transition-all duration-500 ease-out ${
                    fadeTrigger ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
                  }`}
                  style={{ imageRendering: 'pixelated' }}
                  draggable={false}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider">Preparing Image...</span>
              </div>
            )}
          </AnimatePresence>

          {/* Success Overlay if already guessed */}
          {myGuessStatus && state === 'ROUND_ACTIVE' && (
            <div className="absolute inset-0 bg-success/10 backdrop-blur-[2px] flex flex-col items-center justify-center z-10">
              <div className="bg-slate-900/90 border border-success/30 px-6 py-4 rounded-3xl flex flex-col items-center shadow-2xl">
                <div className="w-12 h-12 bg-success/20 rounded-full flex items-center justify-center mb-2">
                  <Check className="w-6 h-6 text-success" />
                </div>
                <span className="text-sm font-extrabold text-success uppercase tracking-wider">Correct Guess!</span>
                <span className="text-[10px] text-slate-400 mt-1">Waiting for other players...</span>
              </div>
            </div>
          )}

          {/* Round End Leaderboard overlay */}
          {showRoundScores && (
            <div className="absolute inset-0 bg-[#0a0b10]/95 backdrop-blur-md flex flex-col items-center justify-center z-20 p-6 overflow-y-auto">
              <span className="text-slate-500 text-[10px] uppercase font-black tracking-widest mb-1">
                Round Completed
              </span>
              <h3 className="text-xl font-black text-slate-355 mb-4 text-center leading-tight">
                The answer was: <span className="text-primary text-glow-primary uppercase select-text font-black text-2xl block mt-1">{roundAnswer}</span>
              </h3>
              
              <div className="flex flex-col md:flex-row items-center gap-6 w-full max-w-lg bg-slate-900/60 border border-white/5 p-6 rounded-3xl shadow-2xl glass-panel">
                {/* Left Side: Unblurred clear image */}
                {currImg && (
                  <div className="flex flex-col items-center shrink-0">
                    <img
                      src={currImg}
                      alt="Clear Answer"
                      className="w-36 h-36 object-contain rounded-2xl border border-slate-800 shadow-xl bg-slate-950/40 p-1"
                    />
                  </div>
                )}
                
                {/* Right Side: Round details */}
                <div className="flex-1 w-full space-y-3.5">
                  {/* Round Winner Badge */}
                  {roundWinner ? (
                    <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-2xl flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                        <Crown className="w-4 h-4 text-amber-400 animate-bounce" />
                      </div>
                      <div className="text-left min-w-0">
                        <span className="text-[9px] uppercase font-black text-amber-500 tracking-wider block">Round Champion</span>
                        <span className="text-xs font-black text-slate-200 truncate block">{roundWinner.username} (+{roundWinner.roundScore} pts)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-2xl text-[11px] text-slate-400 font-bold text-center">
                      Nobody guessed correctly this round!
                    </div>
                  )}

                  {/* Points earned */}
                  <div className="space-y-1.5 bg-slate-950/30 p-3 rounded-2xl border border-slate-900">
                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest pb-1 border-b border-slate-850">
                      Scores Gained
                    </div>
                    <div className="max-h-[90px] overflow-y-auto space-y-1 pr-1">
                      {players.map(p => (
                        <div key={p.id} className="flex justify-between items-center text-[11px]">
                          <span className="font-bold text-slate-400">{p.username}</span>
                          <span className={`font-black ${p.roundScore > 0 ? 'text-success' : 'text-slate-500'}`}>
                            {p.roundScore > 0 ? `+${p.roundScore}` : '0'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Countdown SVG Circle */}
              <div className="flex flex-col items-center gap-1.5 mt-5">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                    <circle
                      cx="24"
                      cy="24"
                      r="18"
                      stroke="rgba(255,255,255,0.03)"
                      strokeWidth="3"
                      fill="transparent"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="18"
                      stroke="#6366f1"
                      strokeWidth="3"
                      fill="transparent"
                      strokeDasharray={113.1}
                      strokeDashoffset={113.1 - (113.1 * intermissionTimer) / 10}
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                  <span className="text-xs font-black text-slate-200">{intermissionTimer}</span>
                </div>
                <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest">
                  Next round starting
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Powerups & Emotes Action Bar */}
        {state === 'ROUND_ACTIVE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Clue Shop */}
            <div className="glass-panel p-3 rounded-2xl flex items-center justify-between gap-2 border-slate-800">
              <span className="text-[9px] uppercase font-black tracking-wider text-slate-500 shrink-0">Shop:</span>
              <div className="flex gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => socket.emit('purchase_powerup', 'reveal_letter')}
                  disabled={myGuessStatus || (me?.coins || 0) < 50}
                  className="px-2.5 py-1.5 rounded-xl border text-[10px] font-black transition duration-200 flex items-center gap-1 bg-slate-900 border-slate-800 text-slate-350 hover:border-primary/45 disabled:opacity-40 disabled:hover:border-slate-800"
                  title="Reveal a random hidden letter"
                >
                  🔍 Letter <span className="text-amber-400">50🪙</span>
                </button>
                <button
                  type="button"
                  onClick={() => socket.emit('purchase_powerup', 'double_points')}
                  disabled={myGuessStatus || me?.doublePointsActive || (me?.coins || 0) < 75}
                  className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-black transition duration-200 flex items-center gap-1 disabled:opacity-40 ${
                    me?.doublePointsActive
                      ? 'bg-success/15 border-success/35 text-success'
                      : 'bg-slate-900 border-slate-800 text-slate-350 hover:border-primary/45'
                  }`}
                  title="Double your points for this round"
                >
                  🚀 2x Pts <span className="text-amber-400">75🪙</span>
                </button>
                <button
                  type="button"
                  onClick={() => socket.emit('purchase_powerup', 'blur_freeze')}
                  disabled={(me?.coins || 0) < 150}
                  className="px-2.5 py-1.5 rounded-xl border text-[10px] font-black transition duration-200 flex items-center gap-1 bg-slate-900 border-slate-800 text-slate-350 hover:border-primary/45 disabled:opacity-40 disabled:hover:border-slate-800"
                  title="Freeze the blur stage for 5 seconds for everyone"
                >
                  ❄️ Freeze <span className="text-amber-400">150🪙</span>
                </button>
              </div>
            </div>

            {/* Quick Emotes reactions */}
            <div className="glass-panel p-3 rounded-2xl flex items-center justify-between gap-2 border-slate-800">
              <span className="text-[9px] uppercase font-black tracking-wider text-slate-500 shrink-0">React:</span>
              <div className="flex gap-1.5">
                {['😂', '😮', '🔥', '💀', '🤔', '👍'].map(emote => (
                  <button
                    key={emote}
                    type="button"
                    onClick={() => socket.emit('send_emote', emote)}
                    className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-850 hover:bg-slate-800 hover:scale-110 active:scale-95 transition-all text-sm flex items-center justify-center"
                  >
                    {emote}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Clue Text Bar */}
        <AnimatePresence>
          {clueHint && (
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="bg-secondary/15 border border-secondary/30 p-3.5 rounded-2xl flex items-center gap-3 glow-secondary/10 shadow-lg"
            >
              <div className="w-7 h-7 rounded-xl bg-secondary/20 flex items-center justify-center text-secondary shrink-0 animate-pulse">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-[9px] uppercase font-black tracking-widest text-secondary block">Active Clue</span>
                <span className="text-xs text-slate-200 font-bold leading-relaxed">{clueHint}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Private Guess Input Section */}
        <div className="glass-panel p-4 rounded-3xl space-y-3">
          <form onSubmit={handleSendGuess} className="flex items-center gap-2">
            <input
              ref={guessInputRef}
              type="text"
              placeholder={myGuessStatus ? "You guessed correctly!" : "Type your guess here..."}
              value={guessText}
              onChange={(e) => setGuessText(e.target.value)}
              disabled={myGuessStatus || state !== 'ROUND_ACTIVE'}
              className={`flex-1 bg-slate-900 border focus:ring-1 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 ${
                inputStatus === 'incorrect'
                  ? 'input-shake-incorrect'
                  : inputStatus === 'correct'
                  ? 'input-pulse-success'
                  : 'border-slate-800 focus:border-primary/80 focus:ring-primary/40'
              }`}
            />
            <button
              type="submit"
              disabled={myGuessStatus || state !== 'ROUND_ACTIVE'}
              className="bg-primary hover:brightness-110 disabled:opacity-50 text-white p-2.5 rounded-xl transition duration-200"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          {/* Private Guess History Log */}
          {privateGuesses.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] font-medium text-slate-500">
              <span>Your Guesses:</span>
              {privateGuesses.map((guess, idx) => (
                <span 
                  key={idx} 
                  className="bg-slate-900 border border-slate-850 px-2 py-0.5 rounded text-slate-400 line-through"
                >
                  {guess.text}
                </span>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* 3. Right Sidebar: Public Lobby Chat */}
      <div className="md:col-span-1 glass-panel p-4 rounded-3xl flex flex-col h-[400px] md:h-auto">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
          Public Chat
        </h2>

        {/* Message Logs */}
        <div className="flex-1 overflow-y-auto space-y-2.5 mb-4 pr-1">
          {chatMessages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="text-[11px] font-semibold text-slate-500 leading-normal bg-slate-950/20 py-1 px-2.5 rounded-lg border border-slate-900/40">
                  {msg.text}
                </div>
              );
            }
            if (msg.type === 'correct') {
              return (
                <div key={msg.id} className="text-[11px] font-bold text-success bg-success/5 border border-success/15 py-1.5 px-2.5 rounded-lg leading-normal">
                  {msg.text}
                </div>
              );
            }
            return (
              <div key={msg.id} className="text-xs leading-normal">
                <span className="font-extrabold text-slate-400 mr-1.5">{msg.username}:</span>
                <span className="text-slate-200 select-text">{msg.text}</span>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input Form */}
        <form onSubmit={handleSendChat} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Say hello..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            maxLength={100}
            className="flex-1 bg-slate-900 border border-slate-850 focus:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-650 transition duration-200 focus:outline-none"
          />
          <button
            type="submit"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-xl border border-slate-750 transition duration-200"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

    </div>
  );
}

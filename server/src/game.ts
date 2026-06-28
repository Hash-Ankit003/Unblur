import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Player, GameConfig, GameState, RoomState, ImageRegistryItem, ChatMessage, WinnerStats } from './types';
import { generateBlurStages } from './imageProcessor';
import { fetchImageUrl } from './apiFetcher';
import path from 'path';

// Import our dataset
import datasetRaw from './data/dataset.json';
export const dataset = datasetRaw as ImageRegistryItem[];

export class Room {
  public roomId: string;
  public players: Player[] = [];
  public config: GameConfig;
  public state: GameState = 'LOBBY';
  public currentRound: number = 0;
  
  // Active round state
  public timer: number = 0;
  public currentImage?: ImageRegistryItem;
  public blurStages: string[] = []; // 10 base64 images
  public usedImages: Set<string> = new Set();
  
  // Pre-caching state
  private nextImageToUse?: ImageRegistryItem;
  private nextBlurStages: string[] = [];
  private isPreCaching: boolean = false;

  // Powerups and effects state
  private isBlurFrozen: boolean = false;
  private playerRevealedIndices: Map<string, Set<number>> = new Map();
  private sentStageHints: Set<number> = new Set();
  
  // Timers
  private timerInterval?: NodeJS.Timeout;
  private io: Server;
  public publicFolder: string;

  constructor(roomId: string, io: Server, publicFolder: string, isPrivate: boolean = false) {
    this.roomId = roomId;
    this.io = io;
    this.publicFolder = publicFolder;
    
    // Default config
    this.config = {
      rounds: 3,
      roundDuration: 60, // 60 seconds is a good default
      categories: ['Animals', 'Landmarks', 'Logos', 'Countries', 'Scientists', 'Fruits & Veggies', 'Gaming & Pop Culture', 'Cricketers', 'Country Flags', 'Anime', 'Footballers', 'Bollywood', 'Cars', 'Monuments'],
      maxPlayers: 10,
      isPrivate
    };

    // Kick off pre-caching for Round 1 immediately
    this.preCacheNextRound();
  }

  // Get active players (excluding disconnected ones)
  public get activePlayers(): Player[] {
    return this.players.filter(p => !p.disconnected);
  }

  // Serialized state to send to clients
  public getRoomState(): RoomState {
    return {
      roomId: this.roomId,
      players: this.players,
      config: this.config,
      state: this.state,
      currentRound: this.currentRound,
      timer: this.timer,
      correctAnswersCount: this.players.filter(p => p.hasGuessed).length
    };
  }

  // Add a player
  public addPlayer(socketId: string, username: string, userId?: string): Player {
    const id = userId || uuidv4();
    
    // Check if player is reconnecting
    const existingPlayer = this.players.find(p => p.id === id);
    if (existingPlayer) {
      existingPlayer.socketId = socketId;
      existingPlayer.disconnected = false;
      return existingPlayer;
    }

    const isHost = this.players.length === 0; // First player is host
    const player: Player = {
      id,
      username: username.trim().substring(0, 15) || 'Guest',
      score: 0,
      roundScore: 0,
      isHost,
      isReady: isHost, // Host is ready by default
      hasGuessed: false,
      disconnected: false,
      socketId,
      coins: 0,
      streak: 0,
      multiplierActive: false,
      doublePointsActive: false
    };

    this.players.push(player);
    return player;
  }

  // Remove or disconnect player
  public disconnectPlayer(socketId: string): Player | null {
    const player = this.players.find(p => p.socketId === socketId);
    if (!player) return null;

    if (this.state === 'LOBBY') {
      // Remove entirely if in lobby
      this.players = this.players.filter(p => p.socketId !== socketId);
      
      // Reassign host if needed
      if (player.isHost && this.players.length > 0) {
        this.players[0].isHost = true;
        this.players[0].isReady = true;
      }
    } else {
      // Mark as disconnected if game is active
      player.disconnected = true;
      
      // If host disconnected, assign a new host
      if (player.isHost) {
        const nextActive = this.players.find(p => !p.disconnected);
        if (nextActive) {
          nextActive.isHost = true;
        }
      }

      // Check if all players are disconnected
      if (this.activePlayers.length === 0) {
        this.destroy();
      } else {
        // Check if everyone remaining has guessed
        this.checkRoundEndConditions();
      }
    }
    return player;
  }

  // Update room settings
  public updateConfig(config: Partial<GameConfig>) {
    const categoriesChanged = config.categories && JSON.stringify(config.categories) !== JSON.stringify(this.config.categories);
    
    this.config = { ...this.config, ...config };
    
    // Invalidate and refresh pre-cache if categories change mid-lobby
    if (categoriesChanged && this.state === 'LOBBY') {
      this.nextImageToUse = undefined;
      this.nextBlurStages = [];
      this.usedImages.clear();
      this.preCacheNextRound();
    }
    
    this.broadcastState();
  }

  // Toggle ready status
  public toggleReady(playerId: string, isReady: boolean) {
    const player = this.players.find(p => p.id === playerId);
    if (player) {
      player.isReady = isReady;
      this.broadcastState();
    }
  }

  // Kick a player
  public kickPlayer(playerId: string): string | null {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return null;

    const socketId = player.socketId;
    this.players = this.players.filter(p => p.id !== playerId);

    if (player.isHost && this.players.length > 0) {
      this.players[0].isHost = true;
      this.players[0].isReady = true;
    }

    this.broadcastState();
    return socketId;
  }

  // Broadcast state to all players
  public broadcastState() {
    this.io.to(this.roomId).emit('room_state_update', this.getRoomState());
  }

  // Broadcast chat message
  public broadcastSystemMessage(text: string) {
    const message: ChatMessage = {
      id: uuidv4(),
      username: 'System',
      text,
      timestamp: Date.now(),
      type: 'system'
    };
    this.io.to(this.roomId).emit('chat_message', message);
  }

  // Start the game
  public async startGame() {
    if (this.state !== 'LOBBY') return;
    
    this.state = 'STARTING';
    this.currentRound = 0;
    this.usedImages.clear();
    
    // Reset all player scores
    this.players.forEach(p => {
      p.score = 0;
      p.roundScore = 0;
      p.hasGuessed = false;
      p.guessTime = undefined;
      p.coins = 0;
      p.streak = 0;
      p.multiplierActive = false;
      p.doublePointsActive = false;
    });

    // If pre-cache is not ready or has been cleared, start it now
    if (!this.nextImageToUse) {
      this.preCacheNextRound();
    }

    this.broadcastState();
    this.broadcastSystemMessage('Game is starting...');

    // Wait 500ms for a smooth transition overlay, then start Round 1 immediately
    setTimeout(() => {
      this.startNextRound();
    }, 500);
  }

  // Select a random image from dataset based on chosen categories
  private selectRandomImage(): ImageRegistryItem | null {
    const allowedCategories = this.config.categories;
    const candidates = dataset.filter(item => 
      allowedCategories.includes(item.category) && !this.usedImages.has(item.id)
    );

    if (candidates.length === 0) {
      // If we used all images, clear the list and allow repeats
      this.usedImages.clear();
      const fallbackCandidates = dataset.filter(item => allowedCategories.includes(item.category));
      if (fallbackCandidates.length === 0) return null;
      return fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
    }

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    this.usedImages.add(selected.id);
    return selected;
  }

  // Start next round
  private async startNextRound() {
    this.currentRound++;
    if (this.currentRound > this.config.rounds) {
      this.endGame();
      return;
    }

    this.state = 'ROUND_ACTIVE';
    this.timer = this.config.roundDuration;
    
    // Reset round state for players
    this.players.forEach(p => {
      p.hasGuessed = false;
      p.roundScore = 0;
      p.guessTime = undefined;
      p.doublePointsActive = false;
    });

    this.playerRevealedIndices.clear();
    this.sentStageHints.clear();
    this.isBlurFrozen = false;

    // 1. If background pre-caching is in progress, wait briefly for it to complete
    if (this.isPreCaching) {
      console.log(`[Pre-Cache] Waiting for background caching of next round to finish...`);
      for (let i = 0; i < 25; i++) {
        if (!this.isPreCaching) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // 2. Consume pre-cached data if available
    let img = this.nextImageToUse;
    let stages = this.nextBlurStages;

    // 3. Fallback: If pre-cache is not ready or failed, resolve synchronously
    if (!img || stages.length === 0) {
      console.log('[Pre-Cache] Cache miss or not ready. Loading image synchronously.');
      img = this.selectRandomImage() || undefined;
      if (!img) {
        this.broadcastSystemMessage('Error: No images found for selected categories.');
        this.state = 'LOBBY';
        this.broadcastState();
        return;
      }
      
      let imageSource = img.fileName;
      if (!imageSource) {
        try {
          this.broadcastSystemMessage(`🔍 Loading image for "${img.answer.toUpperCase()}"...`);
          imageSource = await fetchImageUrl(img);
        } catch (err) {
          console.error('Error fetching image URL:', err);
          imageSource = `https://loremflickr.com/640/480/${encodeURIComponent(img.answer)}`;
        }
      }

      try {
        stages = await generateBlurStages(imageSource, this.publicFolder);
      } catch (err) {
        console.error(err);
        this.broadcastSystemMessage(`Error loading image for "${img.answer}". Skipping round.`);
        setTimeout(() => this.startNextRound(), 3000);
        return;
      }
    }

    this.currentImage = img;
    this.blurStages = stages;

    // 4. Immediately clear pre-cache and kick off background preparation for the NEXT round
    this.nextImageToUse = undefined;
    this.nextBlurStages = [];
    this.preCacheNextRound();

    // Inform clients that round is starting and send static metadata
    this.io.to(this.roomId).emit('round_start', {
      roundNumber: this.currentRound,
      totalRounds: this.config.rounds,
      category: img.category,
      wordLength: img.answer.length,
      answerTemplate: img.answer.split(' ').map(word => '_ '.repeat(word.length).trim()).join('   ')
    });

    this.broadcastSystemMessage(`Round ${this.currentRound} Started! Category: ${img.category}`);
    this.broadcastState();

    // Start timer interval
    this.startTimer();
  }

  // Pre-cache helper to prepare the next round's image in the background
  private async preCacheNextRound() {
    if (this.isPreCaching) return;
    this.isPreCaching = true;

    try {
      const nextImg = this.selectRandomImage();
      if (!nextImg) {
        this.nextImageToUse = undefined;
        this.nextBlurStages = [];
        this.isPreCaching = false;
        return;
      }

      this.nextImageToUse = nextImg;
      console.log(`[Pre-Cache] Starting pre-cache for next round: "${nextImg.answer.toUpperCase()}"`);

      let imageSource = nextImg.fileName;
      if (!imageSource) {
        imageSource = await fetchImageUrl(nextImg);
      }

      this.nextBlurStages = await generateBlurStages(imageSource, this.publicFolder);
      console.log(`[Pre-Cache] Finished pre-cache for next round: "${nextImg.answer.toUpperCase()}"`);
    } catch (err) {
      console.error('[Pre-Cache] Error preparing next image:', err);
      // Fallback
      if (this.nextImageToUse) {
        try {
          const fallbackSource = `https://loremflickr.com/640/480/${encodeURIComponent(this.nextImageToUse.answer)}`;
          this.nextBlurStages = await generateBlurStages(fallbackSource, this.publicFolder);
        } catch (fErr) {
          console.error('[Pre-Cache] Fallback pre-cache failed:', fErr);
        }
      }
    } finally {
      this.isPreCaching = false;
    }
  }

  // Timer loop
  private startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    // Send immediate initial frame update
    this.sendImageUpdates();
    // Send immediate initial progressive hint update
    this.sendHintsIfNeeded();

    this.timerInterval = setInterval(() => {
      // If timer is frozen, do not decrement the time or progress the stage
      if (this.isBlurFrozen) {
        this.io.to(this.roomId).emit('timer_update', this.timer);
        return;
      }

      this.timer--;

      // Send hints based on timer progress
      this.sendHintsIfNeeded();

      // Send progressive image frames
      this.sendImageUpdates();

      // Emit time update
      this.io.to(this.roomId).emit('timer_update', this.timer);

      if (this.timer <= 0) {
        this.endRound();
      }
    }, 1000);
  }

  // Get current blur stage (0 to 9) based on time elapsed
  private get getCurrentBlurStage(): number {
    const elapsed = this.config.roundDuration - this.timer;
    const ratio = elapsed / this.config.roundDuration; // 0 to 1
    // Map ratio to index 0 - 9
    const stage = Math.min(Math.floor(ratio * 10), 9);
    return stage;
  }

  // Send personalized image frames based on guess status (Anti-cheat)
  private sendImageUpdates() {
    const currentStage = this.getCurrentBlurStage;
    const blurredFrame = this.blurStages[currentStage];
    const clearFrame = this.blurStages[9];

    this.activePlayers.forEach(p => {
      const frameToSend = p.hasGuessed ? clearFrame : blurredFrame;
      this.io.to(p.socketId).emit('image_update', {
        image: frameToSend,
        stage: currentStage
      });
    });
  }

  // Hints logic based on unblur stages
  private sendHintsIfNeeded() {
    if (!this.currentImage) return;
    const stage = this.getCurrentBlurStage;
    if (this.sentStageHints.has(stage)) return;

    if (stage === 0) {
      const lengthHint = this.currentImage.answer.split(' ').map(word => {
        return '_ '.repeat(word.length).trim();
      }).join('   ');
      this.io.to(this.roomId).emit('hint_update', {
        type: 'letters',
        text: lengthHint
      });
      this.sentStageHints.add(stage);
    } else if (stage === 3) {
      const initialHint = this.currentImage.answer.split(' ').map(word => {
        if (word.length <= 2) {
          return word.substring(0, 1) + '_ '.repeat(word.length - 1).trim();
        }
        return word.substring(0, 1) + ' _ '.repeat(word.length - 2) + word.substring(word.length - 1);
      }).join('   ');
      this.io.to(this.roomId).emit('hint_update', {
        type: 'letters',
        text: initialHint
      });
      this.sentStageHints.add(stage);
    } else if (stage === 5) {
      const clue = this.currentImage.hints[0] || 'A common object';
      this.io.to(this.roomId).emit('hint_update', {
        type: 'clue',
        text: `Clue 1: ${clue}`
      });
      this.sentStageHints.add(stage);
    } else if (stage === 7) {
      const clue = this.currentImage.hints[1] || this.currentImage.hints[0] || 'A common object';
      this.io.to(this.roomId).emit('hint_update', {
        type: 'clue',
        text: `Clue 2: ${clue}`
      });
      this.sentStageHints.add(stage);
    }
  }

  // Fuzzy matching check
  private isCorrectGuess(guess: string): boolean {
    if (!this.currentImage) return false;

    const cleanString = (str: string) => 
      str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

    const normalizedGuess = cleanString(guess);
    const normalizedAnswer = cleanString(this.currentImage.answer);
    
    // Check main answer
    if (normalizedGuess === normalizedAnswer) return true;

    // Check aliases
    for (const alias of this.currentImage.aliases) {
      if (normalizedGuess === cleanString(alias)) return true;
    }

    // Calculate Levenshtein Distance for minor spelling errors (fuzzy match)
    if (normalizedGuess.length >= 4) {
      const distance = this.levenshtein(normalizedGuess, normalizedAnswer);
      // Allow 1 character typo for lengths 4-7, 2 typos for 8+
      const maxAllowed = normalizedAnswer.length >= 8 ? 2 : 1;
      if (distance <= maxAllowed) return true;
    }

    return false;
  }

  // Levenshtein distance implementation
  private levenshtein(a: string, b: string): number {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(
              matrix[i][j - 1] + 1, // insertion
              matrix[i - 1][j] + 1  // deletion
            )
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // Process guess submission
  public handleGuess(socketId: string, text: string): { correct: boolean } {
    if (this.state !== 'ROUND_ACTIVE') return { correct: false };

    const player = this.players.find(p => p.socketId === socketId);
    if (!player || player.hasGuessed || player.disconnected) return { correct: false };

    const isCorrect = this.isCorrectGuess(text);

    if (isCorrect) {
      player.hasGuessed = true;
      const elapsed = this.config.roundDuration - this.timer;
      player.guessTime = elapsed * 1000; // time in ms

      // Determine if they were on a speed streak (guessed in <= 15s)
      const isFastGuess = elapsed <= 15;
      if (isFastGuess) {
        player.streak++;
        if (player.streak >= 2) {
          player.multiplierActive = true;
        }
      } else {
        player.streak = 0;
        player.multiplierActive = false;
      }

      // Calculate base score: earlier guess -> more points (100 to 250)
      const ratio = this.timer / this.config.roundDuration; // 1 down to 0
      const baseScore = Math.round(100 + 150 * ratio);

      // Apply multipliers (Streak + Power-ups)
      let multiplier = 1.0;
      if (player.multiplierActive) {
        // Cap streak multiplier at 2.0x (increases by 0.25x per level above 1)
        multiplier += Math.min(1.0, (player.streak - 1) * 0.25);
      }
      if (player.doublePointsActive) {
        multiplier *= 2.0;
      }

      player.roundScore = Math.round(baseScore * multiplier);
      player.score += player.roundScore;

      // Award coin currency
      let coinsEarned = 20; // Base award
      if (player.streak > 0) {
        coinsEarned += 10; // Streak bonus
      }
      // Check if this is the first correct guess in the room this round
      const fastestGuesser = !this.players.some(p => p.hasGuessed && p.id !== player.id);
      if (fastestGuesser) {
        coinsEarned += 15; // First place speed bonus
      }
      player.coins += coinsEarned;

      // Broadcast success notification
      const streakSuffix = player.multiplierActive ? ` 🔥 STREAK x${(multiplier).toFixed(2)}!` : '';
      const correctMsg: ChatMessage = {
        id: uuidv4(),
        username: 'System',
        text: `🎉 ${player.username} guessed correctly in ${elapsed}s (+${player.roundScore} pts, +${coinsEarned} 🪙)${streakSuffix}`,
        timestamp: Date.now(),
        type: 'correct'
      };
      this.io.to(this.roomId).emit('chat_message', correctMsg);
      
      // Send guess result back with score and new coins count
      this.io.to(player.socketId).emit('guess_result', {
        correct: true,
        score: player.roundScore,
        coins: player.coins,
        streak: player.streak
      });

      // Instantly push the unblurred image to this player
      this.sendImageUpdates();

      // Check if round should end early
      this.checkRoundEndConditions();
    }

    return { correct: isCorrect };
  }

  // Check if round should end because all active players have guessed
  private checkRoundEndConditions() {
    if (this.state !== 'ROUND_ACTIVE') return;

    const guessers = this.players.filter(p => p.hasGuessed || p.disconnected);
    if (guessers.length === this.players.length) {
      this.endRound();
    }
  }

  // End the round
  private endRound() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.state = 'ROUND_END';

    // Reset streaks for anyone who didn't guess
    this.players.forEach(p => {
      if (!p.hasGuessed) {
        p.streak = 0;
        p.multiplierActive = false;
      }
    });

    const answer = this.currentImage ? this.currentImage.answer : '';
    this.broadcastSystemMessage(`Round over! The correct answer was: "${answer.toUpperCase()}"`);

    // Send round results containing the correct answer and points gained
    this.io.to(this.roomId).emit('round_end', {
      answer,
      players: this.players,
      clearImage: this.blurStages[9] // Everyone sees the final clear image now
    });

    this.broadcastState();

    // Move to next round after 10 seconds of leaderboard review
    setTimeout(() => {
      if (this.state === 'ROUND_END') {
        this.startNextRound();
      }
    }, 10000);
  }

  // Calculate final statistics and display winner
  private endGame() {
    this.state = 'GAME_END';

    // Sort players by total score
    const sorted = [...this.players].sort((a, b) => b.score - a.score);
    const podium = sorted.slice(0, 3);

    // Compute stats
    let fastest: { username: string; time: number } | undefined;
    const avgSpeeds: { username: string; time: number }[] = [];
    
    this.players.forEach(p => {
      // Mock stats / placeholder for speed
      if (p.guessTime !== undefined) {
        if (!fastest || p.guessTime < fastest.time) {
          fastest = { username: p.username, time: p.guessTime / 1000 };
        }
      }
      avgSpeeds.push({ username: p.username, time: 10 + Math.random() * 15 }); // random average speeds for display
    });

    const stats: WinnerStats = {
      podium,
      fastestGuess: fastest,
      averageSpeed: avgSpeeds
    };

    this.io.to(this.roomId).emit('game_over', stats);
    this.broadcastState();
  }

  // Reset to lobby
  public resetToLobby() {
    this.state = 'LOBBY';
    this.players.forEach(p => {
      p.score = 0;
      p.roundScore = 0;
      p.hasGuessed = false;
      p.guessTime = undefined;
      p.coins = 0;
      p.streak = 0;
      p.multiplierActive = false;
      p.doublePointsActive = false;
    });
    this.broadcastState();
  }

  // Cleanup timers
  public destroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  // Emotes React Handler
  public handleSendEmote(socketId: string, emote: string) {
    const player = this.players.find(p => p.socketId === socketId);
    if (!player) return;
    this.io.to(this.roomId).emit('emote_received', {
      playerId: player.id,
      emote
    });
  }

  // Clue Shop Purchase Handler
  public handlePurchasePowerup(socketId: string, type: 'reveal_letter' | 'blur_freeze' | 'double_points'): { success: boolean; message: string; data?: any } {
    const player = this.players.find(p => p.socketId === socketId);
    if (!player || player.disconnected) {
      return { success: false, message: 'Player not found.' };
    }

    if (this.state !== 'ROUND_ACTIVE') {
      return { success: false, message: 'Shop is only open during active rounds.' };
    }

    const costs = {
      reveal_letter: 50,
      double_points: 75,
      blur_freeze: 150
    };

    const cost = costs[type];
    if (player.coins < cost) {
      return { success: false, message: `Insufficient coins. Need ${cost} 🪙.` };
    }

    if (type === 'reveal_letter') {
      if (player.hasGuessed) {
        return { success: false, message: 'You have already guessed correctly!' };
      }
      player.coins -= cost;
      const mask = this.revealRandomLetter(player.id);
      this.broadcastState();
      return {
        success: true,
        message: 'Revealed a letter!',
        data: { mask, coins: player.coins }
      };
    }

    if (type === 'double_points') {
      if (player.hasGuessed) {
        return { success: false, message: 'You have already guessed correctly!' };
      }
      if (player.doublePointsActive) {
        return { success: false, message: 'Double points already active for this round.' };
      }
      player.coins -= cost;
      player.doublePointsActive = true;
      this.broadcastState();
      return {
        success: true,
        message: 'Double points activated for this round!',
        data: { coins: player.coins }
      };
    }

    if (type === 'blur_freeze') {
      if (this.isBlurFrozen) {
        return { success: false, message: 'Blur is already frozen!' };
      }
      player.coins -= cost;
      this.isBlurFrozen = true;
      
      this.broadcastSystemMessage(`❄️ ${player.username} bought a BLUR FREEZE! Unblurring is PAUSED for 5 seconds!`);
      this.io.to(this.roomId).emit('blur_frozen', { playerId: player.id });
      this.broadcastState();

      setTimeout(() => {
        this.isBlurFrozen = false;
        this.broadcastSystemMessage('🔥 Blur Freeze ended! Image unblurring resumed.');
        this.io.to(this.roomId).emit('blur_thawed');
      }, 5000);

      return {
        success: true,
        message: 'Activated Blur Freeze for 5 seconds!',
        data: { coins: player.coins }
      };
    }

    return { success: false, message: 'Invalid powerup type.' };
  }

  // Reveal a random letter helper
  private revealRandomLetter(playerId: string): string {
    if (!this.currentImage) return '';
    const answer = this.currentImage.answer;
    
    if (!this.playerRevealedIndices.has(playerId)) {
      this.playerRevealedIndices.set(playerId, new Set([0]));
    }
    
    const revealed = this.playerRevealedIndices.get(playerId)!;
    const unrevealedIndices: number[] = [];
    
    for (let i = 0; i < answer.length; i++) {
      if (answer[i] !== ' ' && !revealed.has(i)) {
        unrevealedIndices.push(i);
      }
    }
    
    if (unrevealedIndices.length > 0) {
      const randomIndex = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
      revealed.add(randomIndex);
    }
    
    return answer.split('').map((char, index) => {
      if (char === ' ') return '   ';
      return revealed.has(index) ? char : '_';
    }).join(' ');
  }
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private io: Server;
  private publicFolder: string;

  constructor(io: Server, publicFolder: string) {
    this.io = io;
    this.publicFolder = publicFolder;
  }

  public createRoom(isPrivate: boolean = false): Room {
    // Generate a simple room code (e.g. 5 letters)
    let code = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    do {
      code = '';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));

    const room = new Room(code, this.io, this.publicFolder, isPrivate);
    this.rooms.set(code, room);
    return room;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  public deleteRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.destroy();
      this.rooms.delete(roomId);
    }
  }

  // Get active public rooms
  public getPublicRooms(): { roomId: string; playersCount: number; maxPlayers: number }[] {
    const list: { roomId: string; playersCount: number; maxPlayers: number }[] = [];
    this.rooms.forEach((room, code) => {
      if (!room.config.isPrivate && room.state === 'LOBBY') {
        list.push({
          roomId: code,
          playersCount: room.activePlayers.length,
          maxPlayers: room.config.maxPlayers
        });
      }
    });
    return list;
  }
}

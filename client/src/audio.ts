class AudioSynth {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch (e) {
      console.warn("Web Audio API is not supported in this browser environment.", e);
      return null;
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, startDelay: number = 0, volume: number = 0.1) {
    const ctx = this.getContext();
    if (!ctx) return;

    setTimeout(() => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        // Simple envelope: linear ramp to zero
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (err) {
        console.error("Tone playback failed:", err);
      }
    }, startDelay * 1000);
  }

  /**
   * Play a clean, pleasant double chime for correct answers
   */
  public playCorrect() {
    // C5 (523.25Hz) then E5 (659.25Hz)
    this.playTone(523.25, 'triangle', 0.15, 0, 0.15);
    this.playTone(659.25, 'triangle', 0.35, 0.08, 0.15);
  }

  /**
   * Play a short, clean high tick sound for timer countdown
   */
  public playTick() {
    this.playTone(880, 'sine', 0.05, 0, 0.08);
  }

  /**
   * Play a triumphant ascending arpeggio on round start
   */
  public playRoundStart() {
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'sine', 0.25, idx * 0.08, 0.1);
    });
  }

  /**
   * Play a descending melody when the round ends
   */
  public playRoundEnd() {
    const notes = [392.00, 329.63, 261.63]; // G4, E4, C4
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'triangle', 0.3, idx * 0.12, 0.1);
    });
  }

  /**
   * Play a celebratory victory fanfare when the game is won
   */
  public playWinnerFanfare() {
    // Triumphant chord progression: C4 -> E4 -> G4 -> C5 -> E5 -> G5 -> C6
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'triangle', 0.4, idx * 0.06, 0.12);
    });
    // Add a final harmony note
    setTimeout(() => {
      this.playTone(523.25, 'sine', 1.0, 0, 0.1);
      this.playTone(783.99, 'sine', 1.0, 0, 0.15);
      this.playTone(1046.50, 'sine', 1.0, 0, 0.15);
    }, 450);
  }

  /**
   * Short beep for generic UI clicks
   */
  public playClick() {
    this.playTone(440, 'sine', 0.08, 0, 0.05);
  }

  /**
   * Play a slide-up flame streak activate sound
   */
  public playStreak() {
    const notes = [440, 554.37, 659.25, 880, 1109]; // Ascending A major arpeggio
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'sawtooth', 0.2, idx * 0.05, 0.08);
    });
  }

  /**
   * Play a metallic coin register sound for purchases
   */
  public playPurchase() {
    // Two quick high pitches
    this.playTone(987.77, 'sine', 0.05, 0, 0.12);
    this.playTone(1318.51, 'triangle', 0.25, 0.04, 0.15);
  }

  /**
   * Play a slow, deep ice freeze tone
   */
  public playFreeze() {
    // Low, metallic block chimes
    const notes = [392, 349.23, 293.66, 220]; // Descending
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'sine', 0.6, idx * 0.15, 0.15);
    });
  }
}

export const audio = new AudioSynth();

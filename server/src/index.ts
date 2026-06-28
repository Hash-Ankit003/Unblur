import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { RoomManager, dataset } from './game';
import { ChatMessage } from './types';
import { v4 as uuidv4 } from 'uuid';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: true, // Echoes back requesting origin (required for credentialed requests)
  credentials: true,
  methods: ['GET', 'POST']
}));

// Serve static assets (for clean image files)
const publicFolder = path.join(__dirname, '..', 'public');
app.use(express.static(publicFolder));

// Add root health-check endpoint for Render
app.get('/', (req, res) => {
  res.send({ status: 'healthy', message: 'Unblur Backend Server is running.' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (requestOrigin, callback) => {
      // Reflect whatever origin is calling us to prevent CORS blocks
      callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const roomManager = new RoomManager(io, publicFolder);

// Keep track of socket -> room mappings
const socketRoomMap = new Map<string, { roomId: string; playerId: string }>();

io.on('connection', (socket: Socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Fetch list of active public rooms
  socket.on('list_public_rooms', (callback: (rooms: any[]) => void) => {
    callback(roomManager.getPublicRooms());
  });

  // Create a new room
  socket.on('create_room', (data: { username: string; isPrivate: boolean }, callback: (res: { success: boolean; roomId?: string; playerId?: string; error?: string }) => void) => {
    try {
      const room = roomManager.createRoom(data.isPrivate);
      const player = room.addPlayer(socket.id, data.username);
      
      socket.join(room.roomId);
      socketRoomMap.set(socket.id, { roomId: room.roomId, playerId: player.id });

      console.log(`Room created: ${room.roomId} by ${player.username}`);
      
      callback({
        success: true,
        roomId: room.roomId,
        playerId: player.id
      });

      room.broadcastState();
      room.broadcastSystemMessage(`👋 ${player.username} has created the room.`);
    } catch (err: any) {
      callback({ success: false, error: err.message || 'Failed to create room' });
    }
  });

  // Join an existing room
  socket.on('join_room', (data: { roomId: string; username: string; playerId?: string }, callback: (res: { success: boolean; playerId?: string; error?: string }) => void) => {
    const roomId = data.roomId.toUpperCase();
    const room = roomManager.getRoom(roomId);

    if (!room) {
      return callback({ success: false, error: 'Room not found.' });
    }

    if (room.activePlayers.length >= room.config.maxPlayers) {
      return callback({ success: false, error: 'Room is full.' });
    }

    if (room.state !== 'LOBBY') {
      return callback({ success: false, error: 'Game is already in progress.' });
    }

    try {
      const player = room.addPlayer(socket.id, data.username, data.playerId);
      socket.join(room.roomId);
      socketRoomMap.set(socket.id, { roomId: room.roomId, playerId: player.id });

      console.log(`Player ${player.username} joined room ${roomId}`);

      callback({
        success: true,
        playerId: player.id
      });

      room.broadcastState();
      room.broadcastSystemMessage(`👋 ${player.username} joined the lobby.`);
    } catch (err: any) {
      callback({ success: false, error: err.message || 'Failed to join room' });
    }
  });

  // Update game settings (host only)
  socket.on('update_config', (configData: any) => {
    const mapping = socketRoomMap.get(socket.id);
    if (!mapping) return;

    const room = roomManager.getRoom(mapping.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (player && player.isHost) {
      room.updateConfig(configData);
    }
  });

  // Toggle ready status
  socket.on('toggle_ready', (isReady: boolean) => {
    const mapping = socketRoomMap.get(socket.id);
    if (!mapping) return;

    const room = roomManager.getRoom(mapping.roomId);
    if (room) {
      room.toggleReady(mapping.playerId, isReady);
    }
  });

  // Start the game (host only)
  socket.on('start_game', () => {
    const mapping = socketRoomMap.get(socket.id);
    if (!mapping) return;

    const room = roomManager.getRoom(mapping.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (player && player.isHost) {
      room.startGame();
    }
  });

  // Reset to lobby (host only)
  socket.on('reset_to_lobby', () => {
    const mapping = socketRoomMap.get(socket.id);
    if (!mapping) return;

    const room = roomManager.getRoom(mapping.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (player && player.isHost) {
      room.resetToLobby();
    }
  });

  // Submit private guess
  socket.on('submit_guess', (guessText: string) => {
    const mapping = socketRoomMap.get(socket.id);
    if (!mapping) return;

    const room = roomManager.getRoom(mapping.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player || player.hasGuessed) return;

    const result = room.handleGuess(socket.id, guessText);
    
    // If incorrect, send guess privately back to the client only
    if (!result.correct) {
      socket.emit('private_guess_result', {
        text: guessText,
        correct: false
      });
    }
  });

  // Emotes reaction trigger
  socket.on('send_emote', (emote: string) => {
    const mapping = socketRoomMap.get(socket.id);
    if (!mapping) return;

    const room = roomManager.getRoom(mapping.roomId);
    if (room) {
      room.handleSendEmote(socket.id, emote);
    }
  });

  // Shop purchase trigger
  socket.on('purchase_powerup', (type: 'reveal_letter' | 'blur_freeze' | 'double_points') => {
    const mapping = socketRoomMap.get(socket.id);
    if (!mapping) return;

    const room = roomManager.getRoom(mapping.roomId);
    if (!room) return;

    const result = room.handlePurchasePowerup(socket.id, type);
    socket.emit('purchase_response', result);
  });

  // General Chat message
  socket.on('send_chat', (text: string) => {
    const mapping = socketRoomMap.get(socket.id);
    if (!mapping) return;

    const room = roomManager.getRoom(mapping.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (!player || player.disconnected) return;

    const chatMsg: ChatMessage = {
      id: uuidv4(),
      username: player.username,
      text: text.trim().substring(0, 150),
      timestamp: Date.now(),
      type: 'chat'
    };

    io.to(room.roomId).emit('chat_message', chatMsg);
  });

  // Kick player (host only)
  socket.on('kick_player', (kickPlayerId: string) => {
    const mapping = socketRoomMap.get(socket.id);
    if (!mapping) return;

    const room = roomManager.getRoom(mapping.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === mapping.playerId);
    if (player && player.isHost) {
      const targetSocketId = room.kickPlayer(kickPlayerId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('kicked');
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.leave(room.roomId);
        }
        socketRoomMap.delete(targetSocketId);
      }
    }
  });

  // Leave room
  socket.on('leave_room', () => {
    handleDisconnect(socket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    handleDisconnect(socket);
  });
});

function handleDisconnect(socket: Socket) {
  const mapping = socketRoomMap.get(socket.id);
  if (!mapping) return;

  const room = roomManager.getRoom(mapping.roomId);
  if (room) {
    const player = room.disconnectPlayer(socket.id);
    if (player) {
      room.broadcastSystemMessage(`❌ ${player.username} has left.`);
      room.broadcastState();
      
      // Delete room if empty
      if (room.activePlayers.length === 0) {
        console.log(`Deleting empty room: ${room.roomId}`);
        roomManager.deleteRoom(room.roomId);
      }
    }
  }

  socketRoomMap.delete(socket.id);
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`[Boot] Loaded ${dataset.length} items from offline dataset.json registry.`);
});

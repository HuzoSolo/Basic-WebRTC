const express = require('express');
// HTTPS için gerekli modüller
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
// Winston kütüphanesi loglama için eklenebilir (opsiyonel)
// const winston = require('winston');

// Ortam değişkenlerini yüklemek için dotenv kullanabilirsiniz (opsiyonel)
// require('dotenv').config();

// Servis ayarları
const PORT = process.env.PORT || 2002;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
// API güvenliği için anahtar (gerçek projede güvenli bir şekilde saklanmalı)
const API_KEY = process.env.API_KEY || 'default-key';

// Express uygulaması oluşturma
const app = express();

// HTTPS sertifikası ve anahtarı
const httpsOptions = {
  key: fs.readFileSync('192.168.0.16-key.pem'),
  cert: fs.readFileSync('192.168.0.16.pem')
};

// HTTPS sunucusu oluşturma
const server = https.createServer(httpsOptions, app);

// Socket.io sunucusu yapılandırması
const io = new Server(server, {
  cors: { 
    origin: CORS_ORIGIN, // Tüm domainlerden bağlantıya izin ver
    methods: ['GET', 'POST'] // İzin verilen HTTP metotları
  },
  // Bağlantı sağlamlığı için
  pingTimeout: 120000,  // 120 saniye ping zaman aşımı (artırıldı)
  pingInterval: 15000, // 15 saniyede bir ping gönder (azaltıldı)
  connectTimeout: 60000, // 60 saniye bağlantı zaman aşımı
  allowEIO3: true, // Engine.IO protokol sürüm 3'e izin ver
  // Yeniden bağlanma yapılandırması
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5
});

// Aktif odaları saklayan veri yapısı
const rooms = new Map();

// WebRTC için önerilen ICE sunucuları
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
  // Gerçek bir TURN sunucusu eklenebilir
  // { 
  //   urls: 'turn:turnserver.example.com:3478',
  //   username: 'username',
  //   credential: 'password'
  // }
];

// ICE sunucularının sağlık durumunu takip eden veri yapısı
const iceServerHealth = new Map();

// Loglama için basit bir fonksiyon
function logInfo(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Socket.io bağlantı olayları
io.on('connection', (socket) => {
  logInfo(`🔌 Yeni bağlantı: ${socket.id}`);

  // Oda katılma olayı
  socket.on('join', ({ roomId, userData }) => {
    socket.join(roomId);
    
    // Kullanıcı bilgilerini sakla
    if (userData) {
      socket.userData = userData;
      logInfo(`👤 ${userData.name || socket.id} (${socket.id}) katıldı: ${roomId}`);
    } else {
      logInfo(`👤 ${socket.id} katıldı: ${roomId}`);
    }

    // Oda yapısını hazırla, odada mesaj geçmişi yoksa oluştur
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { 
        createdAt: new Date(),
        messages: [],
        participants: new Map(),
        connectionStatus: new Map() // Bağlantı durumlarını takip etmek için
      });
    } else if (!rooms.get(roomId).messages) {
      rooms.get(roomId).messages = [];
    }
    
    // Odaya katılımcıyı ekle
    if (!rooms.get(roomId).participants) {
      rooms.get(roomId).participants = new Map();
    }
    
    // Odaya bağlantı durumu takip yapısı ekle
    if (!rooms.get(roomId).connectionStatus) {
      rooms.get(roomId).connectionStatus = new Map();
    }
    
    // Kullanıcı bilgilerini sakla
    rooms.get(roomId).participants.set(socket.id, {
      id: socket.id,
      userData: socket.userData,
      joinedAt: new Date()
    });

    // Kullanıcıya önceki mesajları gönder
    const roomMessages = rooms.get(roomId).messages;
    if (roomMessages && roomMessages.length > 0) {
      socket.emit('chat-history', roomMessages);
      logInfo(`📚 ${socket.id} kullanıcısına ${roomMessages.length} mesaj geçmişi gönderildi`);
    }

    // Odadaki diğer istemcileri bulma
    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || [])
      .filter(id => id !== socket.id);
    
    // Yeni kullanıcıya odadaki mevcut kullanıcıların listesini gönder
    const existingParticipants = clients.map(clientId => {
      const clientSocket = io.sockets.sockets.get(clientId);
      return {
        socketId: clientId,
        userData: clientSocket.userData
      };
    });
    
    // Yeni kullanıcıya ICE sunucusu yapılandırmasını gönder
    socket.emit('ice-servers', { iceServers });
    logInfo(`❄️ ICE sunucu bilgileri gönderildi: ${socket.id}`);
    
    if (existingParticipants.length > 0) {
      socket.emit('existing-participants', existingParticipants);
      logInfo(`📋 ${socket.id} kullanıcısına ${existingParticipants.length} mevcut katılımcı bilgisi gönderildi`);
    }

    // Odadaki diğer kullanıcılara yeni kullanıcı hakkında bilgi ver
    clients.forEach(clientId => {
      io.to(clientId).emit('new-peer', { 
        socketId: socket.id,
        userData: socket.userData 
      });
      logInfo(`🔄 Peer eşleşmesi bildirildi: ${clientId} <- ${socket.id}`);
    });
  });

  // Bağlantı durumu izleme
  socket.on('connection-status', ({ targetId, status }) => {
    try {
      if (!targetId) {
        return;
      }
      
      // Kullanıcının bulunduğu tüm odalar için
      socket.rooms.forEach(roomId => {
        if (roomId !== socket.id) { // socket.id dışındaki odalar
          if (rooms.has(roomId) && rooms.get(roomId).connectionStatus) {
            // Bağlantı durumunu güncelle
            const connectionKey = [socket.id, targetId].sort().join('-');
            rooms.get(roomId).connectionStatus.set(connectionKey, {
              status,
              updatedAt: new Date()
            });
            
            logInfo(`🔌 Bağlantı durumu güncellendi: ${socket.id} <-> ${targetId}: ${status}`);
          }
        }
      });
      
      // Durum değişikliğini hedef kullanıcıya bildir
      io.to(targetId).emit('connection-status', {
        socketId: socket.id,
        status
      });
      
    } catch (error) {
      logInfo(`❌ Bağlantı durumu hatası: ${error.message}`);
    }
  });

  // Chat mesajı olayı
  socket.on('chat-message', ({ roomId, message, userData }) => {
    try {
      if (!roomId) {
        logInfo(`⚠️ Chat mesajı için oda ID eksik: ${socket.id}`);
        return;
      }
      
      // Mesaj içeriği kontrolü
      if (!message || typeof message !== 'string' || message.trim() === '') {
        logInfo(`⚠️ Geçersiz mesaj formatı: ${socket.id}`);
        return;
      }
      
      // Mesaj bilgisini oluştur
      const messageData = {
        sender: userData || socket.userData || { id: socket.id },
        text: message.trim(),
        timestamp: new Date().toISOString()
      };
      
      // Mesajı odadaki tüm kullanıcılara gönder
      io.to(roomId).emit('chat-message', messageData);
      
      // Log kaydet
      const senderName = messageData.sender.name || messageData.sender.id || socket.id;
      logInfo(`💬 Chat: ${senderName} -> ${roomId}: ${message.substring(0, 30)}${message.length > 30 ? '...' : ''}`);
      
      // Mesajları sakla
      if (rooms.has(roomId)) {
        const roomMessages = rooms.get(roomId).messages;
        roomMessages.push(messageData);
        
        // Son 50 mesajı sakla (daha fazlası için veritabanı düşünülebilir)
        if (roomMessages.length > 50) {
          roomMessages.shift();
        }
      }
    } catch (error) {
      logInfo(`❌ Chat mesajı hatası: ${error.message}`);
    }
  });

  // SDP (Session Description Protocol) sinyalleşmesi
  socket.on('sdp', ({ targetId, sdp }) => {
    try {
      if (!targetId) {
        logInfo(`⚠️ SDP Hedef ID eksik: ${socket.id}`);
        return;
      }
      
      // SDP yapılandırmasının türüne göre log ekstra bilgi
      const sdpType = sdp.type || 'unknown';
      
      io.to(targetId).emit('sdp', { 
        senderId: socket.id, 
        sdp,
        timestamp: Date.now() // Zaman damgası ekleyerek sıralama garantisi
      });
      
      logInfo(`📡 SDP sinyal gönderildi (${sdpType}): ${socket.id} -> ${targetId}`);
    } catch (error) {
      logInfo(`❌ SDP Hatası: ${error.message}`);
    }
  });

  // ICE aday bilgilerinin iletimi
  socket.on('ice-candidate', ({ targetId, candidate }) => {
    try {
      if (!targetId) {
        logInfo(`⚠️ ICE Hedef ID eksik: ${socket.id}`);
        return;
      }
      
      // Kandidat boş ise son durumu bildiriyoruz
      const isFinalCandidate = !candidate || !candidate.candidate;
      
      io.to(targetId).emit('ice-candidate', { 
        senderId: socket.id, 
        candidate,
        isFinalCandidate
      });
      
      const candidateInfo = candidate && candidate.candidate ? 
        `(${candidate.protocol || 'unknown'}, ${candidate.type || 'unknown'})` : 
        '(final)';
      
      logInfo(`❄️ ICE aday bilgisi gönderildi ${candidateInfo}: ${socket.id} -> ${targetId}`);
    } catch (error) {
      logInfo(`❌ ICE Hatası: ${error.message}`);
    }
  });

  // Odadan ayrılma olayı
  socket.on('leave', ({ roomId }) => {
    if (roomId) {
      socket.leave(roomId);
      logInfo(`👋 ${socket.id} ayrıldı: ${roomId}`);
      
      // Odadan katılımcıyı kaldır
      if (rooms.has(roomId) && rooms.get(roomId).participants) {
        rooms.get(roomId).participants.delete(socket.id);
        
        // Bu kullanıcıyla ilgili bağlantı durumlarını temizle
        if (rooms.get(roomId).connectionStatus) {
          const connStatusMap = rooms.get(roomId).connectionStatus;
          
          // Bu socket ID'sini içeren tüm bağlantı anahtarlarını bul ve sil
          Array.from(connStatusMap.keys()).forEach(key => {
            if (key.includes(socket.id)) {
              connStatusMap.delete(key);
            }
          });
        }
        
        // Oda boşsa odayı sil
        if (rooms.get(roomId).participants.size === 0) {
          rooms.delete(roomId);
          logInfo(`🧹 Boş oda silindi: ${roomId}`);
        }
      }
      
      // Odadaki diğer kullanıcılara bildir
      io.to(roomId).emit('peer-left', {
        socketId: socket.id,
        graceful: true, // normal ayrılma olduğunu belirt
        timestamp: Date.now()
      });
      logInfo(`👋 Ayrılma bildirimi gönderildi: ${socket.id} -> ${roomId}`);
    }
  });

  // Bağlantı koptuğunda
  socket.on('disconnect', () => {
    logInfo(`❌ Bağlantı kapandı: ${socket.id}`);
    
    // Kullanıcının olduğu tüm odaları bul ve bildir
    for (const [roomId, room] of rooms.entries()) {
      if (room.participants && room.participants.has(socket.id)) {
        room.participants.delete(socket.id);
        logInfo(`👋 Katılımcı silindi: ${socket.id} -> ${roomId}`);
        
        // Bu kullanıcıyla ilgili bağlantı durumlarını temizle
        if (room.connectionStatus) {
          const connStatusMap = room.connectionStatus;
          
          // Bu socket ID'sini içeren tüm bağlantı anahtarlarını bul ve sil
          Array.from(connStatusMap.keys()).forEach(key => {
            if (key.includes(socket.id)) {
              connStatusMap.delete(key);
            }
          });
        }
        
        // Odadaki diğer kullanıcılara bildir
        io.to(roomId).emit('peer-left', {
          socketId: socket.id,
          graceful: false, // anormal ayrılma olduğunu belirt
          timestamp: Date.now()
        });
        logInfo(`👋 Bağlantı koptuğu için bildirim: ${socket.id} -> ${roomId}`);
        
        // Oda boşsa odayı sil
        if (room.participants.size === 0) {
          rooms.delete(roomId);
          logInfo(`🧹 Boş oda silindi: ${roomId}`);
        }
      }
    }
  });
});

// Middleware'ler
app.use(cors()); // CORS politikalarını ayarla
app.use(express.json()); // JSON verileri ayrıştırma
app.use(express.static('public')); // Statik dosyaları sunmak için

// API anahtarı doğrulama middleware'i
function authenticateApiKey(req, res, next) {
  // const apiKey = req.headers['x-api-key'];// x-api-key header'ını kontrol et
  // if (!apiKey || apiKey !== API_KEY) { // API anahtarı eşleşmiyorsa 401 hatası döndür
  //   return res.status(401).json({ error: 'Geçersiz API anahtarı' });
  // }
  next(); // Test için direkt olarak erişime izin ver
}

// Basit istek kaydı için middleware
app.use((req, res, next) => {
  const start = Date.now();
  logInfo(`${req.method} ${req.originalUrl} başlatıldı`);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logInfo(`${req.method} ${req.originalUrl} tamamlandı: ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// Ana sayfa endpoint'i
app.get('/', (req, res) => {
  res.json({message: 'Signaling Server API'});
});

// ----- ODA YÖNETİMİ API ENDPOINTLERİ -----

// Oda oluşturma (GET metodu)
app.get('/create-room', (req, res) => {
  const roomId = req.query.roomId;    
  if (rooms.has(roomId)) {
    res.json({message: 'Room already exists', roomId: roomId});
  } else {
    rooms.set(roomId, { createdAt: new Date() });
    res.json({message: 'Room created', roomId: roomId});
  }
});

// Oda bulma (GET metodu)
app.get('/find-room', (req, res) => {
  const roomId = req.query.roomId;
  const room = rooms.get(roomId);
  if (room) {
    res.json({message: 'Room found', roomId: roomId});
  } else {
    res.json({message: 'Room not found', roomId: roomId});
  }
});

// ----- YENİ API ENDPOINTLERİ -----

// Oda oluşturma (POST metodu - daha RESTful)
app.post('/api/rooms', (req, res) => {
  const { roomId } = req.body;
  
  // RoomId kontrolü
  if (!roomId) {
    return res.status(400).json({ error: 'roomId gerekli' });
  }
  
  // Oda zaten var mı kontrolü
  if (rooms.has(roomId)) {
    return res.status(409).json({ error: 'Oda zaten mevcut', roomId });
  }
  
  // Yeni oda oluştur
  rooms.set(roomId, { createdAt: new Date() });
  return res.status(201).json({ message: 'Oda oluşturuldu', roomId });
});

// Tüm odaları listeleme
app.get('/api/rooms', (req, res) => {
  // Oda listesini ve katılımcı sayılarını hazırlama
  const roomList = Array.from(rooms.keys()).map(roomId => ({
    roomId,
    participants: io.sockets.adapter.rooms.get(roomId)?.size || 0,
    createdAt: rooms.get(roomId).createdAt
  }));
  
  res.json({ rooms: roomList });
});

// Belirli bir odayı silme
app.delete('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  
  // Oda var mı kontrolü
  if (!rooms.has(roomId)) {
    return res.status(404).json({ error: 'Oda bulunamadı' });
  }
  
  // Odayı sil
  rooms.delete(roomId);
  
  // Odadaki tüm katılımcıları çıkar
  const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
  if (socketsInRoom) {
    for (const socketId of socketsInRoom) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomId);
      }
    }
  }
  
  res.json({ message: 'Oda silindi', roomId });
});

// Bir odadaki katılımcıları listeleme
app.get('/api/rooms/:roomId/participants', (req, res) => {
  const { roomId } = req.params;
  const participants = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
  
  res.json({ 
    roomId, 
    participants, 
    count: participants.length 
  });
});

// Odadaki mesajları getirme
app.get('/api/rooms/:roomId/', (req, res) => {
  const { roomId } = req.paramsmessages;
  
  // Oda var mı kontrol et
  if (!rooms.has(roomId)) {
    return res.status(404).json({ error: 'Oda bulunamadı' });
  }
  
  // Oda mesajlarını al
  const roomData = rooms.get(roomId);
  const messages = roomData.messages || [];
  
  res.json({ 
    roomId, 
    messages, 
    count: messages.length 
  });
});

// Odaya mesaj gönderme (API üzerinden)
app.post('/api/rooms/:roomId/messages', authenticateApiKey, (req, res) => {
  const { roomId } = req.params;
  const { message, sender } = req.body;
  
  // Gerekli parametrelerin kontrolü
  if (!roomId || !message) {
    return res.status(400).json({ error: 'roomId ve message alanları gerekli' });
  }
  
  // Oda var mı kontrol et
  if (!rooms.has(roomId)) {
    return res.status(404).json({ error: 'Oda bulunamadı' });
  }
  
  // Mesaj bilgisini oluştur
  const messageData = {
    sender: sender || { id: 'system', name: 'Sistem' },
    text: message.trim(),
    timestamp: new Date().toISOString()
  };
  
  // Odadaki tüm kullanıcılara mesajı gönder
  io.to(roomId).emit('chat-message', messageData);
  
  // Mesajı kaydet
  if (!rooms.get(roomId).messages) {
    rooms.get(roomId).messages = [];
  }
  rooms.get(roomId).messages.push(messageData);
  
  // Son 50 mesajı tut
  if (rooms.get(roomId).messages.length > 50) {
    rooms.get(roomId).messages.shift();
  }
  
  logInfo(`💬 API üzerinden mesaj gönderildi: ${messageData.sender.name} -> ${roomId}`);
  
  res.json({ 
    success: true, 
    message: 'Mesaj gönderildi', 
    messageData 
  });
});

// API üzerinden WebSocket sinyali gönderme (güvenli endpoint)
app.post('/api/signal', /* authenticateApiKey, */ (req, res) => {
  const { roomId, event, data, targetId } = req.body;
  
  // Gerekli parametrelerin kontrolü
  if (!roomId || !event) {
    return res.status(400).json({ error: 'roomId ve event alanları gerekli' });
  }
  
  // Belirli bir kullanıcıya veya tüm odaya sinyal gönder
  if (targetId) {
    io.to(targetId).emit(event, data);
    logInfo(`API üzerinden sinyal gönderildi: ${event} -> ${targetId}`);
  } else {
    io.to(roomId).emit(event, data);
    logInfo(`API üzerinden odaya sinyal gönderildi: ${event} -> ${roomId}`);
  }
  
  res.json({ success: true, message: 'Sinyal gönderildi' });
});



// Gelişmiş sağlık kontrolü
app.get('/api/health', (req, res) => {
  const status = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    connections: io.engine.clientsCount,
    rooms: rooms.size,
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 + ' MB'
  };
  
  res.json(status);
});

// ----- HARİCİ SİSTEM ENTEGRASYONU API ENDPOINTLERİ -----

// Chat log kayıtları (harici sisteme aktarım)
app.post('/api/external-logs/chat', authenticateApiKey, (req, res) => {
  const { roomId, senderId, receiverId, message, timestamp } = req.body;
  
  // Gerekli parametrelerin kontrolü
  if (!roomId || !senderId || !message) {
    return res.status(400).json({ error: 'roomId, senderId ve message alanları gerekli' });
  }
  
  // Log mesajını oluştur
  const logEntry = {
    id: Date.now().toString(),
    roomId,
    senderId,
    receiverId: receiverId || 'room',
    message,
    timestamp: timestamp || new Date().toISOString(),
    serviceId: 'webrtc-signaling'
  };
  
  // Log kaydı (gerçek entegrasyonda burada harici sisteme istek yapılabilir)
  logInfo(`📝 Harici API Log (Chat): ${logEntry.senderId} -> ${logEntry.receiverId}: ${message.substring(0, 30)}${message.length > 30 ? '...' : ''}`);
  
  // Başarılı yanıt
  res.status(201).json({
    success: true,
    message: 'Chat log kaydı başarılı',
    logEntry
  });
});

// Görüşme log kayıtları (harici sisteme aktarım)
app.post('/api/external-logs/call', authenticateApiKey, (req, res) => {
  const { roomId, callerId, receiverId, status, timestamp, duration } = req.body;
  
  // Gerekli parametrelerin kontrolü
  if (!roomId || !callerId || !status) {
    return res.status(400).json({ error: 'roomId, callerId ve status alanları gerekli' });
  }
  
  // Log mesajını oluştur
  const logEntry = {
    id: Date.now().toString(),
    roomId,
    callerId,
    receiverId: receiverId || 'room',
    status, // 'started', 'ended', 'rejected', vb.
    timestamp: timestamp || new Date().toISOString(),
    duration,
    serviceId: 'webrtc-signaling'
  };
  
  // Log kaydı (gerçek entegrasyonda burada harici sisteme istek yapılabilir)
  logInfo(`📞 Harici API Log (Call): ${logEntry.callerId} -> ${logEntry.receiverId}: ${status}`);
  
  // Başarılı yanıt
  res.status(201).json({
    success: true,
    message: 'Görüşme log kaydı başarılı',
    logEntry
  });
});


// WebRTC ICE sunucuları yapılandırması için endpoint
app.get('/api/ice-servers', (req, res) => {
  res.json({ iceServers });
});

// Oda bağlantı durumları
app.get('/api/rooms/:roomId/connections', (req, res) => {
  const { roomId } = req.params;
  
  // Oda var mı kontrol et
  if (!rooms.has(roomId)) {
    return res.status(404).json({ error: 'Oda bulunamadı' });
  }
  
  // Bağlantı durumlarını al
  const connectionStatus = rooms.get(roomId).connectionStatus;
  if (!connectionStatus) {
    return res.json({ connections: [] });
  }
  
  // Bağlantı durumlarını dizi olarak dönüştür
  const connections = Array.from(connectionStatus.entries()).map(([key, value]) => {
    const [socketId1, socketId2] = key.split('-');
    return {
      connectionKey: key,
      peers: [socketId1, socketId2],
      status: value.status,
      updatedAt: value.updatedAt
    };
  });
  
  res.json({ 
    roomId, 
    connections,
    count: connections.length
  });
});

// Canlılık testi ve bağlantı hata ayıklama (diagnostics)
app.get('/api/diagnostics', (req, res) => {
  const diagnostics = {
    server: {
      uptime: process.uptime(),
      timestamp: Date.now(),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 + ' MB'
    },
    connections: {
      total: io.engine.clientsCount,
      rooms: rooms.size
    },
    socketDetails: Array.from(io.sockets.sockets.keys()).map(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      return {
        id: socketId,
        rooms: Array.from(socket.rooms || []),
        userData: socket.userData,
        connected: socket.connected,
        transport: socket.conn?.transport?.name || 'unknown'
      };
    }),
    roomData: Array.from(rooms.entries()).map(([roomId, room]) => ({
      roomId,
      createdAt: room.createdAt,
      messageCount: room.messages?.length || 0,
      participantsCount: room.participants?.size || 0,
      connectionsCount: room.connectionStatus?.size || 0
    }))
  };
  
  res.json(diagnostics);
});

// API üzerinden ICE sunucuları bilgisi
app.get('/api/check-stun-servers', async (req, res) => {
  try {
    // Client'ın raporladığı STUN sunucu durumlarını güncellemek için
    const { reports } = req.query;
    
    if (reports) {
      try {
        const reportData = JSON.parse(reports);
        
        // Client raporlarını işle
        if (Array.isArray(reportData)) {
          reportData.forEach(report => {
            if (report.url && typeof report.success === 'boolean') {
              // Sunucu sağlık durumunu güncelle
              const currentHealth = iceServerHealth.get(report.url) || { 
                success: 0, 
                failure: 0, 
                lastUpdated: Date.now() 
              };
              
              if (report.success) {
                currentHealth.success++;
              } else {
                currentHealth.failure++;
              }
              
              currentHealth.lastUpdated = Date.now();
              iceServerHealth.set(report.url, currentHealth);
            }
          });
          
          logInfo(`📊 STUN sunucu sağlık raporu güncellendi, ${reportData.length} sunucu`);
        }
      } catch (error) {
        logInfo(`❌ STUN sunucu raporu işleme hatası: ${error.message}`);
      }
    }
    
    // Varsa sağlık durumuna göre önceliklendirilmiş ICE sunucuları
    const healthBasedServers = Array.from(iceServerHealth.entries())
      .filter(([url, health]) => {
        // Son güncellemeden bu yana 1 saatten fazla geçmediyse ve başarı oranı %50'den yüksekse
        const isRecent = (Date.now() - health.lastUpdated) < 3600000; // 1 saat
        const totalAttempts = health.success + health.failure;
        const successRate = totalAttempts > 0 ? health.success / totalAttempts : 0;
        
        return isRecent && successRate > 0.5;
      })
      .sort(([, healthA], [, healthB]) => {
        // Başarı sayısına göre sırala
        return healthB.success - healthA.success;
      })
      .map(([url]) => ({ urls: url }));
    
    // Sağlık durumuna göre hiç sunucu bulunamadıysa varsayılan listeyi kullan
    const recommendedServers = healthBasedServers.length > 0 ? 
      healthBasedServers : 
      iceServers;
    
    res.json({
      status: 'success',
      message: 'Client tarafından raporlanabilecek STUN sunucuları',
      iceServers: recommendedServers
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'ICE sunucuları işlenemedi',
      message: error.message
    });
  }
});

// Genel hata yakalama middleware'i (tüm routeların sonunda olmalı)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Sunucu hatası oluştu' });
});

// Sunucuyu başlat
server.listen(PORT, '0.0.0.0', () => {
  logInfo(`🚀 Signaling Server ${PORT} portunda çalışıyor (HTTPS)`);
  logInfo(`📱 Yerel ağdan erişmek için: https://<yerel-ip-adresiniz>:${PORT}`);
  logInfo(`🔒 HTTPS üzerinden güvenli bağlantı sağlanıyor`);
});

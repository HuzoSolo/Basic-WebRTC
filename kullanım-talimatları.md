# WebRTC Sinyalleşme Servisi Kullanım Talimatları

Bu doküman, WebRTC sinyalleşme servisinin uygulamanıza nasıl entegre edileceğini ve kullanılacağını açıklamaktadır.

## İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Kurulum](#kurulum)
3. [API Referansı](#api-referansı)
4. [Socket.io Olayları](#socketio-olayları)
5. [Örnek İstemci Kodları](#örnek-istemci-kodları)
6. [Güvenlik ve Ölçeklendirme](#güvenlik-ve-ölçeklendirme)

## Genel Bakış

Bu servis, WebRTC bağlantılarının kurulması için gereken sinyalleşme işlemlerini gerçekleştiren hafif bir Node.js uygulamasıdır. Servis, aşağıdaki temel özelliklere sahiptir:

- Socket.io tabanlı gerçek zamanlı iletişim
- Oda tabanlı kullanıcı yönetimi
- REST API aracılığıyla oda yönetimi
- WebRTC sinyalleşme (SDP ve ICE aday değişimi)
- Odalar arası metin tabanlı chat desteği
- Kullanıcı bilgilerini saklama ve paylaşma
- Harici sistemlerle entegrasyon için API endpointleri
- Chat ve görüşme loglarını dış sistemlere aktarma

## Kurulum

### Önkoşullar

- Node.js (v12 veya üzeri)
- npm veya yarn

### Adımlar

1. Repo'yu klonlayın veya proje dosyalarını indirin:

```bash
git clone <repo-url>
cd <proje-dizini>
```

2. Bağımlılıkları yükleyin:

```bash
npm install
```

3. Çevre değişkenlerini ayarlayın (opsiyonel):

```bash
cp .env.example .env
# .env dosyasını düzenleyin
```

4. Sunucuyu başlatın:

```bash
npm start
```

Sunucu varsayılan olarak 2002 portunda çalışacaktır. Bu portu değiştirmek için `PORT` çevre değişkenini ayarlayabilirsiniz.

## API Referansı

### Oda Yönetimi

#### Oda Oluşturma

```
GET /create-room?roomId=<oda-id>
```

veya

```
POST /api/rooms
Content-Type: application/json

{
  "roomId": "<oda-id>"
}
```

**Yanıt:**

```json
{
  "message": "Room created",
  "roomId": "<oda-id>"
}
```

#### Oda Bulma

```
GET /find-room?roomId=<oda-id>
```

**Yanıt:**

```json
{
  "message": "Room found",
  "roomId": "<oda-id>"
}
```

#### Tüm Odaları Listeleme

```
GET /api/rooms
```

**Yanıt:**

```json
{
  "rooms": [
    {
      "roomId": "<oda-id-1>",
      "participants": 2,
      "createdAt": "2023-04-12T15:30:45.123Z"
    },
    {
      "roomId": "<oda-id-2>",
      "participants": 1,
      "createdAt": "2023-04-12T16:20:10.456Z"
    }
  ]
}
```

#### Oda Silme

```
DELETE /api/rooms/<oda-id>
```

**Yanıt:**

```json
{
  "message": "Oda silindi",
  "roomId": "<oda-id>"
}
```

#### Oda Katılımcılarını Görüntüleme

```
GET /api/rooms/<oda-id>/participants
```

**Yanıt:**

```json
{
  "roomId": "<oda-id>",
  "participants": ["<socket-id-1>", "<socket-id-2>"],
  "count": 2
}
```

### Servis Durumu

#### Basit Durum Kontrolü

```
GET /HealthCheck
```

**Yanıt:**

```json
{
  "message": "Server is running"
}
```

#### Detaylı Durum Kontrolü

```
GET /api/health
```

**Yanıt:**

```json
{
  "uptime": 3600,
  "timestamp": 1649774400000,
  "connections": 5,
  "rooms": 3,
  "memoryUsage": "42.5 MB"
}
```

### API Üzerinden Sinyal Gönderme

```
POST /api/signal
Content-Type: application/json
X-API-Key: <api-key>

{
  "roomId": "<oda-id>",
  "event": "<olay-adı>",
  "data": "<veri>",
  "targetId": "<hedef-socket-id>" // Opsiyonel, belirli bir kullanıcıya göndermek için
}
```

**Yanıt:**

```json
{
  "success": true,
  "message": "Sinyal gönderildi"
}
```

### Chat API Endpointleri

#### Oda Mesajlarını Listeleme

```
GET /api/rooms/:roomId/messages
```

**Yanıt:**

```json
{
  "roomId": "<oda-id>",
  "messages": [
    {
      "sender": {
        "id": "<gönderici-id>",
        "name": "<gönderici-adı>"
      },
      "text": "<mesaj-metni>",
      "timestamp": "2023-04-12T15:30:45.123Z"
    }
  ],
  "count": 1
}
```

#### Odaya Mesaj Gönderme

```
POST /api/rooms/:roomId/messages
Content-Type: application/json
X-API-Key: <api-key>

{
  "message": "<mesaj-metni>",
  "sender": {
    "id": "<gönderici-id>",
    "name": "<gönderici-adı>"
  }
}
```

**Yanıt:**

```json
{
  "success": true,
  "message": "Mesaj gönderildi",
  "messageData": {
    "sender": {
      "id": "<gönderici-id>",
      "name": "<gönderici-adı>"
    },
    "text": "<mesaj-metni>",
    "timestamp": "2023-04-12T15:30:45.123Z"
  }
}
```

### Harici Sistem Entegrasyonu Endpointleri

#### Chat Log Kaydetme

```
POST /api/external-logs/chat
Content-Type: application/json
X-API-Key: <api-key>

{
  "roomId": "<oda-id>",
  "senderId": "<gönderici-id>",
  "receiverId": "<alıcı-id>",
  "message": "<mesaj-metni>",
  "timestamp": "2023-04-12T15:30:45.123Z"
}
```

**Yanıt:**

```json
{
  "success": true,
  "message": "Chat log kaydı başarılı",
  "logEntry": {
    "id": "1681489845123",
    "roomId": "<oda-id>",
    "senderId": "<gönderici-id>",
    "receiverId": "<alıcı-id>",
    "message": "<mesaj-metni>",
    "timestamp": "2023-04-12T15:30:45.123Z",
    "serviceId": "webrtc-signaling"
  }
}
```

#### Görüşme Log Kaydetme

```
POST /api/external-logs/call
Content-Type: application/json
X-API-Key: <api-key>

{
  "roomId": "<oda-id>",
  "callerId": "<arayan-id>",
  "receiverId": "<aranan-id>",
  "status": "started|ended|rejected",
  "timestamp": "2023-04-12T15:30:45.123Z",
  "duration": 120
}
```

**Yanıt:**

```json
{
  "success": true,
  "message": "Görüşme log kaydı başarılı",
  "logEntry": {
    "id": "1681489845123",
    "roomId": "<oda-id>",
    "callerId": "<arayan-id>",
    "receiverId": "<aranan-id>",
    "status": "started|ended|rejected",
    "timestamp": "2023-04-12T15:30:45.123Z",
    "duration": 120,
    "serviceId": "webrtc-signaling"
  }
}
```

### Mock Veri Servisi Endpointleri

#### Kullanıcı Listesi

```
GET /api/mock/users
```

**Yanıt:**

```json
[
  {
    "id": "user1",
    "name": "Ahmet Yılmaz",
    "email": "ahmet@example.com",
    "avatar": "https://randomuser.me/api/portraits/men/1.jpg"
  },
  {
    "id": "user2",
    "name": "Ayşe Demir",
    "email": "ayse@example.com",
    "avatar": "https://randomuser.me/api/portraits/women/1.jpg"
  }
]
```

#### Belirli Bir Kullanıcı

```
GET /api/mock/users/:userId
```

**Yanıt:**

```json
{
  "id": "user1",
  "name": "Ahmet Yılmaz",
  "email": "ahmet@example.com",
  "avatar": "https://randomuser.me/api/portraits/men/1.jpg"
}
```

#### Chat Loglarını Görüntüleme

```
GET /api/mock/logs/chat
```

**Yanıt:**

```json
[
  {
    "id": "1681489845123",
    "roomId": "<oda-id>",
    "senderId": "<gönderici-id>",
    "receiverId": "<alıcı-id>",
    "message": "<mesaj-metni>",
    "timestamp": "2023-04-12T15:30:45.123Z"
  }
]
```

#### Görüşme Loglarını Görüntüleme

```
GET /api/mock/logs/call
```

**Yanıt:**

```json
[
  {
    "id": "1681489845123",
    "roomId": "<oda-id>",
    "callerId": "<arayan-id>",
    "receiverId": "<aranan-id>",
    "status": "started",
    "timestamp": "2023-04-12T15:30:45.123Z",
    "duration": 120
  }
]
```

## Socket.io Olayları

### İstemci Tarafından Yayınlanan Olaylar

| Olay | Veri | Açıklama |
|------|------|----------|
| `join` | `{ roomId: string, userData?: object }` | Bir odaya katılma isteği, isteğe bağlı kullanıcı bilgisi ile |
| `sdp` | `{ targetId: string, sdp: RTCSessionDescription }` | SDP teklifi veya cevabı gönderme |
| `ice-candidate` | `{ targetId: string, candidate: RTCIceCandidate }` | ICE aday bilgisi gönderme |
| `chat-message` | `{ roomId: string, message: string, userData?: object }` | Odaya mesaj gönderme |

### Sunucu Tarafından Yayınlanan Olaylar

| Olay | Veri | Açıklama |
|------|------|----------|
| `new-peer` | `{ socketId: string, userData?: object }` | Odaya yeni bir kullanıcı katıldığında, kullanıcı bilgisi ile |
| `sdp` | `{ senderId: string, sdp: RTCSessionDescription }` | SDP teklifi veya cevabı alındığında |
| `ice-candidate` | `{ senderId: string, candidate: RTCIceCandidate }` | ICE aday bilgisi alındığında |
| `chat-message` | `{ sender: object, text: string, timestamp: string }` | Odaya yeni bir mesaj geldiğinde |
| `chat-history` | `Array<Message>` | Odaya katılım sonrası mesaj geçmişi alındığında |

## Örnek İstemci Kodları

### Socket.io İle Bağlantı Kurma

```javascript
const socket = io('http://localhost:2002');

socket.on('connect', () => {
  console.log('Bağlandı:', socket.id);
});
```

### Odaya Katılma

```javascript
// Odaya katılma
socket.emit('join', { roomId: 'test-room' });

// Yeni kullanıcı olayını dinleme
socket.on('new-peer', ({ socketId }) => {
  console.log('Yeni kullanıcı katıldı:', socketId);
  // WebRTC bağlantısını başlat
});
```

### WebRTC Sinyalleşmesi

```javascript
// SDP teklifi gönderme
socket.emit('sdp', {
  targetId: peerSocketId,
  sdp: peerConnection.localDescription
});

// SDP teklifi veya cevabı alma
socket.on('sdp', async ({ senderId, sdp }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
  
  if (sdp.type === 'offer') {
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.emit('sdp', {
      targetId: senderId,
      sdp: peerConnection.localDescription
    });
  }
});

// ICE aday bilgisi gönderme
peerConnection.onicecandidate = event => {
  if (event.candidate) {
    socket.emit('ice-candidate', {
      targetId: peerSocketId,
      candidate: event.candidate
    });
  }
};

// ICE aday bilgisi alma
socket.on('ice-candidate', ({ senderId, candidate }) => {
  peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});
```

### Chat Mesajları

```javascript
// Kullanıcı bilgisi
const userData = {
  id: 'user_' + Math.random().toString(36).substr(2, 9),
  name: 'Kullanıcı_' + Math.floor(Math.random() * 1000)
};

// Mesaj gönderme
function sendMessage(messageText) {
  if (messageText.trim() === '') return;
  
  socket.emit('chat-message', {
    roomId: 'test-room',
    message: messageText,
    userData
  });
}

// Mesaj alma
socket.on('chat-message', (messageData) => {
  console.log('Yeni mesaj:', messageData);
  // Mesajı ekranda göster
  displayMessage(messageData);
});

// Mesaj geçmişi alma
socket.on('chat-history', (messages) => {
  console.log('Mesaj geçmişi alındı:', messages);
  // Geçmiş mesajları göster
  messages.forEach(msg => displayMessage(msg));
});

// Örnek bir mesaj gösterme fonksiyonu
function displayMessage(messageData) {
  const isOwnMessage = messageData.sender.id === userData.id;
  
  console.log(`${isOwnMessage ? 'Ben' : messageData.sender.name}: ${messageData.text}`);
  // Burada mesajı UI'da gösterme kodlarınız olacak
}

// Örnek mesaj gönderme
document.getElementById('sendButton').addEventListener('click', () => {
  const input = document.getElementById('messageInput');
  sendMessage(input.value);
  input.value = '';
});
```

### Kullanıcı Giriş Yönetimi

```javascript
// HTML Yapısı
// <div id="userLoginModal">
//   <form id="userForm">
//     <input type="text" id="userName" placeholder="Adınız" required>
//     <button type="submit">Giriş Yap</button>
//   </form>
// </div>

// DOM Elementleri
const userLoginModal = document.getElementById('userLoginModal');
const userForm = document.getElementById('userForm');
const userNameInput = document.getElementById('userName');

// Kullanıcı Bilgisi
let userData = {
  id: 'user_' + Math.random().toString(36).substr(2, 9)
};

// Kullanıcı Girişi
userForm.addEventListener('submit', (event) => {
  event.preventDefault();
  
  const userName = userNameInput.value.trim();
  if (!userName) {
    alert('Lütfen adınızı girin');
    return;
  }
  
  // Kullanıcı bilgilerini güncelle
  userData.name = userName;
  
  // Modalı gizle
  userLoginModal.style.display = 'none';
  
  // Kullanıcı girişi tamamlandığında yapılacak işlemler
  console.log('Kullanıcı girişi yapıldı:', userData);
  initializeApp(); // Uygulamayı başlat
});

// Uygulama başlatma fonksiyonu
function initializeApp() {
  // Odaya katılma
  socket.emit('join', {
    roomId: 'test-room',
    userData
  });
  
  // Diğer başlatma işlemleri
}
```

### Harici Sistem Entegrasyonu

```javascript
// Chat mesajlarını harici sisteme loglama
async function logChatMessage(messageText, roomId) {
  try {
    const response = await fetch('/api/external-logs/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'your-api-key' // Gerçek uygulamada güvenli bir şekilde saklanmalı
      },
      body: JSON.stringify({
        roomId,
        senderId: userData.id,
        message: messageText,
        timestamp: new Date().toISOString()
      })
    });
    
    const result = await response.json();
    console.log('Mesaj log sonucu:', result);
  } catch (error) {
    console.error('Mesaj log hatası:', error);
  }
}

// Görüşme başlangıç/bitiş logları
async function logCallEvent(status, targetId, roomId) {
  try {
    const response = await fetch('/api/external-logs/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'your-api-key' // Gerçek uygulamada güvenli bir şekilde saklanmalı
      },
      body: JSON.stringify({
        roomId,
        callerId: userData.id,
        receiverId: targetId,
        status, // 'started', 'ended', 'rejected'
        timestamp: new Date().toISOString()
      })
    });
    
    const result = await response.json();
    console.log('Görüşme log sonucu:', result);
  } catch (error) {
    console.error('Görüşme log hatası:', error);
  }
}

// Kullanım örnekleri
function sendChatMessage(text) {
  // Mesajı gönder
  socket.emit('chat-message', {
    roomId: 'test-room',
    message: text,
    userData
  });
  
  // Mesajı logla
  logChatMessage(text, 'test-room');
}

// Peer bağlantısı kurulduğunda
socket.on('new-peer', ({ socketId }) => {
  console.log('Yeni kullanıcı katıldı:', socketId);
  
  // Görüşme başlangıcını logla
  logCallEvent('started', socketId, 'test-room');
  
  // WebRTC bağlantısını başlat...
});

// Peer ayrıldığında
socket.on('peer-left', ({ socketId }) => {
  console.log('Kullanıcı ayrıldı:', socketId);
  
  // Görüşme bitişini logla  
  logCallEvent('ended', socketId, 'test-room');
});
```

## Güvenlik ve Ölçeklendirme

### API Güvenliği

Güvenlik için, `/api` altındaki tüm endpoint'ler API anahtarı doğrulamasıyla korunabilir. Üretim ortamında şu adımları izleyin:

1. `.env` dosyasında güçlü bir API anahtarı belirleyin:
   ```
   API_KEY=your-strong-api-key
   ```

2. İstek yaparken `X-API-Key` header'ını ekleyin:
   ```
   X-API-Key: your-strong-api-key
   ```

3. `index.js` dosyasında API anahtarı doğrulama middleware'ini aktifleştirin (yorum satırlarını kaldırın).

### Ölçeklendirme

Tek sunucu birden fazla istemci için yeterli olabilir, ancak daha büyük ölçekte aşağıdaki adımlar önerilir:

1. Socket.io'yu Redis adaptörü ile yapılandırın
2. Birden fazla sunucu örneği çalıştırın
3. Bir yük dengeleyici kullanın

### STUN/TURN Sunucuları

NAT arkasındaki istemciler için, şu STUN/TURN sunucu ayarlarını kullanın:

```javascript
const peerConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Kendi TURN sunucularınızı ekleyin
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'username',
      credential: 'credential'
    }
  ]
};
```

## Test Uygulaması

Sunucuyu başlattıktan sonra, tarayıcıdan `http://localhost:2002` adresine giderek test uygulamasını kullanabilirsiniz. Bu uygulama, WebRTC video görüşmesini test etmenizi sağlar.

---

Bu doküman hakkında sorularınız veya önerileriniz varsa, lütfen iletişime geçin. 
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname)); // HTML dosyasını sunar

// --- OYUN VERİLERİ ---
let players = {}; // Oyuncular { socketId: { name, role, isAlive, team } }
let gamePhase = 'LOBBY'; // LOBBY, DAY, NIGHT

// Senin Belirlediğin Roller
const ROLES_CONFIG = [
    { name: 'Seri Katil', team: 'SOLO' },
    { name: 'Bombacı', team: 'SOLO' },
    { name: 'Medyum', team: 'SOLO' }, // Solo olarak işaretledim ama Nötr de olabilir
    { name: 'Deli', team: 'SOLO' },
    { name: 'Doktor', team: 'KOY' },
    { name: 'Dedektif', team: 'KOY' },
    { name: 'Hain Polis', team: 'HAIN' },
    { name: 'Tuzakçı', team: 'KOY' },
    // Listeyi uzatabilirsin...
];

io.on('connection', (socket) => {
    console.log('Biri bağlandı:', socket.id);

    // 1. Oyuna Giriş
    socket.on('login', (username) => {
        players[socket.id] = {
            id: socket.id,
            name: username,
            role: 'Sivil', // Henüz rol yok
            team: 'KOY',
            isAlive: true,
            target: null, // Gece kimi seçti?
            avatarColor: '#' + Math.floor(Math.random()*16777215).toString(16) // Rastgele renk
        };
        io.emit('updateGame', players);
    });

    // 2. Oyunu Başlat (Rolleri Dağıt)
    socket.on('startGame', () => {
        const playerIds = Object.keys(players);
        if (playerIds.length < 2) return; // En az 2 kişi lazım test için

        // Rolleri karıştır ve dağıt
        playerIds.forEach((id, index) => {
            // Basit dağıtım: Listeden sırayla veya rastgele seçilir
            const roleInfo = ROLES_CONFIG[index % ROLES_CONFIG.length];
            players[id].role = roleInfo.name;
            players[id].team = roleInfo.team;
            
            // Oyuncuya özel mesaj at: Senin rolün bu!
            io.to(id).emit('systemMessage', `Rolün: ${roleInfo.name} (Takım: ${roleInfo.team})`);
        });

        gamePhase = 'NIGHT'; // Oyun gece başlar
        io.emit('phaseChange', 'GECE');
        io.emit('systemMessage', 'Gece oldu. Aksiyonunu seç!');
        io.emit('updateGame', players);
    });

    // 3. Gece Aksiyonu (Tıklama)
    socket.on('nightAction', (targetId) => {
        if (gamePhase !== 'NIGHT') return;
        const actor = players[socket.id];
        
        if (actor && actor.isAlive) {
            actor.target = targetId;
            socket.emit('systemMessage', `${players[targetId].name} adlı kişiyi seçtin.`);
        }
    });

    // 4. Geceyi Bitir ve Hesapla (Yönetici butonuyla tetiklenir varsayalım)
    socket.on('endNight', () => {
        resolveNight();
        gamePhase = 'DAY';
        io.emit('phaseChange', 'GÜNDÜZ');
        io.emit('updateGame', players);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updateGame', players);
    });
});

// --- ÖNEMLİ: MEDYUM VE ÖLÜM MANTIĞI ---
function resolveNight() {
    let log = [];

    Object.values(players).forEach(actor => {
        if (!actor.target || !actor.isAlive) return;

        const target = players[actor.target];

        // Kural: Medyum
        if (actor.role === 'Medyum') {
            // Eğer hedef ölüyse canlandırmayı dener
            if (!target.isAlive) {
                // Eğer Hain veya Solo takımındaysa Medyum ölür!
                if (target.team === 'HAIN' || target.team === 'SOLO') {
                    actor.isAlive = false;
                    log.push(`Medyum ${actor.name}, kötü bir ruhu (${target.name}) canlandırmaya çalışırken öldü!`);
                } else {
                    target.isAlive = true;
                    log.push(`${target.name} hayata döndürüldü!`);
                }
            } else {
                 // Medyum yaşayan birini seçerse bir şey olmaz veya sadece konuşur
            }
        }

        // Kural: Seri Katil
        if (actor.role === 'Seri Katil') {
            target.isAlive = false;
            log.push(`${target.name} vahşice katledildi.`);
        }

        // Aksiyonu sıfırla
        actor.target = null;
    });

    io.emit('nightResult', log);
}

server.listen(3000, () => {
    console.log('Oyun http://localhost:3000 adresinde başladı.');
});
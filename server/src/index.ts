import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

const app = express();
const serverHttp = http.createServer(app);

const io = new SocketIOServer(serverHttp, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

// თამაშის პარამეტრები
const GAME_AREA_WIDTH = 600;
const GAME_AREA_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 100;
const BALL_RADIUS = 8;
const PADDLE_SPEED_EFFECT = 1.2; // რამდენად იმოქმედებს paddle-ის სიჩქარე ბურთის კუთხეზე
const INITIAL_BALL_SPEED_X = 4;
const INITIAL_BALL_SPEED_Y = 4;
const MAX_BALL_SPEED_Y = 8; // ბურთის მაქსიმალური ვერტიკალური სიჩქარე
const WINNING_SCORE = 5;
const BALL_SPEED_INCREMENT = 0.2; // რამდენით გაიზარდოს X სიჩქარე ყოველ დარტყმაზე
const MAX_BALL_SPEED_X = 10;    // ბურთის მაქსიმალური ჰორიზონტალური სიჩქარე

interface Player {
    id: string;
    name: string;
    y: number; // Paddle-ის Y პოზიცია
    score: number;
}

interface Ball {
    x: number;
    y: number;
    speedX: number;
    speedY: number;
    initialSpeedX: number; // დავამატოთ ეს
    initialSpeedY: number; // დავამატოთ ეს
    radius: number;
}


interface GameRoom {
    player1: Player;
    player2: Player;
    ball: Ball;
    gameInterval: NodeJS.Timeout | null; // თამაშის ციკლისთვის
    lastPaddleHit: number; // 1 for player1, 2 for player2, 0 initially
}

let waitingPlayer: {id: string, name: string} | null = null; // მხოლოდ ID და სახელი მომლოდინესთვის
let gameRooms: Map<string, GameRoom> = new Map(); // roomId -> GameRoom

function initializeBall(): Ball {
    const baseSpeedX = Math.random() > 0.5 ? INITIAL_BALL_SPEED_X : -INITIAL_BALL_SPEED_X;
    const baseSpeedY = Math.random() > 0.5 ? INITIAL_BALL_SPEED_Y : -INITIAL_BALL_SPEED_Y;
    return {
        x: GAME_AREA_WIDTH / 2,
        y: GAME_AREA_HEIGHT / 2,
        speedX: baseSpeedX,
        speedY: baseSpeedY,
        initialSpeedX: Math.abs(baseSpeedX), // შევინახოთ აბსოლუტური მნიშვნელობა
        initialSpeedY: Math.abs(baseSpeedY), // შევინახოთ აბსოლუტური მნიშვნელობა
        radius: BALL_RADIUS,
    };
}

function startGameLoop(roomId: string) {
    const room = gameRooms.get(roomId);
    if (!room) return;

    if (room.gameInterval) {
        clearInterval(room.gameInterval); // გავასუფთაოთ ძველი ინტერვალი, თუ არსებობს
    }

    room.ball = initializeBall(); // ყოველი ახალი რაუნდისთვის ბურთი ცენტრში
    room.lastPaddleHit = 0;


    room.gameInterval = setInterval(() => {
        const currentRoom = gameRooms.get(roomId); // ავიღოთ განახლებული ოთახი
        if (!currentRoom) {
            // თუ ოთახი აღარ არსებობს, გავაჩეროთ ციკლი
            if(room.gameInterval) clearInterval(room.gameInterval);
            return;
        }

        const { player1, player2, ball } = currentRoom;

        // ბურთის მოძრაობა
        ball.x += ball.speedX;
        ball.y += ball.speedY;

        // კედლებთან შეჯახება (ზედა/ქვედა)
        if (ball.y - ball.radius < 0 || ball.y + ball.radius > GAME_AREA_HEIGHT) {
            ball.speedY *= -1;
            // დავრწმუნდეთ, რომ ბურთი არ "გაიჭედოს" კედელში
            if (ball.y - ball.radius < 0) ball.y = ball.radius;
            if (ball.y + ball.radius > GAME_AREA_HEIGHT) ball.y = GAME_AREA_HEIGHT - ball.radius;
            io.to(roomId).emit('playSound', 'wallHit');
        }

        // Paddle-ებთან შეჯახება
        // Player 1 (მარცხენა paddle)
        if (ball.speedX < 0 && // ბურთი მოძრაობს მარცხნივ
            ball.x - ball.radius < (20 + PADDLE_WIDTH) && // 20 არის paddle-ის დაშორება კედლიდან
            ball.x + ball.radius > 20 &&
            ball.y + ball.radius > player1.y &&
            ball.y - ball.radius < player1.y + PADDLE_HEIGHT &&
            currentRoom.lastPaddleHit !== 1 // თავიდან ავიცილოთ ორმაგი დარტყმა
            ) {
            ball.speedX *= -1;
             if (Math.abs(ball.speedX) < MAX_BALL_SPEED_X) {
            ball.speedX += (ball.speedX > 0 ? BALL_SPEED_INCREMENT : -BALL_SPEED_INCREMENT);
            }
            // ბურთის Y სიჩქარის შეცვლა იმის მიხედვით, paddle-ის რომელ ნაწილს მოხვდა
            let deltaY = ball.y - (player1.y + PADDLE_HEIGHT / 2);
            ball.speedY = deltaY * 0.35; // კოეფიციენტი ასხლეტის კუთხის შესაცვლელად
            if (ball.speedY > MAX_BALL_SPEED_Y) ball.speedY = MAX_BALL_SPEED_Y;
            if (ball.speedY < -MAX_BALL_SPEED_Y) ball.speedY = -MAX_BALL_SPEED_Y;
            currentRoom.lastPaddleHit = 1;
            ball.x = 20 + PADDLE_WIDTH + ball.radius; // ბურთი paddle-ის გარეთ
            io.to(roomId).emit('playSound', 'paddleHit');
        }

        // Player 2 (მარჯვენა paddle)
        if (ball.speedX > 0 && // ბურთი მოძრაობს მარჯვნივ
            ball.x + ball.radius > (GAME_AREA_WIDTH - 20 - PADDLE_WIDTH) &&
            ball.x - ball.radius < (GAME_AREA_WIDTH - 20) &&
            ball.y + ball.radius > player2.y &&
            ball.y - ball.radius < player2.y + PADDLE_HEIGHT &&
            currentRoom.lastPaddleHit !== 2 // თავიდან ავიცილოთ ორმაგი დარტყმა
            ) {
            ball.speedX *= -1;
            if (Math.abs(ball.speedX) < MAX_BALL_SPEED_X) {
            ball.speedX += (ball.speedX > 0 ? BALL_SPEED_INCREMENT : -BALL_SPEED_INCREMENT);
            }
            let deltaY = ball.y - (player2.y + PADDLE_HEIGHT / 2);
            ball.speedY = deltaY * 0.35;
            if (ball.speedY > MAX_BALL_SPEED_Y) ball.speedY = MAX_BALL_SPEED_Y;
            if (ball.speedY < -MAX_BALL_SPEED_Y) ball.speedY = -MAX_BALL_SPEED_Y;
            currentRoom.lastPaddleHit = 2;
            ball.x = GAME_AREA_WIDTH - 20 - PADDLE_WIDTH - ball.radius; // ბურთი paddle-ის გარეთ
            io.to(roomId).emit('playSound', 'paddleHit');
        }


        // ქულის აღება
        if (ball.x - ball.radius < 0) { // Player 2 იღებს ქულას
            player2.score++;
            io.to(roomId).emit('scoreUpdate', { player1Score: player1.score, player2Score: player2.score });
            if (player2.score >= WINNING_SCORE) {
                io.to(roomId).emit('gameOver', { winnerName: player2.name });
                if(currentRoom.gameInterval) clearInterval(currentRoom.gameInterval);
                currentRoom.gameInterval = null; // შევაჩეროთ თამაში
                // gameRooms.delete(roomId); // ოთახის წაშლა მოგვიანებით, ან reset
                return; // გავაჩეროთ ამ ციკლის შესრულება
            }
            currentRoom.ball = initializeBall(); // ახალი რაუნდი
            currentRoom.lastPaddleHit = 0;

        } else if (ball.x + ball.radius > GAME_AREA_WIDTH) { // Player 1 იღებს ქულას
            player1.score++;
            io.to(roomId).emit('scoreUpdate', { player1Score: player1.score, player2Score: player2.score });
            if (player1.score >= WINNING_SCORE) {
                io.to(roomId).emit('gameOver', { winnerName: player1.name });
                if(currentRoom.gameInterval) clearInterval(currentRoom.gameInterval);
                currentRoom.gameInterval = null;
                // gameRooms.delete(roomId);
                return;
            }
            currentRoom.ball = initializeBall(); // ახალი რაუნდი
            currentRoom.lastPaddleHit = 0;
        }


        // განახლებული თამაშის მდგომარეობის გაგზავნა კლიენტებისთვის
        // მხოლოდ ბურთის და paddle-ების პოზიციები, ანგარიში ცალკე იგზავნება
        io.to(roomId).emit('gameStateUpdate', {
            ballX: ball.x,
            ballY: ball.y,
            player1Y: player1.y,
            player2Y: player2.y
        });

    }, 1000 / 60); // დაახლოებით 60 კადრი წამში
}


app.get('/', (req, res) => {
    res.send('Ping Pong Server is running!');
});

io.on('connection', (socket: Socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinGame', (playerName: string) => {
        console.log(`Player ${playerName} (id: ${socket.id}) wants to join.`);
        const initialPaddleY = GAME_AREA_HEIGHT / 2 - PADDLE_HEIGHT / 2;

        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const p1Info = waitingPlayer;
            waitingPlayer = null;

            const player1: Player = { id: p1Info.id, name: p1Info.name, y: initialPaddleY, score: 0 };
            const player2: Player = { id: socket.id, name: playerName, y: initialPaddleY, score: 0 };

            const roomId = `room-${player1.id}-${player2.id}`;

            const newRoom: GameRoom = {
                player1,
                player2,
                ball: initializeBall(),
                gameInterval: null,
                lastPaddleHit: 0
            };
            gameRooms.set(roomId, newRoom);

            socket.join(roomId);
            const waitingPlayerSocket = io.sockets.sockets.get(player1.id);
            if (waitingPlayerSocket) {
                waitingPlayerSocket.join(roomId);
            } else {
                console.error(`Could not find waiting player's socket: ${player1.id}`);
                waitingPlayer = {id: socket.id, name: playerName}; // მიმდინარე ისევ მომლოდინედ
                socket.emit('waitingForPlayer');
                return;
            }

            console.log(`Game started in room ${roomId} between ${player1.name} and ${player2.name}`);

            const gameStartDataP1 = {
                roomId,
                opponentName: player2.name,
                isPlayer1: true,
                player1Name: player1.name,
                player2Name: player2.name,
            };
            const gameStartDataP2 = {
                roomId,
                opponentName: player1.name,
                isPlayer1: false,
                player1Name: player1.name,
                player2Name: player2.name,
            };

            io.to(player1.id).emit('gameStart', gameStartDataP1);
            io.to(player2.id).emit('gameStart', gameStartDataP2);

            io.to(roomId).emit('getReady'); // შეატყობინე კლიენტებს, რომ მოემზადონ

            let countdown = 3; // 3 წამიანი უკუთვლა
            const countdownInterval = setInterval(() => {
                if (countdown > 0) {
                    io.to(roomId).emit('countdown', countdown);
                    countdown--;
                } else {
                    clearInterval(countdownInterval);
                    io.to(roomId).emit('countdown', "GO!"); // ან უბრალოდ 'play'
                    // ახლა დაიწყე თამაშის ციკლი
                    const currentRoom = gameRooms.get(roomId);
                    if (currentRoom) { // დარწმუნდი, რომ ოთახი ისევ არსებობს
                        startGameLoop(roomId); // <<<--- startGameLoop აქ გადმოვიდა
                    }
                }
            }, 1000);

        } else if (waitingPlayer && waitingPlayer.id === socket.id) {
            console.log(`Player ${playerName} is already waiting.`);
            socket.emit('waitingForPlayer');
        }
        else {
            waitingPlayer = { id: socket.id, name: playerName };
            console.log(`Player ${playerName} (id: ${socket.id}) is now waiting.`);
            socket.emit('waitingForPlayer');
        }
    });

    socket.on('paddleMove', (data: { roomId: string, y: number }) => {
        const room = gameRooms.get(data.roomId);
        if (room) {
            if (room.player1.id === socket.id) {
                room.player1.y = data.y;
            } else if (room.player2.id === socket.id) {
                room.player2.y = data.y;
            }
            // არ ვგზავნით paddle-ის პოზიციას პირდაპირ აქედან, gameStateUpdate ამას გააკეთებს
            // socket.to(data.roomId).emit('opponentPaddleMove', { y: data.y });
        }
    });


    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            console.log('Waiting player disconnected and removed.');
        } else {
            gameRooms.forEach((room, roomId) => {
                if (room.player1.id === socket.id || room.player2.id === socket.id) {
                    console.log(`Player ${socket.id} disconnected from room ${roomId}`);
                    if (room.gameInterval) {
                        clearInterval(room.gameInterval); // გავაჩეროთ თამაშის ციკლი
                    }
                    const opponentSocketId = room.player1.id === socket.id ? room.player2.id : room.player1.id;
                    io.to(opponentSocketId).emit('opponentLeft'); // შევატყობინოთ მეორეს
                    gameRooms.delete(roomId); // წავშალოთ ოთახი
                    console.log(`Room ${roomId} closed.`);

                    // თუ მომლოდინე მოთამაშე არ გვყავს და ოთახი დაიშალა, შეგვიძლია დარჩენილი
                    // მოთამაშე გადავიყვანოთ მომლოდინეთა სიაში, თუ ის ისევ დაკავშირებულია.
                    const remainingPlayerSocket = io.sockets.sockets.get(opponentSocketId);
                    if(remainingPlayerSocket && !waitingPlayer) {
                        const playerInfo = gameRooms.get(roomId); // ეს უკვე წაშლილია, სახელი გვჭირდება
                        // სახელი აღარ ვიცით ზუსტად, ამიტომ კლიენტმა ხელახლა უნდა გააკეთოს join
                        // waitingPlayer = {id: opponentSocketId, name: "RemainingPlayer"};
                        // io.to(opponentSocketId).emit('waitingForPlayer');
                        // console.log(`Player ${opponentSocketId} moved to waiting list.`);
                    }

                }
            });
        }
    });
});

serverHttp.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
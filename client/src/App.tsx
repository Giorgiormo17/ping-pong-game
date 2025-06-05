import React, { useEffect, useState, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import './App.css';

const SERVER_URL = "http://localhost:3001";

const GAME_AREA_WIDTH = 600;
const GAME_AREA_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 100;
const BALL_RADIUS = 8;

interface GameStartData {
  roomId: string;
  opponentName: string;
  isPlayer1: boolean;
  player1Name: string;
  player2Name: string;
}

// თამაშის მდგომარეობა, რომელსაც სერვერიდან ვიღებთ
interface GameStateUpdate {
    ballX: number;
    ballY: number;
    player1Y: number;
    player2Y: number;
}

// ანგარიშის განახლებისთვის
interface ScoreUpdate {
    player1Score: number;
    player2Score: number;
}

// client/src/App.tsx

// ... (ყველა import და საწყისი განსაზღვრება იგივე რჩება) ...

// ****** ხმოვანი ეფექტების აუდიო ობიექტების შექმნა ******
// ეს ობიექტები იქმნება ერთხელ, კომპონენტის გარეთ ან useRef-ით კომპონენტის შიგნით,
// რათა თავიდან ავიცილოთ მათი ხელახალი შექმნა ყოველ re-render-ზე.
// ბილიკები იწყება /–ით, რადგან ფაილები public ფოლდერშია.
const paddleHitSound = new Audio('/sounds/paddle_hit.mp3'); 
const wallHitSound = new Audio('/sounds/wall_hit.mp3');     
const scoreSound = new Audio('/sounds/score_point.mp3');   

// ხმის დაკვრის ფუნქცია (შეცდომების დასამუშავებლად)
const playSound = (audioElement: HTMLAudioElement) => {
  // შევაჩეროთ წინა დაკვრა და თავიდან დავიწყოთ, თუ სწრაფად ხდება ივენთები
  audioElement.currentTime = 0;
  audioElement.play().catch(error => {
    // ზოგი ბრაუზერი ბლოკავს ავტომატურ დაკვრას მომხმარებლის ინტერაქციის გარეშე
    // console.warn("Audio play failed:", error);
  });
};

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [gameMessage, setGameMessage] = useState<string>("");
  const [isInGame, setIsInGame] = useState<boolean>(false);
  const [gameData, setGameData] = useState<GameStartData | null>(null);

  const initialPaddleY = GAME_AREA_HEIGHT / 2 - PADDLE_HEIGHT / 2;
  // Paddle-ების და ბურთის პოზიციები ახლა იმართება gameState-ით
   const [countdownMessage, setCountdownMessage] = useState<string>("");
  const [paddle1Y, setPaddle1Y] = useState<number>(initialPaddleY);
  const [paddle2Y, setPaddle2Y] = useState<number>(initialPaddleY);
  const [ballX, setBallX] = useState<number>(GAME_AREA_WIDTH / 2);
  const [ballY, setBallY] = useState<number>(GAME_AREA_HEIGHT / 2);

  // ანგარიში
  const [player1Score, setPlayer1Score] = useState<number>(0);
  const [player2Score, setPlayer2Score] = useState<number>(0);


  const gameAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);
    
    newSocket.on('playSound', (soundType: string) => {
        if (soundType === 'wallHit') {
            playSound(wallHitSound);
        } else if (soundType === 'paddleHit') {
            playSound(paddleHitSound);
        }
    });

    newSocket.on('connect', () => console.log('Connected to server! Socket ID:', newSocket.id));
    newSocket.on('disconnect', () => {
      console.log('Disconnected');
      setGameMessage("Disconnected");
      setIsInGame(false); setGameData(null);
    });
    newSocket.on('waitingForPlayer', () => {
      console.log('Waiting for player...');
      setGameMessage('Waiting for player...');
      setIsInGame(false); setGameData(null);
    });

     // ****** useEffect-ის შიგნით, newSocket.on('gameStart', ...) ლისენერის შესწორება ******
    newSocket.on('gameStart', (data: GameStartData) => { // <--- აქ შევცვალეთ ტიპი GameStartData-თი
      console.log('Game started (pending ready)!', data);
      // ახლა data.opponentName, data.isPlayer1, data.player1Name, data.player2Name სწორად იმუშავებს
      setGameMessage(`Game with ${data.opponentName}! You are ${data.isPlayer1 ? data.player1Name : data.player2Name}.`);
      setIsInGame(true);
      setGameData(data); // ახლა data სწორი ტიპისაა setGameData-თვის
      setPlayer1Score(0);
      setPlayer2Score(0);
      setCountdownMessage("");
    });
    // ****** newSocket.on('gameStart', ...) ლისენერის შესწორების დასასრული ******
    newSocket.on('getReady', () => {
        console.log("Get Ready signal received");
        setCountdownMessage("Get Ready!");
        setBallX(GAME_AREA_WIDTH / 2);
        setBallY(GAME_AREA_HEIGHT / 2);
        const initialPaddleYPos = GAME_AREA_HEIGHT / 2 - PADDLE_HEIGHT / 2;
        setPaddle1Y(initialPaddleYPos);
        setPaddle2Y(initialPaddleYPos);
    });

    newSocket.on('countdown', (count: number | string) => {
        console.log("Countdown:", count);
        if (typeof count === 'number') {
            setCountdownMessage(String(count));
        } else {
            setCountdownMessage(count); // "GO!"
            setTimeout(() => setCountdownMessage(""), 1000);
        }
    });
    // მთავარი ივენთი თამაშის მდგომარეობის მისაღებად
    newSocket.on('gameStateUpdate', (data: GameStateUpdate) => {
      // console.log('GameStateUpdate:', data);
      setBallX(data.ballX);
      setBallY(data.ballY);
      setPaddle1Y(data.player1Y);
      setPaddle2Y(data.player2Y);
    });

    newSocket.on('scoreUpdate', (data: ScoreUpdate) => {
        setPlayer1Score(data.player1Score);
        setPlayer2Score(data.player2Score);
    });

    newSocket.on('gameOver', (data: { winnerName: string }) => {
        setGameMessage(`${data.winnerName} wins! Play again?`);
        setIsInGame(false);
        setGameData(null); // თამაში დასრულდა, შეიძლება შევთავაზოთ ხელახლა თამაში
        // აქ შეიძლება დავამატოთ "Play Again" ღილაკი, რომელიც ხელახლა გააკეთებს 'joinGame'-ს
    });


    newSocket.on('opponentLeft', () => {
      console.log('Opponent left.');
      setGameMessage('Opponent left. Join again?');
      setIsInGame(false); setGameData(null);
    });

    return () => { newSocket.disconnect(); };
  }, []);

  const handleJoinGame = () => {
    if (playerName.trim() && socket) {
      socket.emit('joinGame', playerName.trim());
      setGameMessage("Joining game..."); // შეტყობინება გაწევრიანებისას
    } else if (!playerName.trim()){
      alert("Please enter your name!");
    } else {
      alert("Not connected yet.");
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isInGame || !socket || !gameData || !gameAreaRef.current) return;
    const gameAreaRect = gameAreaRef.current.getBoundingClientRect();
    let mouseY = event.clientY - gameAreaRect.top;
    let newPaddleY = mouseY - PADDLE_HEIGHT / 2;
    if (newPaddleY < 0) newPaddleY = 0;
    if (newPaddleY > GAME_AREA_HEIGHT - PADDLE_HEIGHT) newPaddleY = GAME_AREA_HEIGHT - PADDLE_HEIGHT;

    // განვაახლოთ ლოკალური paddle-ის state-ი დაუყოვნებლივ უკეთესი რეაგირებისთვის,
    // სერვერი მაინც გამოგზავნის ავტორიტეტულ პოზიციას gameStateUpdate-ში.
    if (gameData.isPlayer1) {
      setPaddle1Y(newPaddleY);
    } else {
      setPaddle2Y(newPaddleY);
    }
    socket.emit('paddleMove', { roomId: gameData.roomId, y: newPaddleY });
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Ping Pong Game</h1>
        {!isInGame && !gameMessage.startsWith("Waiting") && !gameMessage.includes("wins!") && !gameMessage.startsWith("Joining") ? (
          <div>
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              style={{ padding: '10px', marginRight: '10px', fontSize: '16px' }}
            />
            <button onClick={handleJoinGame} style={{ padding: '10px 20px', fontSize: '16px' }}>
              Join Game
            </button>
          </div>
        ) : null}
        {/* Play Again ღილაკი, თუ თამაში დასრულდა */}
        {gameMessage.includes("wins!") || gameMessage.includes("Opponent left") ? (
             <button onClick={() => {
                setGameMessage(""); // გავასუფთავოთ შეტყობინება, რომ ფორმა გამოჩნდეს
                // არ არის საჭირო setIsInGame(false), რადგან უკვე false-ია
             }} style={{ padding: '10px 20px', fontSize: '16px', marginTop: '10px' }}>
             Play Again / Find New Game
           </button>
        ): null}


        {gameMessage && !countdownMessage && <p>{gameMessage}</p>}

        {countdownMessage && (
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '72px',
                color: 'white',
                zIndex: 10,
                backgroundColor: 'rgba(0,0,0,0.7)', // გავამუქე ფონი
                padding: '20px 40px', // გავზარდე padding
                borderRadius: '15px', // გავზარდე borderRadius
                boxShadow: '0 0 20px rgba(255,255,255,0.3)' // დავამატე მსუბუქი ნათება
            }}>
                {countdownMessage}
            </div>
        )}

        {isInGame && gameData && (
          <div
            ref={gameAreaRef}
            className="game-area"
            style={{
              width: `${GAME_AREA_WIDTH}px`,
              height: `${GAME_AREA_HEIGHT}px`,
              backgroundColor: 'black',
              position: 'relative',
              margin: '20px auto',
              border: '2px solid white',
              cursor: 'none' // დავმალოთ მაუსის კურსორი თამაშის არეალში
            }}
            onMouseMove={handleMouseMove}
          >
            <div /* Player 1 Paddle */
              style={{ position: 'absolute', width: `${PADDLE_WIDTH}px`, height: `${PADDLE_HEIGHT}px`, backgroundColor: 'white', left: '20px', top: `${paddle1Y}px` }}
            />
            <div /* Player 2 Paddle */
              style={{ position: 'absolute', width: `${PADDLE_WIDTH}px`, height: `${PADDLE_HEIGHT}px`, backgroundColor: 'white', right: '20px', top: `${paddle2Y}px` }}
            />
            {/* Ball */}
            <div
              className="ball"
              style={{
                position: 'absolute',
                width: `${BALL_RADIUS * 2}px`,
                height: `${BALL_RADIUS * 2}px`,
                backgroundColor: 'white',
                borderRadius: '50%', // მრგვალი ბურთი
                left: `${ballX - BALL_RADIUS}px`, // X კოორდინატი არის ცენტრი, ამიტომ ვაკლებთ რადიუსს
                top: `${ballY - BALL_RADIUS}px`,  // Y კოორდინატი არის ცენტრი, ამიტომ ვაკლებთ რადიუსს
              }}
            />
            {/* Score */}
                       {/* Score */}
            <div style={{
                width: '100%', // დაიკავოს მთელი სიგანე
                position: 'absolute', // აბსოლუტური პოზიციონირება თამაშის არეალში
                top: '20px', // ცოტა ქვემოთ ჩამოვწიოთ ზედა კიდიდან
                textAlign: 'center', // ტექსტი ჰორიზონტალურად ცენტრში
                color: 'white',
                fontSize: '48px', // გავზარდოთ შრიფტის ზომა
                fontWeight: 'bold',
                // textShadow: '2px 2px 4px #000000', // სურვილისამებრ: ჩრდილი უკეთესი ხილვადობისთვის
            }}>
                {player1Score} : {player2Score}
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
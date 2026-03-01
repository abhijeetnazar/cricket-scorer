import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Play, RotateCcw, Users, Activity, ChevronRight, User, Shield, Circle, Sparkles, Newspaper, Download, Image as ImageIcon, FileText, ArrowRightLeft, Flag, List, LogOut } from 'lucide-react';
import { toPng } from 'html-to-image';
import { PDFDocument } from 'pdf-lib';

// --- Gemini API Helper ---
const apiKey = ""; // API key is injected by the environment

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  let retries = 0;
  const maxRetries = 5;
  const delays = [1000, 2000, 4000, 8000, 16000];

  while (retries <= maxRetries) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
    } catch (error) {
      if (retries === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[retries]));
      retries++;
    }
  }
}

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-md',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300',
    danger: 'bg-red-500 hover:bg-red-600 text-white shadow-md',
    success: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md',
    action: 'bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 shadow-sm',
    outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const ScoreBall = ({ value, type }) => {
  let colorClass = 'bg-gray-200 text-gray-700';
  let display = value;

  const isWicket = type.includes('wicket');
  const baseType = type.replace('_wicket', '');

  if (baseType === 'wicket') {
    colorClass = 'bg-red-500 text-white';
    display = value > 0 ? `W+${value}` : 'W';
  } else if (baseType === 'wide') {
    colorClass = isWicket ? 'bg-red-500 text-white border border-red-600' : 'bg-orange-100 text-orange-700 border border-orange-200';
    display = 'WD' + (value > 0 ? `+${value}` : '') + (isWicket ? ' W' : '');
  } else if (baseType === 'noball') {
    colorClass = isWicket ? 'bg-red-500 text-white border border-red-600' : 'bg-yellow-100 text-yellow-700 border border-yellow-200';
    display = 'NB' + (value > 0 ? `+${value}` : '') + (isWicket ? ' W' : '');
  } else if (value === 4) {
    colorClass = 'bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold';
  } else if (value === 6) {
    colorClass = 'bg-purple-100 text-purple-700 border border-purple-200 font-bold';
  } else if (value === 0) {
    display = '•';
  }

  return (
    <div className={`min-w-[36px] h-9 px-1.5 rounded-full flex items-center justify-center text-xs font-bold whitespace-nowrap ${colorClass}`}>
      {display}
    </div>
  );
};

// --- Main Application ---

export default function CricketScorer() {
  // --- Local Storage Initialization ---
  const getSavedState = () => {
    try {
      const saved = localStorage.getItem('cricket_scorer_state');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Could not load state", e);
    }
    return null;
  };

  const [savedState] = useState(getSavedState());

  // --- State ---
  const [gameState, setGameState] = useState(savedState?.gameState || 'SETUP'); // SETUP, PLAYING, INNINGS_BREAK, FINISHED
  const scorecardRef = useRef(null);

  // Custom Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({ show: false, message: '', onConfirm: null });

  // Match Settings
  const [matchConfig, setMatchConfig] = useState(savedState?.matchConfig || {
    teamA: 'Strikers',
    teamB: 'Titans',
    totalOvers: 5,
    playersPerTeam: 11,
    striker: '',
    nonStriker: '',
    bowler: ''
  });

  const [secondInningsConfig, setSecondInningsConfig] = useState(savedState?.secondInningsConfig || { striker: '', nonStriker: '', bowler: '' });

  // Current Match Status
  const [innings, setInnings] = useState(savedState?.innings || 1);
  const [battingTeam, setBattingTeam] = useState(savedState?.battingTeam || '');
  const [bowlingTeam, setBowlingTeam] = useState(savedState?.bowlingTeam || '');
  const [target, setTarget] = useState(savedState?.target || null);

  // Score Data
  const [score, setScore] = useState(savedState?.score || {
    runs: 0,
    wickets: 0,
    overs: 0,
    ballsInOver: 0, // Legal balls (0-5)
    extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0 },
    thisOver: [], // Array of ball objects
    history: [],  // Array of completed overs
    batsmen: [
      { name: 'Batsman 1', runs: 0, balls: 0, status: 'not out' },
      { name: 'Batsman 2', runs: 0, balls: 0, status: 'not out' }
    ],
    bowlers: [
      { name: 'Bowler 1', runsConceded: 0, wickets: 0, totalBalls: 0 }
    ]
  });

  // Active Players
  const [players, setPlayers] = useState(savedState?.players || {
    striker: { name: 'Batsman 1', runs: 0, balls: 0 },
    nonStriker: { name: 'Batsman 2', runs: 0, balls: 0 },
    bowler: { name: 'Bowler 1', wickets: 0, runsConceded: 0, overs: 0, totalBalls: 0 }
  });

  // Modals
  const [showNewBatsmanModal, setShowNewBatsmanModal] = useState(false);
  const [showNewBowlerModal, setShowNewBowlerModal] = useState(false);
  const [showScorecard, setShowScorecard] = useState(false);
  const [tempName, setTempName] = useState('');
  const [modalCallback, setModalCallback] = useState(null); // Function to run after name entry
  const [wicketModal, setWicketModal] = useState({ show: false, runs: 0, extra: 'none', dismissed: 'striker' });
  const [retireModal, setRetireModal] = useState({ show: false, player: 'striker' });

  // AI State
  const [aiResponse, setAiResponse] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Match Context State
  const [firstInningsScore, setFirstInningsScore] = useState(savedState?.firstInningsScore || null);

  // --- Data Sync (Local Storage) ---
  useEffect(() => {
    const stateToSave = {
      gameState, matchConfig, secondInningsConfig, innings, battingTeam, bowlingTeam, target, score, players, firstInningsScore
    };
    try {
      localStorage.setItem('cricket_scorer_state', JSON.stringify(stateToSave));
    } catch (e) {
      console.error("Could not save state", e);
    }
  }, [gameState, matchConfig, secondInningsConfig, innings, battingTeam, bowlingTeam, target, score, players, firstInningsScore]);

  // --- Helpers ---

  const currentRunRate = () => {
    const totalBalls = score.overs * 6 + score.ballsInOver;
    if (totalBalls === 0) return 0;
    return ((score.runs / totalBalls) * 6).toFixed(2);
  };

  const requiredRunRate = () => {
    if (innings === 1 || !target) return 0;
    const runsNeeded = target - score.runs;
    const ballsRemaining = (matchConfig.totalOvers * 6) - (score.overs * 6 + score.ballsInOver);
    if (ballsRemaining <= 0) return 0;
    return ((runsNeeded / ballsRemaining) * 6).toFixed(2);
  };

  // --- AI Actions ---

  const generateMatchReport = async (resultText) => {
    setIsAiLoading(true);
    setAiResponse({ title: "✨ Match Report", content: "" }); // Set placeholder to open modal immediately

    const prompt = `Write a dramatic, exciting 2-paragraph sports news article summarizing this cricket match.
    Match: ${matchConfig.teamA} vs ${matchConfig.teamB}.
    Result: ${resultText}.
    Final Score of the chasing team: ${score.runs}/${score.wickets} in ${score.overs}.${score.ballsInOver} overs.
    Make it sound like an enthusiastic professional sports commentator wrote it. Include a catchy headline at the top.`;

    try {
      const response = await callGemini(prompt);
      setAiResponse({ title: "✨ Match Report", content: response });
    } catch (error) {
      setAiResponse({ title: "Error", content: "Could not generate the match report. Please try again later." });
    }
    setIsAiLoading(false);
  };

  // --- Actions ---

  const handleNewMatch = () => {
    setConfirmModal({
      show: true,
      message: "Are you sure you want to start a new match? This will erase the current match data.",
      onConfirm: () => {
        try { localStorage.removeItem('cricket_scorer_state'); } catch (e) { }

        setMatchConfig({ teamA: 'Strikers', teamB: 'Titans', totalOvers: 5, playersPerTeam: 11, striker: '', nonStriker: '', bowler: '' });
        setSecondInningsConfig({ striker: '', nonStriker: '', bowler: '' });
        setInnings(1);
        setBattingTeam('');
        setBowlingTeam('');
        setTarget(null);
        setFirstInningsScore(null);
        setGameState('SETUP');

        setScore({
          runs: 0, wickets: 0, overs: 0, ballsInOver: 0,
          extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0 },
          thisOver: [], history: [],
          batsmen: [
            { name: 'Batsman 1', runs: 0, balls: 0, status: 'not out' },
            { name: 'Batsman 2', runs: 0, balls: 0, status: 'not out' }
          ],
          bowlers: [
            { name: 'Bowler 1', runsConceded: 0, wickets: 0, totalBalls: 0 }
          ]
        });
        setPlayers({
          striker: { name: 'Batsman 1', runs: 0, balls: 0 },
          nonStriker: { name: 'Batsman 2', runs: 0, balls: 0 },
          bowler: { name: 'Bowler 1', wickets: 0, runsConceded: 0, overs: 0, totalBalls: 0 }
        });
      }
    });
  };

  const startMatch = () => {
    setBattingTeam(matchConfig.teamA);
    setBowlingTeam(matchConfig.teamB);
    setInnings(1);
    setFirstInningsScore(null);
    setGameState('PLAYING');
    resetScoreboard(matchConfig);
  };

  const resetScoreboard = (config = {}) => {
    const sName = config.striker || 'Batsman 1';
    const nsName = config.nonStriker || 'Batsman 2';
    const bName = config.bowler || 'Bowler 1';

    setScore({
      runs: 0,
      wickets: 0,
      overs: 0,
      ballsInOver: 0, // Legal balls (0-5)
      extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0 },
      thisOver: [],
      history: [],
      batsmen: [
        { name: sName, runs: 0, balls: 0, status: 'not out' },
        { name: nsName, runs: 0, balls: 0, status: 'not out' }
      ],
      bowlers: [
        { name: bName, runsConceded: 0, wickets: 0, totalBalls: 0 }
      ]
    });
    setPlayers({
      striker: { name: sName, runs: 0, balls: 0 },
      nonStriker: { name: nsName, runs: 0, balls: 0 },
      bowler: { name: bName, wickets: 0, runsConceded: 0, overs: 0, totalBalls: 0 }
    });
  };

  // Helper: capture full (unclipped) scorecard as a PNG data URL
  const captureFullScorecard = async () => {
    const el = scorecardRef.current;
    // Temporarily expand the scrollable container so nothing is clipped
    const prevHeight = el.style.height;
    const prevMaxHeight = el.style.maxHeight;
    const prevOverflow = el.style.overflow;
    el.style.height = el.scrollHeight + 'px';
    el.style.maxHeight = 'none';
    el.style.overflow = 'visible';
    try {
      return await toPng(el, { pixelRatio: 2, cacheBust: true });
    } finally {
      el.style.height = prevHeight;
      el.style.maxHeight = prevMaxHeight;
      el.style.overflow = prevOverflow;
    }
  };

  const handleExportImage = async () => {
    try {
      const dataUrl = await captureFullScorecard();
      const link = document.createElement('a');
      link.download = `${battingTeam}_vs_${bowlingTeam}_Scorecard.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export image failed', err);
      alert('Export failed. Please try again.');
    }
  };

  const handleExportPDF = async () => {
    try {
      const dataUrl = await captureFullScorecard();

      const base64 = dataUrl.split(',')[1];
      const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const pdfDoc = await PDFDocument.create();
      const pngImage = await pdfDoc.embedPng(imgBytes);
      const imgW = pngImage.width;

      // A4 in PDF points (72 dpi)
      const A4_W = 595.28;
      const A4_H = 841.89;
      const margin = 20;
      const printW = A4_W - margin * 2;
      const printH = A4_H - margin * 2; // usable height per page

      // Scale image to fit A4 width
      const scale = printW / imgW;
      const scaledH = pngImage.height * scale;

      const totalPages = Math.ceil(scaledH / printH);

      for (let i = 0; i < totalPages; i++) {
        const page = pdfDoc.addPage([A4_W, A4_H]);

        // Vertical offset into the scaled image where this page starts (from top)
        const sliceStart = i * printH;
        const sliceH = Math.min(printH, scaledH - sliceStart);

        // PDF origin is bottom-left. Position the full image so:
        // - image top = page top - margin - sliceStart (above the page for pages > 0)
        // - PDF viewers naturally clip overflow outside the page rect
        const imageBottomY = (A4_H - margin) - scaledH + sliceStart;

        page.drawImage(pngImage, {
          x: margin,
          y: imageBottomY,
          width: printW,
          height: scaledH,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${battingTeam}_vs_${bowlingTeam}_Scorecard.pdf`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export PDF failed', err);
      alert('PDF export failed. Please try again.');
    }
  };

  const handleRetire = (dismissedPlayer) => {
    let newScore = { ...score };
    let newPlayers = { ...players };

    let batMatch = newScore.batsmen.find(b => b.name === newPlayers[dismissedPlayer].name);
    if (!batMatch) {
      batMatch = { name: newPlayers[dismissedPlayer].name, runs: newPlayers[dismissedPlayer].runs, balls: newPlayers[dismissedPlayer].balls, status: 'retired' };
      newScore.batsmen.push(batMatch);
    } else {
      batMatch.runs = newPlayers[dismissedPlayer].runs;
      batMatch.balls = newPlayers[dismissedPlayer].balls;
      batMatch.status = 'retired';
    }

    setScore(newScore);
    setPlayers(newPlayers);

    setTempName('');
    setModalCallback(() => (name) => {
      setPlayers(prev => {
        const updated = { ...prev };
        const newBatName = name || `Batsman ${newScore.batsmen.length + 1}`;
        const existingBat = newScore.batsmen.find(b => b.name === newBatName);
        const r = existingBat ? existingBat.runs : 0;
        const bl = existingBat ? existingBat.balls : 0;
        if (existingBat) existingBat.status = 'not out';

        if (dismissedPlayer === 'striker') {
          updated.striker = { name: newBatName, runs: r, balls: bl };
        } else {
          updated.nonStriker = { name: newBatName, runs: r, balls: bl };
        }
        return updated;
      });
    });
    setShowNewBatsmanModal(true);
  };

  const handleScoring = (runs, type = 'normal', isWicket = false, dismissedPlayer = 'striker') => {
    // Check if match is already over
    if (gameState === 'FINISHED') return;

    let newScore = { ...score };
    let newPlayers = { ...players };
    let isLegalBall = true;
    let runsToAdd = runs;

    // 1. Handle Extras Logic
    if (type === 'wide' || type === 'noball') {
      isLegalBall = false;
      runsToAdd += 1; // The penalty run
      if (type === 'wide') newScore.extras.wides += 1 + runs; // runs here are byes ran on wide
      if (type === 'noball') newScore.extras.noballs += 1 + runs;
    }

    // 2. Update Score Globals
    newScore.runs += runsToAdd;

    // 3. Update Bowler Stats
    newPlayers.bowler.runsConceded += runsToAdd;
    if (isLegalBall) newPlayers.bowler.totalBalls = (newPlayers.bowler.totalBalls || 0) + 1;

    // 4. Update Batsman Stats
    if (isLegalBall && type !== 'wide') {
      newPlayers.striker.balls += 1;
    }
    if (type === 'normal' || type === 'noball') {
      newPlayers.striker.runs += runs;
    }

    // 5. Ball History Logic
    const ballData = { val: runs, type: isWicket ? (type === 'normal' ? 'wicket' : type + '_wicket') : type };
    newScore.thisOver.push(ballData);

    // 6. Legal Ball counting & Over completion
    if (isLegalBall) {
      newScore.ballsInOver += 1;
    }

    // 6.5 Sync to Scorecard Arrays
    let batMatch = newScore.batsmen.find(b => b.name === newPlayers.striker.name);
    if (!batMatch) {
      batMatch = { name: newPlayers.striker.name, runs: 0, balls: 0, status: 'not out' };
      newScore.batsmen.push(batMatch);
    }
    batMatch.runs = newPlayers.striker.runs;
    batMatch.balls = newPlayers.striker.balls;
    if (isWicket && dismissedPlayer === 'striker') batMatch.status = 'out';

    let nonBatMatch = newScore.batsmen.find(b => b.name === newPlayers.nonStriker.name);
    if (!nonBatMatch) {
      nonBatMatch = { name: newPlayers.nonStriker.name, runs: 0, balls: 0, status: 'not out' };
      newScore.batsmen.push(nonBatMatch);
    }
    nonBatMatch.runs = newPlayers.nonStriker.runs;
    nonBatMatch.balls = newPlayers.nonStriker.balls;
    if (isWicket && dismissedPlayer === 'nonStriker') nonBatMatch.status = 'out';

    let bowlMatch = newScore.bowlers.find(b => b.name === newPlayers.bowler.name);
    if (!bowlMatch) {
      bowlMatch = { name: newPlayers.bowler.name, runsConceded: 0, wickets: 0, totalBalls: 0 };
      newScore.bowlers.push(bowlMatch);
    }
    bowlMatch.runsConceded = newPlayers.bowler.runsConceded;
    bowlMatch.wickets = newPlayers.bowler.wickets;
    bowlMatch.totalBalls = newPlayers.bowler.totalBalls;

    // 7. Update State Locally before checks
    setScore(newScore);

    // 8. Handle Rotation (Strike Rotation)
    // Swap if odd runs (1, 3, 5)
    // Note: On a Wide + 1 run, they crossed, so we swap. 
    // If type is normal and runs is odd -> swap
    // If type is noball and runs is odd -> swap
    // If type is wide and (runs > 0 and odd) -> swap (rare, usually wides are 1 run total)
    const shouldSwap = (runs % 2 !== 0);

    if (shouldSwap) {
      const temp = newPlayers.striker;
      newPlayers.striker = newPlayers.nonStriker;
      newPlayers.nonStriker = temp;
    }

    // 9. Handle Wicket
    if (isWicket) {
      newScore.wickets += 1;
      newPlayers.bowler.wickets += 1;
      // Trigger Modal for new batsman
      setPlayers(newPlayers); // Commit current state so UI updates before modal

      if (newScore.wickets >= matchConfig.playersPerTeam - 1) {
        endInnings(newScore);
        return;
      } else {
        setTempName('');
        setModalCallback(() => (name) => {
          setPlayers(prev => {
            const updated = { ...prev };
            const newBatName = name || `Batsman ${newScore.batsmen.length + 1}`;
            const existingBat = newScore.batsmen.find(b => b.name === newBatName);
            const r = existingBat ? existingBat.runs : 0;
            const bl = existingBat ? existingBat.balls : 0;
            if (existingBat) existingBat.status = 'not out';

            if (dismissedPlayer === 'striker') {
              updated.striker = { name: newBatName, runs: r, balls: bl };
            } else {
              updated.nonStriker = { name: newBatName, runs: r, balls: bl };
            }
            return updated;
          });
        });
        setShowNewBatsmanModal(true);
      }
    }

    // 10. Handle Over Completion
    if (newScore.ballsInOver === 6) {
      newScore.overs += 1;
      newScore.ballsInOver = 0;
      newPlayers.bowler.overs += 1;

      // Archive Over
      newScore.history.unshift({ bowler: newPlayers.bowler.name, balls: [...newScore.thisOver] });
      newScore.thisOver = [];

      // Swap Batsmen at end of over
      const temp = newPlayers.striker;
      newPlayers.striker = newPlayers.nonStriker;
      newPlayers.nonStriker = temp;

      setScore(newScore);

      // Check if Match End (Max Overs)
      if (newScore.overs >= matchConfig.totalOvers) {
        endInnings(newScore);
        return;
      }

      // New Bowler Modal
      setPlayers(newPlayers);

      // Auto-suggest the bowler from the previous over at this end (history index 1)
      const suggestedBowler = newScore.history.length >= 2 ? newScore.history[1].bowler : '';
      setTempName(suggestedBowler);

      setModalCallback(() => (name) => {
        const newName = name || `Bowler ${newScore.bowlers.length + 1}`;
        setPlayers(prev => {
          const existing = newScore.bowlers.find(b => b.name === newName);
          if (existing) {
            return { ...prev, bowler: { name: existing.name, wickets: existing.wickets, runsConceded: existing.runsConceded, overs: Math.floor(existing.totalBalls / 6), totalBalls: existing.totalBalls } };
          }
          return {
            ...prev,
            bowler: { name: newName, wickets: 0, runsConceded: 0, overs: 0, totalBalls: 0 }
          };
        });
      });
      setShowNewBowlerModal(true);
    } else {
      // Just update players if over not ended
      setPlayers(newPlayers);

      // Check Win Condition immediately for 2nd innings
      if (innings === 2 && newScore.runs >= target) {
        finishMatch(newScore, true);
      }
    }
  };

  const endInnings = (finalScore) => {
    if (innings === 1) {
      setGameState('INNINGS_BREAK');
      setTarget(finalScore.runs + 1);
    } else {
      finishMatch(finalScore, finalScore.runs >= target);
    }
  };

  const handleDeclare = () => {
    setConfirmModal({
      show: true,
      message: "Are you sure you want to declare/end this innings?",
      onConfirm: () => endInnings(score)
    });
  };

  const swapBatsmen = () => {
    setPlayers(prev => ({
      ...prev,
      striker: prev.nonStriker,
      nonStriker: prev.striker
    }));
  };

  const startSecondInnings = () => {
    setFirstInningsScore({ ...score, teamName: battingTeam });
    setInnings(2);
    // Swap Teams
    const oldBat = battingTeam;
    setBattingTeam(bowlingTeam);
    setBowlingTeam(oldBat);
    resetScoreboard(secondInningsConfig);
    setGameState('PLAYING');
  };

  const finishMatch = (finalScore, chasedSuccessfully) => {
    setScore(finalScore); // Ensure final score is captured
    setGameState('FINISHED');
  };

  // --- Renderers ---

  const renderConfirmModal = () => {
    if (!confirmModal.show) return null;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h3 className="text-lg font-bold mb-6 text-gray-800 text-center">{confirmModal.message}</h3>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1 py-3" onClick={() => setConfirmModal({ show: false, message: '', onConfirm: null })}>Cancel</Button>
            <Button variant="danger" className="flex-1 py-3" onClick={() => {
              if (confirmModal.onConfirm) confirmModal.onConfirm();
              setConfirmModal({ show: false, message: '', onConfirm: null });
            }}>Confirm</Button>
          </div>
        </div>
      </div>
    );
  };

  const renderScorecard = () => {
    if (!showScorecard) return null;

    const allInnings = [];
    if (firstInningsScore) allInnings.push(firstInningsScore);
    allInnings.push({ ...score, teamName: battingTeam });

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <div className="bg-blue-900 text-white p-4 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-xl font-bold">Match Scorecard</h2>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleExportImage} title="Export as PNG" className="text-blue-200 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"><ImageIcon size={20} /></button>
              <button onClick={handleExportPDF} title="Export as PDF" className="text-blue-200 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"><FileText size={20} /></button>
              <button onClick={() => setShowScorecard(false)} className="text-blue-200 hover:text-white font-bold text-3xl leading-none ml-2">&times;</button>
            </div>
          </div>

          <div className="p-0 overflow-y-auto flex-1 bg-gray-100" ref={scorecardRef}>
            {allInnings.map((inn, index) => (
              <div key={index} className="bg-white mb-2 last:mb-0 shadow-sm pb-2">
                <div className="px-4 py-2 bg-gray-800 text-white flex justify-between items-center sticky top-0 z-10">
                  <span className="font-bold">{inn.teamName} Innings</span>
                  <span className="font-mono text-sm">{inn.runs}/{inn.wickets} ({inn.overs}.{inn.ballsInOver})</span>
                </div>
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-4 py-2">Batter</th>
                      <th className="px-2 py-2"></th>
                      <th className="px-2 py-2 text-right">R</th>
                      <th className="px-2 py-2 text-right">B</th>
                      <th className="px-4 py-2 text-right">SR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inn.batsmen.map((b, i) => (
                      <tr key={i} className={b.status === 'out' ? 'text-gray-500' : 'text-gray-900 font-medium'}>
                        <td className="px-4 py-2 truncate max-w-[120px]">{b.name}</td>
                        <td className="px-2 py-2 text-xs italic text-gray-400">{b.status}</td>
                        <td className="px-2 py-2 text-right font-bold">{b.runs}</td>
                        <td className="px-2 py-2 text-right">{b.balls}</td>
                        <td className="px-4 py-2 text-right">{b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="px-4 py-2 bg-gray-50 border-y border-gray-200 text-sm">
                  <span className="font-semibold text-gray-700">Extras: </span>
                  <span className="font-bold">{inn.extras.wides + inn.extras.noballs + inn.extras.byes + inn.extras.legbyes}</span>
                  <span className="text-gray-500 ml-2 text-xs">
                    (wd {inn.extras.wides}, nb {inn.extras.noballs}, b {inn.extras.byes}, lb {inn.extras.legbyes})
                  </span>
                </div>

                <table className="w-full text-sm text-left mb-2">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-4 py-2">Bowler</th>
                      <th className="px-2 py-2 text-right">O</th>
                      <th className="px-2 py-2 text-right">R</th>
                      <th className="px-2 py-2 text-right">W</th>
                      <th className="px-4 py-2 text-right">ECON</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inn.bowlers.filter(b => b.totalBalls > 0 || b.runsConceded > 0).map((b, i) => {
                      const overs = Math.floor(b.totalBalls / 6);
                      const balls = b.totalBalls % 6;
                      const overString = `${overs}.${balls}`;
                      const econ = b.totalBalls > 0 ? ((b.runsConceded / b.totalBalls) * 6).toFixed(1) : '-';
                      return (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium text-gray-800 truncate max-w-[120px]">{b.name}</td>
                          <td className="px-2 py-2 text-right">{overString}</td>
                          <td className="px-2 py-2 text-right font-bold">{b.runsConceded}</td>
                          <td className="px-2 py-2 text-right font-bold text-blue-600">{b.wickets}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{econ}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><List size={16} /> Over History</h4>
                  <div className="space-y-3">
                    {(() => {
                      const displayHistory = [...inn.history].reverse();
                      if (inn.thisOver && inn.thisOver.length > 0) {
                        displayHistory.push({ bowler: 'Current', balls: inn.thisOver, isPartial: true });
                      }
                      return displayHistory.map((over, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-3 text-sm">
                          <span className="font-medium text-gray-500 w-12 shrink-0">Ov {oIdx + 1}</span>
                          <span className="font-semibold text-gray-700 w-20 shrink-0 truncate">{over.bowler}</span>
                          <div className="flex gap-1 overflow-x-auto flex-1 pb-1">
                            {over.balls.map((b, bIdx) => <ScoreBall key={bIdx} value={b.val} type={b.type} />)}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderAiModal = () => {
    if (!aiResponse && !isAiLoading) return null;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl relative max-h-[80vh] overflow-y-auto">
          {isAiLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600 font-medium animate-pulse">Consulting the AI experts...</p>
            </div>
          ) : (
            <>
              <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 text-blue-800">
                {aiResponse?.title}
              </h3>
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed mb-6">
                {aiResponse?.content}
              </div>
              <Button className="w-full" onClick={() => setAiResponse(null)}>Close</Button>
            </>
          )}
        </div>
      </div>
    );
  };

  if (gameState === 'SETUP') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
        {renderConfirmModal()}
        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl">
          <div className="flex items-center justify-center mb-6 text-blue-600">
            <Trophy size={40} />
          </div>
          <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">Cricket Scorer Setup</h1>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batting First</label>
              <input
                type="text"
                value={matchConfig.teamA}
                onChange={(e) => setMatchConfig({ ...matchConfig, teamA: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Team Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fielding First</label>
              <input
                type="text"
                value={matchConfig.teamB}
                onChange={(e) => setMatchConfig({ ...matchConfig, teamB: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Team Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Overs per Innings</label>
              <input
                type="number"
                value={matchConfig.totalOvers}
                onChange={(e) => setMatchConfig({ ...matchConfig, totalOvers: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Opening Players</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Striker Name" value={matchConfig.striker} onChange={e => setMatchConfig({ ...matchConfig, striker: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                <input type="text" placeholder="Non-Striker Name" value={matchConfig.nonStriker} onChange={e => setMatchConfig({ ...matchConfig, nonStriker: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                <input type="text" placeholder="Opening Bowler" value={matchConfig.bowler} onChange={e => setMatchConfig({ ...matchConfig, bowler: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
              </div>
            </div>

            <Button onClick={startMatch} className="w-full mt-6 py-3 text-lg">
              Start Match
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'INNINGS_BREAK') {
    return (
      <div className="min-h-screen bg-blue-900 flex items-center justify-center p-4 font-sans text-white">
        {renderConfirmModal()}
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-bold mb-2">Innings Break</h2>
          <p className="text-blue-200 text-lg mb-8">{battingTeam} scored {score.runs}/{score.wickets}</p>

          <div className="bg-white/10 p-6 rounded-2xl backdrop-blur-sm mb-8">
            <p className="text-sm uppercase tracking-wider text-blue-300 mb-1">Target</p>
            <div className="text-5xl font-bold">{target}</div>
            <p className="text-sm mt-2 text-blue-200">
              {bowlingTeam} needs {target} runs in {matchConfig.totalOvers} overs
            </p>
          </div>

          <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm mb-6 text-left space-y-3">
            <h3 className="text-sm font-bold text-blue-200 tracking-wider mb-2">2nd Innings Openers</h3>
            <input type="text" placeholder="Striker Name" value={secondInningsConfig.striker} onChange={(e) => setSecondInningsConfig({ ...secondInningsConfig, striker: e.target.value })} className="w-full px-3 py-2 bg-white/20 border border-blue-400/30 rounded text-white placeholder-blue-200 outline-none focus:ring-2 focus:ring-blue-400" />
            <input type="text" placeholder="Non-Striker Name" value={secondInningsConfig.nonStriker} onChange={(e) => setSecondInningsConfig({ ...secondInningsConfig, nonStriker: e.target.value })} className="w-full px-3 py-2 bg-white/20 border border-blue-400/30 rounded text-white placeholder-blue-200 outline-none focus:ring-2 focus:ring-blue-400" />
            <input type="text" placeholder="Opening Bowler" value={secondInningsConfig.bowler} onChange={(e) => setSecondInningsConfig({ ...secondInningsConfig, bowler: e.target.value })} className="w-full px-3 py-2 bg-white/20 border border-blue-400/30 rounded text-white placeholder-blue-200 outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <Button onClick={startSecondInnings} variant="success" className="w-full py-3 text-lg mb-3">
            Start 2nd Innings
          </Button>
          <Button onClick={() => setShowScorecard(true)} variant="action" className="w-full py-3 text-lg flex justify-center items-center gap-2">
            <Activity size={20} /> View Scorecard
          </Button>
        </div>
        {renderScorecard()}
      </div>
    );
  }

  if (gameState === 'FINISHED') {
    const runsNeeded = target - score.runs;
    const wonByRuns = target ? (target - 1) - score.runs : 0; // Logic handles 2nd innings score

    let resultText = "";
    if (innings === 1) {
      // Weird edge case where match ends in 1st innings (e.g. all out? No, wait, finished means game over)
      // Usually means we processed 2nd innings logic
    }

    // Logic check: Did batting team chase it?
    const chasersWon = score.runs >= target;

    if (chasersWon) {
      resultText = `${battingTeam} won by ${matchConfig.playersPerTeam - 1 - score.wickets} wickets!`;
    } else {
      // Score.runs is the chasing team's score
      const margin = (target - 1) - score.runs;
      resultText = `${bowlingTeam} won by ${margin} runs!`;
    }

    if (score.runs === target - 1) resultText = "It's a Tie!";

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 font-sans text-white">
        {renderConfirmModal()}
        <div className="text-center w-full max-w-md">
          <Trophy size={64} className="mx-auto text-yellow-400 mb-6" />
          <h1 className="text-4xl font-bold mb-4">Match Ended</h1>
          <div className="bg-gray-800 p-6 rounded-xl mb-8 border border-gray-700">
            <p className="text-2xl font-semibold text-white">{resultText}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8 text-left">
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-gray-400 text-xs">{innings === 2 ? bowlingTeam : battingTeam}</p>
              <p className="text-xl font-bold">{innings === 2 ? (target - 1) : score.runs}</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-gray-400 text-xs">{innings === 2 ? battingTeam : bowlingTeam}</p>
              <p className="text-xl font-bold">{innings === 2 ? score.runs : 'Yet to bat'}</p>
            </div>
          </div>

          <div className="space-y-3">
            <Button onClick={() => setShowScorecard(true)} variant="secondary" className="w-full py-3 flex items-center justify-center gap-2">
              <Activity size={20} /> View Full Scorecard
            </Button>
            <Button
              onClick={() => generateMatchReport(resultText)}
              variant="action"
              className="w-full flex items-center justify-center gap-2 border-none bg-blue-50 text-blue-700 hover:bg-blue-100 py-3"
            >
              <Newspaper size={20} /> ✨ Generate Match Report
            </Button>
            <Button onClick={handleNewMatch} variant="primary" className="w-full py-3">
              New Match
            </Button>
          </div>
        </div>
        {renderAiModal()}
        {renderScorecard()}
      </div>
    );
  }

  // --- PLAYING VIEW ---
  return (
    <div className="min-h-screen bg-gray-100 font-sans pb-20 md:pb-0">

      {renderConfirmModal()}
      {renderAiModal()}
      {renderScorecard()}

      {/* Retire Modal */}
      {retireModal.show && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[55] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2"><LogOut /> Retire Batsman</h3>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Who is retiring?</label>
              <div className="flex flex-col gap-2">
                <Button variant={retireModal.player === 'striker' ? 'primary' : 'secondary'} onClick={() => setRetireModal({ ...retireModal, player: 'striker' })}>
                  {players.striker.name} (Striker)
                </Button>
                <Button variant={retireModal.player === 'nonStriker' ? 'primary' : 'secondary'} onClick={() => setRetireModal({ ...retireModal, player: 'nonStriker' })}>
                  {players.nonStriker.name} (Non-Striker)
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setRetireModal({ ...retireModal, show: false })}>Cancel</Button>
              <Button variant="primary" className="flex-1" onClick={() => {
                handleRetire(retireModal.player);
                setRetireModal({ ...retireModal, show: false });
              }}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {/* Wicket Modal */}
      {wicketModal.show && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[55] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-red-600 flex items-center gap-2"><Shield /> Wicket Details</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Runs Completed</label>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map(r => (
                  <Button key={r} variant={wicketModal.runs === r ? 'primary' : 'secondary'} onClick={() => setWicketModal({ ...wicketModal, runs: r })} className="flex-1">{r}</Button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Type</label>
              <div className="flex gap-2">
                <Button variant={wicketModal.extra === 'none' ? 'primary' : 'secondary'} onClick={() => setWicketModal({ ...wicketModal, extra: 'none' })} className="flex-1">Normal</Button>
                <Button variant={wicketModal.extra === 'wide' ? 'primary' : 'secondary'} onClick={() => setWicketModal({ ...wicketModal, extra: 'wide' })} className="flex-1">Wide</Button>
                <Button variant={wicketModal.extra === 'noball' ? 'primary' : 'secondary'} onClick={() => setWicketModal({ ...wicketModal, extra: 'noball' })} className="flex-1">No Ball</Button>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Who is out?</label>
              <div className="flex flex-col gap-2">
                <Button variant={wicketModal.dismissed === 'striker' ? 'danger' : 'secondary'} onClick={() => setWicketModal({ ...wicketModal, dismissed: 'striker' })}>
                  {players.striker.name} (Striker)
                </Button>
                <Button variant={wicketModal.dismissed === 'nonStriker' ? 'danger' : 'secondary'} onClick={() => setWicketModal({ ...wicketModal, dismissed: 'nonStriker' })}>
                  {players.nonStriker.name} (Non-Striker)
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setWicketModal({ ...wicketModal, show: false })}>Cancel</Button>
              <Button variant="danger" className="flex-1" onClick={() => {
                setWicketModal({ ...wicketModal, show: false });
                handleScoring(wicketModal.runs, wicketModal.extra === 'none' ? 'normal' : wicketModal.extra, true, wicketModal.dismissed);
              }}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Names */}
      {(showNewBatsmanModal || showNewBowlerModal) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold mb-4">
              {showNewBatsmanModal ? 'New Batsman' : 'New Bowler'}
            </h3>
            <input
              autoFocus
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="Enter Name"
              className="w-full border p-3 rounded-lg mb-4 text-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />

            {/* Quick Select for Retired Batsmen */}
            {showNewBatsmanModal && score.batsmen.filter(b => b.status === 'retired').length > 0 && (
              <div className="mb-5">
                <p className="text-sm font-medium text-gray-600 mb-2">Retired Batsmen (Resume):</p>
                <div className="flex flex-wrap gap-2">
                  {score.batsmen
                    .filter(b => b.status === 'retired')
                    .map((b, idx) => (
                      <button
                        key={idx}
                        onClick={() => setTempName(b.name)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-sm rounded-full text-blue-700 transition-colors font-medium"
                      >
                        {b.name} ({b.runs})
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Quick Select for Previous Bowlers */}
            {showNewBowlerModal && score.bowlers.filter(b => b.name !== players.bowler.name).length > 0 && (
              <div className="mb-5">
                <p className="text-sm font-medium text-gray-600 mb-2">Previous Bowlers:</p>
                <div className="flex flex-wrap gap-2">
                  {score.bowlers
                    .filter(b => b.name !== players.bowler.name) // Hide the bowler who just finished
                    .map((b, idx) => (
                      <button
                        key={idx}
                        onClick={() => setTempName(b.name)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-sm rounded-full text-blue-700 transition-colors font-medium"
                      >
                        {b.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => {
                if (modalCallback) modalCallback(tempName);
                setShowNewBatsmanModal(false);
                setShowNewBowlerModal(false);
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      )}

      {/* Header Scoreboard */}
      <div className="bg-blue-900 text-white p-4 shadow-lg rounded-b-3xl sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="font-bold text-blue-200 text-sm uppercase tracking-wide mb-1">{battingTeam}</h2>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold tracking-tighter">
                  {score.runs}/{score.wickets}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-light text-blue-100">
                {score.overs}.{score.ballsInOver}
                <span className="text-sm text-blue-400 font-medium ml-1">/ {matchConfig.totalOvers} OVS</span>
              </div>
              <div className="text-xs text-blue-300 mt-1 font-mono">
                CR: {currentRunRate()} {target && `| RR: ${requiredRunRate()}`}
              </div>
            </div>
          </div>

          {target && (
            <div className="bg-blue-800/50 rounded-lg py-2 px-3 text-sm text-blue-200 flex justify-between items-center">
              <span>Target: {target}</span>
              <span>Need {target - score.runs} off {(matchConfig.totalOvers * 6) - (score.overs * 6 + score.ballsInOver)} balls</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Players Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Batsmen */}
          <div className="flex divide-x divide-gray-100 relative">
            <div className={`flex-1 p-4 ${true ? 'bg-blue-50' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-gray-800 truncate">{players.striker.name} *</span>
              </div>
              <div className="text-sm text-gray-500">
                <span className="font-bold text-gray-900">{players.striker.runs}</span>
                <span className="text-xs ml-1">({players.striker.balls})</span>
              </div>
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <button onClick={swapBatsmen} title="Swap Batsmen" className="bg-white border border-gray-200 rounded-full p-1.5 shadow-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <ArrowRightLeft size={16} />
              </button>
            </div>

            <div className="flex-1 p-4 opacity-75">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-700 truncate">{players.nonStriker.name}</span>
              </div>
              <div className="text-sm text-gray-500">
                <span className="font-bold text-gray-900">{players.nonStriker.runs}</span>
                <span className="text-xs ml-1">({players.nonStriker.balls})</span>
              </div>
            </div>
          </div>

          {/* Bowler */}
          <div className="bg-gray-50 p-3 border-t border-gray-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="bg-gray-200 p-1.5 rounded-full">
                <Circle size={14} className="text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{players.bowler.name}</p>
                <p className="text-xs text-gray-500">
                  {players.bowler.wickets}-{players.bowler.runsConceded} <span className="ml-1">({players.bowler.overs}.{score.ballsInOver})</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const initiateBowlerChange = () => {
                  setTempName('');
                  setModalCallback(() => (name) => {
                    const newName = name || `Bowler ${score.bowlers.length + 1}`;
                    const existing = score.bowlers.find(b => b.name === newName);
                    if (existing) {
                      setPlayers(prev => ({ ...prev, bowler: { name: existing.name, wickets: existing.wickets, runsConceded: existing.runsConceded, overs: Math.floor(existing.totalBalls / 6), totalBalls: existing.totalBalls } }));
                    } else {
                      setPlayers(prev => ({ ...prev, bowler: { name: newName, wickets: 0, runsConceded: 0, overs: 0, totalBalls: 0 } }));
                    }
                  });
                  setShowNewBowlerModal(true);
                };

                if (score.ballsInOver > 0) {
                  setConfirmModal({
                    show: true,
                    message: "Change bowler in the middle of the over?",
                    onConfirm: initiateBowlerChange
                  });
                } else {
                  initiateBowlerChange();
                }
              }}
              className="text-xs text-blue-600 font-medium hover:underline"
            >
              Change
            </button>
          </div>
        </div>

        {/* Current Over Timeline */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
          <div className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">This Over</div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {score.thisOver.length === 0 && <span className="text-gray-400 text-sm italic">Ready to bowl...</span>}
            {score.thisOver.map((ball, idx) => (
              <ScoreBall key={idx} value={ball.val} type={ball.type} />
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-4 gap-3">
          <Button variant="secondary" className="h-14 text-xl font-bold" onClick={() => handleScoring(0)}>0</Button>
          <Button variant="secondary" className="h-14 text-xl font-bold" onClick={() => handleScoring(1)}>1</Button>
          <Button variant="secondary" className="h-14 text-xl font-bold" onClick={() => handleScoring(2)}>2</Button>
          <Button variant="secondary" className="h-14 text-xl font-bold" onClick={() => handleScoring(3)}>3</Button>

          <Button variant="success" className="h-14 text-xl font-bold" onClick={() => handleScoring(4)}>4</Button>
          <Button variant="success" className="h-14 text-xl font-bold" onClick={() => handleScoring(6)}>6</Button>
          <Button variant="action" className="h-14 text-sm font-bold text-orange-600 border-orange-200 bg-orange-50" onClick={() => handleScoring(0, 'wide')}>WD</Button>
          <Button variant="action" className="h-14 text-sm font-bold text-yellow-600 border-yellow-200 bg-yellow-50" onClick={() => handleScoring(0, 'noball')}>NB</Button>

          <Button
            variant="secondary"
            className="col-span-2 h-14 text-lg font-bold mt-2 flex items-center justify-center gap-2 border-2 border-gray-300"
            onClick={() => setRetireModal({ show: true, player: 'striker' })}
          >
            <LogOut size={20} /> RETIRE
          </Button>

          <Button
            variant="danger"
            className="col-span-2 h-14 text-lg font-bold mt-2 flex items-center justify-center gap-2"
            onClick={() => setWicketModal({ show: true, runs: 0, extra: 'none', dismissed: 'striker' })}
          >
            <Shield size={20} /> WICKET
          </Button>
        </div>

        {/* Extras Summary */}
        <div className="text-center text-gray-400 text-xs mt-4">
          Extras: {score.extras.wides} WD, {score.extras.noballs} NB, {score.extras.byes + score.extras.legbyes} B/LB
        </div>

        <div className="flex flex-col gap-4 mt-6">
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => setShowScorecard(true)}
              variant="action"
              className="w-full flex items-center justify-center gap-2 py-3 font-semibold text-blue-700 bg-blue-50 border-blue-200"
            >
              <Activity size={18} /> Full Scorecard
            </Button>
            <Button
              onClick={handleDeclare}
              variant="action"
              className="w-full flex items-center justify-center gap-2 py-3 font-semibold text-red-700 bg-red-50 border-red-200"
            >
              <Flag size={18} /> Declare
            </Button>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => {
                setConfirmModal({
                  show: true,
                  message: "End match and reset to setup screen?",
                  onConfirm: () => setGameState('SETUP')
                });
              }}
              className="flex items-center gap-2 text-gray-400 hover:text-red-500 transition-colors text-sm"
            >
              <RotateCcw size={14} /> Reset Match
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

function Timer({ isPopup = false, isCompact = false }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [initialTime, setInitialTime] = useState(25 * 60); // 25 dakika pomodoro varsayılan
  const [isRunning, setIsRunning] = useState(false);
  const [isSettingTime, setIsSettingTime] = useState(false);
  const [inputMinutes, setInputMinutes] = useState('25');
  const [inputSeconds, setInputSeconds] = useState('0');
  const [isAlarming, setIsAlarming] = useState(false);
  const [hasTimerRun, setHasTimerRun] = useState(false);
  const audioRef = useRef(null);
  const alarmIntervalRef = useRef(null);

  useEffect(() => {
    let interval = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => {
          if (time <= 1) {
            setIsRunning(false);
            return 0;
          }
          return time - 1;
        });
      }, 1000);
    } else if (timeLeft === 0 && !isRunning) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  useEffect(() => {
    if (timeLeft === 0 && !isRunning && !isAlarming && hasTimerRun) {
      setIsAlarming(true);
      playAlarmOnce();
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
      alarmIntervalRef.current = setInterval(() => {
        playAlarmOnce();
      }, 2000);
    }
  }, [timeLeft, isRunning, isAlarming, hasTimerRun]);

  useEffect(() => {
    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
    };
  }, []);

  const playAlarmOnce = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 1);

    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.value = 800;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 1);
    }, 300);

    setTimeout(() => {
      const osc3 = audioContext.createOscillator();
      const gain3 = audioContext.createGain();
      osc3.connect(gain3);
      gain3.connect(audioContext.destination);
      osc3.frequency.value = 800;
      osc3.type = 'sine';
      gain3.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
      osc3.start(audioContext.currentTime);
      osc3.stop(audioContext.currentTime + 1);
    }, 600);
  };

  const stopAlarm = () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    setIsAlarming(false);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    stopAlarm();
    if (timeLeft === 0) {
      setTimeLeft(initialTime);
    }
    setIsRunning(true);
    setHasTimerRun(true);
  };

  const handlePause = () => {
    setIsRunning(false);
    stopAlarm();
  };

  const handleStop = () => {
    setIsRunning(false);
    setTimeLeft(0);
    setHasTimerRun(false);
    stopAlarm();
  };

  const handleRestart = () => {
    stopAlarm();
    setTimeLeft(initialTime);
    setIsRunning(true);
    setHasTimerRun(true);
  };

  const handleRepeat = () => {
    stopAlarm();
    setTimeLeft(initialTime);
    setIsRunning(true);
    setHasTimerRun(true);
  };

  const handleSetTime = () => {
    const minutes = parseInt(inputMinutes) || 0;
    const seconds = parseInt(inputSeconds) || 0;
    const totalSeconds = minutes * 60 + seconds;
    setInitialTime(totalSeconds);
    setTimeLeft(totalSeconds);
    setIsSettingTime(false);
    setIsRunning(false);
  };

  const displayTime = timeLeft > 0 ? timeLeft : initialTime;
  const progress = initialTime > 0 ? (timeLeft / initialTime) * 100 : 100;

  // Preset times in minutes
  const presets = [5, 15, 25, 45, 60];

  // Open timer in popup window
  const openPopup = async (compact = false) => {
    try {
      // Save current timer state to localStorage for popup to read
      localStorage.setItem('timerPopupState', JSON.stringify({
        timeLeft,
        initialTime,
        isRunning,
        hasTimerRun
      }));

      const url = compact ? 'index.html?popup=timer&compact=1' : 'index.html?popup=timer';
      const webview = new WebviewWindow('timer-popup', {
        url,
        title: 'Timer',
        width: compact ? 240 : 320,
        height: compact ? 100 : 420,
        resizable: compact ? false : false,
        alwaysOnTop: true,
        decorations: false,
        center: true,
        transparent: false,
        focus: true,
      });

      webview.once('tauri://created', () => {
        console.log('Timer popup created');
      });

      webview.once('tauri://error', (e) => {
        console.error('Timer popup error:', e);
      });
    } catch (err) {
      console.error('Failed to open popup:', err);
    }
  };

  // Initialize popup state from localStorage
  useEffect(() => {
    if (isPopup) {
      const savedState = localStorage.getItem('timerPopupState');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          setTimeLeft(state.timeLeft || 0);
          setInitialTime(state.initialTime || 25 * 60);
          setIsRunning(state.isRunning || false);
          setHasTimerRun(state.hasTimerRun || false);
        } catch (e) {
          console.error('Failed to parse timer state:', e);
        }
      }
    }
  }, [isPopup]);

  // Sync timer state to localStorage for popup
  useEffect(() => {
    if (isPopup) {
      localStorage.setItem('timerPopupState', JSON.stringify({
        timeLeft,
        initialTime,
        isRunning,
        hasTimerRun
      }));
    }
  }, [isPopup, timeLeft, initialTime, isRunning, hasTimerRun]);

  const setPresetTime = (minutes) => {
    const totalSeconds = minutes * 60;
    setInitialTime(totalSeconds);
    setTimeLeft(totalSeconds);
    setIsRunning(false);
    setHasTimerRun(false);
    stopAlarm();
  };

  // Compact mode render (for mini popup)
  if (isCompact) {
    return (
      <div className="timer-compact-body">
        <div
          className={`timer-compact-display ${isAlarming ? 'alarming' : ''}`}
          onClick={() => !isRunning && setIsSettingTime(true)}
        >
          {isSettingTime ? (
            <div className="timer-compact-set">
              <input
                type="number"
                className="timer-compact-input"
                value={inputMinutes}
                onChange={(e) => setInputMinutes(e.target.value)}
                placeholder="m"
                min="0" max="180"
                autoFocus
              />
              <span>:</span>
              <input
                type="number"
                className="timer-compact-input"
                value={inputSeconds}
                onChange={(e) => setInputSeconds(e.target.value)}
                placeholder="s"
                min="0" max="59"
              />
              <button className="timer-compact-btn confirm" onClick={handleSetTime}>✓</button>
              <button className="timer-compact-btn cancel" onClick={() => setIsSettingTime(false)}>✕</button>
            </div>
          ) : (
            <span className="timer-compact-time">{formatTime(displayTime)}</span>
          )}
        </div>
        {!isSettingTime && (
          <div className="timer-compact-controls">
            {timeLeft === 0 && hasTimerRun ? (
              <>
                <button className="timer-compact-btn" onClick={handleRepeat} title="Repeat">↺</button>
                <button className="timer-compact-btn" onClick={handleStop} title="Reset">⏹</button>
              </>
            ) : isRunning ? (
              <>
                <button className="timer-compact-btn" onClick={handlePause} title="Pause">⏸</button>
                <button className="timer-compact-btn" onClick={handleRestart} title="Restart">↺</button>
              </>
            ) : (
              <>
                <button className="timer-compact-btn play" onClick={handleStart} title="Start">▶</button>
                {timeLeft > 0 && timeLeft < initialTime && (
                  <button className="timer-compact-btn" onClick={handleStop} title="Reset">⏹</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`timer-large ${isPopup ? 'popup-mode' : ''}`}>
      {isSettingTime ? (
        <div className="timer-setting-panel">
          <div className="timer-input-group">
            <input
              type="number"
              className="timer-input-large"
              value={inputMinutes}
              onChange={(e) => setInputMinutes(e.target.value)}
              placeholder="Min"
              min="0"
              max="180"
              autoFocus
            />
            <span className="timer-colon-large">:</span>
            <input
              type="number"
              className="timer-input-large"
              value={inputSeconds}
              onChange={(e) => setInputSeconds(e.target.value)}
              placeholder="Sec"
              min="0"
              max="59"
            />
          </div>
          <div className="timer-setting-buttons">
            <button className="timer-btn-large timer-btn-confirm" onClick={handleSetTime}>
              Set Time
            </button>
            <button className="timer-btn-large timer-btn-cancel" onClick={() => setIsSettingTime(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={`timer-circle ${isAlarming ? 'alarming' : ''} ${isRunning ? 'running' : ''}`}>
            {isPopup ? (
              <svg className="timer-progress-ring" width="160" height="160" viewBox="0 0 160 160">
                <circle
                  className="timer-progress-ring-circle-bg"
                  stroke="#2a2a2a"
                  strokeWidth="7"
                  fill="transparent"
                  r="72"
                  cx="80"
                  cy="80"
                />
                <circle
                  className="timer-progress-ring-circle"
                  stroke="url(#gradient-popup)"
                  strokeWidth="7"
                  fill="transparent"
                  r="72"
                  cx="80"
                  cy="80"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 72}`,
                    strokeDashoffset: `${2 * Math.PI * 72 * (1 - (progress / 100))}`,
                  }}
                />
                <defs>
                  <linearGradient id="gradient-popup" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#667eea" />
                    <stop offset="100%" stopColor="#764ba2" />
                  </linearGradient>
                </defs>
              </svg>
            ) : (
              <svg className="timer-progress-ring" width="200" height="200">
                <circle
                  className="timer-progress-ring-circle-bg"
                  stroke="#2a2a2a"
                  strokeWidth="8"
                  fill="transparent"
                  r="90"
                  cx="100"
                  cy="100"
                />
                <circle
                  className="timer-progress-ring-circle"
                  stroke="url(#gradient)"
                  strokeWidth="8"
                  fill="transparent"
                  r="90"
                  cx="100"
                  cy="100"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 90}`,
                    strokeDashoffset: `${2 * Math.PI * 90 * (1 - (progress / 100))}`,
                  }}
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#667eea" />
                    <stop offset="100%" stopColor="#764ba2" />
                  </linearGradient>
                </defs>
              </svg>
            )}
            <div className="timer-display-large" onClick={() => !isRunning && setIsSettingTime(true)}>
              {formatTime(displayTime)}
            </div>
          </div>

          <div className="timer-controls-large">
            {timeLeft === 0 && hasTimerRun ? (
              <>
                <button className="timer-btn-large timer-btn-play" onClick={handleRepeat}>
                  🔁 Repeat
                </button>
                <button className="timer-btn-large timer-btn-reset" onClick={handleStop}>
                  ⏹ Reset
                </button>
              </>
            ) : isRunning ? (
              <>
                <button className="timer-btn-large timer-btn-pause-large" onClick={handlePause}>
                  ⏸ Pause
                </button>
                <button className="timer-btn-large timer-btn-restart" onClick={handleRestart}>
                  🔄 Restart
                </button>
              </>
            ) : (
              <>
                <button className="timer-btn-large timer-btn-play" onClick={handleStart}>
                  ▶ Start
                </button>
                {timeLeft > 0 && timeLeft < initialTime && (
                  <button className="timer-btn-large timer-btn-reset" onClick={handleStop}>
                    ⏹ Reset
                  </button>
                )}
              </>
            )}
          </div>

          <div className="timer-presets">
            {presets.map(min => (
              <button
                key={min}
                className="timer-preset-btn"
                onClick={() => setPresetTime(min)}
              >
                {min}m
              </button>
            ))}
          </div>

          {/* Popup button - only show in main window */}
          {!isPopup && (
            <div className="timer-popup-controls">
              <button className="timer-popup-btn" onClick={() => openPopup(false)} title="Open as popup">
                ⬈ Popup
              </button>
              <button className="timer-popup-btn mini" onClick={() => openPopup(true)} title="Open as mini popup">
                ⬈ Mini
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Timer;

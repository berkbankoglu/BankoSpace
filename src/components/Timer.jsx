import { useState, useEffect, useRef } from 'react';

function Timer() {
  const [timeLeft, setTimeLeft] = useState(0);
  const [initialTime, setInitialTime] = useState(30 * 60); // 30 dakika varsayılan
  const [isRunning, setIsRunning] = useState(false);
  const [isSettingTime, setIsSettingTime] = useState(false);
  const [inputMinutes, setInputMinutes] = useState('30');
  const [inputSeconds, setInputSeconds] = useState('0');
  const [isAlarming, setIsAlarming] = useState(false);
  const [hasTimerRun, setHasTimerRun] = useState(false); // Timer en az bir kez çalıştı mı?
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

  // Alarm kontrolü için ayrı useEffect
  useEffect(() => {
    // Sadece timer en az bir kez çalıştıysa ve bittiğinde alarm çal
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
    // Web Audio API ile alarm sesi oluştur
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

    // 3 kez tekrarla
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
    stopAlarm(); // Stop alarm first
    if (timeLeft === 0) {
      setTimeLeft(initialTime);
    }
    setIsRunning(true);
    setHasTimerRun(true); // Timer başlatıldı, işaretle
  };

  const handlePause = () => {
    setIsRunning(false);
    stopAlarm(); // Stop alarm when pausing
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(0);
    setHasTimerRun(false); // Reset durumunda timer'ın çalıştığını sıfırla
    stopAlarm();
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
  const progress = initialTime > 0 ? ((initialTime - timeLeft) / initialTime) * 100 : 0;

  return (
    <div className="timer-compact">
      {isSettingTime ? (
        <div className="timer-setting-inline">
          <input
            type="number"
            className="timer-input-small"
            value={inputMinutes}
            onChange={(e) => setInputMinutes(e.target.value)}
            placeholder="dk"
            min="0"
            max="180"
            autoFocus
          />
          <span className="timer-colon">:</span>
          <input
            type="number"
            className="timer-input-small"
            value={inputSeconds}
            onChange={(e) => setInputSeconds(e.target.value)}
            placeholder="sn"
            min="0"
            max="59"
          />
          <button className="timer-btn-small timer-btn-primary" onClick={handleSetTime}>
            ✓
          </button>
          <button className="timer-btn-small" onClick={() => setIsSettingTime(false)}>
            ✕
          </button>
        </div>
      ) : (
        <div className="timer-inline">
          <div className={`timer-display-small ${isAlarming ? 'alarming' : ''}`} onClick={() => !isRunning && setIsSettingTime(true)}>
            <div className="timer-progress-mini">
              <div className="timer-progress-fill-mini" style={{ width: `${progress}%` }}></div>
            </div>
            <span className="timer-time-text">{formatTime(displayTime)}</span>
          </div>
          <div className="timer-controls-inline">
            {!isRunning ? (
              <button className="timer-btn-small timer-btn-start" onClick={handleStart}>
                ▶
              </button>
            ) : (
              <button className="timer-btn-small timer-btn-pause" onClick={handlePause}>
                ⏸
              </button>
            )}
            {(timeLeft > 0 || isRunning || isAlarming) && (
              <button className="timer-btn-small" onClick={handleReset}>
                ⏹
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Timer;

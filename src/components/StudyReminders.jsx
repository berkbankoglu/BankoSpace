import { useState, useEffect, useRef } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

function StudyReminders() {
  const [reminders, setReminders] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderTime, setNewReminderTime] = useState('');
  const [newReminderDays, setNewReminderDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri default
  const [newReminderEnabled, setNewReminderEnabled] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [alarmingId, setAlarmingId] = useState(null);
  const alarmIntervalRef = useRef(null);
  const [editingTimeId, setEditingTimeId] = useState(null);
  const [editingTimeValue, setEditingTimeValue] = useState('');

  const daysOfWeek = [
    { id: 0, name: 'Sunday', short: 'Sun' },
    { id: 1, name: 'Monday', short: 'Mon' },
    { id: 2, name: 'Tuesday', short: 'Tue' },
    { id: 3, name: 'Wednesday', short: 'Wed' },
    { id: 4, name: 'Thursday', short: 'Thu' },
    { id: 5, name: 'Friday', short: 'Fri' },
    { id: 6, name: 'Saturday', short: 'Sat' }
  ];

  // Load reminders from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('studyReminders');
    if (saved) {
      setReminders(JSON.parse(saved));
    }
    checkPermission();
  }, []);

  // Save reminders to localStorage
  useEffect(() => {
    localStorage.setItem('studyReminders', JSON.stringify(reminders));
  }, [reminders]);

  // Check and request notification permission
  const checkPermission = async () => {
    try {
      let permission = await isPermissionGranted();
      if (!permission) {
        const result = await requestPermission();
        permission = result === 'granted';
      }
      setPermissionGranted(permission);

      // Also request browser notification permission as fallback
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch (error) {
      console.error('Permission check error:', error);
      // Try browser notification as fallback
      if ('Notification' in window && Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (err) {
          console.error('Browser notification error:', err);
        }
      }
    }
  };

  // Alarm sound functions
  const playAlarmSound = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.value = 1000;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.5);
    }, 200);

    setTimeout(() => {
      const osc3 = audioContext.createOscillator();
      const gain3 = audioContext.createGain();
      osc3.connect(gain3);
      gain3.connect(audioContext.destination);
      osc3.frequency.value = 800;
      osc3.type = 'sine';
      gain3.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      osc3.start(audioContext.currentTime);
      osc3.stop(audioContext.currentTime + 0.5);
    }, 400);
  };

  const triggerAlarm = (reminderId) => {
    setAlarmingId(reminderId);
    playAlarmSound();

    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
    }

    alarmIntervalRef.current = setInterval(() => {
      playAlarmSound();
    }, 3000);
  };

  const stopAlarm = () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    setAlarmingId(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
    };
  }, []);

  // Check reminders every minute
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      reminders.forEach(reminder => {
        if (reminder.enabled && reminder.days.includes(currentDay) && reminder.time === currentTime) {
          // Trigger alarm sound
          triggerAlarm(reminder.id);

          if (permissionGranted) {
            sendNotification({
              title: reminder.title || 'Study Reminder',
              body: `Time to study! It's ${reminder.time}`,
            });
          }
          // Also show browser notification as fallback
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(reminder.title || 'Study Reminder', {
              body: `Time to study! It's ${reminder.time}`,
              icon: '/icon.png'
            });
          }
        }
      });
    };

    // Check every minute
    const interval = setInterval(checkReminders, 60000);
    // Also check immediately
    checkReminders();

    return () => clearInterval(interval);
  }, [reminders, permissionGranted]);

  const addReminder = () => {
    if (newReminderTime && newReminderDays.length > 0) {
      const reminder = {
        id: Date.now(),
        title: newReminderTitle.trim() || 'Study Time',
        time: newReminderTime,
        days: newReminderDays,
        enabled: newReminderEnabled,
        createdAt: Date.now()
      };
      setReminders([...reminders, reminder]);
      setNewReminderTitle('');
      setNewReminderTime('');
      setNewReminderDays([1, 2, 3, 4, 5]);
      setNewReminderEnabled(true);
      setShowAddForm(false);
    }
  };

  const toggleReminder = (id) => {
    setReminders(reminders.map(reminder =>
      reminder.id === id ? { ...reminder, enabled: !reminder.enabled } : reminder
    ));
  };

  const deleteReminder = (id) => {
    if (window.confirm('Delete this reminder?')) {
      setReminders(reminders.filter(reminder => reminder.id !== id));
    }
  };

  const toggleDay = (dayId) => {
    if (newReminderDays.includes(dayId)) {
      setNewReminderDays(newReminderDays.filter(d => d !== dayId));
    } else {
      setNewReminderDays([...newReminderDays, dayId].sort());
    }
  };

  const getDaysText = (days) => {
    if (days.length === 7) return 'Every day';
    if (JSON.stringify(days) === JSON.stringify([1, 2, 3, 4, 5])) return 'Weekdays';
    if (JSON.stringify(days) === JSON.stringify([0, 6])) return 'Weekends';
    return days.map(d => daysOfWeek.find(day => day.id === d)?.short).join(', ');
  };

  const startEditingTime = (reminder) => {
    setEditingTimeId(reminder.id);
    setEditingTimeValue(reminder.time);
  };

  const saveEditingTime = (id) => {
    if (editingTimeValue) {
      setReminders(reminders.map(r =>
        r.id === id ? { ...r, time: editingTimeValue } : r
      ));
    }
    setEditingTimeId(null);
    setEditingTimeValue('');
  };

  const cancelEditingTime = () => {
    setEditingTimeId(null);
    setEditingTimeValue('');
  };

  return (
    <div className="reminders-container">
      <div className="reminders-header">
        <div className="reminders-info">
          <div className="reminders-stat">
            {reminders.length} reminder{reminders.length !== 1 ? 's' : ''}
          </div>
          <div className="reminders-stat">
            {reminders.filter(r => r.enabled).length} active
          </div>
          {!permissionGranted && (
            <div className="reminders-warning" onClick={checkPermission}>
              ⚠️ Notifications disabled - Click to enable
            </div>
          )}
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="reminders-add-btn"
        >
          {showAddForm ? '✕ Close' : '+ New Reminder'}
        </button>
      </div>

      {showAddForm && (
        <div className="reminders-add-form">
          <input
            type="text"
            placeholder="Reminder title (e.g., Math Study Time)"
            value={newReminderTitle}
            onChange={(e) => setNewReminderTitle(e.target.value)}
            className="reminders-input"
          />

          <div className="reminders-form-group">
            <label>Time</label>
            <input
              type="time"
              value={newReminderTime}
              onChange={(e) => setNewReminderTime(e.target.value)}
              className="reminders-time-input"
            />
          </div>

          <div className="reminders-form-group">
            <label>Days</label>
            <div className="reminders-days-grid">
              {daysOfWeek.map(day => (
                <button
                  key={day.id}
                  onClick={() => toggleDay(day.id)}
                  className={`reminders-day-btn ${newReminderDays.includes(day.id) ? 'active' : ''}`}
                >
                  {day.short}
                </button>
              ))}
            </div>
            <div className="reminders-quick-select">
              <button onClick={() => setNewReminderDays([1, 2, 3, 4, 5])} className="reminders-quick-btn">
                Weekdays
              </button>
              <button onClick={() => setNewReminderDays([0, 6])} className="reminders-quick-btn">
                Weekends
              </button>
              <button onClick={() => setNewReminderDays([0, 1, 2, 3, 4, 5, 6])} className="reminders-quick-btn">
                Every day
              </button>
            </div>
          </div>

          <button onClick={addReminder} className="reminders-save-btn" disabled={!newReminderTime || newReminderDays.length === 0}>
            Save Reminder
          </button>
        </div>
      )}

      <div className="reminders-list">
        {reminders.length === 0 ? (
          <div className="reminders-empty">
            No study reminders yet. Create one to get notified!
          </div>
        ) : (
          reminders.map(reminder => (
            <div
              key={reminder.id}
              className={`reminders-item ${!reminder.enabled ? 'disabled' : ''} ${alarmingId === reminder.id ? 'alarming' : ''}`}
            >
              <div className="reminders-item-header">
                {editingTimeId === reminder.id ? (
                  <input
                    type="time"
                    value={editingTimeValue}
                    onChange={(e) => setEditingTimeValue(e.target.value)}
                    onBlur={() => saveEditingTime(reminder.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditingTime(reminder.id);
                      if (e.key === 'Escape') cancelEditingTime();
                    }}
                    className="reminders-item-time-edit"
                    autoFocus
                  />
                ) : (
                  <div
                    className="reminders-item-time"
                    onClick={() => startEditingTime(reminder)}
                    style={{ cursor: 'pointer' }}
                    title="Click to edit time"
                  >
                    {reminder.time}
                  </div>
                )}
                <div className="reminders-item-actions">
                  <button
                    onClick={() => toggleReminder(reminder.id)}
                    className={`reminders-toggle-btn ${reminder.enabled ? 'enabled' : 'disabled'}`}
                    title={reminder.enabled ? 'Disable' : 'Enable'}
                  >
                    {reminder.enabled ? '🔔' : '🔕'}
                  </button>
                  <button
                    onClick={() => deleteReminder(reminder.id)}
                    className="reminders-delete-btn"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="reminders-item-title">{reminder.title}</div>
              <div className="reminders-item-days">{getDaysText(reminder.days)}</div>
              {alarmingId === reminder.id && (
                <button
                  onClick={stopAlarm}
                  className="reminders-stop-alarm-btn-bottom"
                >
                  🔕 Stop Alarm
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default StudyReminders;

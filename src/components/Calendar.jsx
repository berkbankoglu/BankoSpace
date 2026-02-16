import { useState, useMemo } from 'react';
import './Calendar.css';

function Calendar({ todos, onToggleTodo, onUpdateTodo }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Group todos by dueDate for fast lookup
  const todosByDate = useMemo(() => {
    const map = new Map();
    todos.forEach(todo => {
      if (todo.dueDate) {
        const existing = map.get(todo.dueDate) || [];
        existing.push(todo);
        map.set(todo.dueDate, existing);
      }
    });
    return map;
  }, [todos]);

  const getCalendarDays = () => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const date = new Date(year, month - 1, day);
      days.push({ day, isCurrentMonth: false, date });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, isCurrentMonth: true, date: new Date(year, month, d) });
    }

    // Next month padding
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push({ day: d, isCurrentMonth: false, date: new Date(year, month + 1, d) });
    }

    return days;
  };

  const formatDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getTodosForDate = (date) => {
    const key = formatDateKey(date);
    return todosByDate.get(key) || [];
  };

  const isSameDay = (d1, d2) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const isOverdue = (dateStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    return due < today;
  };

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const calendarDays = getCalendarDays();
  const today = new Date();
  const selectedDateTodos = selectedDate ? getTodosForDate(selectedDate) : [];

  const monthLabel = currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  return (
    <div className="calendar-container">
      {/* Header */}
      <div className="calendar-header">
        <h1 className="calendar-title">Calendar</h1>
        <div className="calendar-nav">
          <button className="calendar-nav-btn" onClick={goToPrevMonth}>&lt;</button>
          <span className="calendar-month-label">{monthLabel}</span>
          <button className="calendar-nav-btn" onClick={goToNextMonth}>&gt;</button>
          <button className="calendar-today-btn" onClick={goToToday}>Today</button>
        </div>
      </div>

      <div className="calendar-body">
        {/* Calendar Grid */}
        <div className="calendar-grid-wrapper">
          <div className="calendar-weekdays">
            {['Pzr', 'Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt'].map(d => (
              <div key={d} className="calendar-weekday">{d}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map((dayObj, i) => {
              const dayTodos = getTodosForDate(dayObj.date);
              const isToday = isSameDay(dayObj.date, today);
              const isSelected = selectedDate && isSameDay(dayObj.date, selectedDate);
              const hasOverdue = dayTodos.some(t => !t.completed && isOverdue(t.dueDate));

              return (
                <div
                  key={i}
                  className={`calendar-day ${!dayObj.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedDate(dayObj.date)}
                >
                  <span className="calendar-day-number">{dayObj.day}</span>
                  {dayTodos.length > 0 && (
                    <div className="calendar-day-indicators">
                      {dayTodos.length <= 3 ? (
                        dayTodos.map(t => (
                          <span
                            key={t.id}
                            className={`calendar-dot ${t.completed ? 'completed' : ''} ${!t.completed && isOverdue(t.dueDate) ? 'overdue' : ''}`}
                          />
                        ))
                      ) : (
                        <span className="calendar-day-count">{dayTodos.length}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Side Panel */}
        <div className="calendar-day-panel">
          {selectedDate ? (
            <>
              <h3 className="calendar-panel-title">
                {selectedDate.toLocaleDateString('tr-TR', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <div className="calendar-panel-todos">
                {selectedDateTodos.length === 0 ? (
                  <div className="calendar-panel-empty">Bu gün icin gorev yok</div>
                ) : (
                  selectedDateTodos.map(todo => (
                    <div
                      key={todo.id}
                      className={`calendar-todo-item ${todo.completed ? 'completed' : ''} ${!todo.completed && isOverdue(todo.dueDate) ? 'overdue' : ''}`}
                    >
                      <label className="calendar-todo-label">
                        <input
                          type="checkbox"
                          className="calendar-todo-checkbox"
                          checked={todo.completed}
                          onChange={() => onToggleTodo(todo.id)}
                        />
                        <span className="calendar-todo-checkmark"></span>
                        <span className="calendar-todo-text">{todo.text}</span>
                      </label>
                      <span className="calendar-todo-category">{todo.category}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="calendar-panel-empty">Gorevleri gormek icin bir gun secin</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Calendar;

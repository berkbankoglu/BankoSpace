import { useState, useEffect } from 'react';

function Goals() {
  const [goals, setGoals] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState(100);
  const [newGoalDeadline, setNewGoalDeadline] = useState('');
  const [newGoalCategory, setNewGoalCategory] = useState('general');
  const [filterStatus, setFilterStatus] = useState('active'); // active, completed, all
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Load goals from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('goals');
    if (saved) {
      setGoals(JSON.parse(saved));
    }
  }, []);

  // Save goals to localStorage
  useEffect(() => {
    localStorage.setItem('goals', JSON.stringify(goals));
  }, [goals]);

  const addGoal = () => {
    if (newGoalTitle.trim()) {
      const goal = {
        id: Date.now(),
        title: newGoalTitle.trim(),
        description: newGoalDescription.trim(),
        target: newGoalTarget,
        current: 0,
        deadline: newGoalDeadline,
        category: newGoalCategory,
        completed: false,
        createdAt: Date.now()
      };
      setGoals([...goals, goal]);
      setNewGoalTitle('');
      setNewGoalDescription('');
      setNewGoalTarget(100);
      setNewGoalDeadline('');
      setNewGoalCategory('general');
      setShowAddForm(false);
    }
  };

  const updateProgress = (id, value) => {
    setGoals(goals.map(goal => {
      if (goal.id === id) {
        const newCurrent = Math.max(0, Math.min(goal.target, value));
        return {
          ...goal,
          current: newCurrent,
          completed: newCurrent >= goal.target
        };
      }
      return goal;
    }));
  };

  const deleteGoal = (id) => {
    if (window.confirm('Delete this goal?')) {
      setGoals(goals.filter(goal => goal.id !== id));
    }
  };

  const toggleComplete = (id) => {
    setGoals(goals.map(goal =>
      goal.id === id ? { ...goal, completed: !goal.completed } : goal
    ));
  };

  const startEditingTitle = (goal) => {
    setEditingGoalId(goal.id);
    setEditingTitle(goal.title);
  };

  const saveEditedTitle = (id) => {
    if (editingTitle.trim()) {
      setGoals(goals.map(goal =>
        goal.id === id ? { ...goal, title: editingTitle.trim() } : goal
      ));
    }
    setEditingGoalId(null);
    setEditingTitle('');
  };

  const cancelEditingTitle = () => {
    setEditingGoalId(null);
    setEditingTitle('');
  };

  const getProgressPercentage = (goal) => {
    return Math.round((goal.current / goal.target) * 100);
  };

  const getDaysRemaining = (deadline) => {
    if (!deadline) return null;
    const now = new Date();
    const end = new Date(deadline);
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const filteredGoals = goals.filter(goal => {
    if (filterStatus === 'active') return !goal.completed;
    if (filterStatus === 'completed') return goal.completed;
    return true;
  });

  const categoryColors = {
    general: '#667eea',
    daily: '#48bb78',
    weekly: '#ed8936',
    monthly: '#9f7aea',
    longterm: '#38b2ac'
  };

  return (
    <div className="goals-container">
      <div className="goals-header">
        <div className="goals-actions">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="goals-filter-select"
          >
            <option value="all">All Goals</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="goals-add-btn"
          >
            {showAddForm ? '✕ Close' : '+ New Goal'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="goals-add-form">
          <input
            type="text"
            placeholder="Goal title"
            value={newGoalTitle}
            onChange={(e) => setNewGoalTitle(e.target.value)}
            className="goals-input"
            onKeyDown={(e) => e.key === 'Enter' && addGoal()}
          />
          <textarea
            placeholder="Description (optional)"
            value={newGoalDescription}
            onChange={(e) => setNewGoalDescription(e.target.value)}
            className="goals-textarea"
            rows="2"
          />
          <div className="goals-form-row">
            <div className="goals-form-group">
              <label>Target Value</label>
              <input
                type="number"
                value={newGoalTarget}
                onChange={(e) => setNewGoalTarget(parseInt(e.target.value) || 0)}
                className="goals-input-small"
                min="1"
              />
            </div>
            <div className="goals-form-group">
              <label>Deadline</label>
              <input
                type="date"
                value={newGoalDeadline}
                onChange={(e) => setNewGoalDeadline(e.target.value)}
                className="goals-input-small"
              />
            </div>
            <div className="goals-form-group">
              <label>Category</label>
              <select
                value={newGoalCategory}
                onChange={(e) => setNewGoalCategory(e.target.value)}
                className="goals-input-small"
              >
                <option value="general">General</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="longterm">Long Term</option>
              </select>
            </div>
          </div>
          <button onClick={addGoal} className="goals-save-btn">
            Save Goal
          </button>
        </div>
      )}

      <div className="goals-list">
        {filteredGoals.length === 0 ? (
          <div className="goals-empty">
            {filterStatus === 'active' && goals.length > 0
              ? 'No active goals. All goals completed!'
              : filterStatus === 'completed' && goals.length > 0
              ? 'No completed goals yet.'
              : 'No goals yet. Create one to get started!'}
          </div>
        ) : (
          filteredGoals.map(goal => {
            const progress = getProgressPercentage(goal);
            const daysRemaining = getDaysRemaining(goal.deadline);
            const isOverdue = daysRemaining !== null && daysRemaining < 0 && !goal.completed;
            const isUrgent = daysRemaining !== null && daysRemaining <= 3 && daysRemaining >= 0;

            return (
              <div
                key={goal.id}
                className={`goals-item ${goal.completed ? 'completed' : ''}`}
              >
                <div className="goals-item-header">
                  <div className="goals-item-title-row">
                    <div
                      className="goals-category-badge"
                      style={{ backgroundColor: categoryColors[goal.category] }}
                    >
                      {goal.category}
                    </div>
                    {editingGoalId === goal.id ? (
                      <div className="goals-title-edit-container">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditedTitle(goal.id);
                            if (e.key === 'Escape') cancelEditingTitle();
                          }}
                          onBlur={() => saveEditedTitle(goal.id)}
                          className="goals-title-edit-input"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <h3
                        className="goals-item-title editable-goal-title"
                        onDoubleClick={() => startEditingTitle(goal)}
                      >
                        {goal.title}
                      </h3>
                    )}
                    {isOverdue && <span className="goals-overdue-badge">Overdue</span>}
                    {isUrgent && <span className="goals-urgent-badge">Urgent</span>}
                  </div>
                  <button
                    onClick={() => deleteGoal(goal.id)}
                    className="goals-delete-btn"
                    title="Delete goal"
                  >
                    ✕
                  </button>
                </div>

                {goal.description && (
                  <p className="goals-item-description">{goal.description}</p>
                )}

                <div className="goals-progress-section">
                  <div className="goals-progress-info">
                    <span>{goal.current} / {goal.target}</span>
                    <span className="goals-progress-percentage">{progress}%</span>
                  </div>
                  <div className="goals-progress-bar">
                    <div
                      className="goals-progress-fill"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: goal.completed
                          ? '#48bb78'
                          : progress >= 75
                          ? '#667eea'
                          : progress >= 50
                          ? '#ed8936'
                          : '#e53e3e'
                      }}
                    />
                  </div>
                </div>

                <div className="goals-item-controls">
                  <div className="goals-update-section">
                    <button
                      onClick={() => updateProgress(goal.id, goal.current - 1)}
                      className="goals-update-btn"
                      disabled={goal.current <= 0}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={goal.current}
                      onChange={(e) => updateProgress(goal.id, parseInt(e.target.value) || 0)}
                      className="goals-progress-input"
                      min="0"
                      max={goal.target}
                    />
                    <button
                      onClick={() => updateProgress(goal.id, goal.current + 1)}
                      className="goals-update-btn"
                      disabled={goal.current >= goal.target}
                    >
                      +
                    </button>
                  </div>

                  <div className="goals-item-meta">
                    {goal.deadline && (
                      <span className={`goals-deadline ${isOverdue ? 'overdue' : isUrgent ? 'urgent' : ''}`}>
                        {daysRemaining !== null && daysRemaining >= 0
                          ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`
                          : daysRemaining !== null && daysRemaining < 0
                          ? `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''} overdue`
                          : new Date(goal.deadline).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      onClick={() => toggleComplete(goal.id)}
                      className={`goals-complete-btn ${goal.completed ? 'completed' : ''}`}
                    >
                      {goal.completed ? '✓ Completed' : 'Mark Complete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Goals;

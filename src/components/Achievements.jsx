import { useState, useEffect } from 'react';

function Achievements() {
  const [streakData, setStreakData] = useState({ currentStreak: 0, bestStreak: 0 });
  const [todos, setTodos] = useState([]);
  const [goals, setGoals] = useState([]);
  const [flashCards, setFlashCards] = useState([]);

  // Load data from localStorage
  useEffect(() => {
    const loadedStreak = localStorage.getItem('streakData');
    if (loadedStreak) {
      setStreakData(JSON.parse(loadedStreak));
    }

    const loadedTodos = localStorage.getItem('todos');
    if (loadedTodos) {
      setTodos(JSON.parse(loadedTodos));
    }

    const loadedGoals = localStorage.getItem('goals');
    if (loadedGoals) {
      setGoals(JSON.parse(loadedGoals));
    }

    const loadedCards = localStorage.getItem('flashCards');
    if (loadedCards) {
      setFlashCards(JSON.parse(loadedCards));
    }

    // Listen for storage changes
    const handleStorage = () => {
      const newStreak = localStorage.getItem('streakData');
      if (newStreak) setStreakData(JSON.parse(newStreak));

      const newTodos = localStorage.getItem('todos');
      if (newTodos) setTodos(JSON.parse(newTodos));

      const newGoals = localStorage.getItem('goals');
      if (newGoals) setGoals(JSON.parse(newGoals));

      const newCards = localStorage.getItem('flashCards');
      if (newCards) setFlashCards(JSON.parse(newCards));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Define all achievements
  const generateAchievements = () => {
    const achievementsList = [];
    const icons = ['🔥', '⚡', '💪', '👑', '🏆', '✅', '📝', '🎯', '🎪', '🌟', '📚', '🧠', '💎', '🎓', '🚀', '⭐', '🏅', '🎨', '💡', '🌈'];
    const rarities = ['common', 'rare', 'epic', 'legendary'];

    // Streak achievements (25 total)
    const streakMilestones = [1, 2, 3, 5, 7, 10, 14, 20, 25, 30, 40, 50, 60, 75, 90, 100, 120, 150, 180, 200, 250, 300, 365, 500, 730];
    streakMilestones.forEach((days, index) => {
      achievementsList.push({
        id: `streak_${days}`,
        title: `${days} Day Streak`,
        description: `Complete tasks for ${days} days in a row`,
        icon: icons[index % icons.length],
        unlocked: streakData.currentStreak >= days || streakData.bestStreak >= days,
        progress: Math.min(streakData.currentStreak, days),
        total: days,
        category: 'streak',
        rarity: index < 8 ? 'common' : index < 15 ? 'rare' : index < 20 ? 'epic' : 'legendary'
      });
    });

    // Todo achievements (25 total)
    const todoMilestones = [1, 5, 10, 15, 20, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000];
    todoMilestones.forEach((count, index) => {
      achievementsList.push({
        id: `todos_${count}`,
        title: `${count} Tasks Done`,
        description: `Complete ${count} todos`,
        icon: icons[(index + 5) % icons.length],
        unlocked: todos.filter(t => t.completed).length >= count,
        progress: Math.min(todos.filter(t => t.completed).length, count),
        total: count,
        category: 'todos',
        rarity: index < 8 ? 'common' : index < 15 ? 'rare' : index < 20 ? 'epic' : 'legendary'
      });
    });

    // Goal achievements (25 total)
    const goalMilestones = [1, 2, 3, 5, 7, 10, 12, 15, 20, 25, 30, 35, 40, 50, 60, 75, 90, 100, 125, 150, 175, 200, 250, 300, 365];
    goalMilestones.forEach((count, index) => {
      achievementsList.push({
        id: `goals_${count}`,
        title: `${count} Goals Achieved`,
        description: `Complete ${count} goals`,
        icon: icons[(index + 10) % icons.length],
        unlocked: goals.filter(g => g.completed).length >= count,
        progress: Math.min(goals.filter(g => g.completed).length, count),
        total: count,
        category: 'goals',
        rarity: index < 8 ? 'common' : index < 15 ? 'rare' : index < 20 ? 'epic' : 'legendary'
      });
    });

    // Flash cards achievements (25 total)
    const cardMilestones = [1, 5, 10, 15, 20, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400, 500, 600, 750, 1000, 1250, 1500, 2000, 2500];
    cardMilestones.forEach((count, index) => {
      achievementsList.push({
        id: `cards_${count}`,
        title: `${count} Cards Studied`,
        description: `Study ${count} flash cards`,
        icon: icons[(index + 15) % icons.length],
        unlocked: flashCards.filter(c => c.studyCount > 0).length >= count,
        progress: Math.min(flashCards.filter(c => c.studyCount > 0).length, count),
        total: count,
        category: 'study',
        rarity: index < 8 ? 'common' : index < 15 ? 'rare' : index < 20 ? 'epic' : 'legendary'
      });
    });

    return achievementsList;
  };

  const achievements = generateAchievements();

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalCount = achievements.length;
  const completionPercentage = Math.round((unlockedCount / totalCount) * 100);

  const rarityColors = {
    common: '#48bb78',
    rare: '#667eea',
    epic: '#9f7aea',
    legendary: '#ed8936'
  };

  const categoryNames = {
    streak: 'Streaks',
    todos: 'Tasks',
    goals: 'Goals',
    study: 'Study'
  };

  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all'); // all, unlocked, locked

  const filteredAchievements = achievements.filter(achievement => {
    if (filterCategory !== 'all' && achievement.category !== filterCategory) return false;
    if (filterStatus === 'unlocked' && !achievement.unlocked) return false;
    if (filterStatus === 'locked' && achievement.unlocked) return false;
    return true;
  });

  return (
    <div className="achievements-container">
      <div className="achievements-header">
        <div className="achievements-progress-section">
          <div className="achievements-progress-text">
            <span className="achievements-count">{unlockedCount} / {totalCount}</span>
            <span className="achievements-percentage">{completionPercentage}%</span>
          </div>
          <div className="achievements-progress-bar">
            <div
              className="achievements-progress-fill"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        <div className="achievements-filters">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="achievements-filter-select"
          >
            <option value="all">All Categories</option>
            <option value="streak">Streaks</option>
            <option value="todos">Tasks</option>
            <option value="goals">Goals</option>
            <option value="study">Study</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="achievements-filter-select"
          >
            <option value="all">All</option>
            <option value="unlocked">Unlocked</option>
            <option value="locked">Locked</option>
          </select>
        </div>
      </div>

      <div className="achievements-grid">
        {filteredAchievements.map(achievement => (
          <div
            key={achievement.id}
            className={`achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'}`}
            style={{
              borderColor: achievement.unlocked ? rarityColors[achievement.rarity] : '#444'
            }}
          >
            <div className="achievement-icon-section">
              <div className={`achievement-icon ${achievement.unlocked ? 'unlocked' : ''}`}>
                {achievement.icon}
              </div>
              <div
                className="achievement-rarity"
                style={{
                  backgroundColor: achievement.unlocked ? rarityColors[achievement.rarity] : '#444',
                  opacity: achievement.unlocked ? 1 : 0.5
                }}
              >
                {achievement.rarity}
              </div>
            </div>

            <div className="achievement-content">
              <div className="achievement-header">
                <h3 className="achievement-title">{achievement.title}</h3>
                <span className="achievement-category">
                  {categoryNames[achievement.category]}
                </span>
              </div>
              <p className="achievement-description">{achievement.description}</p>

              {!achievement.unlocked && (
                <div className="achievement-progress-section">
                  <div className="achievement-progress-text">
                    {achievement.progress} / {achievement.total}
                  </div>
                  <div className="achievement-progress-bar">
                    <div
                      className="achievement-progress-fill"
                      style={{
                        width: `${(achievement.progress / achievement.total) * 100}%`,
                        backgroundColor: rarityColors[achievement.rarity]
                      }}
                    />
                  </div>
                </div>
              )}

              {achievement.unlocked && (
                <div className="achievement-unlocked-badge">
                  ✓ Unlocked
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredAchievements.length === 0 && (
        <div className="achievements-empty">
          No achievements match your filters.
        </div>
      )}
    </div>
  );
}

export default Achievements;

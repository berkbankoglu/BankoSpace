import { useState, useEffect } from 'react';

function ProductivityHeatmap() {
  const [activityData, setActivityData] = useState({});

  // Load login data from localStorage
  useEffect(() => {
    const loadedActivity = localStorage.getItem('loginHeatmap');
    if (loadedActivity) {
      setActivityData(JSON.parse(loadedActivity));
    }

    // Mark today as active
    const today = new Date().toISOString().split('T')[0];
    const currentActivity = loadedActivity ? JSON.parse(loadedActivity) : {};

    if (!currentActivity[today]) {
      currentActivity[today] = true;
      localStorage.setItem('loginHeatmap', JSON.stringify(currentActivity));
      setActivityData(currentActivity);
    }
  }, []);

  // Generate last 12 weeks of dates
  const generateHeatmapData = () => {
    const weeks = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (12 * 7)); // 12 weeks ago

    // Start from the most recent Sunday
    const dayOfWeek = today.getDay();
    const mostRecentSunday = new Date(today);
    mostRecentSunday.setDate(today.getDate() - dayOfWeek);

    for (let week = 0; week < 12; week++) {
      const weekDays = [];
      for (let day = 0; day < 7; day++) {
        const date = new Date(mostRecentSunday);
        date.setDate(mostRecentSunday.getDate() - ((11 - week) * 7) + day);

        const dateStr = date.toISOString().split('T')[0];
        const isActive = activityData[dateStr] || false;

        weekDays.push({
          date: dateStr,
          isActive: isActive,
          day: day
        });
      }
      weeks.push(weekDays);
    }

    return weeks;
  };

  const getIntensityClass = (isActive) => {
    return isActive ? 'heatmap-cell-active' : 'heatmap-cell-inactive';
  };

  const weeks = generateHeatmapData();
  const totalActiveDays = Object.values(activityData).filter(v => v).length;

  return (
    <div className="heatmap-container">
      <div className="heatmap-header">
        <h3>Login Heat</h3>
        <span className="heatmap-total">{totalActiveDays} days active</span>
      </div>

      <div className="heatmap-content">
        <div className="heatmap-grid">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="heatmap-week">
              {week.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  className={`heatmap-cell ${getIntensityClass(day.isActive)}`}
                  title={`${day.date}`}
                >
                  <span className="heatmap-tooltip">
                    {new Date(day.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}: {day.isActive ? '✓ Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="heatmap-legend">
          <span>Inactive</span>
          <div className="heatmap-cell heatmap-cell-inactive"></div>
          <div className="heatmap-cell heatmap-cell-active"></div>
          <span>Active</span>
        </div>
      </div>
    </div>
  );
}

export default ProductivityHeatmap;

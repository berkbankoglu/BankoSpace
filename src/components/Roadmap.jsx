import { useState, useEffect } from 'react';
import './Roadmap.css';

function Roadmap() {
  const [roadmapData, setRoadmapData] = useState(() => {
    const saved = localStorage.getItem('roadmapProgress');
    return saved ? JSON.parse(saved) : getInitialRoadmapData();
  });

  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    localStorage.setItem('roadmapProgress', JSON.stringify(roadmapData));
  }, [roadmapData]);

  const toggleTask = (categoryId, taskId) => {
    setRoadmapData(prev => ({
      ...prev,
      categories: prev.categories.map(cat => {
        if (cat.id === categoryId) {
          return {
            ...cat,
            tasks: cat.tasks.map(task =>
              task.id === taskId ? { ...task, completed: !task.completed } : task
            )
          };
        }
        return cat;
      })
    }));
  };

  const toggleSection = (categoryId) => {
    setExpandedSections(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const calculateProgress = (tasks) => {
    const completed = tasks.filter(t => t.completed).length;
    return tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  };

  const totalProgress = () => {
    const allTasks = roadmapData.categories.flatMap(cat => cat.tasks);
    return calculateProgress(allTasks);
  };

  return (
    <div className="roadmap-container">
      <div className="roadmap-header">
        <h1>🎮 Japonya Game Dev İş Başvurusu Yol Haritası</h1>
        <div className="roadmap-meta">
          <span>Hazırlayan: Claude AI</span>
          <span>Tarih: 25 Şubat 2026</span>
          <span>Hedef: Environment Artist — Japonya</span>
        </div>
        <div className="total-progress">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${totalProgress()}%` }}></div>
          </div>
          <span className="progress-text">{totalProgress()}% Tamamlandı</span>
        </div>
      </div>

      <div className="roadmap-categories">
        {roadmapData.categories.map(category => {
          const progress = calculateProgress(category.tasks);
          const isExpanded = expandedSections[category.id] !== false;

          return (
            <div key={category.id} className="roadmap-category">
              <div
                className="category-header"
                onClick={() => toggleSection(category.id)}
              >
                <div className="category-title">
                  <span className="category-icon">{category.icon}</span>
                  <h2>{category.title}</h2>
                  <span className="category-count">
                    {category.tasks.filter(t => t.completed).length}/{category.tasks.length}
                  </span>
                </div>
                <div className="category-progress">
                  <div className="progress-bar-small">
                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                  </div>
                  <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="category-tasks">
                  {category.tasks.map(task => (
                    <div key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                      <label className="task-checkbox">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => toggleTask(category.id, task.id)}
                        />
                        <span className="checkmark"></span>
                      </label>
                      <div className="task-content">
                        <span className="task-text">{task.text}</span>
                        {task.note && <span className="task-note">{task.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="roadmap-footer">
        <button className="export-button" onClick={() => {
          const dataStr = JSON.stringify(roadmapData, null, 2);
          const dataBlob = new Blob([dataStr], { type: 'application/json' });
          const url = URL.createObjectURL(dataBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `roadmap-${new Date().toISOString().split('T')[0]}.json`;
          link.click();
          URL.revokeObjectURL(url);
        }}>
          📤 Export Roadmap
        </button>

        <button className="import-button" onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'application/json';
          input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (event) => {
                try {
                  const imported = JSON.parse(event.target.result);
                  if (imported.categories && Array.isArray(imported.categories)) {
                    setRoadmapData(imported);
                    alert('Roadmap başarıyla yüklendi!');
                  } else {
                    alert('Geçersiz roadmap formatı!');
                  }
                } catch (error) {
                  alert('Dosya okunamadı: ' + error.message);
                }
              };
              reader.readAsText(file);
            }
          };
          input.click();
        }}>
          📥 Import Roadmap
        </button>

        <button className="reset-button" onClick={() => {
          if (confirm('Tüm ilerlemeyi sıfırlamak istediğinize emin misiniz?')) {
            setRoadmapData(getInitialRoadmapData());
          }
        }}>
          🔄 İlerlemeyi Sıfırla
        </button>
      </div>
    </div>
  );
}

function getInitialRoadmapData() {
  return {
    categories: [
      {
        id: 'portfolio',
        icon: '🎨',
        title: 'A. PORTFOLYO HAZIRLIĞI',
        tasks: [
          { id: 'p1', text: 'ArtStation hesabı oluştur', completed: false },
          { id: 'p2', text: '5-7 adet game-ready environment projesi oluştur', completed: false },
          { id: 'p3', text: 'Her proje için breakdown görselleri hazırla', completed: false },
          { id: 'p4', text: 'Showreel / demo video (60-90 saniye)', completed: false },
          { id: 'p5', text: 'Mevcut archviz işlerinden game pipeline\'a uygun olanları adapte et', completed: false },
          { id: 'p6', text: 'Portfolyo PDF versiyonu (Japon firmalar PDF istiyor!)', completed: false }
        ]
      },
      {
        id: 'technical',
        icon: '🛠️',
        title: 'B. TEKNİK BECERİLER',
        tasks: [
          { id: 't1', text: 'Unreal Engine 5 — Level Design & Environment', completed: false },
          { id: 't2', text: '3D Modelleme (game-ready): Blender veya Maya', completed: false },
          { id: 't3', text: 'Substance Painter / Substance Designer (PBR texturing)', completed: false },
          { id: 't4', text: 'ZBrush (high-poly sculpting)', completed: false },
          { id: 't5', text: 'Megascans / Quixel Bridge kullanımı', completed: false },
          { id: 't6', text: 'Game-ready asset optimization (LOD, UV, polycount)', completed: false },
          { id: 't7', text: 'Basic lighting & post-processing in UE5', completed: false }
        ]
      },
      {
        id: 'japanese',
        icon: '🇯🇵',
        title: 'C. JAPONCA',
        tasks: [
          { id: 'j1', text: 'JLPT N5 hedefi (3-4 ay)', completed: false },
          { id: 'j2', text: 'JLPT N4 hedefi (6-8 ay)', completed: false },
          { id: 'j3', text: 'JLPT N3 hedefi (12-15 ay)', completed: false },
          { id: 'j4', text: 'Temel iş Japoncası (keigo/teineigo)', completed: false },
          { id: 'j5', text: 'Japonca CV yazımı (履歴書 - rirekisho formatı)', completed: false }
        ]
      },
      {
        id: 'cv',
        icon: '📄',
        title: 'D. CV / RESUME',
        tasks: [
          { id: 'c1', text: 'İngilizce CV (game industry formatında)', completed: false },
          { id: 'c2', text: 'Japonca CV (rirekisho formatı — ileride)', completed: false },
          { id: 'c3', text: 'LinkedIn profili güncelleme', completed: false },
          { id: 'c4', text: 'Cover letter şablonları (firma bazlı özelleştirilebilir)', completed: false }
        ]
      },
      {
        id: 'jobsearch',
        icon: '🔍',
        title: 'E. İŞ ARAMA PLATFORMLARI',
        tasks: [
          { id: 's1', text: 'TokyoDev hesabı (https://tokyodev.com)', completed: false, note: 'EN ÖNEMLİ' },
          { id: 's2', text: 'Glassdoor Japan', completed: false },
          { id: 's3', text: 'CareerCross (https://careercross.com)', completed: false },
          { id: 's4', text: 'Daijob (https://daijob.com)', completed: false },
          { id: 's5', text: 'LinkedIn Jobs — Japan filter', completed: false },
          { id: 's6', text: 'Firma kariyer sayfaları (doğrudan başvuru)', completed: false },
          { id: 's7', text: 'ArtStation Jobs bölümü', completed: false }
        ]
      },
      {
        id: 'visa',
        icon: '✈️',
        title: 'F. VİZE & YASAL',
        tasks: [
          { id: 'v1', text: 'Pasaport güncelliğini kontrol et', completed: false },
          { id: 'v2', text: '"Engineer/Specialist in Humanities" vize kategorisini araştır', completed: false },
          { id: 'v3', text: 'Diploma apostil / onay işlemleri', completed: false },
          { id: 'v4', text: 'Firmadan CoE (Certificate of Eligibility) süreci hakkında bilgi al', completed: false }
        ]
      }
    ]
  };
}

export default Roadmap;

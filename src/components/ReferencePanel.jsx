import { useState, useEffect, useRef } from 'react';

function ReferencePanel() {
  const [images, setImages] = useState([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [draggedImage, setDraggedImage] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingImage, setResizingImage] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const contentRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('refImages');
    if (saved) {
      setImages(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('refImages', JSON.stringify(images));
  }, [images]);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    setZoomLevel(prev => Math.max(0.3, Math.min(3, prev + delta)));
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImages(prev => [...prev, {
          id: Date.now() + index,
          src: event.target.result,
          x: 20 + index * 20,
          y: 20 + index * 20,
          width: 300,
          height: 300
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          setImages(prev => [...prev, {
            id: Date.now(),
            src: event.target.result,
            x: 50,
            y: 50,
            width: 300,
            height: 300
          }]);
        };
        reader.readAsDataURL(blob);
        e.preventDefault();
        break;
      }
    }
  };

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const handleMouseDown = (e, image, isResize) => {
    if (isResize) {
      setResizingImage(image);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: image.width,
        height: image.height
      });
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setDraggedImage(image);
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (draggedImage && contentRef.current) {
      const rect = contentRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y + contentRef.current.scrollTop;
      
      setImages(prev => prev.map(img => 
        img.id === draggedImage.id ? { ...img, x, y } : img
      ));
    }

    if (resizingImage) {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      const newWidth = Math.max(100, resizeStart.width + deltaX);
      const newHeight = Math.max(100, resizeStart.height + deltaY);
      
      setImages(prev => prev.map(img => 
        img.id === resizingImage.id ? { ...img, width: newWidth, height: newHeight } : img
      ));
    }
  };

  const handleMouseUp = () => {
    setDraggedImage(null);
    setResizingImage(null);
  };

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedImage, resizingImage, dragOffset, resizeStart]);

  const deleteImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  return (
    <div className="ref-panel-box">
      <div className="ref-panel-header">
        <h3>📎 Referanslar</h3>
        <div className="ref-panel-actions">
          <button className="ref-btn" onClick={() => setZoomLevel(prev => Math.max(0.3, prev - 0.1))}>
            🔍−
          </button>
          <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
          <button className="ref-btn" onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.1))}>
            🔍+
          </button>
          <button className="ref-btn" onClick={() => setZoomLevel(1)}>Reset</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button className="ref-btn" onClick={() => fileInputRef.current.click()}>
            + Görsel Ekle
          </button>
        </div>
      </div>
      <div 
        ref={contentRef}
        className="ref-panel-content"
        onWheel={handleWheel}
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {images.length === 0 ? (
          <div className="ref-empty-state">
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>🖼️</div>
            <div>Referans görseli eklemek için "+ Görsel Ekle" butonuna tıklayın</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Görselleri sürükleyip bırakabilir, boyutlandırabilirsiniz
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
              💡 Kopyaladığınız görseli <strong>Ctrl+V</strong> ile yapıştırabilirsiniz
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
              🖱️ <strong>Mouse Wheel</strong> ile zoom yapabilirsiniz
            </div>
          </div>
        ) : (
          images.map(image => (
            <div
              key={image.id}
              className={`ref-image-container ${draggedImage?.id === image.id ? 'selected' : ''}`}
              style={{
                left: `${image.x}px`,
                top: `${image.y}px`,
                width: `${image.width}px`,
                height: `${image.height}px`
              }}
              onMouseDown={(e) => handleMouseDown(e, image, false)}
            >
              <img src={image.src} alt="Reference" />
              <button 
                className="ref-image-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteImage(image.id);
                }}
              >
                ×
              </button>
              <div
                className="ref-image-resize"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e, image, true);
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ReferencePanel;

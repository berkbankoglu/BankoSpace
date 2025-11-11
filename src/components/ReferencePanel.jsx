import { useState, useEffect, useRef } from 'react';

function ReferencePanel() {
  const [images, setImages] = useState([]);
  const [texts, setTexts] = useState([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [draggedImage, setDraggedImage] = useState(null);
  const [draggedText, setDraggedText] = useState(null);
  const [editingText, setEditingText] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingImage, setResizingImage] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [selectionBox, setSelectionBox] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItems, setSelectedItems] = useState({ images: [], texts: [] });
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [selectionDragStart, setSelectionDragStart] = useState({ x: 0, y: 0 });
  const [isFullScreen, setIsFullScreen] = useState(false);
  const contentRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('refImages');
    if (saved) {
      setImages(JSON.parse(saved));
    }
    const savedTexts = localStorage.getItem('refTexts');
    if (savedTexts) {
      setTexts(JSON.parse(savedTexts));
    }
  }, []);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isFullScreen]);

  const handleToggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  useEffect(() => {
    localStorage.setItem('refImages', JSON.stringify(images));
  }, [images]);

  useEffect(() => {
    localStorage.setItem('refTexts', JSON.stringify(texts));
  }, [texts]);

  const handleWheel = (e) => {
    // Eğer Ctrl tuşuna basılıysa zoom yap
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      setZoomLevel(prev => Math.max(0.3, Math.min(3, prev + delta)));
      return;
    }

    // Normal scroll - sayfa kaydırmasını engelle
    e.stopPropagation();

    // Panel içinde scroll yap
    if (contentRef.current) {
      contentRef.current.scrollTop += e.deltaY;
      e.preventDefault();
    }
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
      // Eğer seçili öğeler varsa ve tıklanan öğe seçili ise, toplu sürükleme başlat
      if (selectedItems.images.includes(image.id)) {
        setIsDraggingSelection(true);
        setSelectionDragStart({
          x: e.clientX,
          y: e.clientY
        });
      } else {
        const rect = e.currentTarget.getBoundingClientRect();
        setDraggedImage(image);
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    }
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    // Dikdörtgen seçim alanını güncelle
    if (isSelecting && contentRef.current) {
      const rect = contentRef.current.getBoundingClientRect();
      const currentX = (e.clientX - rect.left) / zoomLevel;
      const currentY = (e.clientY - rect.top + contentRef.current.scrollTop) / zoomLevel;

      setSelectionBox(prev => ({
        ...prev,
        currentX,
        currentY
      }));
      return;
    }

    // Seçili öğeleri toplu sürükle
    if (isDraggingSelection && contentRef.current) {
      const deltaX = (e.clientX - selectionDragStart.x) / zoomLevel;
      const deltaY = (e.clientY - selectionDragStart.y) / zoomLevel;

      setImages(prev => prev.map(img =>
        selectedItems.images.includes(img.id)
          ? { ...img, x: img.x + deltaX, y: img.y + deltaY }
          : img
      ));

      setTexts(prev => prev.map(txt =>
        selectedItems.texts.includes(txt.id)
          ? { ...txt, x: txt.x + deltaX, y: txt.y + deltaY }
          : txt
      ));

      setSelectionDragStart({
        x: e.clientX,
        y: e.clientY
      });
      return;
    }

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

    // Seçim kutusu tamamlandıysa, içindeki öğeleri seç
    if (isSelecting && selectionBox) {
      const box = {
        left: Math.min(selectionBox.startX, selectionBox.currentX),
        top: Math.min(selectionBox.startY, selectionBox.currentY),
        right: Math.max(selectionBox.startX, selectionBox.currentX),
        bottom: Math.max(selectionBox.startY, selectionBox.currentY)
      };

      const selectedImages = images.filter(img => {
        const imgCenterX = img.x + img.width / 2;
        const imgCenterY = img.y + img.height / 2;
        return imgCenterX >= box.left && imgCenterX <= box.right &&
               imgCenterY >= box.top && imgCenterY <= box.bottom;
      });

      const selectedTexts = texts.filter(txt => {
        const txtCenterX = txt.x + txt.width / 2;
        const txtCenterY = txt.y + 50; // Yaklaşık metin yüksekliği
        return txtCenterX >= box.left && txtCenterX <= box.right &&
               txtCenterY >= box.top && txtCenterY <= box.bottom;
      });

      setSelectedItems({
        images: selectedImages.map(img => img.id),
        texts: selectedTexts.map(txt => txt.id)
      });
    }

    setIsSelecting(false);
    setSelectionBox(null);
    setIsDraggingSelection(false);
  };

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedImage, resizingImage, dragOffset, resizeStart, isSelecting, selectionBox, images, texts, isDraggingSelection, selectionDragStart, selectedItems]);

  const deleteImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handlePanelMouseDown = (e) => {
    // Ctrl+Alt ile dikdörtgen seçim başlat
    if (e.ctrlKey && e.altKey && (e.target === contentRef.current || e.target.classList.contains('ref-panel-content'))) {
      const rect = contentRef.current.getBoundingClientRect();
      const startX = (e.clientX - rect.left) / zoomLevel;
      const startY = (e.clientY - rect.top + contentRef.current.scrollTop) / zoomLevel;

      setIsSelecting(true);
      setSelectionBox({
        startX,
        startY,
        currentX: startX,
        currentY: startY
      });
      e.preventDefault();
    } else if (e.target === contentRef.current || e.target.classList.contains('ref-panel-content')) {
      // Boş alana tıklanırsa seçimi kaldır
      setSelectedItems({ images: [], texts: [] });
    }
  };

  const handleDoubleClick = (e) => {
    if (e.target === contentRef.current || e.target.classList.contains('ref-panel-content')) {
      const rect = contentRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoomLevel;
      const y = (e.clientY - rect.top + contentRef.current.scrollTop) / zoomLevel;

      const newText = {
        id: Date.now(),
        content: 'Yeni metin',
        x,
        y,
        width: 200,
        height: 'auto'
      };

      setTexts(prev => [...prev, newText]);
      setEditingText(newText.id);
    }
  };

  const handleTextMouseDown = (e, text) => {
    if (editingText === text.id) return;

    // Eğer seçili öğeler varsa ve tıklanan metin seçili ise, toplu sürükleme başlat
    if (selectedItems.texts.includes(text.id)) {
      setIsDraggingSelection(true);
      setSelectionDragStart({
        x: e.clientX,
        y: e.clientY
      });
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setDraggedText(text);
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
    e.preventDefault();
  };

  const handleTextMouseMove = (e) => {
    if (draggedText && contentRef.current) {
      const rect = contentRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - dragOffset.x) / zoomLevel;
      const y = (e.clientY - rect.top - dragOffset.y + contentRef.current.scrollTop) / zoomLevel;

      setTexts(prev => prev.map(txt =>
        txt.id === draggedText.id ? { ...txt, x, y } : txt
      ));
    }
  };

  const handleTextMouseUp = () => {
    setDraggedText(null);
  };

  useEffect(() => {
    if (draggedText) {
      document.addEventListener('mousemove', handleTextMouseMove);
      document.addEventListener('mouseup', handleTextMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleTextMouseMove);
        document.removeEventListener('mouseup', handleTextMouseUp);
      };
    }
  }, [draggedText, dragOffset]);

  const deleteText = (id) => {
    setTexts(prev => prev.filter(txt => txt.id !== id));
    if (editingText === id) setEditingText(null);
  };

  const handleTextEdit = (id, newContent) => {
    setTexts(prev => prev.map(txt =>
      txt.id === id ? { ...txt, content: newContent } : txt
    ));
  };

  return (
    <div className={`ref-panel-box ${isFullScreen ? 'fullscreen' : ''}`}>
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
          <button className="ref-btn" onClick={handleToggleFullScreen}>
            {isFullScreen ? '🗗 Çıkış' : '🗖 Tam Ekran'}
          </button>
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
        onDoubleClick={handleDoubleClick}
        onMouseDown={handlePanelMouseDown}
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {images.length === 0 && texts.length === 0 ? (
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
              🖱️ <strong>Ctrl+Mouse Wheel</strong> ile zoom yapabilirsiniz
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
              ✍️ <strong>Double Click</strong> ile metin ekleyebilirsiniz
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
              🖱️ <strong>Ctrl+Alt+Sürükle</strong> ile dikdörtgen alan seçimi yapabilirsiniz
            </div>
          </div>
        ) : (
          <>
            {images.map(image => (
              <div
                key={image.id}
                className={`ref-image-container ${draggedImage?.id === image.id || selectedItems.images.includes(image.id) ? 'selected' : ''}`}
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
            ))}
            {texts.map(text => (
              <div
                key={text.id}
                className={`ref-text-container ${draggedText?.id === text.id || selectedItems.texts.includes(text.id) ? 'selected' : ''}`}
                style={{
                  left: `${text.x}px`,
                  top: `${text.y}px`,
                  minWidth: `${text.width}px`
                }}
                onMouseDown={(e) => handleTextMouseDown(e, text)}
              >
                {editingText === text.id ? (
                  <textarea
                    className="ref-text-input"
                    value={text.content}
                    onChange={(e) => handleTextEdit(text.id, e.target.value)}
                    onBlur={() => setEditingText(null)}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                  />
                ) : (
                  <div
                    className="ref-text-display"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingText(text.id);
                    }}
                  >
                    {text.content}
                  </div>
                )}
                <button
                  className="ref-text-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteText(text.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {selectionBox && (
              <div
                className="selection-box"
                style={{
                  left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
                  top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
                  width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
                  height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ReferencePanel;

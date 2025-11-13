import { useState, useEffect, useRef } from 'react';

function ReferencePanel() {
  const [tabs, setTabs] = useState([{
    id: 1,
    name: 'Tab 1',
    leftPage: { images: [], texts: [] },
    rightPage: { images: [], texts: [] }
  }]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [activePage, setActivePage] = useState('left'); // 'left' or 'right'
  const [zoomLevel, setZoomLevel] = useState(1);
  const [draggedImage, setDraggedImage] = useState(null);
  const [draggedText, setDraggedText] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingImage, setResizingImage] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [selectionBox, setSelectionBox] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItems, setSelectedItems] = useState({ images: [], texts: [] });
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [selectionDragStart, setSelectionDragStart] = useState({ x: 0, y: 0 });
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollTop: 0, scrollLeft: 0 });
  const [editingTabId, setEditingTabId] = useState(null);
  const [moveModeActive, setMoveModeActive] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const contentRef = useRef(null);
  const leftPageRef = useRef(null);
  const rightPageRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const images = activePage === 'left' ? activeTab.leftPage.images : activeTab.rightPage.images;
  const texts = activePage === 'left' ? activeTab.leftPage.texts : activeTab.rightPage.texts;

  const setImages = (updateFn) => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? {
            ...tab,
            [activePage === 'left' ? 'leftPage' : 'rightPage']: {
              ...tab[activePage === 'left' ? 'leftPage' : 'rightPage'],
              images: typeof updateFn === 'function'
                ? updateFn(tab[activePage === 'left' ? 'leftPage' : 'rightPage'].images)
                : updateFn
            }
          }
        : tab
    ));
  };

  const setTexts = (updateFn) => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? {
            ...tab,
            [activePage === 'left' ? 'leftPage' : 'rightPage']: {
              ...tab[activePage === 'left' ? 'leftPage' : 'rightPage'],
              texts: typeof updateFn === 'function'
                ? updateFn(tab[activePage === 'left' ? 'leftPage' : 'rightPage'].texts)
                : updateFn
            }
          }
        : tab
    ));
  };

  useEffect(() => {
    const saved = localStorage.getItem('refTabs');
    if (saved) {
      const loadedTabs = JSON.parse(saved);
      setTabs(loadedTabs);
      if (loadedTabs.length > 0) {
        setActiveTabId(loadedTabs[0].id);
      }
    }
  }, []);

  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (e) => {
      const currentPageRef = activePage === 'left' ? leftPageRef : rightPageRef;
      if (currentPageRef.current) {
        const rect = currentPageRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / zoomLevel;
        const y = (e.clientY - rect.top) / zoomLevel;
        setLastMousePos({ x, y });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [activePage, zoomLevel, leftPageRef, rightPageRef]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input
      if (e.target.tagName === 'INPUT') return;

      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }


      // T key to add text at mouse position
      if (e.key === 't' || e.key === 'T') {
        const newText = {
          id: Date.now(),
          content: '',
          x: lastMousePos.x,
          y: lastMousePos.y
        };

        setTexts(prev => [...prev, newText]);
      }

      // Delete key to remove selected items
      if (e.key === 'Delete' && (selectedItems.images.length > 0 || selectedItems.texts.length > 0)) {
        if (selectedItems.images.length > 0) {
          setImages(prev => prev.filter(img => !selectedItems.images.includes(img.id)));
        }
        if (selectedItems.texts.length > 0) {
          setTexts(prev => prev.filter(txt => !selectedItems.texts.includes(txt.id)));
        }
        setSelectedItems({ images: [], texts: [] });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen, selectedItems, images, texts, activePage, zoomLevel, leftPageRef, rightPageRef, lastMousePos]);

  const handleToggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  useEffect(() => {
    localStorage.setItem('refTabs', JSON.stringify(tabs));
  }, [tabs]);

  const addNewTab = () => {
    const newId = Math.max(...tabs.map(t => t.id), 0) + 1;
    const newTab = {
      id: newId,
      name: `Tab ${newId}`,
      leftPage: { images: [], texts: [] },
      rightPage: { images: [], texts: [] }
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const deleteTab = (tabId) => {
    if (tabs.length === 1) return; // Don't delete last tab
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[0].id);
    }
  };

  const renameTab = (tabId, newName) => {
    setTabs(prev => prev.map(tab =>
      tab.id === tabId ? { ...tab, name: newName } : tab
    ));
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImages(prev => [...prev, {
          id: Date.now() + index,
          src: event.target.result,
          x: 50 + index * 20,
          y: 50 + index * 20,
          width: 300,
          height: 300
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  useEffect(() => {
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

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [activePage, activeTabId]);

  const handleMouseDown = (e, image, isResize) => {
    const currentPageRef = activePage === 'left' ? leftPageRef : rightPageRef;

    if (isResize) {
      setResizingImage(image);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: image.width,
        height: image.height
      });
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click to toggle selection
      setSelectedItems(prev => {
        const isSelected = prev.images.includes(image.id);
        return {
          ...prev,
          images: isSelected
            ? prev.images.filter(id => id !== image.id)
            : [...prev.images, image.id]
        };
      });
    } else {
      // Direct drag - calculate offset from image top-left
      if (currentPageRef.current) {
        const rect = currentPageRef.current.getBoundingClientRect();
        const offsetX = (e.clientX - rect.left) / zoomLevel - image.x;
        const offsetY = (e.clientY - rect.top) / zoomLevel - image.y;

        setDraggedImage(image);
        setDragOffset({ x: offsetX, y: offsetY });
      }
    }
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    const currentPageRef = activePage === 'left' ? leftPageRef : rightPageRef;

    // Right click pan
    if (isPanning && contentRef.current) {
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;

      contentRef.current.scrollLeft = panStart.scrollLeft - deltaX;
      contentRef.current.scrollTop = panStart.scrollTop - deltaY;
      return;
    }

    // Selection box update
    if (isSelecting && currentPageRef.current) {
      const rect = currentPageRef.current.getBoundingClientRect();
      const currentX = (e.clientX - rect.left) / zoomLevel;
      const currentY = (e.clientY - rect.top) / zoomLevel;

      setSelectionBox(prev => ({
        ...prev,
        currentX,
        currentY
      }));
      return;
    }

    // Drag multiple selected items
    if (isDraggingSelection) {
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

    if (draggedImage && currentPageRef.current) {
      const rect = currentPageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - dragOffset.x * zoomLevel) / zoomLevel;
      const y = (e.clientY - rect.top - dragOffset.y * zoomLevel) / zoomLevel;

      setImages(prev => prev.map(img =>
        img.id === draggedImage.id ? { ...img, x, y } : img
      ));
    }

    if (resizingImage) {
      const deltaX = (e.clientX - resizeStart.x) / zoomLevel;
      const deltaY = (e.clientY - resizeStart.y) / zoomLevel;
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
    setIsPanning(false);

    // Selection box complete
    if (isSelecting && selectionBox) {
      const box = {
        left: Math.min(selectionBox.startX, selectionBox.currentX),
        top: Math.min(selectionBox.startY, selectionBox.currentY),
        right: Math.max(selectionBox.startX, selectionBox.currentX),
        bottom: Math.max(selectionBox.startY, selectionBox.currentY)
      };

      const boxSelectedImages = images.filter(img => {
        const imgCenterX = img.x + img.width / 2;
        const imgCenterY = img.y + img.height / 2;
        return imgCenterX >= box.left && imgCenterX <= box.right &&
               imgCenterY >= box.top && imgCenterY <= box.bottom;
      });

      const boxSelectedTexts = texts.filter(txt => {
        const txtCenterX = txt.x + 50;
        const txtCenterY = txt.y + 10;
        return txtCenterX >= box.left && txtCenterX <= box.right &&
               txtCenterY >= box.top && txtCenterY <= box.bottom;
      });

      // Add to existing selection (toggle: add if not selected, remove if already selected)
      setSelectedItems(prev => {
        const newImageIds = boxSelectedImages.map(img => img.id);
        const newTextIds = boxSelectedTexts.map(txt => txt.id);

        // Toggle images: add if not in prev, keep prev if not in box selection
        const toggledImages = [
          ...prev.images.filter(id => !newImageIds.includes(id)),
          ...newImageIds.filter(id => !prev.images.includes(id))
        ];

        // Toggle texts
        const toggledTexts = [
          ...prev.texts.filter(id => !newTextIds.includes(id)),
          ...newTextIds.filter(id => !prev.texts.includes(id))
        ];

        return {
          images: toggledImages,
          texts: toggledTexts
        };
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
  }, [draggedImage, resizingImage, dragOffset, resizeStart, isSelecting, selectionBox, images, texts, isDraggingSelection, selectionDragStart, selectedItems, isPanning, panStart]);

  const deleteImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handlePanelMouseDown = (e, page) => {
    const currentPageRef = page === 'left' ? leftPageRef : rightPageRef;

    // Switch active page
    if (activePage !== page) {
      setActivePage(page);
      setSelectedItems({ images: [], texts: [] });
    }

    // Right click for panning
    if (e.button === 2) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX,
        y: e.clientY,
        scrollTop: contentRef.current.scrollTop,
        scrollLeft: contentRef.current.scrollLeft
      });
      e.preventDefault();
      return;
    }

    // Check if clicking on empty canvas area
    const isCanvasArea = e.target.classList.contains('ref-page') ||
                         e.target.classList.contains('ref-empty-state');

    // Shift + left click for selection box
    if (e.shiftKey && isCanvasArea && e.button === 0 && currentPageRef.current) {
      const rect = currentPageRef.current.getBoundingClientRect();
      const startX = (e.clientX - rect.left) / zoomLevel;
      const startY = (e.clientY - rect.top) / zoomLevel;

      setIsSelecting(true);
      setSelectionBox({
        startX,
        startY,
        currentX: startX,
        currentY: startY
      });

      // Don't clear selection - keep existing selection for multi-select
      e.preventDefault();
    } else if (isCanvasArea && e.button === 0) {
      // Click on empty area without Shift - deselect all
      setSelectedItems({ images: [], texts: [] });
    }
  };

  const handleDoubleClick = (e, page) => {
    const currentPageRef = page === 'left' ? leftPageRef : rightPageRef;

    // Switch active page
    if (activePage !== page) {
      setActivePage(page);
    }

    // Double click to create text
    const isCanvasArea = e.target.classList.contains('ref-page') ||
                         e.target.classList.contains('ref-empty-state') ||
                         e.target.classList.contains('notebook-lines');

    if (isCanvasArea && currentPageRef.current) {
      const rect = currentPageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoomLevel;
      const y = (e.clientY - rect.top) / zoomLevel;

      const newText = {
        id: Date.now(),
        content: '',
        x,
        y
      };

      setTexts(prev => [...prev, newText]);
    }
  };

  const handleTextMouseDown = (e, text) => {
    const currentPageRef = activePage === 'left' ? leftPageRef : rightPageRef;

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click to toggle selection
      setSelectedItems(prev => {
        const isSelected = prev.texts.includes(text.id);
        return {
          ...prev,
          texts: isSelected
            ? prev.texts.filter(id => id !== text.id)
            : [...prev.texts, text.id]
        };
      });
    } else if (currentPageRef.current) {
      const rect = currentPageRef.current.getBoundingClientRect();
      const offsetX = (e.clientX - rect.left) / zoomLevel - text.x;
      const offsetY = (e.clientY - rect.top) / zoomLevel - text.y;

      setDraggedText(text);
      setDragOffset({ x: offsetX, y: offsetY });
    }

    e.preventDefault();
    e.stopPropagation();
  };

  const handleTextMouseMove = (e) => {
    const currentPageRef = activePage === 'left' ? leftPageRef : rightPageRef;

    if (draggedText && currentPageRef.current) {
      const rect = currentPageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - dragOffset.x * zoomLevel) / zoomLevel;
      const y = (e.clientY - rect.top - dragOffset.y * zoomLevel) / zoomLevel;

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
  };

  const handleTextEdit = (id, newContent) => {
    setTexts(prev => prev.map(txt =>
      txt.id === id ? { ...txt, content: newContent } : txt
    ));
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
  };

  const handleDeleteSelected = () => {
    if (selectedItems.images.length > 0) {
      setImages(prev => prev.filter(img => !selectedItems.images.includes(img.id)));
    }
    if (selectedItems.texts.length > 0) {
      setTexts(prev => prev.filter(txt => !selectedItems.texts.includes(txt.id)));
    }
    setSelectedItems({ images: [], texts: [] });
  };

  const selectedCount = selectedItems.images.length + selectedItems.texts.length;

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
  };

  // Helper to render a page
  const renderPage = (page, pageRef) => {
    const pageImages = page === 'left' ? activeTab.leftPage.images : activeTab.rightPage.images;
    const pageTexts = page === 'left' ? activeTab.leftPage.texts : activeTab.rightPage.texts;

    return (
      <div
        ref={pageRef}
        className={`ref-page ${activePage === page ? 'active' : ''}`}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => handlePanelMouseDown(e, page)}
        onDoubleClick={(e) => handleDoubleClick(e, page)}
        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
      >
        {/* Notebook lines */}
        <div className="notebook-lines"></div>

        {pageImages.length === 0 && pageTexts.length === 0 ? (
          <div className="ref-empty-state">
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>🖼️</div>
            <div>Double-click to add text</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Or paste images with Ctrl+V
            </div>
          </div>
        ) : null}

        {/* Always show images from this page */}
        {pageImages.map(image => (
          <div
            key={image.id}
            className={`ref-image-container ${draggedImage?.id === image.id || selectedItems.images.includes(image.id) ? 'selected' : ''}`}
            style={{
              left: `${image.x}px`,
              top: `${image.y}px`,
              width: `${image.width}px`,
              height: `${image.height}px`,
              cursor: 'pointer'
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

        {/* Simple text elements */}
        {pageTexts.map(text => (
          <input
            key={text.id}
            type="text"
            value={text.content}
            style={{
              position: 'absolute',
              left: `${text.x}px`,
              top: `${text.y}px`,
              color: '#ffffff',
              fontSize: '16px',
              minWidth: '100px',
              padding: '2px 4px',
              outline: 'none',
              cursor: 'pointer',
              border: selectedItems.texts.includes(text.id)
                ? '2px solid #4A90E2'
                : 'none',
              background: selectedItems.texts.includes(text.id)
                ? 'rgba(74, 144, 226, 0.2)'
                : 'transparent',
              direction: 'ltr',
              textAlign: 'left',
              pointerEvents: 'auto'
            }}
            onChange={(e) => handleTextEdit(text.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              handleTextMouseDown(e, text);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            autoFocus={text.content === ''}
          />
        ))}

        {activePage === page && selectionBox && (
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
      </div>
    );
  };

  return (
    <div className={`ref-panel-box ${isFullScreen ? 'fullscreen' : ''}`}>
      <div className="ref-panel-header">
        <h3>📎 References</h3>
        <span style={{
          position: 'absolute',
          right: '10px',
          top: '10px',
          fontSize: '16px',
          color: '#888',
          fontFamily: 'monospace',
          fontWeight: 'bold'
        }}>v0.8</span>
        <div className="ref-panel-actions">
          {selectedCount > 0 && (
            <button
              className="ref-btn ref-btn-delete"
              onClick={handleDeleteSelected}
              title={`Delete ${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`}
            >
              🗑️ Delete ({selectedCount})
            </button>
          )}
          <div className="zoom-controls">
            <button className="ref-btn" onClick={handleZoomOut} title="Zoom Out">−</button>
            <button className="ref-btn" onClick={handleZoomReset} title="Reset Zoom">{Math.round(zoomLevel * 100)}%</button>
            <button className="ref-btn" onClick={handleZoomIn} title="Zoom In">+</button>
          </div>
          <button className="ref-btn" onClick={handleToggleFullScreen}>
            {isFullScreen ? '🗗 Exit' : '🗖 Full Screen'}
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
            + Add Image
          </button>
        </div>
      </div>

      <div className="ref-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`ref-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {editingTabId === tab.id ? (
              <input
                className="ref-tab-input"
                value={tab.name}
                onChange={(e) => renameTab(tab.id, e.target.value)}
                onBlur={() => setEditingTabId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingTabId(null);
                  if (e.key === 'Escape') setEditingTabId(null);
                }}
                autoFocus
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTabId(tab.id);
              }}>
                {tab.name}
              </span>
            )}
            {tabs.length > 1 && (
              <button
                className="ref-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTab(tab.id);
                }}
                title="Close tab"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button className="ref-tab-add" onClick={addNewTab} title="Add new tab">
          +
        </button>
      </div>
      <div ref={contentRef} className="ref-panel-content">
        <div className="ref-notebook">
          {renderPage('left', leftPageRef)}
          <div className="notebook-divider" />
          {renderPage('right', rightPageRef)}
        </div>
      </div>
    </div>
  );
}

export default ReferencePanel;

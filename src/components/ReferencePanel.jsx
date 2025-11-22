import { useState, useEffect, useRef } from 'react';

function ReferencePanel() {
  const [tabs, setTabs] = useState([{
    id: 1,
    name: 'Board 1',
    items: [] // images, texts, sticky notes
  }]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedItems, setSelectedItems] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingItem, setResizingItem] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [spaceKeyPressed, setSpaceKeyPressed] = useState(false);
  const [selectionBox, setSelectionBox] = useState(null);
  const [isDrawingSelection, setIsDrawingSelection] = useState(false);
  const [hoveredItems, setHoveredItems] = useState([]);
  const [tool, setTool] = useState('select'); // 'select', 'text', 'sticky'

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const items = activeTab.items;

  const setItems = (updateFn) => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, items: typeof updateFn === 'function' ? updateFn(tab.items) : updateFn }
        : tab
    ));
  };

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('freeformTabs');
    if (saved) {
      try {
        const loadedTabs = JSON.parse(saved);
        setTabs(loadedTabs);
        if (loadedTabs.length > 0) {
          setActiveTabId(loadedTabs[0].id);
        }
      } catch (e) {
        console.error('Failed to load tabs:', e);
      }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('freeformTabs', JSON.stringify(tabs));
  }, [tabs]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Space for pan mode
      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceKeyPressed(true);
      }

      // V for select tool
      if (e.key === 'v' || e.key === 'V') {
        setTool('select');
      }

      // T for text tool
      if (e.key === 't' || e.key === 'T') {
        setTool('text');
      }

      // N for sticky note
      if (e.key === 'n' || e.key === 'N') {
        setTool('sticky');
      }

      // Delete selected items
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItems.length > 0) {
          e.preventDefault();
          setItems(prev => prev.filter(item => !selectedItems.includes(item.id)));
          setSelectedItems([]);
        }
      }

      // Cmd/Ctrl + A - Select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedItems(items.map(item => item.id));
      }

      // Escape - Deselect all
      if (e.key === 'Escape') {
        setSelectedItems([]);
        setTool('select');
      }

      // Zoom with Cmd/Ctrl + Plus/Minus
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoomLevel(prev => Math.min(prev + 0.1, 3));
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        setZoomLevel(prev => Math.max(prev - 0.1, 0.25));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setSpaceKeyPressed(false);
        setIsPanning(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedItems, items]);

  // Mouse wheel zoom
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoomLevel(prev => Math.max(0.25, Math.min(3, prev + delta)));
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, []);

  // Paste images
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            const newItem = {
              id: Date.now(),
              type: 'image',
              src: event.target.result,
              x: -panOffset.x / zoomLevel + 100,
              y: -panOffset.y / zoomLevel + 100,
              width: 300,
              height: 300
            };
            setItems(prev => [...prev, newItem]);
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [panOffset, zoomLevel]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newItem = {
          id: Date.now() + index,
          type: 'image',
          src: event.target.result,
          x: -panOffset.x / zoomLevel + 50 + index * 20,
          y: -panOffset.y / zoomLevel + 50 + index * 20,
          width: 300,
          height: 300
        };
        setItems(prev => [...prev, newItem]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const getCanvasCoords = (clientX, clientY) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panOffset.x) / zoomLevel,
      y: (clientY - rect.top - panOffset.y) / zoomLevel
    };
  };

  const getItemsInBox = (box) => {
    return items.filter(item => {
      // Get item dimensions with padding for easier selection
      let itemWidth, itemHeight, itemX, itemY;
      const padding = 20; // Extra padding for text items

      if (item.type === 'image' || item.type === 'sticky') {
        itemWidth = item.width || 100;
        itemHeight = item.height || 100;
        itemX = item.x;
        itemY = item.y;
      } else if (item.type === 'text') {
        // Add padding around text for easier selection
        itemWidth = Math.max(50, (item.content?.length || 5) * 8) + padding * 2;
        itemHeight = 30 + padding * 2;
        itemX = item.x - padding;
        itemY = item.y - padding;
      } else {
        itemWidth = 100;
        itemHeight = 30;
        itemX = item.x;
        itemY = item.y;
      }

      const itemRight = itemX + itemWidth;
      const itemBottom = itemY + itemHeight;

      // Check if there's any overlap (even 1px)
      return !(itemRight <= box.left || itemX >= box.right ||
               itemBottom <= box.top || itemY >= box.bottom);
    }).map(item => item.id);
  };

  const handleCanvasMouseDown = (e) => {
    if (e.button === 2) return; // Ignore right click

    const coords = getCanvasCoords(e.clientX, e.clientY);

    // Space + drag for panning
    if (spaceKeyPressed || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
      return;
    }

    // Text tool - create text
    if (tool === 'text') {
      const newItem = {
        id: Date.now(),
        type: 'text',
        content: '',
        x: coords.x,
        y: coords.y,
        fontSize: 16,
        color: '#ffffff'
      };
      setItems(prev => [...prev, newItem]);
      setEditingTextId(newItem.id);
      setTool('select');
      return;
    }

    // Sticky note tool
    if (tool === 'sticky') {
      const newItem = {
        id: Date.now(),
        type: 'sticky',
        content: '',
        x: coords.x,
        y: coords.y,
        width: 200,
        height: 200,
        color: '#fef08a' // yellow
      };
      setItems(prev => [...prev, newItem]);
      setEditingTextId(newItem.id);
      setTool('select');
      return;
    }

    // Selection tool - start drawing selection box
    if (tool === 'select') {
      setIsDrawingSelection(true);
      setSelectionBox({ startX: coords.x, startY: coords.y, currentX: coords.x, currentY: coords.y });
      setSelectedItems([]); // Clear selection when starting new box
      setHoveredItems([]); // Clear hovered items
      return;
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (isPanning) {
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      setPanOffset(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (isDrawingSelection && selectionBox) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      setSelectionBox(prev => ({ ...prev, currentX: coords.x, currentY: coords.y }));

      // Update hovered items in real-time
      const box = {
        left: Math.min(selectionBox.startX, coords.x),
        right: Math.max(selectionBox.startX, coords.x),
        top: Math.min(selectionBox.startY, coords.y),
        bottom: Math.max(selectionBox.startY, coords.y)
      };
      setHoveredItems(getItemsInBox(box));
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);

    if (isDrawingSelection && selectionBox) {
      const box = {
        left: Math.min(selectionBox.startX, selectionBox.currentX),
        right: Math.max(selectionBox.startX, selectionBox.currentX),
        top: Math.min(selectionBox.startY, selectionBox.currentY),
        bottom: Math.max(selectionBox.startY, selectionBox.currentY)
      };

      const selected = getItemsInBox(box);

      setSelectedItems(selected);
      setSelectionBox(null);
      setIsDrawingSelection(false);
      setHoveredItems([]); // Clear hovered items
    }
  };

  useEffect(() => {
    document.addEventListener('mousemove', handleCanvasMouseMove);
    document.addEventListener('mouseup', handleCanvasMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleCanvasMouseMove);
      document.removeEventListener('mouseup', handleCanvasMouseUp);
    };
  }, [isPanning, panStart, selectionBox, isDrawingSelection, items]);

  const handleItemMouseDown = (e, item) => {
    // Don't interfere with other tools
    if (tool !== 'select') {
      e.stopPropagation();
      return;
    }

    // Stop event propagation so canvas mousedown doesn't trigger
    e.stopPropagation();
    e.preventDefault();

    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      // Multi-select with modifier keys
      if (selectedItems.includes(item.id)) {
        setSelectedItems(prev => prev.filter(id => id !== item.id));
      } else {
        setSelectedItems(prev => [...prev, item.id]);
      }
      return;
    }

    // Single select - only select if not already selected
    if (!selectedItems.includes(item.id)) {
      setSelectedItems([item.id]);
    }

    // Start dragging
    const coords = getCanvasCoords(e.clientX, e.clientY);
    setDraggedItem(item);
    setDragOffset({ x: coords.x - item.x, y: coords.y - item.y });
  };

  const handleItemMouseMove = (e) => {
    if (draggedItem) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      const newX = coords.x - dragOffset.x;
      const newY = coords.y - dragOffset.y;

      setItems(prev => prev.map(item => {
        if (item.id === draggedItem.id) {
          return { ...item, x: newX, y: newY };
        }
        if (selectedItems.includes(item.id) && item.id !== draggedItem.id) {
          const deltaX = newX - draggedItem.x;
          const deltaY = newY - draggedItem.y;
          return { ...item, x: item.x + deltaX, y: item.y + deltaY };
        }
        return item;
      }));

      // Don't update draggedItem state, just track position internally
      draggedItem.x = newX;
      draggedItem.y = newY;
    }

    if (resizingItem) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      const deltaX = coords.x - resizeStart.x;
      const deltaY = coords.y - resizeStart.y;
      const newWidth = Math.max(50, resizeStart.width + deltaX);
      const newHeight = Math.max(50, resizeStart.height + deltaY);

      setItems(prev => prev.map(item =>
        item.id === resizingItem.id ? { ...item, width: newWidth, height: newHeight } : item
      ));
    }
  };

  const handleItemMouseUp = () => {
    setDraggedItem(null);
    setResizingItem(null);
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!draggedItem && !resizingItem) return;
      handleItemMouseMove(e);
    };

    const handleUp = () => {
      if (!draggedItem && !resizingItem) return;
      handleItemMouseUp();
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [draggedItem, resizingItem, selectedItems, dragOffset, resizeStart]);

  const handleResizeMouseDown = (e, item) => {
    e.stopPropagation();
    const coords = getCanvasCoords(e.clientX, e.clientY);
    setResizingItem(item);
    setResizeStart({ x: coords.x, y: coords.y, width: item.width, height: item.height });
  };

  const addNewTab = () => {
    const newId = Math.max(...tabs.map(t => t.id), 0) + 1;
    const newTab = { id: newId, name: `Board ${newId}`, items: [] };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const deleteTab = (tabId) => {
    if (tabs.length === 1) return;
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[0].id);
    }
  };

  const renameTab = (tabId, newName) => {
    setTabs(prev => prev.map(tab => tab.id === tabId ? { ...tab, name: newName } : tab));
  };

  return (
    <div className="freeform-container">
      {/* Toolbar */}
      <div className="freeform-toolbar">
        <div className="freeform-tools">
          <button
            className={`freeform-tool-btn ${tool === 'select' ? 'active' : ''}`}
            onClick={() => setTool('select')}
            title="Select (V)"
          >
            ↖️
          </button>
          <button
            className={`freeform-tool-btn ${tool === 'text' ? 'active' : ''}`}
            onClick={() => setTool('text')}
            title="Text (T)"
          >
            T
          </button>
          <button
            className={`freeform-tool-btn ${tool === 'sticky' ? 'active' : ''}`}
            onClick={() => setTool('sticky')}
            title="Sticky Note (N)"
          >
            📝
          </button>
          <button
            className="freeform-tool-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Add Image"
          >
            🖼️
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        <div className="freeform-zoom">
          <button onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.25))}>−</button>
          <span>{Math.round(zoomLevel * 100)}%</span>
          <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 3))}>+</button>
          <button onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}>Reset</button>
        </div>

        {selectedItems.length > 0 && (
          <div className="freeform-selection-info">
            {selectedItems.length} selected
            <button onClick={() => {
              setItems(prev => prev.filter(item => !selectedItems.includes(item.id)));
              setSelectedItems([]);
            }}>Delete</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="freeform-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`freeform-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {editingTabId === tab.id ? (
              <input
                className="freeform-tab-input"
                value={tab.name}
                onChange={(e) => renameTab(tab.id, e.target.value)}
                onBlur={() => setEditingTabId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') setEditingTabId(null);
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span onDoubleClick={(e) => { e.stopPropagation(); setEditingTabId(tab.id); }}>
                {tab.name}
              </span>
            )}
            {tabs.length > 1 && (
              <button
                className="freeform-tab-close"
                onClick={(e) => { e.stopPropagation(); deleteTab(tab.id); }}
              >×</button>
            )}
          </div>
        ))}
        <button className="freeform-tab-add" onClick={addNewTab}>+</button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="freeform-canvas"
        onMouseDown={handleCanvasMouseDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: spaceKeyPressed || isPanning ? 'grab' : tool === 'text' ? 'text' : 'default' }}
      >
        <div
          className="freeform-content"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: '0 0'
          }}
        >
          {/* Grid background */}
          <div className="freeform-grid"></div>

          {/* Items */}
          {items.map(item => {
            const isSelected = selectedItems.includes(item.id);
            const isHovered = hoveredItems.includes(item.id);

            if (item.type === 'image') {
              return (
                <div
                  key={item.id}
                  className={`freeform-item freeform-image ${isSelected || isHovered ? 'selected' : ''}`}
                  style={{
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    width: `${item.width}px`,
                    height: `${item.height}px`
                  }}
                  onMouseDown={(e) => handleItemMouseDown(e, item)}
                >
                  <img src={item.src} alt="" draggable={false} />
                  {isSelected && (
                    <div
                      className="freeform-resize-handle"
                      onMouseDown={(e) => handleResizeMouseDown(e, item)}
                    />
                  )}
                </div>
              );
            }

            if (item.type === 'text') {
              const isEditing = editingTextId === item.id;
              return (
                <div
                  key={item.id}
                  className={`freeform-item freeform-text ${!isEditing && (isSelected || isHovered) ? 'selected' : ''}`}
                  style={{
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    fontSize: `${item.fontSize}px`,
                    color: item.color
                  }}
                  onMouseDown={(e) => !isEditing && handleItemMouseDown(e, item)}
                  onClick={(e) => {
                    if (!isEditing) {
                      e.stopPropagation();
                      setEditingTextId(item.id);
                    }
                  }}
                >
                  {editingTextId === item.id ? (
                    <textarea
                      className="freeform-text-input"
                      value={item.content}
                      onChange={(e) => setItems(prev => prev.map(i =>
                        i.id === item.id ? { ...i, content: e.target.value } : i
                      ))}
                      onBlur={() => setEditingTextId(null)}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="freeform-text-content">{item.content || 'Double-click to edit'}</div>
                  )}
                </div>
              );
            }

            if (item.type === 'sticky') {
              const isEditing = editingTextId === item.id;
              return (
                <div
                  key={item.id}
                  className={`freeform-item freeform-sticky ${!isEditing && (isSelected || isHovered) ? 'selected' : ''}`}
                  style={{
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    width: `${item.width}px`,
                    height: `${item.height}px`,
                    backgroundColor: item.color
                  }}
                  onMouseDown={(e) => !isEditing && handleItemMouseDown(e, item)}
                  onClick={(e) => {
                    if (!isEditing) {
                      e.stopPropagation();
                      setEditingTextId(item.id);
                    }
                  }}
                >
                  {editingTextId === item.id ? (
                    <textarea
                      className="freeform-sticky-input"
                      value={item.content}
                      onChange={(e) => setItems(prev => prev.map(i =>
                        i.id === item.id ? { ...i, content: e.target.value } : i
                      ))}
                      onBlur={() => setEditingTextId(null)}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="freeform-sticky-content">{item.content || 'Double-click to edit'}</div>
                  )}
                  {isSelected && (
                    <div
                      className="freeform-resize-handle"
                      onMouseDown={(e) => handleResizeMouseDown(e, item)}
                    />
                  )}
                </div>
              );
            }

            return null;
          })}

          {/* Selection box */}
          {selectionBox && (
            <div
              className="freeform-selection-box"
              style={{
                left: `${Math.min(selectionBox.startX, selectionBox.currentX)}px`,
                top: `${Math.min(selectionBox.startY, selectionBox.currentY)}px`,
                width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}px`,
                height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}px`
              }}
            />
          )}
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="freeform-hints">
        <div><kbd>V</kbd> Select</div>
        <div><kbd>T</kbd> Text</div>
        <div><kbd>N</kbd> Note</div>
        <div><kbd>Space</kbd> Pan</div>
        <div><kbd>Shift</kbd> Multi-select</div>
        <div><kbd>Cmd/Ctrl + Wheel</kbd> Zoom</div>
      </div>
    </div>
  );
}

export default ReferencePanel;

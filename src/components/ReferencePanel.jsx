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
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [clipboard, setClipboard] = useState(null);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastDragPosRef = useRef({ x: 0, y: 0 });

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const items = activeTab.items;

  // Add to history when items change
  const saveToHistory = (newItems) => {
    const currentState = JSON.stringify(newItems);
    const lastState = history[historyIndex];

    // Don't save if state hasn't changed
    if (lastState && JSON.stringify(lastState) === currentState) {
      return;
    }

    // Remove any history after current index (when undoing then making new changes)
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newItems);

    // Limit history to 50 states
    if (newHistory.length > 50) {
      newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    } else {
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const setItems = (updateFn) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === activeTabId) {
        const newItems = typeof updateFn === 'function' ? updateFn(tab.items) : updateFn;
        saveToHistory(newItems);
        return { ...tab, items: newItems };
      }
      return tab;
    }));
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const previousState = history[newIndex];
      setTabs(prev => prev.map(tab =>
        tab.id === activeTabId ? { ...tab, items: previousState } : tab
      ));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const nextState = history[newIndex];
      setTabs(prev => prev.map(tab =>
        tab.id === activeTabId ? { ...tab, items: nextState } : tab
      ));
    }
  };

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('freeformTabs');
    console.log('Loading tabs from localStorage:', saved);

    // Try to recover from backup if exists
    const backup = localStorage.getItem('freeformTabs_backup');

    if (saved) {
      try {
        const loadedTabs = JSON.parse(saved);
        console.log('Loaded tabs:', loadedTabs);

        // Check if tabs have content
        const hasContent = loadedTabs.some(tab => tab.items && tab.items.length > 0);

        if (!hasContent && backup) {
          // Try to restore from backup
          console.log('No content in current tabs, trying backup...');
          try {
            const backupTabs = JSON.parse(backup);
            console.log('Restored from backup:', backupTabs);
            setTabs(backupTabs);
            if (backupTabs.length > 0) {
              setActiveTabId(backupTabs[0].id);
            }
            return;
          } catch (e) {
            console.error('Failed to load backup:', e);
          }
        }

        setTabs(loadedTabs);
        if (loadedTabs.length > 0) {
          setActiveTabId(loadedTabs[0].id);
        }
      } catch (e) {
        console.error('Failed to load tabs:', e);
      }
    } else {
      console.log('No saved tabs found in localStorage');

      // Try backup
      if (backup) {
        try {
          const backupTabs = JSON.parse(backup);
          console.log('Loaded from backup:', backupTabs);
          setTabs(backupTabs);
          if (backupTabs.length > 0) {
            setActiveTabId(backupTabs[0].id);
          }
        } catch (e) {
          console.error('Failed to load backup:', e);
        }
      }
    }
  }, []);

  // Save to localStorage with backup
  useEffect(() => {
    const tabsJson = JSON.stringify(tabs);

    // Create backup before saving if tabs have content
    const hasContent = tabs.some(tab => tab.items && tab.items.length > 0);
    if (hasContent) {
      const existingBackup = localStorage.getItem('freeformTabs_backup');
      if (existingBackup) {
        // Keep old backup as second backup
        localStorage.setItem('freeformTabs_backup_old', existingBackup);
      }
      localStorage.setItem('freeformTabs_backup', tabsJson);
    }

    localStorage.setItem('freeformTabs', tabsJson);
  }, [tabs]);


  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.target.contentEditable === 'true') return;

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

      // Cmd/Ctrl + C - Copy selected items
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (selectedItems.length > 0) {
          e.preventDefault();
          const itemsToCopy = items.filter(item => selectedItems.includes(item.id));
          setClipboard(itemsToCopy);
        }
      }

      // Cmd/Ctrl + V - Paste copied items
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (clipboard && clipboard.length > 0) {
          e.preventDefault();
          const now = Date.now();
          const pastedItems = clipboard.map((item, index) => ({
            ...item,
            id: now + index,
            x: item.x + 20, // Offset by 20px
            y: item.y + 20
          }));
          setItems(prev => [...prev, ...pastedItems]);
          // Select the newly pasted items
          setSelectedItems(pastedItems.map(item => item.id));
        }
      }

      // Cmd/Ctrl + Z - Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Cmd/Ctrl + Shift + Z - Redo
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }

      // Cmd/Ctrl + Y - Redo (alternative)
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
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
  }, [selectedItems, items, clipboard]);

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
      // Get item dimensions using the same function as alignment
      const dims = getItemDimensions(item);
      const padding = 1; // Minimal padding for precise selection

      let itemWidth, itemHeight, itemX, itemY;

      if (item.type === 'image' || item.type === 'sticky') {
        itemWidth = dims.width;
        itemHeight = dims.height;
        itemX = item.x;
        itemY = item.y;
      } else if (item.type === 'text') {
        // Use calculated dimensions for text, add small padding for easier selection
        itemWidth = dims.width + padding * 2;
        itemHeight = dims.height + padding * 2;
        itemX = item.x - padding;
        itemY = item.y - padding;
      } else {
        itemWidth = dims.width;
        itemHeight = dims.height;
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
      e.preventDefault();
      e.stopPropagation();

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

      // Use setTimeout to ensure state is updated before editing
      setTimeout(() => {
        setEditingTextId(newItem.id);
      }, 0);

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
    lastDragPosRef.current = { x: item.x, y: item.y };
  };

  const handleItemMouseMove = (e) => {
    if (draggedItem) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      const newX = coords.x - dragOffset.x;
      const newY = coords.y - dragOffset.y;

      const deltaX = newX - lastDragPosRef.current.x;
      const deltaY = newY - lastDragPosRef.current.y;

      setItems(prev => prev.map(item => {
        if (item.id === draggedItem.id) {
          return { ...item, x: newX, y: newY };
        }
        if (selectedItems.includes(item.id) && item.id !== draggedItem.id) {
          return { ...item, x: item.x + deltaX, y: item.y + deltaY };
        }
        return item;
      }));

      lastDragPosRef.current = { x: newX, y: newY };
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

  // Helper function to get item dimensions
  const getItemDimensions = (item) => {
    if (item.type === 'text') {
      // Calculate text dimensions based on content
      const fontSize = item.fontSize || 16;
      const lineHeight = fontSize * 1.5;
      const content = item.content || '';

      // Count actual lines in the content
      const lines = content.split('\n');
      const lineCount = lines.length || 1;

      // Calculate width - use the longest line
      const maxLineLength = Math.max(...lines.map(line => line.length), 1);
      const estimatedWidth = maxLineLength * fontSize * 0.6; // Approximate char width

      return {
        width: estimatedWidth,
        height: lineCount * lineHeight
      };
    }
    return {
      width: item.width || 0,
      height: item.height || 0
    };
  };

  // Align functions
  const alignLeft = () => {
    if (selectedItems.length < 2) return;
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    const minX = Math.min(...selectedItemsData.map(item => item.x));
    setItems(prev => prev.map(item =>
      selectedItems.includes(item.id) ? { ...item, x: minX } : item
    ));
  };

  const alignRight = () => {
    if (selectedItems.length < 2) return;
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    const maxX = Math.max(...selectedItemsData.map(item => {
      const dims = getItemDimensions(item);
      return item.x + dims.width;
    }));
    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id)) {
        const dims = getItemDimensions(item);
        return { ...item, x: maxX - dims.width };
      }
      return item;
    }));
  };

  const alignTop = () => {
    if (selectedItems.length < 2) return;
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    const minY = Math.min(...selectedItemsData.map(item => item.y));
    setItems(prev => prev.map(item =>
      selectedItems.includes(item.id) ? { ...item, y: minY } : item
    ));
  };

  const alignBottom = () => {
    if (selectedItems.length < 2) return;
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    const maxY = Math.max(...selectedItemsData.map(item => {
      const dims = getItemDimensions(item);
      return item.y + dims.height;
    }));
    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id)) {
        const dims = getItemDimensions(item);
        return { ...item, y: maxY - dims.height };
      }
      return item;
    }));
  };

  const alignCenterHorizontal = () => {
    if (selectedItems.length < 2) return;
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    const centerX = selectedItemsData.reduce((sum, item) => {
      const dims = getItemDimensions(item);
      return sum + item.x + dims.width / 2;
    }, 0) / selectedItemsData.length;
    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id)) {
        const dims = getItemDimensions(item);
        return { ...item, x: centerX - dims.width / 2 };
      }
      return item;
    }));
  };

  const alignCenterVertical = () => {
    if (selectedItems.length < 2) return;
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));
    const centerY = selectedItemsData.reduce((sum, item) => {
      const dims = getItemDimensions(item);
      return sum + item.y + dims.height / 2;
    }, 0) / selectedItemsData.length;
    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id)) {
        const dims = getItemDimensions(item);
        return { ...item, y: centerY - dims.height / 2 };
      }
      return item;
    }));
  };

  // Distribute functions
  const distributeHorizontal = () => {
    if (selectedItems.length < 3) return;
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));

    // Sort by x position
    const sorted = [...selectedItemsData].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const firstDims = getItemDimensions(first);
    const lastDims = getItemDimensions(last);

    const totalSpace = (last.x + lastDims.width) - first.x;
    const totalItemWidth = sorted.reduce((sum, item) => {
      const dims = getItemDimensions(item);
      return sum + dims.width;
    }, 0);
    const spacing = (totalSpace - totalItemWidth) / (sorted.length - 1);

    let currentX = first.x + firstDims.width + spacing;

    setItems(prev => prev.map(item => {
      const index = sorted.findIndex(s => s.id === item.id);
      if (index > 0 && index < sorted.length - 1) {
        const newX = currentX;
        const dims = getItemDimensions(item);
        currentX = newX + dims.width + spacing;
        return { ...item, x: newX };
      }
      return item;
    }));
  };

  const distributeVertical = () => {
    if (selectedItems.length < 3) return;
    const selectedItemsData = items.filter(item => selectedItems.includes(item.id));

    // Sort by y position
    const sorted = [...selectedItemsData].sort((a, b) => a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const firstDims = getItemDimensions(first);
    const lastDims = getItemDimensions(last);

    const totalSpace = (last.y + lastDims.height) - first.y;
    const totalItemHeight = sorted.reduce((sum, item) => {
      const dims = getItemDimensions(item);
      return sum + dims.height;
    }, 0);
    const spacing = (totalSpace - totalItemHeight) / (sorted.length - 1);

    let currentY = first.y + firstDims.height + spacing;

    setItems(prev => prev.map(item => {
      const index = sorted.findIndex(s => s.id === item.id);
      if (index > 0 && index < sorted.length - 1) {
        const newY = currentY;
        const dims = getItemDimensions(item);
        currentY = newY + dims.height + spacing;
        return { ...item, y: newY };
      }
      return item;
    }));
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

        <div className="freeform-history-tools">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Undo (Cmd/Ctrl + Z)"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Cmd/Ctrl + Shift + Z)"
          >
            ↷
          </button>
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

        <div className="freeform-align-tools">
          <div className="align-section">
            <span className="align-label">Text:</span>
            <button
              onClick={() => {
                setItems(prev => prev.map(item => {
                  if (selectedItems.includes(item.id) && item.type === 'text') {
                    return { ...item, fontSize: Math.max(8, (item.fontSize || 16) - 2) };
                  }
                  return item;
                }));
              }}
              className="align-btn"
              title="Decrease Font Size"
              disabled={!(selectedItems.length > 0 && items.filter(item => selectedItems.includes(item.id) && item.type === 'text').length > 0)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16">
                <text x="2" y="12" fontSize="10" fill="currentColor" fontWeight="bold">A</text>
              </svg>
            </button>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>
              {(() => {
                const textItems = items.filter(item => selectedItems.includes(item.id) && item.type === 'text');
                const fontSize = textItems.length > 0 ? textItems[0].fontSize || 16 : 16;
                return fontSize;
              })()}
            </span>
            <button
              onClick={() => {
                setItems(prev => prev.map(item => {
                  if (selectedItems.includes(item.id) && item.type === 'text') {
                    return { ...item, fontSize: Math.min(72, (item.fontSize || 16) + 2) };
                  }
                  return item;
                }));
              }}
              className="align-btn"
              title="Increase Font Size"
              disabled={!(selectedItems.length > 0 && items.filter(item => selectedItems.includes(item.id) && item.type === 'text').length > 0)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16">
                <text x="1" y="13" fontSize="14" fill="currentColor" fontWeight="bold">A</text>
              </svg>
            </button>
            <span className="align-divider">|</span>
            <button
              onClick={() => {
                setItems(prev => prev.map(item => {
                  if (selectedItems.includes(item.id) && item.type === 'text') {
                    return { ...item, fontWeight: item.fontWeight === 'bold' ? 'normal' : 'bold' };
                  }
                  return item;
                }));
              }}
              className={`align-btn ${items.some(item => selectedItems.includes(item.id) && item.type === 'text' && item.fontWeight === 'bold') ? 'active' : ''}`}
              title="Bold"
              disabled={!(selectedItems.length > 0 && items.filter(item => selectedItems.includes(item.id) && item.type === 'text').length > 0)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16">
                <text x="4" y="12" fontSize="12" fill="currentColor" fontWeight="bold">B</text>
              </svg>
            </button>
            <span className="align-divider">|</span>
          </div>
          <div className="align-section">
            <span className="align-label">Align:</span>
            <button onClick={alignLeft} title="Align Left" className="align-btn" disabled={selectedItems.length < 2}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <line x1="2" y1="2" x2="2" y2="14" stroke="currentColor" strokeWidth="2"/>
                <rect x="4" y="3" width="8" height="2" fill="currentColor"/>
                <rect x="4" y="7" width="10" height="2" fill="currentColor"/>
                <rect x="4" y="11" width="6" height="2" fill="currentColor"/>
              </svg>
            </button>
            <button onClick={alignCenterHorizontal} title="Align Center Horizontal" className="align-btn" disabled={selectedItems.length < 2}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="2"/>
                <rect x="5" y="3" width="6" height="2" fill="currentColor"/>
                <rect x="3" y="7" width="10" height="2" fill="currentColor"/>
                <rect x="6" y="11" width="4" height="2" fill="currentColor"/>
              </svg>
            </button>
            <button onClick={alignRight} title="Align Right" className="align-btn" disabled={selectedItems.length < 2}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <line x1="14" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="2"/>
                <rect x="4" y="3" width="8" height="2" fill="currentColor"/>
                <rect x="2" y="7" width="10" height="2" fill="currentColor"/>
                <rect x="6" y="11" width="6" height="2" fill="currentColor"/>
              </svg>
            </button>
            <span className="align-divider">|</span>
            <button onClick={alignTop} title="Align Top" className="align-btn" disabled={selectedItems.length < 2}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <line x1="2" y1="2" x2="14" y2="2" stroke="currentColor" strokeWidth="2"/>
                <rect x="3" y="4" width="2" height="8" fill="currentColor"/>
                <rect x="7" y="4" width="2" height="10" fill="currentColor"/>
                <rect x="11" y="4" width="2" height="6" fill="currentColor"/>
              </svg>
            </button>
            <button onClick={alignCenterVertical} title="Align Center Vertical" className="align-btn" disabled={selectedItems.length < 2}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2"/>
                <rect x="3" y="5" width="2" height="6" fill="currentColor"/>
                <rect x="7" y="3" width="2" height="10" fill="currentColor"/>
                <rect x="11" y="6" width="2" height="4" fill="currentColor"/>
              </svg>
            </button>
            <button onClick={alignBottom} title="Align Bottom" className="align-btn" disabled={selectedItems.length < 2}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" strokeWidth="2"/>
                <rect x="3" y="4" width="2" height="8" fill="currentColor"/>
                <rect x="7" y="2" width="2" height="10" fill="currentColor"/>
                <rect x="11" y="6" width="2" height="6" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div className="align-section">
            <span className="align-label">Distribute:</span>
            <button onClick={distributeHorizontal} title="Distribute Horizontal" className="align-btn" disabled={selectedItems.length < 3}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <rect x="2" y="5" width="2" height="6" fill="currentColor"/>
                <rect x="7" y="5" width="2" height="6" fill="currentColor"/>
                <rect x="12" y="5" width="2" height="6" fill="currentColor"/>
                <line x1="4" y1="8" x2="7" y2="8" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
                <line x1="9" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
              </svg>
            </button>
            <button onClick={distributeVertical} title="Distribute Vertical" className="align-btn" disabled={selectedItems.length < 3}>
              <svg width="16" height="16" viewBox="0 0 16 16">
                <rect x="5" y="2" width="6" height="2" fill="currentColor"/>
                <rect x="5" y="7" width="6" height="2" fill="currentColor"/>
                <rect x="5" y="12" width="6" height="2" fill="currentColor"/>
                <line x1="8" y1="4" x2="8" y2="7" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
                <line x1="8" y1="9" x2="8" y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
              </svg>
            </button>
          </div>
        </div>
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

              if (isEditing) {
                return (
                  <div
                    key={item.id}
                    className="freeform-item"
                    style={{
                      position: 'absolute',
                      left: `${item.x}px`,
                      top: `${item.y}px`,
                      zIndex: 1000
                    }}
                  >
                    <textarea
                      value={item.content}
                      onChange={(e) => {
                        setItems(prev => prev.map(i =>
                          i.id === item.id ? { ...i, content: e.target.value } : i
                        ));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingTextId(null);
                          // Delete if empty - check current input value
                          if (!e.target.value.trim()) {
                            setItems(prev => prev.filter(i => i.id !== item.id));
                          }
                        }
                        // Cmd/Ctrl + Enter to finish editing
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          setEditingTextId(null);
                          if (!e.target.value.trim()) {
                            setItems(prev => prev.filter(i => i.id !== item.id));
                          }
                        }
                      }}
                      onBlur={(e) => {
                        setEditingTextId(null);
                        // Delete if empty - check current input value
                        if (!e.target.value.trim()) {
                          setItems(prev => prev.filter(i => i.id !== item.id));
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      autoFocus
                      placeholder="Type here..."
                      rows={item.content.split('\n').length || 1}
                      style={{
                        fontSize: `${item.fontSize}px`,
                        color: item.color || '#ffffff',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        outline: 'none',
                        background: 'rgba(0, 0, 0, 0.3)',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        padding: '4px 8px',
                        margin: 0,
                        width: `${Math.max(200, Math.max(...(item.content.split('\n').map(line => line.length))) * (item.fontSize * 0.6))}px`,
                        maxWidth: '1200px',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        resize: 'none',
                        overflow: 'hidden',
                        lineHeight: '1.5'
                      }}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className={`freeform-item freeform-text ${(isSelected || isHovered) ? 'selected' : ''}`}
                  style={{
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    fontSize: `${item.fontSize}px`,
                    color: item.color,
                    cursor: 'pointer',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                    display: 'inline-block',
                    verticalAlign: 'top',
                    fontWeight: item.fontWeight || 'normal'
                  }}
                  onMouseDown={(e) => handleItemMouseDown(e, item)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTextId(item.id);
                  }}
                >
                  {item.content || ' '}
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
        <div><kbd>Cmd/Ctrl + C/V</kbd> Copy/Paste</div>
        <div><kbd>Cmd/Ctrl + Wheel</kbd> Zoom</div>
      </div>
    </div>
  );
}

export default ReferencePanel;

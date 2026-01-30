import { useState, useEffect, useRef } from 'react';
import StorageService from '../services/storageService';

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
  const [editingCanvasId, setEditingCanvasId] = useState(null);
  const [spaceKeyPressed, setSpaceKeyPressed] = useState(false);
  const [selectionBox, setSelectionBox] = useState(null);
  const [isDrawingSelection, setIsDrawingSelection] = useState(false);
  const [hoveredItems, setHoveredItems] = useState([]);
  const [tool, setTool] = useState('select'); // 'select', 'text', 'canvas'
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [clipboard, setClipboard] = useState(null);
  const [storageService, setStorageService] = useState(null);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastDragPosRef = useRef({ x: 0, y: 0 });
  const zoomLevelRef = useRef(zoomLevel);
  const panOffsetRef = useRef(panOffset);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const items = activeTab.items;

  // Ref'leri güncel tut
  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

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
    const loadTabs = () => {
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
    };

    // Initial load
    loadTabs();

    // Listen for changes from Firebase sync (via custom event)
    const handleStorageUpdate = (e) => {
      if (e.key === 'freeformTabs' || e.detail?.key === 'freeformTabs') {
        console.log('freeformTabs updated from Firebase, reloading...');
        loadTabs();
      }
    };

    // Listen for custom storage update events (triggered by Firebase sync)
    window.addEventListener('storage-updated', handleStorageUpdate);

    return () => {
      window.removeEventListener('storage-updated', handleStorageUpdate);
    };
  }, []);

  // Initialize storage service
  useEffect(() => {
    setStorageService(new StorageService('local-user'));
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

      // Text düzenleme modunda CTRL+C/V için native clipboard kullan
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v')) {
        if (editingTextId !== null || editingCanvasId !== null) return;
      }

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
          setItems(prev => {
            // Filter out top-level selected items
            const filteredTopLevel = prev.filter(item => !selectedItems.includes(item.id));

            // Also remove selected items from canvas children
            return filteredTopLevel.map(item => {
              if (item.type === 'canvas' && item.items) {
                return {
                  ...item,
                  items: item.items.filter(child => !selectedItems.includes(child.id))
                };
              }
              return item;
            });
          });
          setSelectedItems([]);
        }
      }

      // Cmd/Ctrl + A - Select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        const allIds = [];
        items.forEach(item => {
          allIds.push(item.id);
          // Also add canvas children
          if (item.type === 'canvas' && item.items) {
            item.items.forEach(child => allIds.push(child.id));
          }
        });
        setSelectedItems(allIds);
      }

      // Cmd/Ctrl + C - Copy selected items
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (selectedItems.length > 0) {
          e.preventDefault();
          const itemsToCopy = [];

          // Get top-level selected items
          items.forEach(item => {
            if (selectedItems.includes(item.id)) {
              itemsToCopy.push(item);
            }
            // Also check canvas children
            if (item.type === 'canvas' && item.items) {
              item.items.forEach(child => {
                if (selectedItems.includes(child.id)) {
                  // Convert to absolute coordinates for copying
                  itemsToCopy.push({
                    ...child,
                    x: item.x + child.x,
                    y: item.y + child.y,
                    parentId: null // Remove parent when copying
                  });
                }
              });
            }
          });

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
      const isOverCanvas = canvasRef.current?.contains(e.target);

      if (isOverCanvas) {
        // Canvas içinde: zoom (CTRL'ye gerek yok)
        e.preventDefault();

        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? -0.1 : 0.1;

        // Mevcut değerleri ref'ten al
        const currentZoom = zoomLevelRef.current;
        const currentPan = panOffsetRef.current;

        // Yeni zoom seviyesini hesapla
        const newZoom = Math.max(0.25, Math.min(3, currentZoom + delta));

        // İmlecin işaret ettiği world koordinatını hesapla
        const worldX = (mouseX - currentPan.x) / currentZoom;
        const worldY = (mouseY - currentPan.y) / currentZoom;

        // Yeni pan offset: aynı world noktası imleçte kalacak
        const newPanX = mouseX - worldX * newZoom;
        const newPanY = mouseY - worldY * newZoom;

        // State'leri güncelle
        setZoomLevel(newZoom);
        setPanOffset({ x: newPanX, y: newPanY });
      }
      // Canvas dışında: normal scroll (preventDefault yok)
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  // Paste images
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = async (event) => {
            const img = new Image();
            img.onload = async () => {
              const base64 = event.target.result;
              let imageSrc = base64;

              // Firebase Storage'a yükle
              if (storageService) {
                try {
                  const itemId = Date.now();
                  imageSrc = await storageService.uploadBase64(base64, itemId);
                  console.log('Image uploaded to Firebase Storage:', imageSrc);
                } catch (error) {
                  console.error('Upload failed, using base64:', error);
                  // base64 olarak kalır
                }
              }

              const newItem = {
                id: Date.now(),
                type: 'image',
                src: imageSrc,  // URL veya base64
                x: -panOffset.x / zoomLevel + 100,
                y: -panOffset.y / zoomLevel + 100,
                width: img.width,
                height: img.height
              };
              setItems(prev => [...prev, newItem]);
            };
            img.src = event.target.result;
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('paste', handlePaste);
      return () => canvas.removeEventListener('paste', handlePaste);
    }

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

  // Find which canvas contains a point
  const getCanvasAt = (x, y) => {
    // Find canvas items, sorted by z-index (last one is on top)
    const canvases = items.filter(item => item.type === 'canvas');

    // Check from top to bottom (reverse order)
    for (let i = canvases.length - 1; i >= 0; i--) {
      const canvas = canvases[i];
      if (x >= canvas.x && x <= canvas.x + canvas.width &&
          y >= canvas.y && y <= canvas.y + canvas.height) {
        return canvas;
      }
    }
    return null;
  };

  const getItemsInBox = (box) => {
    const selectedIds = [];
    const padding = 1;

    items.forEach(item => {
      // Check top-level items
      const dims = getItemDimensions(item);

      let itemWidth, itemHeight, itemX, itemY;

      if (item.type === 'image' || item.type === 'sticky' || item.type === 'canvas') {
        itemWidth = dims.width;
        itemHeight = dims.height;
        itemX = item.x;
        itemY = item.y;
      } else if (item.type === 'text') {
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

      // Check if top-level item overlaps
      const overlaps = !(itemRight <= box.left || itemX >= box.right ||
                         itemBottom <= box.top || itemY >= box.bottom);

      if (overlaps) {
        selectedIds.push(item.id);
      }

      // Check canvas children
      if (item.type === 'canvas' && item.items && item.items.length > 0) {
        item.items.forEach(child => {
          // Convert child coordinates to absolute
          const absX = item.x + child.x;
          const absY = item.y + child.y;

          const childDims = getItemDimensions(child);
          let childWidth, childHeight, childX, childY;

          if (child.type === 'text') {
            childWidth = childDims.width + padding * 2;
            childHeight = childDims.height + padding * 2;
            childX = absX - padding;
            childY = absY - padding;
          } else if (child.type === 'image') {
            childWidth = childDims.width;
            childHeight = childDims.height;
            childX = absX;
            childY = absY;
          } else {
            childWidth = childDims.width;
            childHeight = childDims.height;
            childX = absX;
            childY = absY;
          }

          const childRight = childX + childWidth;
          const childBottom = childY + childHeight;

          // Check if child overlaps with selection box
          const childOverlaps = !(childRight <= box.left || childX >= box.right ||
                                  childBottom <= box.top || childY >= box.bottom);

          if (childOverlaps) {
            selectedIds.push(child.id);
          }
        });
      }
    });

    return selectedIds;
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

      const parentCanvas = getCanvasAt(coords.x, coords.y);

      const newItem = {
        id: Date.now(),
        type: 'text',
        content: '',
        x: parentCanvas ? coords.x - parentCanvas.x : coords.x,
        y: parentCanvas ? coords.y - parentCanvas.y : coords.y,
        fontSize: 16,
        color: '#ffffff',
        parentId: parentCanvas ? parentCanvas.id : null
      };

      if (parentCanvas) {
        // Add to canvas's items array
        setItems(prev => prev.map(item =>
          item.id === parentCanvas.id
            ? { ...item, items: [...(item.items || []), newItem] }
            : item
        ));
      } else {
        setItems(prev => [...prev, newItem]);
      }

      // Use setTimeout to ensure state is updated before editing
      setTimeout(() => {
        setEditingTextId(newItem.id);
      }, 0);

      setTool('select');
      return;
    }

    // Canvas tool - create a draggable canvas area
    if (tool === 'canvas') {
      setIsDrawingSelection(true);
      setSelectionBox({ startX: coords.x, startY: coords.y, currentX: coords.x, currentY: coords.y });
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

      // If canvas tool, create a canvas item
      if (tool === 'canvas') {
        const width = box.right - box.left;
        const height = box.bottom - box.top;

        // Only create canvas if it has meaningful size
        if (width > 50 && height > 50) {
          const newCanvas = {
            id: Date.now(),
            type: 'canvas',
            name: 'Canvas',
            x: box.left,
            y: box.top,
            width: width,
            height: height,
            items: [], // Canvas içindeki öğeler
            backgroundColor: 'rgba(40, 40, 40, 0.8)'
          };
          setItems(prev => [...prev, newCanvas]);
        }

        setTool('select');
        setSelectionBox(null);
        setIsDrawingSelection(false);
        return;
      }

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
    // If space key is pressed or panning, don't handle - allow pan instead
    if (spaceKeyPressed || isPanning) {
      return;
    }

    // Don't interfere with other tools
    if (tool !== 'select') {
      e.stopPropagation();
      return;
    }

    // Stop event propagation so canvas mousedown doesn't trigger
    e.stopPropagation();

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

    // Don't start dragging if item is locked
    if (item.locked) {
      return;
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

      setItems(prev => {
        // If dragged item has a parentId, we need to update it within the parent's items array
        if (draggedItem.parentId) {
          return prev.map(item => {
            if (item.id === draggedItem.parentId && item.type === 'canvas') {
              // Update child item within canvas and move all selected siblings
              return {
                ...item,
                items: (item.items || []).map(child => {
                  if (child.id === draggedItem.id) {
                    // Convert back to relative coordinates
                    return { ...child, x: newX - item.x, y: newY - item.y };
                  }
                  // Move other selected children together with the dragged one
                  if (selectedItems.includes(child.id) && child.id !== draggedItem.id) {
                    return { ...child, x: child.x + deltaX, y: child.y + deltaY };
                  }
                  return child;
                })
              };
            }
            return item;
          });
        }

        // Otherwise update top-level items
        return prev.map(item => {
          if (item.id === draggedItem.id) {
            return { ...item, x: newX, y: newY };
          }
          if (selectedItems.includes(item.id) && item.id !== draggedItem.id) {
            return { ...item, x: item.x + deltaX, y: item.y + deltaY };
          }
          return item;
        });
      });

      lastDragPosRef.current = { x: newX, y: newY };
    }

    if (resizingItem) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      const deltaX = coords.x - resizeStart.x;
      const deltaY = coords.y - resizeStart.y;
      let newWidth = Math.max(50, resizeStart.width + deltaX);
      let newHeight = Math.max(50, resizeStart.height + deltaY);

      // Görseller için aspect ratio her zaman korunur
      if (resizingItem.type === 'image' && resizeStart.width > 0 && resizeStart.height > 0) {
        const aspectRatio = resizeStart.width / resizeStart.height;
        newHeight = newWidth / aspectRatio;
      }

      setItems(prev => prev.map(item => {
        if (item.id === resizingItem.id) {
          return { ...item, width: newWidth, height: newHeight };
        }
        return item;
      }));
    }
  };

  const handleItemMouseUp = (e) => {
    if (draggedItem) {
      // Check if the dragged item is dropped on a canvas
      const coords = e ? getCanvasCoords(e.clientX, e.clientY) : null;

      if (coords && (draggedItem.type === 'text' || draggedItem.type === 'image')) {
        const targetCanvas = getCanvasAt(coords.x, coords.y);
        const currentParentId = draggedItem.parentId;

        // Moving from one canvas to another, or from top-level to canvas
        if (targetCanvas && currentParentId !== targetCanvas.id) {
          // Convert coordinates to be relative to the target canvas
          const relativeX = draggedItem.x - targetCanvas.x;
          const relativeY = draggedItem.y - targetCanvas.y;

          setItems(prev => {
            let updated = [...prev];

            // Remove from current parent if it has one
            if (currentParentId) {
              updated = updated.map(item => {
                if (item.id === currentParentId && item.type === 'canvas') {
                  return {
                    ...item,
                    items: (item.items || []).filter(ci => ci.id !== draggedItem.id)
                  };
                }
                return item;
              });
            } else {
              // Remove from top level
              updated = updated.filter(item => item.id !== draggedItem.id);
            }

            // Add to target canvas
            updated = updated.map(item => {
              if (item.id === targetCanvas.id) {
                return {
                  ...item,
                  items: [
                    ...(item.items || []),
                    {
                      ...draggedItem,
                      x: relativeX,
                      y: relativeY,
                      parentId: targetCanvas.id
                    }
                  ]
                };
              }
              return item;
            });

            return updated;
          });
        }
        // Moving from canvas to top-level (outside all canvases)
        else if (!targetCanvas && currentParentId) {
          setItems(prev => {
            // Remove from parent canvas
            const withoutFromParent = prev.map(item => {
              if (item.id === currentParentId) {
                return {
                  ...item,
                  items: (item.items || []).filter(ci => ci.id !== draggedItem.id)
                };
              }
              return item;
            });

            // Add to top level with absolute coordinates
            return [...withoutFromParent, {
              ...draggedItem,
              x: draggedItem.x,
              y: draggedItem.y,
              parentId: null
            }];
          });
        }
      }
    }

    setDraggedItem(null);
    setResizingItem(null);
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!draggedItem && !resizingItem) return;
      handleItemMouseMove(e);
    };

    const handleUp = (e) => {
      if (!draggedItem && !resizingItem) return;
      handleItemMouseUp(e);
    };

    // Prevent text selection while dragging
    if (draggedItem || resizingItem) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = draggedItem ? 'grabbing' : 'nwse-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [draggedItem, resizingItem]);

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
      const estimatedWidth = maxLineLength * fontSize * 0.5; // Approximate char width

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

    // Get all selected items including canvas children (with absolute coordinates)
    // Skip canvas items themselves
    const selectedItemsData = [];
    items.forEach(item => {
      if (selectedItems.includes(item.id) && item.type !== 'canvas') {
        selectedItemsData.push({ ...item, parentId: null, parentX: 0, parentY: 0 });
      }
      if (item.type === 'canvas' && item.items) {
        item.items.forEach(child => {
          if (selectedItems.includes(child.id)) {
            selectedItemsData.push({ ...child, parentId: item.id, parentX: item.x, parentY: item.y, absX: item.x + child.x });
          }
        });
      }
    });

    if (selectedItemsData.length < 2) return;

    const minX = Math.min(...selectedItemsData.map(item => item.parentId ? item.absX : item.x));

    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id) && !item.parentId && item.type !== 'canvas') {
        return { ...item, x: minX };
      }
      if (item.type === 'canvas' && item.items) {
        return {
          ...item,
          items: item.items.map(child => {
            if (selectedItems.includes(child.id)) {
              return { ...child, x: minX - item.x };
            }
            return child;
          })
        };
      }
      return item;
    }));
  };

  const alignRight = () => {
    if (selectedItems.length < 2) return;

    const selectedItemsData = [];
    items.forEach(item => {
      if (selectedItems.includes(item.id) && item.type !== 'canvas') {
        const dims = getItemDimensions(item);
        selectedItemsData.push({ ...item, parentId: null, parentX: 0, absX: item.x, dims });
      }
      if (item.type === 'canvas' && item.items) {
        item.items.forEach(child => {
          if (selectedItems.includes(child.id)) {
            const dims = getItemDimensions(child);
            selectedItemsData.push({ ...child, parentId: item.id, parentX: item.x, absX: item.x + child.x, dims });
          }
        });
      }
    });

    if (selectedItemsData.length < 2) return;

    const maxX = Math.max(...selectedItemsData.map(item => item.absX + item.dims.width));

    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id) && !item.parentId && item.type !== 'canvas') {
        const dims = getItemDimensions(item);
        return { ...item, x: maxX - dims.width };
      }
      if (item.type === 'canvas' && item.items) {
        return {
          ...item,
          items: item.items.map(child => {
            if (selectedItems.includes(child.id)) {
              const dims = getItemDimensions(child);
              return { ...child, x: maxX - dims.width - item.x };
            }
            return child;
          })
        };
      }
      return item;
    }));
  };

  const alignTop = () => {
    if (selectedItems.length < 2) return;

    const selectedItemsData = [];
    items.forEach(item => {
      if (selectedItems.includes(item.id)) {
        selectedItemsData.push({ ...item, parentId: null, absY: item.y });
      }
      if (item.type === 'canvas' && item.items) {
        item.items.forEach(child => {
          if (selectedItems.includes(child.id)) {
            selectedItemsData.push({ ...child, parentId: item.id, parentY: item.y, absY: item.y + child.y });
          }
        });
      }
    });

    const minY = Math.min(...selectedItemsData.map(item => item.absY));

    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id) && !item.parentId) {
        return { ...item, y: minY };
      }
      if (item.type === 'canvas' && item.items) {
        return {
          ...item,
          items: item.items.map(child => {
            if (selectedItems.includes(child.id)) {
              return { ...child, y: minY - item.y };
            }
            return child;
          })
        };
      }
      return item;
    }));
  };

  const alignBottom = () => {
    if (selectedItems.length < 2) return;

    const selectedItemsData = [];
    items.forEach(item => {
      if (selectedItems.includes(item.id)) {
        const dims = getItemDimensions(item);
        selectedItemsData.push({ ...item, parentId: null, absY: item.y, dims });
      }
      if (item.type === 'canvas' && item.items) {
        item.items.forEach(child => {
          if (selectedItems.includes(child.id)) {
            const dims = getItemDimensions(child);
            selectedItemsData.push({ ...child, parentId: item.id, parentY: item.y, absY: item.y + child.y, dims });
          }
        });
      }
    });

    const maxY = Math.max(...selectedItemsData.map(item => item.absY + item.dims.height));

    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id) && !item.parentId) {
        const dims = getItemDimensions(item);
        return { ...item, y: maxY - dims.height };
      }
      if (item.type === 'canvas' && item.items) {
        return {
          ...item,
          items: item.items.map(child => {
            if (selectedItems.includes(child.id)) {
              const dims = getItemDimensions(child);
              return { ...child, y: maxY - dims.height - item.y };
            }
            return child;
          })
        };
      }
      return item;
    }));
  };

  const alignCenterHorizontal = () => {
    if (selectedItems.length < 2) return;

    const selectedItemsData = [];
    items.forEach(item => {
      if (selectedItems.includes(item.id)) {
        const dims = getItemDimensions(item);
        selectedItemsData.push({ ...item, parentId: null, absX: item.x, dims });
      }
      if (item.type === 'canvas' && item.items) {
        item.items.forEach(child => {
          if (selectedItems.includes(child.id)) {
            const dims = getItemDimensions(child);
            selectedItemsData.push({ ...child, parentId: item.id, parentX: item.x, absX: item.x + child.x, dims });
          }
        });
      }
    });

    const centerX = selectedItemsData.reduce((sum, item) => {
      return sum + item.absX + item.dims.width / 2;
    }, 0) / selectedItemsData.length;

    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id) && !item.parentId) {
        const dims = getItemDimensions(item);
        return { ...item, x: centerX - dims.width / 2 };
      }
      if (item.type === 'canvas' && item.items) {
        return {
          ...item,
          items: item.items.map(child => {
            if (selectedItems.includes(child.id)) {
              const dims = getItemDimensions(child);
              return { ...child, x: centerX - dims.width / 2 - item.x };
            }
            return child;
          })
        };
      }
      return item;
    }));
  };

  const alignCenterVertical = () => {
    if (selectedItems.length < 2) return;

    const selectedItemsData = [];
    items.forEach(item => {
      if (selectedItems.includes(item.id)) {
        const dims = getItemDimensions(item);
        selectedItemsData.push({ ...item, parentId: null, absY: item.y, dims });
      }
      if (item.type === 'canvas' && item.items) {
        item.items.forEach(child => {
          if (selectedItems.includes(child.id)) {
            const dims = getItemDimensions(child);
            selectedItemsData.push({ ...child, parentId: item.id, parentY: item.y, absY: item.y + child.y, dims });
          }
        });
      }
    });

    const centerY = selectedItemsData.reduce((sum, item) => {
      return sum + item.absY + item.dims.height / 2;
    }, 0) / selectedItemsData.length;

    setItems(prev => prev.map(item => {
      if (selectedItems.includes(item.id) && !item.parentId) {
        const dims = getItemDimensions(item);
        return { ...item, y: centerY - dims.height / 2 };
      }
      if (item.type === 'canvas' && item.items) {
        return {
          ...item,
          items: item.items.map(child => {
            if (selectedItems.includes(child.id)) {
              const dims = getItemDimensions(child);
              return { ...child, y: centerY - dims.height / 2 - item.y };
            }
            return child;
          })
        };
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
    <div className="freeform-container vertical-layout">
      {/* Board Tabs - Chrome style tab bar */}
      <div className="freeform-tab-bar">
        <div className="freeform-board-tabs">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`freeform-board-tab ${tab.id === activeTabId ? 'active' : ''}`}
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
          <button className="freeform-board-add" onClick={addNewTab}>+</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="freeform-toolbar-container">
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
            className={`freeform-tool-btn ${tool === 'canvas' ? 'active' : ''}`}
            onClick={() => setTool('canvas')}
            title="Canvas (C)"
          >
            🎨
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
                  // Update canvas children
                  if (item.type === 'canvas' && item.items) {
                    return {
                      ...item,
                      items: item.items.map(child => {
                        if (selectedItems.includes(child.id) && child.type === 'text') {
                          return { ...child, fontSize: Math.max(8, (child.fontSize || 16) - 2) };
                        }
                        return child;
                      })
                    };
                  }
                  return item;
                }));
              }}
              className="align-btn"
              title="Decrease Font Size"
              disabled={!(selectedItems.length > 0)}
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
                  // Update canvas children
                  if (item.type === 'canvas' && item.items) {
                    return {
                      ...item,
                      items: item.items.map(child => {
                        if (selectedItems.includes(child.id) && child.type === 'text') {
                          return { ...child, fontSize: Math.min(72, (child.fontSize || 16) + 2) };
                        }
                        return child;
                      })
                    };
                  }
                  return item;
                }));
              }}
              className="align-btn"
              title="Increase Font Size"
              disabled={!(selectedItems.length > 0)}
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
                  // Update canvas children
                  if (item.type === 'canvas' && item.items) {
                    return {
                      ...item,
                      items: item.items.map(child => {
                        if (selectedItems.includes(child.id) && child.type === 'text') {
                          return { ...child, fontWeight: child.fontWeight === 'bold' ? 'normal' : 'bold' };
                        }
                        return child;
                      })
                    };
                  }
                  return item;
                }));
              }}
              className={`align-btn`}
              title="Bold"
              disabled={!(selectedItems.length > 0)}
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
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="freeform-canvas"
        tabIndex={0}
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
          {items.filter(item => !item.parentId).map(item => {
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
                      rows={1}
                      style={{
                        fontSize: `${item.fontSize}px`,
                        color: item.color || '#ffffff',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        outline: 'none',
                        background: 'rgba(0, 0, 0, 0.3)',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        padding: '8px 12px',
                        margin: 0,
                        width: `${item.content.trim() ? Math.max(80, Math.max(...(item.content.split('\n').map(line => line.length))) * (item.fontSize * 0.5)) : 80}px`,
                        height: `${Math.max(item.fontSize * 1.5 + 16, (item.content.split('\n').length) * (item.fontSize * 1.5) + 16)}px`,
                        maxWidth: 'none',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        resize: 'none',
                        overflow: 'hidden',
                        overflowWrap: 'normal',
                        wordWrap: 'normal',
                        whiteSpace: 'pre',
                        lineHeight: '1.5',
                        display: 'block',
                        verticalAlign: 'top'
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
                    fontWeight: item.fontWeight || 'normal',
                    userSelect: 'none',
                    WebkitUserSelect: 'none'
                  }}
                  onMouseDown={(e) => {
                    handleItemMouseDown(e, item);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTextId(item.id);
                  }}
                >
                  {item.content || ' '}
                </div>
              );
            }

            if (item.type === 'canvas') {
              return (
                <div
                  key={item.id}
                  className={`freeform-item freeform-canvas-item ${!item.locked && (isSelected || isHovered) ? 'selected' : ''}`}
                  style={{
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    width: `${item.width}px`,
                    height: `${item.height}px`,
                    backgroundColor: item.backgroundColor || 'rgba(40, 40, 40, 0.8)',
                    border: item.locked ? '2px solid rgba(102, 126, 234, 0.2)' : '2px solid rgba(102, 126, 234, 0.5)',
                    borderRadius: '8px',
                    position: 'absolute',
                    overflow: 'hidden',
                    opacity: item.locked ? 0.7 : 1
                  }}
                  onMouseDown={(e) => {
                    // If space key is pressed or panning, don't handle - allow pan instead
                    if (spaceKeyPressed || isPanning) return;

                    // Only handle if clicking the canvas itself (not children)
                    if (e.target !== e.currentTarget) return;

                    // If using text tool or canvas tool, let it bubble
                    if (tool !== 'select') return;

                    // If canvas is locked, don't allow selection
                    if (item.locked) return;

                    // If shift/cmd key is pressed, handle multi-select
                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                      e.stopPropagation();
                      handleItemMouseDown(e, item);
                      return;
                    }

                    // If canvas is not selected, select it
                    if (!selectedItems.includes(item.id)) {
                      e.stopPropagation();
                      handleItemMouseDown(e, item);
                      return;
                    }

                    // If canvas is already selected, allow selection box inside
                    // Don't stop propagation - let it bubble to canvas background
                  }}
                >
                  <div
                    className="canvas-inner-container"
                    style={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      padding: '8px',
                      pointerEvents: tool === 'text' ? 'none' : 'auto'
                    }}
                    onMouseDown={(e) => {
                      // If space key is pressed or panning, don't handle - allow pan instead
                      if (spaceKeyPressed || isPanning) return;

                      // Check if clicked on a text, image, label, or corner handle
                      const clickedElement = e.target;
                      const isChildElement = clickedElement.closest('.freeform-text') ||
                                            clickedElement.closest('.freeform-image') ||
                                            clickedElement.closest('.canvas-label') ||
                                            clickedElement.closest('.canvas-corner-handle');

                      // If clicked on child elements, don't start selection box
                      if (isChildElement) return;

                      // If using text tool, let it bubble
                      if (tool === 'text') return;

                      // If canvas is locked, don't allow any interaction
                      if (item.locked) return;

                      // If using select tool, start selection box inside canvas
                      if (tool === 'select') {
                        const coords = getCanvasCoords(e.clientX, e.clientY);
                        setIsDrawingSelection(true);
                        setSelectionBox({ startX: coords.x, startY: coords.y, currentX: coords.x, currentY: coords.y });
                        // Clear selected items when starting new selection box
                        setSelectedItems([]);
                        setHoveredItems([]);
                        return;
                      }

                      // Otherwise, select the canvas
                      e.stopPropagation();
                      handleItemMouseDown(e, item);
                    }}
                  >
                    {/* Sticky note corner handle - top right (only visible when unlocked) */}
                    {!item.locked && (
                      <div
                        className="canvas-corner-handle"
                        style={{
                          position: 'absolute',
                          top: '0',
                          right: '0',
                          width: '0',
                          height: '0',
                          borderStyle: 'solid',
                          borderWidth: '0 40px 40px 0',
                          borderColor: 'transparent rgba(102, 126, 234, 0.7) transparent transparent',
                          cursor: 'grab',
                          zIndex: 1002,
                          filter: 'drop-shadow(-2px 2px 3px rgba(0, 0, 0, 0.3))',
                          transition: 'border-color 0.2s',
                          pointerEvents: 'auto'
                        }}
                        onMouseDown={(e) => {
                          // If space key is pressed or panning, don't handle - allow pan instead
                          if (spaceKeyPressed || isPanning) return;

                          e.stopPropagation();
                          handleItemMouseDown(e, item);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'transparent rgba(102, 126, 234, 0.9) transparent transparent';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'transparent rgba(102, 126, 234, 0.7) transparent transparent';
                        }}
                        title="Drag to move canvas"
                      >
                        {/* Small icon in the corner */}
                        <div style={{
                          position: 'absolute',
                          top: '-32px',
                          right: '-32px',
                          fontSize: '14px',
                          pointerEvents: 'none',
                          transform: 'rotate(0deg)',
                          color: '#fff'
                        }}>
                          ✋
                        </div>
                      </div>
                    )}

                    {/* Canvas label with lock button */}
                    <div
                      className="canvas-label"
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        padding: '4px 8px',
                        background: 'rgba(102, 126, 234, 0.3)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#e0e0e0',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backdropFilter: 'blur(4px)',
                        pointerEvents: 'auto'
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {editingCanvasId === item.id ? (
                        <input
                          type="text"
                          value={item.name || 'Canvas'}
                          onChange={(e) => {
                            setItems(prev => prev.map(i =>
                              i.id === item.id ? { ...i, name: e.target.value } : i
                            ));
                          }}
                          onBlur={() => setEditingCanvasId(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              setEditingCanvasId(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          autoFocus
                          style={{
                            fontSize: '10px',
                            background: 'rgba(0, 0, 0, 0.5)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '3px',
                            color: '#ffffff',
                            padding: '2px 4px',
                            width: '100px'
                          }}
                        />
                      ) : (
                        <span
                          style={{ fontSize: '10px', cursor: 'text' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCanvasId(item.id);
                          }}
                        >
                          {item.name || 'Canvas'} ({(item.items || []).length})
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setItems(prev => prev.map(i =>
                            i.id === item.id ? { ...i, locked: !i.locked } : i
                          ));
                        }}
                        style={{
                          background: item.locked ? 'rgba(255, 193, 7, 0.4)' : 'rgba(76, 175, 80, 0.4)',
                          border: `1px solid ${item.locked ? '#ffc107' : '#4caf50'}`,
                          borderRadius: '3px',
                          color: item.locked ? '#ffc107' : '#4caf50',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = item.locked ? 'rgba(255, 193, 7, 0.6)' : 'rgba(76, 175, 80, 0.6)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = item.locked ? 'rgba(255, 193, 7, 0.4)' : 'rgba(76, 175, 80, 0.4)';
                        }}
                        title={item.locked ? 'Click to unlock' : 'Click to lock'}
                      >
                        {item.locked ? '🔒' : '🔓'}
                      </button>
                    </div>

                    {/* Render canvas child items */}
                    {(item.items || []).map(childItem => {
                      if (childItem.type === 'text') {
                        const isChildEditing = editingTextId === childItem.id;
                        if (isChildEditing) {
                          return (
                            <div
                              key={childItem.id}
                              style={{
                                position: 'absolute',
                                left: `${childItem.x}px`,
                                top: `${childItem.y}px`,
                                zIndex: 100
                              }}
                            >
                              <input
                                type="text"
                                value={childItem.content}
                                onChange={(e) => {
                                  setItems(prev => prev.map(i =>
                                    i.id === item.id
                                      ? {
                                          ...i,
                                          items: i.items.map(ci =>
                                            ci.id === childItem.id ? { ...ci, content: e.target.value } : ci
                                          )
                                        }
                                      : i
                                  ));
                                }}
                                onBlur={() => setEditingTextId(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'Escape') setEditingTextId(null);
                                }}
                                autoFocus
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  outline: 'none',
                                  color: childItem.color,
                                  fontSize: `${childItem.fontSize}px`,
                                  fontWeight: childItem.fontWeight || 'normal',
                                  minWidth: '100px'
                                }}
                              />
                            </div>
                          );
                        }
                        return (
                          <div
                            key={childItem.id}
                            className={`freeform-item freeform-text ${selectedItems.includes(childItem.id) ? 'selected' : ''}`}
                            style={{
                              position: 'absolute',
                              left: `${childItem.x}px`,
                              top: `${childItem.y}px`,
                              fontSize: `${childItem.fontSize}px`,
                              color: childItem.color,
                              fontWeight: childItem.fontWeight || 'normal',
                              cursor: 'pointer',
                              whiteSpace: 'pre-wrap',
                              lineHeight: '1.5',
                              userSelect: 'none',
                              WebkitUserSelect: 'none'
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              // Convert child coordinates to absolute coordinates for dragging
                              const absoluteChildItem = {
                                ...childItem,
                                x: item.x + childItem.x,
                                y: item.y + childItem.y
                              };
                              handleItemMouseDown(e, absoluteChildItem);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingTextId(childItem.id);
                            }}
                          >
                            {childItem.content || ' '}
                          </div>
                        );
                      }
                      if (childItem.type === 'image') {
                        return (
                          <div
                            key={childItem.id}
                            style={{
                              position: 'absolute',
                              left: `${childItem.x}px`,
                              top: `${childItem.y}px`,
                              width: `${childItem.width}px`,
                              height: `${childItem.height}px`
                            }}
                          >
                            <img src={childItem.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                  {isSelected && !item.locked && (
                    <div
                      className="freeform-resize-handle"
                      onMouseDown={(e) => handleResizeMouseDown(e, item)}
                      style={{
                        position: 'absolute',
                        right: '-4px',
                        bottom: '-4px',
                        width: '12px',
                        height: '12px',
                        background: 'rgba(102, 126, 234, 0.8)',
                        border: '2px solid #667eea',
                        borderRadius: '50%',
                        cursor: 'nwse-resize',
                        zIndex: 1001
                      }}
                    />
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
        <div><kbd>Cmd/Ctrl + C/V</kbd> Copy/Paste</div>
        <div><kbd>Cmd/Ctrl + Wheel</kbd> Zoom</div>
      </div>
    </div>
  );
}

export default ReferencePanel;

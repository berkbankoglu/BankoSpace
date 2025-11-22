import { useState, useEffect, useRef } from 'react';

function ReferencePanel() {
  const [tabs, setTabs] = useState([{
    id: 1,
    name: 'Tab 1',
    pages: [{
      pageNumber: 1,
      images: [],
      texts: []
    }],
    currentPageIndex: 0
  }]);
  const [activeTabId, setActiveTabId] = useState(1);
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
  const [editingTextId, setEditingTextId] = useState(null);
  const [tKeyPressed, setTKeyPressed] = useState(false);
  const [ctrlKeyPressed, setCtrlKeyPressed] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const contentRef = useRef(null);
  const pageRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const currentPage = activeTab.pages[activeTab.currentPageIndex];
  const images = currentPage.images;
  const texts = currentPage.texts;

  const setImages = (updateFn) => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? {
            ...tab,
            pages: tab.pages.map((page, idx) =>
              idx === tab.currentPageIndex
                ? {
                    ...page,
                    images: typeof updateFn === 'function'
                      ? updateFn(page.images)
                      : updateFn
                  }
                : page
            )
          }
        : tab
    ));
  };

  const setTexts = (updateFn) => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? {
            ...tab,
            pages: tab.pages.map((page, idx) =>
              idx === tab.currentPageIndex
                ? {
                    ...page,
                    texts: typeof updateFn === 'function'
                      ? updateFn(page.texts)
                      : updateFn
                  }
                : page
            )
          }
        : tab
    ));
  };

  useEffect(() => {
    const saved = localStorage.getItem('refTabs');
    if (saved) {
      const loadedTabs = JSON.parse(saved);
      // Migrate old format to new format
      const migratedTabs = loadedTabs.map(tab => {
        if (!tab.pages) {
          // Old format with leftPage/rightPage - merge into single page
          const allImages = [
            ...(tab.leftPage?.images || []),
            ...(tab.rightPage?.images || [])
          ];
          const allTexts = [
            ...(tab.leftPage?.texts || []),
            ...(tab.rightPage?.texts || [])
          ];
          return {
            ...tab,
            pages: [{
              pageNumber: 1,
              images: allImages,
              texts: allTexts
            }],
            currentPageIndex: 0
          };
        }
        // Migrate pages with leftPage/rightPage to single page
        if (tab.pages && tab.pages[0]?.leftPage) {
          return {
            ...tab,
            pages: tab.pages.map(page => ({
              pageNumber: page.pageNumber,
              images: [
                ...(page.leftPage?.images || []),
                ...(page.rightPage?.images || [])
              ],
              texts: [
                ...(page.leftPage?.texts || []),
                ...(page.rightPage?.texts || [])
              ]
            }))
          };
        }
        return tab;
      });
      setTabs(migratedTabs);
      if (migratedTabs.length > 0) {
        setActiveTabId(migratedTabs[0].id);
      }
    }
  }, []);

  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (pageRef.current) {
        const rect = pageRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / zoomLevel;
        const y = (e.clientY - rect.top) / zoomLevel;
        setLastMousePos({ x, y });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [zoomLevel]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }

      // T key - set state to true
      if (e.key === 't' || e.key === 'T') {
        setTKeyPressed(true);
      }

      // Ctrl key - enable pan mode
      if (e.key === 'Control') {
        setCtrlKeyPressed(true);
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

    const handleKeyUp = (e) => {
      // T key released - set state to false
      if (e.key === 't' || e.key === 'T') {
        setTKeyPressed(false);
      }

      // Ctrl key released - disable pan mode
      if (e.key === 'Control') {
        setCtrlKeyPressed(false);
        setIsPanning(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isFullScreen, selectedItems, images, texts]);

  const handleToggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  useEffect(() => {
    localStorage.setItem('refTabs', JSON.stringify(tabs));
  }, [tabs]);

  // Mouse wheel zoom
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoomLevel(prev => Math.max(0.5, Math.min(3, prev + delta)));
      }
    };

    const contentElement = contentRef.current;
    if (contentElement) {
      contentElement.addEventListener('wheel', handleWheel, { passive: false });
      return () => contentElement.removeEventListener('wheel', handleWheel);
    }
  }, []);

  const addNewTab = () => {
    const newId = Math.max(...tabs.map(t => t.id), 0) + 1;
    const newTab = {
      id: newId,
      name: `Tab ${newId}`,
      pages: [{
        pageNumber: 1,
        images: [],
        texts: []
      }],
      currentPageIndex: 0
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

  const addNewPage = () => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? {
            ...tab,
            pages: [...tab.pages, {
              pageNumber: tab.pages.length + 1,
              images: [],
              texts: []
            }]
          }
        : tab
    ));
  };

  const goToNextPage = () => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId && tab.currentPageIndex < tab.pages.length - 1
        ? { ...tab, currentPageIndex: tab.currentPageIndex + 1 }
        : tab
    ));
  };

  const goToPrevPage = () => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId && tab.currentPageIndex > 0
        ? { ...tab, currentPageIndex: tab.currentPageIndex - 1 }
        : tab
    ));
  };

  const deletePage = () => {
    if (activeTab.pages.length === 1) return; // Don't delete last page
    if (window.confirm('Are you sure you want to delete this page?')) {
      setTabs(prev => prev.map(tab =>
        tab.id === activeTabId
          ? {
              ...tab,
              pages: tab.pages.filter((_, idx) => idx !== tab.currentPageIndex),
              currentPageIndex: Math.max(0, tab.currentPageIndex - 1)
            }
          : tab
      ));
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
  }, [activeTabId]);

  const handleMouseDown = (e, image, isResize) => {
    const currentPageRef = pageRef;

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
    const currentPageRef = pageRef;

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

  const handlePanelMouseDown = (e) => {
    const currentPageRef = pageRef;

    // Right click OR Ctrl + left click for panning
    if (e.button === 2 || (ctrlKeyPressed && e.button === 0)) {
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
                         e.target.classList.contains('ref-empty-state') ||
                         e.target.classList.contains('notebook-lines');

    // T key + left click to add text
    if (tKeyPressed && isCanvasArea && e.button === 0 && currentPageRef.current) {
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
      setEditingTextId(newText.id);
      e.preventDefault();
      return;
    }

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
      // Click on empty area without Shift or T - deselect all
      setSelectedItems({ images: [], texts: [] });
    }
  };

  const handleDoubleClick = (e) => {
    const currentPageRef = pageRef;

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
      setEditingTextId(newText.id);
    }
  };

  const handleTextMouseDown = (e, text) => {
    const currentPageRef = pageRef;

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
    const currentPageRef = pageRef;

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

  // Helper to render the page
  const renderPage = () => {
    const pageImages = currentPage.images;
    const pageTexts = currentPage.texts;

    return (
      <div
        ref={pageRef}
        className="ref-page ref-page-single"
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => handlePanelMouseDown(e)}
        onDoubleClick={(e) => handleDoubleClick(e)}
        style={{
          transform: `scale(${zoomLevel})`,
          transformOrigin: 'top left',
          cursor: ctrlKeyPressed ? 'grab' : isPanning ? 'grabbing' : 'default'
        }}
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
            <img
              src={image.src}
              alt="Reference"
              onClick={(e) => {
                if (!draggedImage && !resizingImage) {
                  e.stopPropagation();
                  setPreviewImage(image.src);
                }
              }}
            />
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
        {pageTexts.map(text => {
          const isEditing = editingTextId === text.id;
          const lineCount = text.content.split('\n').length;
          const maxLineLength = Math.max(...text.content.split('\n').map(line => line.length), 10);

          return (
            <textarea
              key={text.id}
              value={text.content}
              readOnly={!isEditing}
              style={{
                position: 'absolute',
                left: `${text.x}px`,
                top: `${text.y}px`,
                color: '#ffffff',
                fontSize: '16px',
                width: `${Math.max(100, maxLineLength * 10 + 20)}px`,
                height: `${Math.max(25, lineCount * 22)}px`,
                padding: '2px 4px',
                outline: 'none',
                cursor: isEditing ? 'text' : 'pointer',
                border: selectedItems.texts.includes(text.id)
                  ? '2px solid #4A90E2'
                  : (isEditing ? '2px solid #4A90E2' : 'none'),
                background: selectedItems.texts.includes(text.id)
                  ? 'rgba(74, 144, 226, 0.2)'
                  : (isEditing ? 'rgba(74, 144, 226, 0.1)' : 'transparent'),
                direction: 'ltr',
                textAlign: 'left',
                pointerEvents: 'auto',
                resize: 'none',
                overflow: 'hidden',
                fontFamily: 'inherit',
                lineHeight: '22px'
              }}
              onChange={(e) => handleTextEdit(text.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                if (!isEditing) {
                  handleTextMouseDown(e, text);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTextId(text.id);
              }}
              onKeyDown={(e) => {
                // Right Shift + Enter için alt satıra geçiş
                if (e.key === 'Enter' && e.shiftKey && e.location === 2) {
                  // location === 2 means right shift
                  e.preventDefault();
                  const cursorPos = e.target.selectionStart;
                  const newContent = text.content.slice(0, cursorPos) + '\n' + text.content.slice(cursorPos);
                  handleTextEdit(text.id, newContent);
                  // Cursor pozisyonunu yeni satırın başına taşı
                  setTimeout(() => {
                    e.target.selectionStart = e.target.selectionEnd = cursorPos + 1;
                  }, 0);
                } else if (e.key === 'Escape' && isEditing) {
                  setEditingTextId(null);
                }
              }}
              onBlur={(e) => {
                if (isEditing) {
                  setEditingTextId(null);
                  // Boş yazıları sil
                  if (text.content.trim() === '') {
                    const pageToUpdate = page === 'left' ? 'left' : 'right';
                    setTexts(prev => prev.filter(t => t.id !== text.id), pageToUpdate);
                  }
                }
              }}
              autoFocus={text.content === '' || isEditing}
            />
          );
        })}

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
      </div>
    );
  };

  return (
    <div className={`ref-panel-box ${isFullScreen ? 'fullscreen' : ''}`}>
      <div className="ref-panel-header">
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
          <button className="ref-btn" onClick={goToPrevPage} disabled={activeTab.currentPageIndex === 0} title="Previous page">
            ←
          </button>
          <span className="ref-btn" style={{ cursor: 'default', minWidth: '100px' }}>
            Page {activeTab.currentPageIndex + 1} / {activeTab.pages.length}
          </span>
          <button className="ref-btn" onClick={goToNextPage} disabled={activeTab.currentPageIndex === activeTab.pages.length - 1} title="Next page">
            →
          </button>
          <button className="ref-btn" onClick={addNewPage} style={{ background: '#5cb85c', color: '#fff' }} title="Add new page">
            + Add Page
          </button>
          <button className="ref-btn" onClick={deletePage} disabled={activeTab.pages.length === 1} style={{ background: activeTab.pages.length === 1 ? '#3a3a3a' : '#dc3545', color: activeTab.pages.length === 1 ? '#666' : '#fff' }} title="Delete current page">
            🗑️ Delete Page
          </button>
          <div className="zoom-controls">
            <button className="ref-btn" onClick={handleZoomOut} title="Zoom Out">
              −
            </button>
            <button className="ref-btn" onClick={handleZoomReset} title="Reset Zoom">
              {Math.round(zoomLevel * 100)}%
            </button>
            <button className="ref-btn" onClick={handleZoomIn} title="Zoom In">
              +
            </button>
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

      {/* Keyboard Shortcuts Hints */}
      <div className="ref-hints">
        <div className="ref-hint-item">
          <span className="ref-hint-key">Double Click</span>
          <span className="ref-hint-desc">Rename tab</span>
        </div>
        <div className="ref-hint-item">
          <span className="ref-hint-key">T</span>
          <span className="ref-hint-desc">Add text (click to place)</span>
        </div>
        <div className="ref-hint-item">
          <span className="ref-hint-key">Ctrl + V</span>
          <span className="ref-hint-desc">Paste image</span>
        </div>
        <div className="ref-hint-item">
          <span className="ref-hint-key">Drag</span>
          <span className="ref-hint-desc">Select multiple items</span>
        </div>
        <div className="ref-hint-item">
          <span className="ref-hint-key">Ctrl + Wheel</span>
          <span className="ref-hint-desc">Zoom in/out</span>
        </div>
        <div className="ref-hint-item">
          <span className="ref-hint-key">Ctrl + Drag / Right Click</span>
          <span className="ref-hint-desc">Pan view</span>
        </div>
      </div>

      <div ref={contentRef} className="ref-panel-content">
        <div className="ref-notebook-single">
          {renderPage()}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="ref-image-preview-modal"
          onClick={() => setPreviewImage(null)}
        >
          <div className="ref-image-preview-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="ref-image-preview-close"
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
            <img src={previewImage} alt="Preview" />
          </div>
        </div>
      )}
    </div>
  );
}

export default ReferencePanel;

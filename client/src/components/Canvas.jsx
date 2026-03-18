import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

const Canvas = forwardRef(({ tool, color, brushSize, onStrokeEnd, onCursorMove }, ref) => {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef([]);
  const strokeIdRef = useRef(null);

  useImperativeHandle(ref, () => ({
    drawStroke(stroke) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      renderStroke(ctx, stroke);
    },
    clearCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    },
    undoStroke(strokeId, allStrokes) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      allStrokes.filter(s => s.id !== strokeId).forEach(s => renderStroke(ctx, s));
    },
    exportPNG() {
      const canvas = canvasRef.current;
      const link = document.createElement('a');
      link.download = 'whiteboard.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  }));

  function renderStroke(ctx, stroke) {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      const mid = {
        x: (stroke.points[i - 1].x + stroke.points[i].x) / 2,
        y: (stroke.points[i - 1].y + stroke.points[i].y) / 2,
      };
      ctx.quadraticCurveTo(stroke.points[i - 1].x, stroke.points[i - 1].y, mid.x, mid.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    isDrawing.current = true;
    strokeIdRef.current = crypto.randomUUID();
    currentStroke.current = [getPos(e)];
  };

  const draw = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    onCursorMove?.(pos.x, pos.y);
    if (!isDrawing.current) return;

    currentStroke.current.push(pos);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pts = currentStroke.current;

    // Draw last segment live
    if (pts.length >= 2) {
      ctx.save();
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const prev = pts[pts.length - 2];
      const curr = pts[pts.length - 1];
      const mid = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };
      ctx.moveTo(prev.x, prev.y);
      ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
      ctx.stroke();
      ctx.restore();
    }
  };

  const endDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentStroke.current.length > 1) {
      const stroke = {
        id: strokeIdRef.current,
        tool,
        color,
        size: brushSize,
        points: currentStroke.current,
        userId: window.__userId,
        userName: window.__userName,
      };
      onStrokeEnd?.(stroke);
    }
    currentStroke.current = [];
  };

  // Resize canvas to match display size
  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      canvas.getContext('2d').putImageData(imageData, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full touch-none"
      style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
      onMouseDown={startDraw}
      onMouseMove={draw}
      onMouseUp={endDraw}
      onMouseLeave={endDraw}
      onTouchStart={startDraw}
      onTouchMove={draw}
      onTouchEnd={endDraw}
    />
  );
});

Canvas.displayName = 'Canvas';
export default Canvas;

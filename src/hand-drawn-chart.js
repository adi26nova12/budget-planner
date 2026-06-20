/**
 * Hand-Drawn Pie Chart Renderer
 * Emulates sketch-style lines, watercolor washes, and hand-drawn patterns.
 */
export class HandDrawnPieChart {
  constructor(canvas, data = []) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    
    // Set high DPI support
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  setData(data) {
    this.data = data;
    this.draw();
  }

  // Draw sketchy line between two points
  drawSketchyLine(x1, y1, x2, y2, color = '#222222', thickness = 1.2) {
    const ctx = this.ctx;
    const dist = Math.hypot(x2 - x1, y2 - y1);
    if (dist < 1) return;
    
    const steps = Math.max(4, Math.floor(dist / 8));
    
    // Draw twice with slight variations to emulate pencil/pen sketching
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness + (Math.random() - 0.5) * 0.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.moveTo(x1, y1);
      
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        let px = x1 + (x2 - x1) * t;
        let py = y1 + (y2 - y1) * t;
        
        // Add random displacement perpendicular to the line
        if (i < steps) {
          const dx = (x2 - x1) / dist;
          const dy = (y2 - y1) / dist;
          // Pencil waviness
          const offset = (Math.random() - 0.5) * 1.5 + Math.sin(t * Math.PI * 4) * 0.4;
          px += -dy * offset;
          py += dx * offset;
        }
        
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  // Draw sketchy circle (or sector arc)
  drawSketchyArc(cx, cy, r, startAngle, endAngle, color = '#222222', thickness = 1.2) {
    const ctx = this.ctx;
    const angleDiff = endAngle - startAngle;
    if (Math.abs(angleDiff) < 0.01) return;

    const steps = Math.max(10, Math.floor(r * Math.abs(angleDiff) / 5));
    
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness + (Math.random() - 0.5) * 0.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = startAngle + angleDiff * t;
        // Radial noise
        const rNoise = (Math.random() - 0.5) * 1.3 + Math.sin(angle * 12) * 0.5;
        const x = cx + (r + rNoise) * Math.cos(angle);
        const y = cy + (r + rNoise) * Math.sin(angle);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  // Apply watercolor style background wash
  drawWatercolorWash(cx, cy, r, startAngle, endAngle, color) {
    const ctx = this.ctx;
    
    ctx.save();
    // Clip to sector
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.clip();
    
    // Draw multiple overlapping semi-transparent layers to build depth
    const colors = this.hexToRgb(color);
    
    // Base layer
    ctx.fillStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0.5)`;
    ctx.fill();
    
    // Radial gradient layer for watercolor pool effect
    const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx + (Math.random() - 0.5) * 15, cy + (Math.random() - 0.5) * 15, r * 0.95);
    grad.addColorStop(0, `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0.35)`);
    grad.addColorStop(0.75, `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0.5)`);
    grad.addColorStop(1, `rgba(${Math.max(0, colors.r - 25)}, ${Math.max(0, colors.g - 25)}, ${Math.max(0, colors.b - 20)}, 0.7)`); // darker edge
    
    ctx.fillStyle = grad;
    ctx.fill();
    
    // Add subtle splotch layers
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const sx = cx + (Math.random() - 0.5) * r * 0.5;
      const sy = cy + (Math.random() - 0.5) * r * 0.5;
      const sr = r * (0.3 + Math.random() * 0.4);
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0.08)`;
      ctx.fill();
    }
    
    ctx.restore();
  }

  // Draw hand-drawn textures
  drawTexturePattern(cx, cy, r, startAngle, endAngle, patternType) {
    const ctx = this.ctx;
    
    ctx.save();
    // Clip to sector
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = 'rgba(30, 30, 30, 0.4)';
    ctx.lineWidth = 1.0;
    
    switch (patternType) {
      case 'dots':
        // Jittered dots grid
        for (let x = cx - r; x < cx + r; x += 12) {
          for (let y = cy - r; y < cy + r; y += 12) {
            const dx = x - cx;
            const dy = y - cy;
            if (Math.hypot(dx, dy) < r - 2) {
              const jx = (Math.random() - 0.5) * 4;
              const jy = (Math.random() - 0.5) * 4;
              ctx.beginPath();
              ctx.arc(x + jx, y + jy, 0.8 + Math.random() * 0.5, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(30, 30, 30, 0.65)';
              ctx.fill();
            }
          }
        }
        break;

      case 'hatch-diagonal':
        // Diagonal hatching
        for (let k = -r * 2; k < r * 2; k += 10) {
          // Draw diagonal lines
          const x1 = cx + k - r;
          const y1 = cy - r;
          const x2 = cx + k + r;
          const y2 = cy + r;
          this.drawSketchyLine(x1, y1, x2, y2, 'rgba(30, 30, 30, 0.35)', 0.85);
        }
        break;

      case 'hatch-cross':
        // Cross hatching grid
        for (let k = -r * 2; k < r * 2; k += 12) {
          // Diagonal 1
          this.drawSketchyLine(cx + k - r, cy - r, cx + k + r, cy + r, 'rgba(30, 30, 30, 0.3)', 0.8);
          // Diagonal 2
          this.drawSketchyLine(cx - k - r, cy + r, cx - k + r, cy - r, 'rgba(30, 30, 30, 0.3)', 0.8);
        }
        break;

      case 'hatch-vertical':
        // Vertical hatching
        for (let x = cx - r; x < cx + r; x += 9) {
          const y1 = cy - r;
          const y2 = cy + r;
          this.drawSketchyLine(x, y1, x, y2, 'rgba(30, 30, 30, 0.35)', 0.85);
        }
        break;

      case 'swirls':
        // Sketchy loops/spirals
        for (let x = cx - r + 15; x < cx + r; x += 25) {
          for (let y = cy - r + 15; y < cy + r; y += 25) {
            const dx = x - cx;
            const dy = y - cy;
            if (Math.hypot(dx, dy) < r - 15) {
              const jx = x + (Math.random() - 0.5) * 6;
              const jy = y + (Math.random() - 0.5) * 6;
              ctx.beginPath();
              ctx.strokeStyle = 'rgba(30, 30, 30, 0.4)';
              ctx.lineWidth = 0.8;
              let theta = 0;
              ctx.moveTo(jx, jy);
              // Draw spiral
              const turns = 1.5 + Math.random() * 1.5;
              const maxTheta = Math.PI * 2 * turns;
              while (theta < maxTheta) {
                theta += 0.25;
                const rad = (theta / maxTheta) * 7;
                ctx.lineTo(jx + rad * Math.cos(theta), jy + rad * Math.sin(theta));
              }
              ctx.stroke();
            }
          }
        }
        break;

      case 'cash':
        // Cash Reserve shading: cross hatching along the outer perimeter (radial shading)
        for (let angle = startAngle; angle < endAngle; angle += 0.05) {
          // Draw sketchy ticks from outer edge pointing inwards
          const edgeX1 = cx + r * Math.cos(angle);
          const edgeY1 = cy + r * Math.sin(angle);
          const inLength = r * (0.82 + Math.random() * 0.06);
          const edgeX2 = cx + inLength * Math.cos(angle - 0.15); // angle slightly offset to create hatching look
          const edgeY2 = cy + inLength * Math.sin(angle - 0.15);
          
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(30, 30, 30, 0.35)';
          ctx.lineWidth = 0.9;
          ctx.moveTo(edgeX1, edgeY1);
          ctx.lineTo(edgeX2, edgeY2);
          ctx.stroke();

          // Criss-cross tick
          const edgeX3 = cx + inLength * Math.cos(angle + 0.15);
          const edgeY3 = cy + inLength * Math.sin(angle + 0.15);
          ctx.beginPath();
          ctx.moveTo(edgeX1, edgeY1);
          ctx.lineTo(edgeX3, edgeY3);
          ctx.stroke();
        }
        break;
        
      default:
        // No texture, just clean watercolor color wash
        break;
    }

    ctx.restore();
  }

  // Draw the full hand-drawn chart
  draw() {
    this.resize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.data.length === 0) {
      ctx.font = '16px "Architects Daughter", cursive';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', this.width / 2, this.height / 2);
      return;
    }

    // Filter out slices with value <= 0
    const activeData = this.data.filter(d => d.value > 0);
    const total = activeData.reduce((sum, item) => sum + item.value, 0);
    
    // Circle configurations
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = Math.min(this.width, this.height) * 0.26;
    
    let currentAngle = -Math.PI / 2; // start from 12 o'clock

    // 1. Draw Watercolor Fills and Textures for each slice
    activeData.forEach(slice => {
      const sliceAngle = (slice.value / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      
      // Watercolor wash
      this.drawWatercolorWash(cx, cy, r, startAngle, endAngle, slice.color);
      
      // Textured hatching pattern
      this.drawTexturePattern(cx, cy, r, startAngle, endAngle, slice.pattern || 'none');
      
      currentAngle = endAngle;
    });

    // 2. Draw Sketchy Dividing Borders between sectors
    currentAngle = -Math.PI / 2;
    activeData.forEach(slice => {
      const sliceAngle = (slice.value / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      
      // Draw sector separating lines
      const edgeX = cx + r * Math.cos(startAngle);
      const edgeY = cy + r * Math.sin(startAngle);
      this.drawSketchyLine(cx, cy, edgeX, edgeY, '#111111', 1.3);

      // Draw the outer arc of the slice
      this.drawSketchyArc(cx, cy, r, startAngle, endAngle, '#111111', 1.3);

      currentAngle = endAngle;
    });

    // 3. Draw Outer Sketchy Boundary Circle (Double Outline)
    this.drawSketchyArc(cx, cy, r, 0, Math.PI * 2, '#111111', 1.5);
    this.drawSketchyArc(cx, cy, r + 1.5, 0, Math.PI * 2, '#111111', 1.0);

    // (Floating currency symbols removed for cleaner mobile layout and legibility)

    // 5. Draw Slice Labels (Inside for large slices, outside with sketchy pointers for small ones)
    currentAngle = -Math.PI / 2;
    activeData.forEach(slice => {
      const sliceAngle = (slice.value / total) * Math.PI * 2;
      const endAngle = currentAngle + sliceAngle;
      const midAngle = currentAngle + sliceAngle / 2;
      const sharePercent = Math.round((slice.value / total) * 100);
      
      // Draw outside with sketchy pointer lines for all slices to keep styling uniform and readable
      ctx.font = '12px "Architects Daughter", cursive';
      ctx.fillStyle = '#111111';

      const cos = Math.cos(midAngle);
      const sin = Math.sin(midAngle);
      
      // Pointer start (inside slice slightly) and end
      const px1 = cx + r * 0.85 * cos;
      const py1 = cy + r * 0.85 * sin;
      
      // Scale extLength shorter horizontally (based on absolute cos) to prevent boundary clipping
      const baseExtLength = 15 + (Math.random() - 0.5) * 4;
      const extLength = baseExtLength * (1 - Math.abs(cos) * 0.35);
      
      const px2 = cx + (r + extLength) * cos;
      const py2 = cy + (r + extLength) * sin;
      
      // Draw the pointer line
      this.drawSketchyLine(px1, py1, px2, py2, '#222222', 1.0);
      
      // Text alignment and coordinates
      const isLeft = cos < 0;
      ctx.textAlign = isLeft ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      
      const labelX = px2 + (isLeft ? -5 : 5);
      const labelY = py2;

      // Label: e.g., "Groceries 15%" (no redundant currency prefix)
      const labelText = `${slice.label} ${sharePercent}%`;
      
      ctx.fillText(labelText, labelX, labelY);
      
      currentAngle = endAngle;
    });
  }

  // Convert Hex color to RGB object
  hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 150, g: 150, b: 150 };
  }
}

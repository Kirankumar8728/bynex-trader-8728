
import { registerOverlay } from 'klinecharts';

export const registerCustomOverlays = () => {
  // Arrow Overlay
  registerOverlay({
    name: 'arrow',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length > 0) {
        const x1 = coordinates[0].x;
        const y1 = coordinates[0].y;
        const x2 = coordinates[1]?.x ?? x1;
        const y2 = coordinates[1]?.y ?? y1;
        
        const figures: any[] = [
          {
            type: 'line',
            attrs: {
              coordinates: [
                { x: x1, y: y1 },
                { x: x2, y: y2 }
              ]
            }
          }
        ];

        if (coordinates.length === 2) {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLength = 10;
          
          figures.push(
            {
              type: 'line',
              attrs: {
                coordinates: [
                  { x: x2, y: y2 },
                  {
                    x: x2 - headLength * Math.cos(angle - Math.PI / 6),
                    y: y2 - headLength * Math.sin(angle - Math.PI / 6)
                  }
                ]
              }
            },
            {
              type: 'line',
              attrs: {
                coordinates: [
                  { x: x2, y: y2 },
                  {
                    x: x2 - headLength * Math.cos(angle + Math.PI / 6),
                    y: y2 - headLength * Math.sin(angle + Math.PI / 6)
                  }
                ]
              }
            }
          );
        }
        return figures;
      }
      return [];
    }
  });

  // Rectangle Overlay
  registerOverlay({
    name: 'rectangle',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length > 0) {
        const x1 = coordinates[0].x;
        const y1 = coordinates[0].y;
        const x2 = coordinates[1]?.x ?? x1;
        const y2 = coordinates[1]?.y ?? y1;
        
        return [
          {
            type: 'polygon',
            attrs: {
              coordinates: [
                { x: x1, y: y1 },
                { x: x2, y: y1 },
                { x: x2, y: y2 },
                { x: x1, y: y2 }
              ]
            }
          }
        ];
      }
      return [];
    }
  });
  // Barrier Overlay
  registerOverlay({
    name: 'barrier',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, precision, overlay }) => {
      if (coordinates.length === 0 || !overlay.points[0]) return [];
      const { x, y } = coordinates[0];
      const price = overlay.points[0].value ?? 0;
      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y },
              { x: bounding.width, y }
            ]
          },
          style: {
            style: 'dashed',
            dashedValue: [4, 4]
          }
        },
        {
          type: 'text',
          attrs: {
            x: 10,
            y: y - 10,
            text: `BARRIER: ${price.toFixed(precision.price)}`
          },
          style: {
            color: '#f59e0b',
            size: 10,
            weight: 'bold',
            family: 'monospace'
          }
        }
      ];
    }
  });

  // Trade Line Overlay
  registerOverlay({
    name: 'tradeLine',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, precision, overlay }) => {
      if (coordinates.length === 0 || !overlay.points[0]) return [];
      const { x, y } = coordinates[0];
      const price = overlay.points[0].value ?? 0;
      const profit = (overlay.points[0] as any).profit ?? 0;
      const color = profit >= 0 ? '#22c55e' : '#ef4444';
      
      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y },
              { x: bounding.width, y }
            ]
          },
          style: {
            color: color,
            size: 1,
            style: 'solid'
          }
        },
        {
          type: 'text',
          attrs: {
            x: bounding.width - 60,
            y: y - 10,
            text: `${profit >= 0 ? '+' : ''}${profit.toFixed(precision.price)}`
          },
          style: {
            color: color,
            size: 10,
            weight: 'bold',
            family: 'monospace'
          }
        }
      ];
    }
  });
};

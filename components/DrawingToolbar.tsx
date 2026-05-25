import React from 'react';
import { Trash2, Lock, Unlock, Copy } from 'lucide-react';

export const DrawingToolbar = ({ drawing, onUpdate, onDelete }: { drawing: any, onUpdate: (d: any) => void, onDelete: () => void }) => {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 p-2 flex items-center gap-2 shadow-2xl">
            <button onClick={() => onUpdate({ ...drawing, locked: !drawing.locked })} className="p-2 hover:bg-white/10 rounded-lg">
                {drawing.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
            <button onClick={() => onUpdate({ ...drawing, id: Math.random().toString(36).substr(2, 9) })} className="p-2 hover:bg-white/10 rounded-lg">
                <Copy className="w-4 h-4" />
            </button>

            <button onClick={onDelete} className="p-2 hover:bg-white/10 rounded-lg text-red-500">
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
};

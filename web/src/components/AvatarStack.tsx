import React, { useState } from 'react';
import type { Member } from '../hooks/useRoom';

interface AvatarStackProps {
  members: Member[];
  maxVisible?: number;
}

export const AvatarStack: React.FC<AvatarStackProps> = ({ members, maxVisible = 4 }) => {
  const [hoveredMember, setHoveredMember] = useState<string | null>(null);

  const visible = members.slice(0, maxVisible);
  const overflow = members.length - maxVisible;

  return (
    <div className="flex items-center -space-x-2 relative" aria-label="Active watchers">
      {visible.map((m) => (
        <div
          key={m.id}
          className="relative group"
          onMouseEnter={() => setHoveredMember(m.id)}
          onMouseLeave={() => setHoveredMember(null)}
          onClick={() => setHoveredMember(hoveredMember === m.id ? null : m.id)}
        >
          <img
            src={m.avatar}
            alt={m.name}
            className="w-7 h-7 rounded-full border border-gray-700 bg-gray-800 object-cover ring-2 ring-[#0b0d12] transition-transform hover:scale-110"
          />
          {m.isHost && (
            <span
              title="Room Host"
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-violet-500 rounded-full ring-1 ring-[#0b0d12]"
            />
          )}

          {/* Hover name tooltip */}
          {hoveredMember === m.id && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 text-xs font-medium text-white bg-gray-900 border border-gray-700 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none">
              {m.name} {m.isHost ? '(Host)' : ''}
            </div>
          )}
        </div>
      ))}

      {overflow > 0 && (
        <div
          className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-[11px] font-medium text-gray-300 ring-2 ring-[#0b0d12]"
          title={`${overflow} more viewers`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Film,
  Heart,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MovieNight } from "./MovieNight";
import { getGradientPoster } from "../utils/gradientPoster";

export interface RoomItem {
  id: string;
  name: string;
  ownerName: string;
  memberCount: number;
  playing: boolean;
  nowPlaying: string | null;
}
interface RoomsScreenProps {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onSelectRoom: (roomId: string) => Promise<void>;
  displayName: string;
}
export function RoomsScreen({
  onCreateRoom,
  onJoinRoom,
  onSelectRoom,
  displayName,
}: RoomsScreenProps) {
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [joining, setJoining] = useState<string | null>(null);
  const fetchRooms = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/rooms", {
        credentials: "same-origin",
      });
      if (!response.ok)
        throw new Error("Could not load your rooms. Please try again.");
      const data = await response.json();
      setRooms(data.rooms || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load rooms.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void fetchRooms();
  }, []);
  const filtered = rooms.filter((room) =>
    room.name.toLowerCase().includes(search.toLowerCase()),
  );
  const openRoom = async (id: string) => {
    setJoining(id);
    try {
      await onSelectRoom(id);
    } catch {
      setError("Could not connect to this room. Try again.");
    } finally {
      setJoining(null);
    }
  };
  return (
    <div className="dashboard-content">
      <header className="dashboard-greeting">
        <div>
          <span className="eyebrow">YOUR LITTLE CORNER OF THE CINEMA</span>
          <p>
            Hey, {displayName} <span className="text-[#e9a993]">✦</span>
          </p>
        </div>
        <span className="private-label">
          <LockKeyhole size={13} /> Your space, your people
        </span>
      </header>
      <MovieNight compact onStart={onCreateRoom} onJoin={onJoinRoom} />
      <div className="dashboard-notes">
        <span>
          <Heart size={16} /> A date night. A group hang. One more episode.
        </span>
        <span>Bring the movie. We’ll bring you together.</span>
      </div>
      <section className="mt-9" aria-labelledby="rooms-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>
            <h2 id="rooms-title">
              Your watch rooms{" "}
              <span className="room-count">{rooms.length}</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-stone-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search your rooms"
                placeholder="Find a room…"
                className="pl-9 w-44 sm:w-52"
              />
            </div>
            <Button
              aria-label="Refresh rooms"
              variant="ghost"
              size="icon"
              disabled={loading}
              onClick={fetchRooms}
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
        {error && (
          <div role="alert" className="room-error">
            {error}
            <Button size="sm" variant="outline" onClick={fetchRooms}>
              Try again
            </Button>
          </div>
        )}
        {loading ? (
          <div className="room-grid" role="status" aria-label="Loading rooms">
            {[1, 2, 3].map((i) => (
              <div key={i} className="room-skeleton animate-pulse" />
            ))}
          </div>
        ) : !error && rooms.length === 0 ? (
          <div className="first-room">
            <div className="first-room-art">
              <Film size={29} />
              <span>
                <Heart size={13} />
              </span>
            </div>
            <div>
              <h3>Every good night starts with a room.</h3>
              <p>
                Create a cozy corner, send an invite, and choose what’s next.
              </p>
            </div>
            <Button onClick={onCreateRoom} className="cinema-primary">
              <Plus size={16} /> Create your first room
            </Button>
          </div>
        ) : !error && filtered.length === 0 ? (
          <div className="first-room">
            <Search size={24} />
            <div>
              <h3>No rooms found</h3>
              <p>Try another name or create something new.</p>
            </div>
            <Button variant="outline" onClick={() => setSearch("")}>
              Clear search
            </Button>
          </div>
        ) : (
          <div className="room-grid">
            {filtered.map((room) => (
              <button
                key={room.id}
                disabled={joining !== null}
                onClick={() => openRoom(room.id)}
                className="watch-room-card"
              >
                <div
                  className="room-poster"
                  style={{ background: getGradientPoster(room.name) }}
                >
                  <Film size={40} strokeWidth={1} />
                  <span
                    className={`room-status ${room.playing ? "is-live" : ""}`}
                  >
                    <span />
                    {room.playing ? "WATCHING NOW" : "READY WHEN YOU ARE"}
                  </span>
                  <span className="poster-corner">
                    <LockKeyhole size={14} />
                  </span>
                </div>
                <div className="room-card-body">
                  <h3>{room.name}</h3>
                  <p className="truncate">
                    {room.nowPlaying || "A fresh playlist is waiting"}
                  </p>
                  <div className="room-card-footer">
                    <span>
                      <Users size={13} />
                      {room.memberCount}{" "}
                      {room.memberCount === 1 ? "person" : "people"}
                    </span>
                    <span>
                      {joining === room.id ? "Joining…" : "Enter room"}
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {!error && rooms.length > 0 && (
              <button className="new-room-card" onClick={onCreateRoom}>
                <Plus size={25} />
                <strong>A new kind of night</strong>
                <span>Create another watch room</span>
              </button>
            )}
          </div>
        )}
      </section>
      <div className="dashboard-tip">
        <span className="feature-icon">
          <Film size={20} />
        </span>
        <div>
          <strong>Got a whole season lined up?</strong>
          <p>
            Add multiple episode links to your playlist. The next episode is
            just a click away.
          </p>
        </div>
        <Button variant="ghost" onClick={onCreateRoom}>
          Let’s watch <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}

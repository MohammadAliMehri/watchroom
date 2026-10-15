import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface Member {
    id: string;
    name: string;
    avatar: string;
    isHost: boolean;
}

export interface ChatMessage {
    id: string;
    sender: string;
    text: string;
    isSystem: boolean;
    timestamp: number;
}

export interface PlaylistItem {
    id: string;
    url: string;
    title: string;
    durationSec?: number;
    addedBy?: string | null;
}

export interface RoomSummary {
    id: string;
    name: string;
    ownerId?: string;
    ownerName?: string;
    isLive: boolean;
    viewerCount: number;
    currentTitle: string;
    createdAt?: number;
}

export interface Stats {
    totalRooms: number;
    liveRooms: number;
    viewers: number;
}

export interface SubtitleTrack {
    id: string;
    label: string;
    language?: string;
    src: string;
    default?: boolean;
}

export interface AudioStream {
    index: number;
    codec: string;
    language: string;
    title: string;
}

export interface PlaybackState {
    currentItem: PlaylistItem | null;
    currentTime: number;
    isPlaying: boolean;
    updatedAt: number;
    mediaSrc: string | null;
    mediaType: string | null;
    subtitles: string | null;
    subtitleTracks?: SubtitleTrack[];
    audioStreams?: AudioStream[];
    isPreparing: boolean;
    prepareProgress: number;
    prepareError: string | null;
}

interface JoinPayload {
    roomId: string;
    password?: string;
}

interface JoinAck {
    ok?: boolean;
    success?: boolean;
    error?: string;
}

interface CreateAck extends JoinAck {
    roomId?: string;
    name?: string;
}

type ControlAction = 'play' | 'pause' | 'seek' | 'changeItem';

const EMPTY_STATS: Stats = { totalRooms: 0, liveRooms: 0, viewers: 0 };

const initialPlayback = (): PlaybackState => ({
    currentItem: null,
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
    mediaSrc: null,
    mediaType: null,
    subtitles: null,
    subtitleTracks: [],
    audioStreams: [],
    isPreparing: false,
    prepareProgress: 0,
    prepareError: null,
});

const avatarFor = (name: string) =>
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;

export function useRoom() {
    const socketRef = useRef<Socket | null>(null);
    // Last successful join payload, replayed after a reconnect.
    const joinedRef = useRef<JoinPayload | null>(null);

    const [connected, setConnected] = useState(false);
    const [isRestoringRoom, setIsRestoringRoom] = useState(false);
    const [rooms, setRooms] = useState<RoomSummary[]>([]);
    const [stats, setStats] = useState<Stats>(EMPTY_STATS);
    const [isLoadingRooms, setIsLoadingRooms] = useState(true);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [roomName, setRoomName] = useState('');
    const [hostOnly, setHostOnly] = useState(false);
    const [isHost, setIsHost] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [members, setMembers] = useState<Member[]>([]);
    const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [playback, setPlayback] = useState<PlaybackState>(initialPlayback);
    const [lastNotice, setLastNotice] = useState<string | null>(null);

    const resetRoomState = useCallback(() => {
        setActiveRoomId(null);
        setRoomName('');
        setHostOnly(false);
        setIsHost(false);
        setIsOwner(false);
        setMembers([]);
        setPlaylist([]);
        setChatMessages([]);
        setPlayback(initialPlayback());
    }, []);

    useEffect(() => {
        const socket = io({
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            withCredentials: true,
        });
        socketRef.current = socket;
        let noticeTimer: ReturnType<typeof setTimeout> | undefined;

        socket.on('connect', () => {
            setConnected(true);
            socket.emit('rooms:list');

            const payload = joinedRef.current;
            if (!payload) return;
            setIsRestoringRoom(true);
            socket.timeout(10000).emit('room:join', payload, (err: Error | null, ack?: JoinAck) => {
                if (err || (!ack?.success && !ack?.ok)) {
                    socket.emit('room:leave');
                    joinedRef.current = null;
                    setIsRestoringRoom(false);
                    resetRoomState();
                    setLastNotice('Could not restore the room connection. Please rejoin.');
                }
            });
        });

        socket.on('disconnect', () => {
            setConnected(false);
            setIsRestoringRoom(!!joinedRef.current);
        });

        socket.on('rooms:list', (data: { rooms?: RoomSummary[]; stats?: Stats }) => {
            setRooms(data.rooms || []);
            setStats(data.stats || EMPTY_STATS);
            setIsLoadingRooms(false);
        });

        socket.on(
            'room:joined',
            (data: {
                roomId: string;
                name?: string;
                roomName?: string;
                hostOnly?: boolean;
                isHost?: boolean;
                isOwner?: boolean;
                members?: Member[];
                playlist?: PlaylistItem[];
                chatHistory?: ChatMessage[];
                playback?: Partial<PlaybackState>;
            }) => {
                setIsRestoringRoom(false);
                setActiveRoomId(data.roomId);
                setRoomName(data.roomName || data.name || '');
                setHostOnly(!!data.hostOnly);
                setIsHost(!!data.isHost || !!data.isOwner);
                setIsOwner(!!data.isOwner);
                setMembers(data.members || []);
                setPlaylist(data.playlist || []);
                setChatMessages(data.chatHistory || []);
                // Start from a clean state so a previous room's media never leaks in.
                setPlayback({ ...initialPlayback(), ...(data.playback || {}) });
            },
        );

        // The server only sends display names here; keep known flags/avatars by name.
        socket.on('room:members', (data: { names?: string[] } | Member[]) => {
            if (Array.isArray(data)) {
                setMembers(data);
                return;
            }
            if (!data || !Array.isArray(data.names)) return;
            const names = data.names;
            setMembers((prev) =>
                names.map((name, index) => {
                    const known = prev.find((m) => m.name === name);
                    return known ?? { id: `member-${index}`, name, avatar: avatarFor(name), isHost: false };
                }),
            );
        });

        socket.on('sync:state', (data: Partial<PlaybackState>) => {
            setPlayback((prev) => ({ ...prev, ...data }));
        });

        socket.on('media:progress', (data: { progress: number }) => {
            setPlayback((prev) => ({
                ...prev,
                isPreparing: data.progress < 100,
                prepareProgress: data.progress,
            }));
        });

        socket.on('playlist:updated', (items: PlaylistItem[]) => {
            setPlaylist(items);
        });

        const onChat = (msg: ChatMessage) => {
            // Server emits both chat:msg and chat:message for each message.
            setChatMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg].slice(-200)));
        };
        socket.on('chat:msg', onChat);
        socket.on('chat:message', onChat);

        socket.on('room:closed', () => {
            joinedRef.current = null;
            resetRoomState();
            setLastNotice('This room was deleted by its owner.');
            clearTimeout(noticeTimer);
            noticeTimer = setTimeout(() => setLastNotice(null), 4000);
        });

        socket.on('error:notice', (data: { message: string }) => {
            setLastNotice(data.message);
            clearTimeout(noticeTimer);
            noticeTimer = setTimeout(() => setLastNotice(null), 4000);
        });

        return () => {
            clearTimeout(noticeTimer);
            socket.disconnect();
        };
    }, [resetRoomState]);

    const createRoom = useCallback(
        (name: string, password: string, hostOnlyFlag: boolean) =>
            new Promise<{ success: boolean; ok?: boolean; room?: { id: string; name: string }; roomId?: string; error?: string }>(
                (resolve) => {
                    const socket = socketRef.current;
                    if (!socket) return resolve({ success: false, error: 'Not connected' });
                    socket.emit('room:create', { name, password, hostOnly: hostOnlyFlag }, (ack?: CreateAck) => {
                        if (ack?.ok && ack.roomId) {
                            resolve({
                                success: true,
                                ok: true,
                                room: { id: ack.roomId, name: ack.name || name },
                                roomId: ack.roomId,
                            });
                        } else {
                            resolve({ success: false, error: ack?.error });
                        }
                    });
                },
            ),
        [],
    );

    const joinRoom = useCallback(
        (roomId: string, password?: string) =>
            new Promise<{ success: boolean; ok?: boolean; error?: string }>((resolve) => {
                const socket = socketRef.current;
                if (!socket) return resolve({ success: false, error: 'Not connected' });
                const payload: JoinPayload = { roomId, password };
                socket.timeout(10000).emit('room:join', payload, (err: Error | null, ack?: JoinAck) => {
                    if (err) return resolve({ success: false, error: 'The room request timed out. Try again.' });
                    if (ack?.ok || ack?.success) {
                        joinedRef.current = payload;
                        resolve({ success: true, ok: true });
                    } else {
                        resolve({ success: false, ok: false, error: ack?.error || 'Could not join the room.' });
                    }
                });
            }),
        [],
    );

    const leaveRoom = useCallback(() => {
        joinedRef.current = null;
        setIsRestoringRoom(false);
        socketRef.current?.emit('room:leave');
        resetRoomState();
    }, [resetRoomState]);

    const sendControl = useCallback(
        (action: ControlAction, currentTime?: number, itemId?: string) => {
            if (socketRef.current && activeRoomId) {
                socketRef.current.emit('sync:control', { action, currentTime, itemId });
            }
        },
        [activeRoomId],
    );

    const addToPlaylist = useCallback(
        (url: string, title?: string) =>
            new Promise<{ success: boolean; error?: string }>((resolve) => {
                if (!socketRef.current || !activeRoomId) return resolve({ success: false, error: 'Not in room' });
                socketRef.current.emit('playlist:add', { url, title }, (ack?: { success: boolean; error?: string }) => {
                    resolve(ack || { success: true });
                });
            }),
        [activeRoomId],
    );

    const addBatchToPlaylist = useCallback(
        (items: { url: string; title?: string }[]) =>
            new Promise<{ success: boolean; count?: number; error?: string }>((resolve) => {
                if (!socketRef.current || !activeRoomId) return resolve({ success: false, error: 'Not in room' });
                socketRef.current.emit('playlist:addBatch', { items }, (ack?: { success: boolean; count?: number; error?: string }) => {
                    resolve(ack || { success: true });
                });
            }),
        [activeRoomId],
    );

    const changeAudioTrack = useCallback(
        (audioTrackIndex: number) => {
            if (!socketRef.current || !activeRoomId || !playback.currentItem) return;
            socketRef.current.emit('media:prepare', {
                url: playback.currentItem.url,
                audioTrackIndex
            });
        },
        [activeRoomId, playback.currentItem],
    );

    const removeFromPlaylist = useCallback(
        (itemId: string) => {
            if (socketRef.current && activeRoomId) {
                socketRef.current.emit('playlist:remove', { itemId });
            }
        },
        [activeRoomId],
    );

    const selectPlaylistItem = useCallback(
        (itemId: string) => {
            if (socketRef.current && activeRoomId) {
                socketRef.current.emit('playlist:select', { itemId });
            }
        },
        [activeRoomId],
    );

    const sendChat = useCallback(
        (text: string) => {
            if (socketRef.current && activeRoomId) {
                socketRef.current.emit('chat:send', { text });
            }
        },
        [activeRoomId],
    );

    const retryPlayback = useCallback(() => {
        if (playback.currentItem && activeRoomId) {
            selectPlaylistItem(playback.currentItem.id);
        }
    }, [playback.currentItem, activeRoomId, selectPlaylistItem]);

    return {
        connected,
        isRestoringRoom,
        rooms,
        stats,
        isLoadingRooms,
        activeRoomId,
        roomName,
        setRoomName,
        hostOnly,
        isHost,
        isOwner,
        members,
        playlist,
        chatMessages,
        playback,
        lastNotice,
        createRoom,
        joinRoom,
        leaveRoom,
        sendControl,
        addToPlaylist,
        addBatchToPlaylist,
        changeAudioTrack,
        removeFromPlaylist,
        selectPlaylistItem,
        sendChat,
        retryPlayback,
    };
}

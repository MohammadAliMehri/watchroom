export interface MappedError {
    title: string;
    description: string;
    nextStep?: string;
    action?: 'retry' | 'back';
}

// Translates raw server / player error strings into user-facing copy.
export function mapServerError(message?: string | null): MappedError {
    if (!message) {
        return { title: 'Unknown error', description: 'An unexpected issue occurred.' };
    }
    const text = message.trim();

    if (text.includes('Cannot read this link as video')) {
        return {
            title: "We couldn't read this link as a video.",
            description: 'The video stream or format could not be processed.',
            nextStep: 'Check that it opens in a browser.',
        };
    }
    if (text.includes('That address is not allowed')) {
        return {
            title: "This address can't be used.",
            description: 'This address is restricted or forbidden.',
        };
    }
    if (text.includes('Server is busy converting another movie')) {
        return {
            title: 'The server is busy converting another movie.',
            description: 'Heavy re-encoding is currently running for another movie.',
            nextStep: 'Try again in a few minutes.',
        };
    }
    if (text.includes('Server is busy with other movies')) {
        return {
            title: 'The server is busy with other movies.',
            description: 'Maximum active conversion capacity reached.',
            nextStep: 'Try again in a few minutes.',
        };
    }
    if (text.includes('Playback error (fatal HLS)') || text.includes('Playback stopped')) {
        return {
            title: 'Playback stopped.',
            description: 'The media stream encountered an error during playback.',
            nextStep: 'Try reloading the video stream.',
            action: 'retry',
        };
    }
    if (text.includes('Room not found')) {
        return {
            title: 'No room with that ID.',
            description: 'Please check the room code or link and try again.',
            nextStep: 'Back to join form.',
            action: 'back',
        };
    }
    return { title: text, description: 'Please check the input and try again.' };
}

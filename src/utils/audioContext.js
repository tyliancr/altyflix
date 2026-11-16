let audioCtx = null;

export const getAudioContext = () => {
    if (typeof window === 'undefined') return null;
    if ((!audioCtx || audioCtx.state === 'suspended') && window.navigator.userActivation?.hasBeenActive === false) return null;
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
};


export interface RecorderOptions {
	fps?: number;
	audiEnabled?: boolean;
	webcamEnabled?: boolean;
}

export interface RecorderStreams {
	screenStream: MediaStream;
	micStream: MediaStream | null;
	webcamStream: MediaStream | null;
	combinedStream: MediaStream;
}

export async function getScreenStream(fps: number = 30): Promise<MediaStream> {
	return navigator.mediaDevices.getDisplayMedia({
		video: {
			frameRate: fps
		},
		audio: false
	});
}

export async function getMicStream(): Promise<MediaStream | null> {
	try {
		return await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true
			},
			video: false
		});
	} catch {
		console.warn('Microphone not available');
		return null;
	}
}

export async function getWebcamStream(): Promise<MediaStream | null> {
	try {
		return await navigator.mediaDevices.getUserMedia({
			video: {
				width: { ideal: 320 },
				height: { ideal: 320 },
				facingMode: 'user'
			},
			audio: false
		});
	} catch {
		console.warn('Webcam not available');
		return null;
	}
}

export function combineStreams(
	screenStream: MediaStream,
	micStream: MediaStream | null
): MediaStream {
	const tracks: MediaStreamTrack[] = [...screenStream.getVideoTracks()];

	if (micStream) {
		tracks.push(...micStream.getAudioTracks());
	}

	return new MediaStream(tracks);
}

export function getSupportedMimeType(): string {
	const types = [
		'video/webm;codecs=vp9,opus',
		'video/webm;codecs=vp8,opus',
		'video/webm;codecs=vp9',
		'video/webm;codecs=vp8',
		'video/webm'
	];

	for (const type of types) {
		if (MediaRecorder.isTypeSupported(type)) {
			return type;
		}
	}

	return 'video/webm';
}

export function createMediaRecorder(
	stream: MediaStream,
	onChunk: (data: ArrayBuffer) => void,
	onStop: () => void
): MediaRecorder {
	const mimeType = getSupportedMimeType();
	const recorder = new MediaRecorder(stream, {
		mimeType,
		videoBitsPerSecond: 2_500_000
	});

	recorder.ondataavailable = async (event: BlobEvent) => {
		if (event.data.size > 0) {
			const buffer = await event.data.arrayBuffer();
			onChunk(buffer);
		}
	};

	recorder.onstop = onStop;

	return recorder;
}

export function stopAllStreams(streams: RecorderStreams) {
	streams.screenStream.getTracks().forEach((t) => t.stop());
	streams.micStream?.getTracks().forEach((t) => t.stop());
	streams.webcamStream?.getTracks().forEach((t) => t.stop());
}

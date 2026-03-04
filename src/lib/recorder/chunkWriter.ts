import { invoke } from '@tauri-apps/api/core';

let writeQueue: Promise<void> = Promise.resolve();

export function enqueueChunk(chunk: ArrayBuffer): Promise<number> {
	return new Promise((resolve, reject) => {
		writeQueue = writeQueue.then(async () => {
			try {
				const bytes: number = await invoke('write_chunk', {
					headers: { 'content-type': 'application/octet-stream' }
				});
				resolve(bytes);
			} catch (err) {
				// Fallback: try raw invoke
				try {
					const bytes: number = await invoke('write_chunk');
					resolve(bytes);
				} catch (err2) {
					reject(err2);
				}
			}
		});
	});
}

export function resetQueue() {
	writeQueue = Promise.resolve();
}

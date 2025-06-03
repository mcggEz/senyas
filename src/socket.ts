import { io, Socket } from 'socket.io-client';

class SocketService {
    private socket: Socket | null = null;

    connect() {
        this.socket = io('http://localhost:3000');

        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
    }

    sendFrame(imageData: string) {
        if (this.socket) {
            this.socket.emit('process-frame', { image: imageData });
        }
    }

    onRecognitionResult(callback: (result: any) => void) {
        if (this.socket) {
            this.socket.on('recognition-result', callback);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

export const socketService = new SocketService();
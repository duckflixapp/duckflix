import { describe, expect, test } from 'bun:test';
import type { RqbitTorrent, TorrentStats } from '@shared/types/torrent';
import { Torrent, TorrentCanceledError, type TorrentClient } from '../torrent';

const torrentData: RqbitTorrent = {
    id: 7,
    output_folder: '/downloads/rqbit-7',
    details: {
        files: [{ name: 'video.mkv', length: 100 }],
    },
} as RqbitTorrent;

describe('Torrent', () => {
    test('cancel removes the torrent and rejects an active wait', async () => {
        const removed: number[] = [];
        const client = {
            remove: async (torrentId: number) => {
                removed.push(torrentId);
            },
            stats: async (): Promise<TorrentStats> => {
                throw new Error('stats should not be called after cancel');
            },
        } as unknown as TorrentClient;
        const torrent = new Torrent(client, torrentData);

        const wait = torrent.waitDownload();
        await torrent.cancel();

        expect(wait).rejects.toBeInstanceOf(TorrentCanceledError);
        expect(removed).toEqual([7]);
    });
});

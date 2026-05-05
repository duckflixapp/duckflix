type CancellableDownload = {
    cancel(): Promise<void> | void;
};

class DownloadRegistry {
    private readonly activeDownloads = new Map<string, CancellableDownload>();

    public register(videoId: string, download: CancellableDownload) {
        this.activeDownloads.set(videoId, download);
    }

    public unregister(videoId: string) {
        this.activeDownloads.delete(videoId);
    }

    public async cancel(videoId: string) {
        const download = this.activeDownloads.get(videoId);
        if (!download) return false;

        await download.cancel();
        this.activeDownloads.delete(videoId);
        return true;
    }
}

export const downloadRegistry = new DownloadRegistry();

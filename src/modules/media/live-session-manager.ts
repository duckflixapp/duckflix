import fs from 'node:fs/promises';
import path from 'node:path';
import { NotStandardResolutionError, TooBigResolutionError } from './live.errors';
import type { LiveSessionTask, LiveSessionTaskFactory, MediaPaths } from './media.ports';

export interface LiveSessionManagerDependencies {
    paths: MediaPaths;
    presetHeights: number[];
    taskFactory: LiveSessionTaskFactory;
    removePath?: typeof fs.rm;
}

export class LiveSessionManager {
    private readonly sessionRegistry = new Map<string, LiveSessionTask>();
    private readonly sessionRef = new Map<string, number>();
    private readonly removePath: typeof fs.rm;

    constructor(private readonly dependencies: LiveSessionManagerDependencies) {
        this.removePath = dependencies.removePath ?? fs.rm;
    }

    size() {
        return this.sessionRegistry.size;
    }

    destroyAll() {
        this.sessionRegistry.values().forEach((session) => session.destroy());
    }

    async ensureSegment(
        session: string,
        height: number,
        original: { storageKey: string; height: number; duration: number },
        options = { segment: 0, segmentDuration: 6 }
    ) {
        if (height > original.height) throw new TooBigResolutionError();
        if (!this.dependencies.presetHeights.includes(height) && height !== original.height) throw new NotStandardResolutionError();

        const sessionPath = path.resolve(this.dependencies.paths.live, session, String(height));
        const sessionKey = `${session}:${height}`;
        let sessionTask = this.sessionRegistry.get(sessionKey);

        if (!sessionTask) {
            const sourcePath = path.resolve(this.dependencies.paths.storage, original.storageKey);
            const totalSegments = Math.ceil(original.duration / options.segmentDuration);

            sessionTask = await this.dependencies.taskFactory(
                session,
                sourcePath,
                sessionPath,
                options.segmentDuration,
                height,
                totalSegments,
                async () => {
                    this.sessionRegistry.delete(sessionKey);

                    const ref = (this.sessionRef.get(session) ?? 0) - 1;

                    if (ref <= 0) {
                        this.sessionRef.delete(session);
                        await this.removePath(path.resolve(this.dependencies.paths.live, session), { recursive: true, force: true }).catch(
                            () => {}
                        );
                    } else {
                        this.sessionRef.set(session, ref);
                        await this.removePath(sessionPath, { recursive: true, force: true }).catch(() => {});
                    }
                }
            );

            this.sessionRegistry.set(sessionKey, sessionTask);
            this.sessionRef.set(session, (this.sessionRef.get(session) ?? 0) + 1);
            await sessionTask.initalize();
        }

        await sessionTask.prepareSegment(options.segment, { height });

        return path.join(sessionPath, `seg-${options.segment}.ts`);
    }
}

import { app } from '@core/app';
import { pool } from '@shared/configs/db';
import { env } from '@core/env';
import { initalize } from '@core/initialize';
import { logger } from '@shared/configs/logger';
import { liveSessionManager } from '@modules/media/live.service';
import { socketPlugin } from '@core/socket';
import { Socket } from '@shared/lib/socket';

await initalize();

app.use(socketPlugin);

const PORT = env.PORT;
app.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
});

export const socket = new Socket(app.server);

process.on('SIGINT', async () => {
    app.stop();
    await pool.end();
    liveSessionManager.destroyAll();
    process.exit(0);
});

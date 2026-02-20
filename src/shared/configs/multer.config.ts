import multer from 'multer';
import { AppError } from '../../shared/errors';
import type { Multer } from 'multer';
import { paths } from './path.config';
import { limits } from './limits.config';

export const movieUpload: Multer = multer({
    dest: paths.uploads,
    limits: {
        fileSize: 1024 * 1024 * limits.file.upload,
    },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'video') {
            if (file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream') return cb(null, true);
            return cb(new AppError('The "video" field must contain a valid video file.', { statusCode: 400 }) as unknown as null, false);
        }
        if (file.fieldname === 'torrent') {
            const contentLength = parseInt(req.headers['content-length'] || '0');

            // If whole request is 5MB .torrent file is probably malicious
            if (contentLength > 5 * 1024 * 1024) {
                return cb(new AppError('Torrent file is suspiciously large', { statusCode: 400 }) as unknown as null, false);
            }

            const isTorrentMime = file.mimetype === 'application/x-bittorrent';
            const isTorrentExt = file.originalname.toLowerCase().endsWith('.torrent');

            if (isTorrentMime || isTorrentExt) {
                return cb(null, true);
            }
            return cb(new AppError('The "torrent" field must contain a .torrent file.', { statusCode: 400 }) as unknown as null, false);
        }

        cb(new AppError('Only video files (mp4, mkv, avi, mov) are allowed', { statusCode: 400 }) as unknown as null, false);
    },
});
